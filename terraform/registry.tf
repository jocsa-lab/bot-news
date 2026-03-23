resource "google_artifact_registry_repository" "pipeline" {
  location      = var.region
  repository_id = "content-pipeline"
  format        = "DOCKER"
  description   = "Docker images for the content pipeline"
}
