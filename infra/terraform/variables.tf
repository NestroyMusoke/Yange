variable "project_id" {
  description = "Google Cloud project ID funded by the hackathon credits."
  type        = string
}

variable "app_region" {
  description = "Cloud Run, Firestore, Storage, and Pub/Sub data region near Yange's Kampala demo user."
  type        = string
  default     = "africa-south1"
}

variable "task_region" {
  description = "Nearest Cloud Tasks region currently supported by the service. Task payloads contain identifiers, not wardrobe media."
  type        = string
  default     = "me-central1"
}

variable "vertex_location" {
  description = "Vertex AI endpoint location."
  type        = string
  default     = "global"
}

variable "gemini_model" {
  description = "Hackathon-required Gemini model identifier."
  type        = string
  default     = "gemini-3.5-flash"
}

variable "gemini_multimodal_model" {
  description = "Fast Gemini model used for garment and care-label image understanding."
  type        = string
  default     = "gemini-3.5-flash-lite"
}

variable "mirror_location" {
  description = "Supported Google Virtual Try-On region. Wardrobe media crosses from Africa south1 only after explicit consent."
  type        = string
  default     = "europe-west1"
}

variable "mirror_daily_limit" {
  description = "Maximum user-initiated Mirror generations per anonymous wardrobe partition per UTC day."
  type        = number
  default     = 4
  validation {
    condition     = var.mirror_daily_limit >= 1 && var.mirror_daily_limit <= 20
    error_message = "mirror_daily_limit must be between 1 and 20."
  }
}

variable "api_image" {
  description = "Immutable Artifact Registry image URI for the Yange API/worker container."
  type        = string
}

variable "agent_image" {
  description = "Immutable Artifact Registry image URI for the Google ADK agent container."
  type        = string
}

variable "session_secret" {
  description = "At least 32 random characters used to sign anonymous private demo sessions."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.session_secret) >= 32
    error_message = "session_secret must be at least 32 characters."
  }
}

variable "calendar_id" {
  description = "Optional Google Calendar shared read-only with the worker service account."
  type        = string
  default     = ""
}

variable "budget_alert_email" {
  description = "Optional email for the final manual budget-alert step; Terraform does not create a billing budget without a billing account ID."
  type        = string
  default     = ""
}
