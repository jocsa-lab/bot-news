variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "southamerica-east1"
}

variable "scheduler_timezone" {
  description = "Timezone for Cloud Scheduler jobs"
  type        = string
  default     = "America/Sao_Paulo"
}

variable "morning_schedule" {
  description = "Cron schedule for morning content generation (BRT)"
  type        = string
  default     = "0 8 * * *"
}

variable "evening_schedule" {
  description = "Cron schedule for evening content generation (BRT)"
  type        = string
  default     = "0 18 * * *"
}

variable "docker_image" {
  description = "Full Docker image URI (Artifact Registry)"
  type        = string
  default     = ""
}
