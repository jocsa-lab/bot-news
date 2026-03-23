locals {
  image = var.docker_image != "" ? var.docker_image : "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.pipeline.repository_id}/content-pipeline:latest"

  # Map secret names to env var names expected by the app
  secret_env_vars = {
    GEMINI_API_KEY              = "gemini-api-key"
    DEEPSEEK_API_KEY            = "deepseek-api-key"
    ANTHROPIC_API_KEY           = "anthropic-api-key"
    MONGODB_URI                 = "mongodb-uri"
    META_APP_ID                 = "meta-app-id"
    META_APP_SECRET             = "meta-app-secret"
    META_ACCESS_TOKEN           = "meta-access-token"
    INSTAGRAM_ACCOUNT_ID        = "instagram-account-id"
    TELEGRAM_BOT_TOKEN          = "telegram-bot-token"
    TELEGRAM_CHAT_ID            = "telegram-chat-id"
  }
}

resource "google_cloud_run_v2_service" "pipeline" {
  name     = "content-pipeline"
  location = var.region

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    timeout = "300s"

    containers {
      image = local.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # Plain env vars
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }

      # Secret-backed env vars
      dynamic "env" {
        for_each = local.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [google_secret_manager_secret.secrets]
}

# Allow unauthenticated access (for Telegram webhook)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.pipeline.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
