locals {
  secret_ids = [
    "gemini-api-key",
    "deepseek-api-key",
    "anthropic-api-key",
    "mongodb-uri",
    "meta-app-id",
    "meta-app-secret",
    "meta-access-token",
    "instagram-account-id",
    "telegram-bot-token",
    "telegram-chat-id",
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secret_ids)
  secret_id = each.key

  replication {
    auto {}
  }
}

# Cloud Run SA can read all secrets
resource "google_secret_manager_secret_iam_member" "cloud_run_access" {
  for_each  = google_secret_manager_secret.secrets
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}
