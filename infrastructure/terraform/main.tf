terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
    docker = { source = "kreuzwerker/docker", version = "~> 3.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── VPC ──────────────────────────────────────────────────────────────────────

resource "aws_vpc" "vera" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "vera-lattice-vpc" }
}

resource "aws_subnet" "vera_public" {
  count                   = 2
  vpc_id                  = aws_vpc.vera.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "vera-public-${count.index + 1}" }
}

resource "aws_internet_gateway" "vera" {
  vpc_id = aws_vpc.vera.id
  tags   = { Name = "vera-igw" }
}

resource "aws_route_table" "vera_public" {
  vpc_id = aws_vpc.vera.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.vera.id
  }
  tags = { Name = "vera-public-rt" }
}

resource "aws_route_table_association" "vera_public" {
  count          = 2
  subnet_id      = aws_subnet.vera_public[count.index].id
  route_table_id = aws_route_table.vera_public.id
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ─── Security Groups ─────────────────────────────────────────────────────────

resource "aws_security_group" "vera_api" {
  name_prefix = "vera-api-"
  vpc_id      = aws_vpc.vera.id

  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "vera-api-sg" }
}

resource "aws_security_group" "vera_internal" {
  name_prefix = "vera-internal-"
  vpc_id      = aws_vpc.vera.id

  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.vera_api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "vera-internal-sg" }
}

# ─── ECR Repository ────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "vera" {
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ─── ECS Cluster ──────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "vera" {
  name = var.app_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "vera" {
  cluster_name = aws_ecs_cluster.vera.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }
}

# ─── CloudWatch Log Group ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "vera" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 7
}

# ─── IAM Roles ───────────────────────────────────────────────────────────────

resource "aws_iam_role" "vera_execution" {
  name = "${var.app_name}-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "vera_execution" {
  role       = aws_iam_role.vera_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "vera_task" {
  name = "${var.app_name}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# ─── Task Definition ─────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "vera" {
  family                   = var.app_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.vera_execution.arn
  task_role_arn            = aws_iam_role.vera_task.arn

  container_definitions = jsonencode([{
    name  = var.app_name
    image = "${aws_ecr_repository.vera.repository_url}:latest"
    portMappings = [{ containerPort = 8080, protocol = "tcp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.vera.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
    environment = [
      { name = "PORT", value = "8080" },
      { name = "HEDERA_NETWORK", value = var.hedera_network },
      { name = "MODEL_PROVIDER", value = var.model_provider },
    ]
    secrets = [
      { name = "HEDERA_OPERATOR_ACCOUNT_ID", valueFrom = aws_ssm_parameter.hedera_account.arn },
      { name = "HEDERA_OPERATOR_PRIVATE_KEY", valueFrom = aws_ssm_parameter.hedera_key.arn },
    ]
  }])
}

# ─── SSM Parameters ─────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "hedera_account" {
  name  = "/${var.app_name}/hedera/account-id"
  type  = "SecureString"
  value = var.hedera_operator_account_id
}

resource "aws_ssm_parameter" "hedera_key" {
  name  = "/${var.app_name}/hedera/private-key"
  type  = "SecureString"
  value = var.hedera_operator_private_key
}

# ─── ECS Service ─────────────────────────────────────────────────────────────

resource "aws_ecs_service" "vera" {
  name            = var.app_name
  cluster         = aws_ecs_cluster.vera.id
  task_definition = aws_ecs_task_definition.vera.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.vera_public[*].id
    security_groups  = [aws_security_group.vera_api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.vera.arn
    container_name   = var.app_name
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.vera]
}

# ─── Application Load Balancer ────────────────────────────────────────────────

resource "aws_lb" "vera" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.vera_api.id]
  subnets            = aws_subnet.vera_public[*].id
}

resource "aws_lb_target_group" "vera" {
  name        = "${var.app_name}-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.vera.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }
}

resource "aws_lb_listener" "vera" {
  load_balancer_arn = aws_lb.vera.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.vera.arn
  }
}

resource "aws_lb_listener" "vera_http_redirect" {
  load_balancer_arn = aws_lb.vera.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ─── Auto Scaling ─────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "vera" {
  max_capacity       = var.max_count
  min_capacity       = var.min_count
  resource_id        = "service/${aws_ecs_cluster.vera.name}/${aws_ecs_service.vera.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "vera_cpu" {
  name               = "${var.app_name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.vera.resource_id
  scalable_dimension = aws_appautoscaling_target.vera.scalable_dimension
  service_namespace  = aws_appautoscaling_target.vera.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
