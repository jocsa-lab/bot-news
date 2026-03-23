resource "google_cloud_scheduler_job" "content_morning" {
  name      = "content-morning"
  schedule  = var.morning_schedule
  time_zone = var.scheduler_timezone

  http_target {
    uri         = "${google_cloud_run_v2_service.pipeline.uri}/generate"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  retry_config {
    retry_count          = 1
    min_backoff_duration = "60s"
  }
}

resource "google_cloud_scheduler_job" "content_evening" {
  name      = "content-evening"
  schedule  = var.evening_schedule
  time_zone = var.scheduler_timezone

  http_target {
    uri         = "${google_cloud_run_v2_service.pipeline.uri}/generate"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  retry_config {
    retry_count          = 1
    min_backoff_duration = "60s"
  }
}

resource "google_cloud_scheduler_job" "meta_token_refresh" {
  name      = "meta-token-refresh"
  schedule  = "0 3 1 * *"
  time_zone = "UTC"

  http_target {
    uri         = "${google_cloud_run_v2_service.pipeline.uri}/refresh-token"
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  retry_config {
    retry_count          = 1
    min_backoff_duration = "60s"
  }
}
