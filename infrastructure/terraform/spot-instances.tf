# AWS Spot Instance Configuration for Vera
# 70% cost savings on compute with graceful interruption handling

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data source for latest Amazon Linux AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

# Launch Template for Vera Spot Instances
resource "aws_launch_template" "vera_spot" {
  name_prefix   = "vera-spot-"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = "g4dn.xlarge"  # GPU instance for inference

  vpc_security_group_ids = [aws_security_group.vera.id]
  key_name               = var.ssh_key_name

  iam_instance_profile {
    name = aws_iam_instance_profile.vera.name
  }

  # Spot instance configuration
  instance_market_options {
    market_type = "spot"
    spot_options {
      max_price                      = "1.50"  # Max spot price (on-demand is $0.50/hr)
      spot_instance_type             = "one-time"
      instance_interruption_behavior = "stop"  # Stop instead of terminate for data preservation
    }
  }

  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    node_id        = "spot-${random_id.node.hex}"
    redis_url      = aws_elasticache_cluster.vera.cache_nodes[0].address
    qvx_server_url = "http://${aws_instance.qvx_server.private_ip}:5101"
    cluster_token  = random_password.cluster_token.result
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "vera-spot-instance"
      Environment = "production"
      ManagedBy   = "terraform"
      Spot        = "true"
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"  # IMDSv2
    http_put_response_hop_limit = 1
  }

  monitoring {
    enabled = true
  }
}

# Mixed Instances Policy for Diverse Spot Capacity
resource "aws_autoscaling_group" "vera_spot" {
  name                = "vera-spot-asg"
  vpc_zone_identifier = var.private_subnet_ids
  target_group_arns   = [aws_lb_target_group.vera.arn]
  health_check_type   = "ELB"
  health_check_grace_period = 300

  min_size         = 3
  max_size         = 20
  desired_capacity = 5

  mixed_instances_policy {
    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.vera_spot.id
        version            = "$Latest"
      }

      # Multiple instance types for spot capacity optimization
      override {
        instance_type     = "g4dn.xlarge"
        weighted_capacity = "3"
      }
      override {
        instance_type     = "g4dn.2xlarge"
        weighted_capacity = "6"
      }
      override {
        instance_type     = "g5.xlarge"
        weighted_capacity = "3"
      }
      override {
        instance_type     = "g5.2xlarge"
        weighted_capacity = "6"
      }
    }

    instances_distribution {
      on_demand_base_capacity                  = 2   # Always keep 2 on-demand
      on_demand_percentage_above_base_capacity = 20 # 20% of remainder on-demand
      spot_allocation_strategy                 = "capacity-optimized"
      spot_instance_pools                      = 4
    }
  }

  tag {
    key                 = "Name"
    value               = "vera-spot-node"
    propagate_at_launch = true
  }

  tag {
    key                 = "SpotInterruptionHandler"
    value               = "enabled"
    propagate_at_launch = true
  }

  # Lifecycle hooks for graceful shutdown
  initial_lifecycle_hook {
    name                 = "spot-interruption-hook"
    default_result       = "CONTINUE"
    heartbeat_timeout    = 300
    lifecycle_transition = "autoscaling:EC2_INSTANCE_TERMINATING"
    notification_target_arn = aws_sns_topic.spot_interruption.arn
    role_arn                = aws_iam_role.lifecycle_hook.arn
  }

  termination_policies = ["OldestInstance", "Default"]

  dynamic "tag" {
    for_each = var.additional_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}

# Spot Instance Interruption Handler
resource "aws_sns_topic" "spot_interruption" {
  name = "vera-spot-interruption"
}

resource "aws_sns_topic_subscription" "spot_interruption" {
  topic_arn = aws_sns_topic.spot_interruption.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.spot_handler.arn
}

