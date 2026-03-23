# --- Cloud Run service account ---

resource "google_service_account" "cloud_run" {
  account_id   = "content-pipeline-run"
  display_name = "Content Pipeline Cloud Run"
}

resource "google_project_iam_member" "cloud_run_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_storage_admin" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# --- Cloud Scheduler service account ---

resource "google_service_account" "scheduler" {
  account_id   = "content-pipeline-scheduler"
  display_name = "Content Pipeline Cloud Scheduler"
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.pipeline.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# --- Secret Manager write access for token refresh ---

resource "google_secret_manager_secret_iam_member" "cloud_run_meta_token_write" {
  secret_id = google_secret_manager_secret.secrets["meta-access-token"].id
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}
