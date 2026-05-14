variable "app_name" {
  description = "Application name"
  type        = string
  default     = "vera-lattice"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "cpu" {
  description = "Fargate task CPU units"
  type        = string
  default     = "512"
}

variable "memory" {
  description = "Fargate task memory (MiB)"
  type        = string
  default     = "1024"
}

variable "desired_count" {
  description = "Initial ECS service count"
  type        = number
  default     = 2
}

variable "min_count" {
  description = "Minimum ECS service count"
  type        = number
  default     = 2
}

variable "max_count" {
  description = "Maximum ECS service count"
  type        = number
  default     = 10
}

variable "hedera_network" {
  description = "Hedera network (mainnet/testnet)"
  type        = string
  default     = "mainnet"
}

variable "model_provider" {
  description = "LLM provider (ollama/openai/google/native)"
  type        = string
  default     = "openai"
}

variable "hedera_operator_account_id" {
  description = "Hedera operator account ID"
  type        = string
  sensitive   = true
}

variable "hedera_operator_private_key" {
  description = "Hedera operator private key"
  type        = string
  sensitive   = true
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
  type        = string
}
