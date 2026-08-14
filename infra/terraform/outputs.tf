output "edge_url" {
  description = "Public Yange demo URL."
  value       = google_cloud_run_v2_service.edge.uri
}

output "worker_url" {
  description = "Private deterministic worker URL."
  value       = google_cloud_run_v2_service.worker.uri
}

output "agent_url" {
  description = "Private Google ADK service URL."
  value       = google_cloud_run_v2_service.agent.uri
}

output "media_bucket" {
  description = "Private wardrobe media bucket."
  value       = google_storage_bucket.media.name
}

output "task_queue" {
  value = google_cloud_tasks_queue.wearcast.id
}
