data "google_project" "current" {
  project_id = var.project_id
}

locals {
  services = toset([
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "calendar-json.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtasks.googleapis.com",
    "firestore.googleapis.com",
    "iamcredentials.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "weather.googleapis.com",
  ])

  pubsub_service_agent = "service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_project_service" "required" {
  for_each           = local.services
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firestore_database" "default" {
  project                     = var.project_id
  name                        = "(default)"
  location_id                 = var.app_region
  type                        = "FIRESTORE_NATIVE"
  delete_protection_state     = "DELETE_PROTECTION_ENABLED"
  deletion_policy             = "ABANDON"
  concurrency_mode            = "PESSIMISTIC"
  app_engine_integration_mode = "DISABLED"

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-yange-media"
  location                    = var.app_region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # The final Cloud Run URL is only known after the edge service exists, while
  # the edge service also needs this bucket name. The deployer resolves that
  # cycle by applying origin-specific CORS after Terraform completes.
  lifecycle {
    ignore_changes = [cors]
  }

  lifecycle_rule {
    condition {
      age            = 1
      matches_prefix = ["temporary/"]
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "session" {
  secret_id = "yange-session-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "session" {
  secret      = google_secret_manager_secret.session.id
  secret_data = var.session_secret
}

resource "google_service_account" "edge" {
  account_id   = "yange-edge"
  display_name = "Yange public edge runtime"
}

resource "google_service_account" "worker" {
  account_id   = "yange-worker"
  display_name = "Yange private deterministic worker"
}

resource "google_service_account" "agent" {
  account_id   = "yange-adk-agent"
  display_name = "Yange Google ADK reasoning service"
}

resource "google_service_account" "scheduler" {
  account_id   = "yange-scheduler"
  display_name = "Yange Cloud Scheduler caller"
}

resource "google_service_account" "task_invoker" {
  account_id   = "yange-task-invoker"
  display_name = "Yange Cloud Tasks worker caller"
}

resource "google_project_iam_member" "edge_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.edge.email}"
}

resource "google_project_iam_member" "worker_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "agent_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_project_iam_member" "edge_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.edge.email}"
}

resource "google_project_iam_member" "worker_service_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "worker_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "edge_service_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.edge.email}"
}

resource "google_project_iam_member" "task_enqueuers" {
  for_each = toset([google_service_account.edge.email, google_service_account.worker.email])
  project  = var.project_id
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${each.value}"
}

resource "google_service_account_iam_member" "task_identity_users" {
  for_each           = toset([google_service_account.edge.email, google_service_account.worker.email])
  service_account_id = google_service_account.task_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${each.value}"
}

resource "google_storage_bucket_iam_member" "edge_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.edge.email}"
}

resource "google_storage_bucket_iam_member" "worker_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_service_account_iam_member" "edge_signer" {
  service_account_id = google_service_account.edge.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.edge.email}"
}

resource "google_secret_manager_secret_iam_member" "session_access" {
  secret_id = google_secret_manager_secret.session.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.edge.email}"
}

resource "google_pubsub_topic" "events" {
  name = "yange-domain-events"
  message_storage_policy {
    allowed_persistence_regions = [var.app_region]
  }
  message_retention_duration = "604800s"
  depends_on                 = [google_project_service.required]
}

resource "google_pubsub_topic" "dead_letter" {
  name = "yange-domain-events-dead-letter"
  message_storage_policy {
    allowed_persistence_regions = [var.app_region]
  }
  message_retention_duration = "1209600s"
  depends_on                 = [google_project_service.required]
}

resource "google_pubsub_subscription" "audit" {
  name                       = "yange-domain-events-audit"
  topic                      = google_pubsub_topic.events.id
  ack_deadline_seconds       = 30
  message_retention_duration = "604800s"
  retain_acked_messages      = false
  enable_message_ordering    = true

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_pubsub_topic_iam_member" "dead_letter_service_agent" {
  topic  = google_pubsub_topic.dead_letter.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${local.pubsub_service_agent}"
}

resource "google_pubsub_subscription_iam_member" "audit_service_agent" {
  subscription = google_pubsub_subscription.audit.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${local.pubsub_service_agent}"
}

resource "google_cloud_tasks_queue" "wearcast" {
  name     = "wearcast-runs"
  location = var.task_region

  rate_limits {
    max_concurrent_dispatches = 2
    max_dispatches_per_second = 2
  }

  retry_config {
    max_attempts       = 7
    max_retry_duration = "3600s"
    min_backoff        = "10s"
    max_backoff        = "600s"
    max_doublings      = 5
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_tasks_queue" "mirror" {
  name     = "mirror-previews"
  location = var.task_region

  rate_limits {
    max_concurrent_dispatches = 1
    max_dispatches_per_second = 1
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "1800s"
    min_backoff        = "20s"
    max_backoff        = "300s"
    max_doublings      = 3
  }

  depends_on = [google_project_service.required]
}