# Lambda function for graceful spot interruption handling
resource "aws_lambda_function" "spot_handler" {
  filename         = data.archive_file.spot_handler.output_path
  function_name    = "vera-spot-interruption-handler"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      REDIS_URL      = "redis://${aws_elasticache_cluster.vera.cache_nodes[0].address}:6379"
      WEBHOOK_URL    = var.slack_webhook_url
      CLUSTER_TOKEN  = random_password.cluster_token.result
    }
  }

  tags = {
    Name = "vera-spot-handler"
  }
}

# CloudWatch Event for Spot Interruption Warning (2-minute warning)
resource "aws_cloudwatch_event_rule" "spot_interruption" {
  name        = "vera-spot-interruption-warning"
  description = "Capture EC2 Spot Instance Interruption Warnings"

  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Spot Instance Interruption Warning"]
  })
}

resource "aws_cloudwatch_event_target" "spot_interruption" {
  rule      = aws_cloudwatch_event_rule.spot_interruption.name
  target_id = "SpotInterruptionLambda"
  arn       = aws_lambda_function.spot_handler.arn
}

# Auto Scaling Policies
data "aws_autoscaling_groups" "vera" {
  filter {
    name   = "tag:Name"
    values = ["vera-spot-node"]
  }
}

resource "aws_autoscaling_policy" "vera_cpu" {
  name                   = "vera-cpu-target"
  autoscaling_group_name = aws_autoscaling_group.vera_spot.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

resource "aws_autoscaling_policy" "vera_requests" {
  name                   = "vera-requests-target"
  autoscaling_group_name = aws_autoscaling_group.vera_spot.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    customized_metric_specification {
      metric_dimension {
        name  = "AutoScalingGroupName"
        value = aws_autoscaling_group.vera_spot.name
      }
      metric_name = "VeraRequestsPerInstance"
      namespace   = "Vera/Scaling"
      statistic   = "Average"
    }
    target_value = 50.0  # Scale when > 50 requests per instance
  }
}

# Scheduled Scaling (reduce costs during off-peak)
resource "aws_autoscaling_schedule" "scale_down_night" {
  scheduled_action_name  = "scale-down-night"
  min_size               = 2
  max_size               = 10
  desired_capacity       = 2
  recurrence             = "0 22 * * *"  # 10 PM UTC daily
  autoscaling_group_name = aws_autoscaling_group.vera_spot.name
}

resource "aws_autoscaling_schedule" "scale_up_morning" {
  scheduled_action_name  = "scale-up-morning"
  min_size               = 3
  max_size               = 20
  desired_capacity       = 5
  recurrence             = "0 8 * * *"   # 8 AM UTC daily
  autoscaling_group_name = aws_autoscaling_group.vera_spot.name
}

# Capacity Reservations for baseline capacity
data "aws_ec2_instance_type_offering" "vera_gpu" {
  filter {
    name   = "instance-type"
    values = ["g4dn.xlarge"]
  }

  filter {
    name   = "location"
    values = [var.aws_region]
  }

  preferred_instance_types = ["g4dn.xlarge", "g5.xlarge"]
}

resource "aws_ec2_capacity_reservation" "vera_baseline" {
  instance_type           = "g4dn.xlarge"
  instance_platform       = "Linux/UNIX"
  availability_zone       = var.availability_zone
  instance_count          = 2  # Reserve 2 on-demand for stability
  instance_match_criteria = "open"
  ebs_optimized           = true
}

# Variables
variable "ssh_key_name" {
  description = "Name of SSH key pair"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "availability_zone" {
  description = "Primary availability zone"
  type        = string
  default     = "us-east-1a"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "slack_webhook_url" {
  description = "Slack webhook for notifications"
  type        = string
  sensitive   = true
}

variable "additional_tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}

# Outputs
output "autoscaling_group_name" {
  description = "Name of the Vera spot instance ASG"
  value       = aws_autoscaling_group.vera_spot.name
}

output "spot_savings_estimate" {
  description = "Estimated monthly savings from spot instances"
  value       = "~70% compute cost reduction = ~$1200-1800/month savings"
}

output "interruption_handler_lambda" {
  description = "Lambda function for spot interruption handling"
  value       = aws_lambda_function.spot_handler.function_name
}
