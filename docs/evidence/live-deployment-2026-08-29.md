# Live Google Cloud deployment receipt

Captured on **29 August 2026** after deploying commit `bc41bed` and the Yange Mirror compatibility hotfix to project `yange-agentic-prod-2026`.

This receipt contains no credentials, signed URLs, user photographs, bucket object paths or private user identifiers. The public endpoints below can be checked independently while the service remains online.

## Public service

- URL: <https://yange-kdxt2klboq-bq.a.run.app/>
- Health: <https://yange-kdxt2klboq-bq.a.run.app/health>
- Runtime configuration: <https://yange-kdxt2klboq-bq.a.run.app/v1/runtime>
- Cloud Run revision: `yange-00013-qzv`
- Traffic: `100%`
- Container image: `africa-south1-docker.pkg.dev/yange-agentic-prod-2026/yange/yange-api:20260829-183100-hotfix`
- Image digest: `sha256:a448ac48b44fa995953b44187f07f79773482589758f0e4602545f1aba582eae`

The health probe returned:

```json
{"status":"ok","service":"yange"}
```

## Private worker

- Cloud Run revision: `yange-worker-00011-m54`
- Traffic: `100%`
- Container image: `africa-south1-docker.pkg.dev/yange-agentic-prod-2026/yange/yange-api:20260829-183100-hotfix`
- Direct unauthenticated access: denied by Cloud Run IAM
- New-revision error audit after rollout: no worker errors recorded

The edge and worker use the same immutable container but start with different runtime roles. The edge does not expose internal worker routes, and the worker does not expose public application routes.

## Sanitised runtime receipt

The live `/v1/runtime` response reported:

```json
{
  "configuration": {
    "mode": "google",
    "role": "edge",
    "environment": "production",
    "serviceName": "yange",
    "projectId": "yange-agentic-prod-2026",
    "location": "global",
    "taskLocation": "me-central1",
    "geminiModel": "gemini-3.5-flash",
    "geminiMultimodalModel": "gemini-3.5-flash-lite",
    "firestoreDatabase": "(default)",
    "mediaBucketConfigured": true,
    "workerConfigured": true,
    "taskInvokerConfigured": true,
    "weatherConfigured": true,
    "calendarConfigured": false,
    "mirrorConfigured": true,
    "mirrorModel": "virtual-try-on-001",
    "mirrorProcessingRegion": "europe-west1",
    "mirrorDailyLimit": 4
  },
  "readiness": {
    "ready": true,
    "issues": []
  },
  "architecture": {
    "decisionAuthority": "deterministic-domain",
    "aiRole": "supervised-proposal-and-explanation",
    "persistence": "firestore-transactional",
    "media": "private-cloud-storage",
    "asyncTransport": "cloud-tasks-plus-pubsub"
  }
}
```

The per-browser opaque session partition was deliberately removed from this stored receipt.

## Yange Mirror upload-contract smoke test

A valid 1 KiB JPEG upload-intent request was sent through a fresh application session. No photograph or file body was uploaded.

```text
SIGNED_UPLOAD=True
CONTENT_TYPE=image/jpeg
```

The server returned a private, short-lived signed upload URL. The URL itself was not printed or stored.

Two earlier malformed probes correctly returned `REQUEST_BODY_INVALID` and produced the only edge error entries during this verification window. The valid request above passed immediately afterward. These schema failures prove that the edge rejects unexpected Mirror payloads before any media processing begins.

## Repository gates rerun after the README update

```text
npm test          -> 108/108 TypeScript tests passed
npm run typecheck -> all TypeScript workspaces passed
npm run build     -> all buildable workspaces produced production output
README links      -> 8 local targets checked, 0 missing
```

The production build includes the verified 4,574,861-byte on-device garment cutout model with SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`.

## Infrastructure present in the deployed environment

- Public Cloud Run edge
- Private Cloud Run deterministic worker
- Private Cloud Run Google ADK steward
- Firestore event ledger, projections, checkpoints and transactional outbox
- Private Cloud Storage with short-lived signed media access
- Cloud Tasks queues with OIDC dispatch, including a rate-limited Mirror queue
- Cloud Scheduler sweeps
- Pub/Sub ordered audit events and dead-letter handling
- Google Weather context
- Vertex AI Gemini adapters
- Google Virtual Try-On in `europe-west1`
- Secret Manager and separate least-privilege service identities

Google Calendar is intentionally reported as disconnected in this receipt. It is an optional read-only adapter and is not required for weather-aware planning or manually supplied occasion context.

