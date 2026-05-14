output "load_balancer_dns" {
  description = "DNS name of the application load balancer"
  value       = aws_lb.vera.dns_name
}

output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = aws_ecr_repository.vera.repository_url
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.vera.name
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.vera.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for container logs"
  value       = aws_cloudwatch_log_group.vera.name
}
