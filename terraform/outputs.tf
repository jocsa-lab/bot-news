output "cloud_run_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.pipeline.uri
}

output "temp_bucket_name" {
  description = "Name of the temporary images bucket"
  value       = google_storage_bucket.temp_images.name
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.pipeline.repository_id}"
}
