resource "google_storage_bucket" "temp_images" {
  name                        = "${var.project_id}-temp-images"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "Delete"
    }
  }
}
