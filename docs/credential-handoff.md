# Yange credential handoff

Yange's application code does not require source edits when credentials are connected. Local wardrobe capture, care review, outfit planning, Style Aura learning, laundry grouping, and WearCast rehearsal work without paid APIs.

## Required for the deployed Google demo

1. Authenticate `gcloud` with the funded project owner account.
2. Keep Application Default Credentials local; never commit a JSON key.
3. Deploy the verified revision with `scripts/deploy-google-cloud.ps1`.

The deployment attaches service identities to Cloud Run and provisions the session secret through Secret Manager. Firestore, Storage, Cloud Tasks, Scheduler, Pub/Sub, Google Weather, Vertex AI, and the ADK service use those attached identities.

## Optional Calendar connection

Create a dedicated demo calendar, share it read-only with `yange-worker@PROJECT_ID.iam.gserviceaccount.com`, and pass its calendar ID with `-CalendarId`. If Calendar is omitted or temporarily fails, weather-based planning continues and the UI labels Calendar as unavailable.

## What to test after deployment

1. Complete profile setup with your real city or browser location.
2. In Studio, upload one garment photo and one readable care-label close-up.
3. Review every extracted care fact and save the garment.
4. Refresh the page and confirm the photo restores from private cloud media.
5. Plan an occasion in Atelier with live weather selected.
6. Mark an outfit worn, save a Confidence Check-in, and verify the Style Aura receipt changes gradually.
7. In WearCast, enable device alerts, create laundry pressure, and run the check twice to prove duplicate suppression.
8. In Cloud, run the connected proof and capture all six committed checkpoints.

## Honest demo boundaries

- A browser notification appears after a connected Yange client observes an unseen durable inbox item. The in-app inbox remains the reliable fallback when OS permission is denied. Full push delivery to a completely closed browser would require a push-subscription service and is outside this hackathon MVP.
- Cloud sessions are browser-scoped signed sessions. Google account sign-in and multi-device account linking are optional post-MVP work, not required for the judged end-to-end journey.
- Direct TikTok URL ingestion is not included. Users can upload an inspiration image or a frame they have permission to use, which keeps the demo free and avoids brittle platform scraping.
- Google Weather and Vertex AI are billable services. The deployment scales to zero and is deliberately capped, but the attached hackathon credits are a budget, not a promise of permanently free usage.
