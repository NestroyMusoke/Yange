# Deploy Yange to Google Cloud

This is the only phase that needs your Google account. Do not create service-account keys and do not put credentials in this repository. Cloud Run uses attached service identities and the deployment script generates the session secret directly into Secret Manager through Terraform.

## 1. Prerequisites

- A Google Cloud project with billing and the hackathon credit attached
- Google Cloud CLI (`gcloud`) authenticated as a project owner during initial provisioning
- Terraform 1.8 or newer
- PowerShell 7 or Windows PowerShell 5.1
- Optional: Agents CLI if you want the command-line ADK proof

Authenticate and choose the funded project:

```powershell
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud auth list
```

Before deployment, create a small Cloud Billing budget and email alert in the console. A budget alerts you; it does not automatically stop usage. Google Weather is billable per successful request, so keep the included instance/queue caps and do not run continuous demos.

## 2. Optional Calendar connection

Calendar is not required for the winning Friday-risk demo. To enable it without OAuth secrets:

1. deploy once or note the future worker identity `yange-worker@YOUR_PROJECT_ID.iam.gserviceaccount.com`;
2. share a dedicated demo calendar with that address using **See all event details** only;
3. copy the calendar ID from Calendar settings; and
4. pass it as `-CalendarId` during deployment.

Use a demo calendar, not a private personal calendar. The adapter requests events only and cannot modify them.

## 3. Deploy

From the repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\deploy-google-cloud.ps1 `
  -ProjectId YOUR_PROJECT_ID `
  -CalendarId ''
```

The script enables bootstrap APIs, creates Artifact Registry, builds two immutable images with Cloud Build, generates a random session secret, validates/applies Terraform, applies private-bucket CORS for the final edge URL, and probes health/readiness. Terraform provisions the remaining APIs and resources.

The intentional regional split is:

- `africa-south1`: web/API, worker, ADK service, Firestore, Storage, Pub/Sub persistence;
- `me-central1`: Cloud Tasks and Scheduler, which have no African region;
- `global`: Vertex AI Gemini endpoint.

Override these only if the selected Google APIs are unavailable in your project:

```powershell
.\scripts\deploy-google-cloud.ps1 `
  -ProjectId YOUR_PROJECT_ID `
  -AppRegion africa-south1 `
  -TaskRegion me-central1 `
  -VertexLocation global `
  -GeminiModel gemini-3.5-flash
```

## 4. Prove the deployed web workflow

Open the printed `https://...run.app` edge URL and select **Cloud proof**. It must say **Google Cloud live**. Click **Run cloud proof** and capture:

- six committed workflow checkpoints in Yange;
- the Cloud Run edge and private worker revisions;
- the `wearcast-runs` Cloud Tasks queue;
- the Firestore user partition with `events`, `projections`, `workflows`, and `outbox` subcollections;
- structured request/workflow logs in Cloud Logging; and
- the Vertex AI / ADK service revision described below.

If you need a clean take, click **Reset cloud twin**. Reset affects only the current anonymous demo partition.

## 5. Prove Gemini + Google ADK

Install/use Google's Agents CLI, then obtain the private agent URL and an identity token:

```powershell
$projectId = 'YOUR_PROJECT_ID'
$region = 'africa-south1'
$agentUrl = gcloud run services describe yange-steward --project $projectId --region $region --format 'value(status.url)'
$token = gcloud auth print-identity-token
```

Read the `sessionPartition` value from `GET /v1/runtime` in browser devtools or PowerShell, then run:

```powershell
agents-cli run `
  --url $agentUrl `
  --mode adk `
  --app-name yange_steward `
  -H "Authorization: Bearer $token" `
  "Inspect wardrobe partition SESSION_PARTITION, then run verified WearCast with trigger adk-demo-20260814 and timestamp 2026-08-14T07:30:00Z. Report the checkpoint receipt."
```

The trace should show `inspect_wardrobe_twin` before `run_verified_wearcast`. The worker, not Gemini, returns the committed receipt. Repeating the identical trigger demonstrates deduplication.

## 6. Failure and rollback checks

- Stop or deny Pub/Sub temporarily: the decision should complete while outbox rows become `failed`; the recovery scheduler later republishes them.
- Repeat a WearCast trigger: Cloud Tasks or the worker returns the existing identity/receipt without duplicate events.
- Remove one required edge variable from a test revision: `/readyz` must return 503 while `/healthz` remains 200.
- Roll back a service with `gcloud run services update-traffic SERVICE --to-revisions REVISION=100 --region africa-south1`.

Never demonstrate failure injection against a personal production calendar or irreplaceable bucket.

## 7. Pause spending after recording

The hackathon permits deployment proof without keeping the app live continuously. After capturing the demo, set public traffic aside or delete nonessential revisions. Terraform enables deletion protection for stateful and Cloud Run resources, so deliberate teardown requires first changing that setting in code and applying it; this prevents an accidental `terraform destroy` from erasing evidence.

Keep the screenshots, Cloud Logging trace IDs, deployed revision names, and video evidence for Phase 6. Never commit Terraform state, `.env`, tokens, or downloaded credentials.
