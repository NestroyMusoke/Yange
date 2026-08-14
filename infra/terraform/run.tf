locals {
  common_environment = {
    YANGE_RUNTIME                      = "google"
    GOOGLE_CLOUD_PROJECT               = var.project_id
    GOOGLE_CLOUD_LOCATION              = var.vertex_location
    YANGE_TASK_LOCATION                = var.task_region
    GEMINI_MODEL                       = var.gemini_model
    FIRESTORE_DATABASE                 = google_firestore_database.default.name
    YANGE_WEARCAST_QUEUE               = google_cloud_tasks_queue.wearcast.name
    YANGE_EVENTS_TOPIC                 = google_pubsub_topic.events.name
    YANGE_TASK_INVOKER_SERVICE_ACCOUNT = google_service_account.task_invoker.email
    YANGE_WEATHER_LATITUDE             = "0.3476"
    YANGE_WEATHER_LONGITUDE            = "32.5825"
    GOOGLE_CALENDAR_ID                 = var.calendar_id
  }
}

resource "google_cloud_run_v2_service" "worker" {
  name                = "yange-worker"
  location            = var.app_region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account                  = google_service_account.worker.email
    timeout                          = "300s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.api_image
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = merge(local.common_environment, {
          YANGE_ROLE = "worker"
        })
        content {
          name  = env.key
          value = env.value
        }
      }

      startup_probe {
        failure_threshold     = 3
        initial_delay_seconds = 2
        period_seconds        = 5
        timeout_seconds       = 2
        http_get {
          path = "/healthz"
        }
      }
      liveness_probe {
        period_seconds  = 30
        timeout_seconds = 2
        http_get {
          path = "/healthz"
        }
      }
    }
  }

  depends_on = [
    google_project_service.required,
    google_service_account_iam_member.task_identity_users,
  ]
}

resource "google_cloud_run_v2_service" "edge" {
  name                = "yange"
  location            = var.app_region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account                  = google_service_account.edge.email
    timeout                          = "60s"
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.api_image
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      ports {
        container_port = 8080
      }

      dynamic "env" {
        for_each = merge(local.common_environment, {
          YANGE_ROLE           = "edge"
          YANGE_ALLOWED_ORIGIN = "self"
          YANGE_MEDIA_BUCKET   = google_storage_bucket.media.name
          YANGE_WORKER_URL     = google_cloud_run_v2_service.worker.uri
        })
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "YANGE_SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        failure_threshold     = 3
        initial_delay_seconds = 2
        period_seconds        = 5
        timeout_seconds       = 2
        http_get {
          path = "/healthz"
        }
      }
      liveness_probe {
        period_seconds  = 30
        timeout_seconds = 2
        http_get {
          path = "/healthz"
        }
      }
    }
  }

  depends_on = [
    google_cloud_run_v2_service.worker,
    google_secret_manager_secret_version.session,
    google_secret_manager_secret_iam_member.session_access,
  ]
}

resource "google_cloud_run_v2_service" "agent" {
  name                = "yange-steward"
  location            = var.app_region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account                  = google_service_account.agent.email
    timeout                          = "300s"
    max_instance_request_concurrency = 10

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.agent_image
      resources {
        limits   = { cpu = "1", memory = "1Gi" }
        cpu_idle = true
      }
      ports {
        container_port = 8080
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.vertex_location
      }
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "true"
      }
      env {
        name  = "GEMINI_MODEL"
        value = var.gemini_model
      }
      env {
        name  = "YANGE_WORKER_URL"
        value = google_cloud_run_v2_service.worker.uri
      }
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service_iam_member" "edge_public" {
  project  = var.project_id
  location = var.app_region
  name     = google_cloud_run_v2_service.edge.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "task_worker" {
  project  = var.project_id
  location = var.app_region
  name     = google_cloud_run_v2_service.worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.task_invoker.email}"
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_worker" {
  project  = var.project_id
  location = var.app_region
  name     = google_cloud_run_v2_service.worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_run_v2_service_iam_member" "agent_worker" {
  project  = var.project_id
  location = var.app_region
  name     = google_cloud_run_v2_service.worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_cloud_scheduler_job" "wearcast_sweep" {
  name             = "yange-wearcast-sweep"
  region           = var.task_region
  schedule         = "17 */6 * * *"
  time_zone        = "Africa/Kampala"
  attempt_deadline = "180s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "15s"
    max_backoff_duration = "300s"
    max_doublings        = 3
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.worker.uri}/internal/scheduler/sweep"
    body        = base64encode("{}")
    headers = {
      "Content-Type" = "application/json"
      "X-Yange-User" = "system"
    }
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }
}

resource "google_cloud_scheduler_job" "outbox_sweep" {
  name             = "yange-outbox-recovery"
  region           = var.task_region
  schedule         = "*/15 * * * *"
  time_zone        = "Africa/Kampala"
  attempt_deadline = "180s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "15s"
    max_backoff_duration = "300s"
    max_doublings        = 3
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.worker.uri}/internal/scheduler/outbox-sweep"
    body        = base64encode("{}")
    headers = {
      "Content-Type" = "application/json"
      "X-Yange-User" = "system"
    }
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }
}
