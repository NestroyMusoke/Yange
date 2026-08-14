# Yange Phase 5 specification

## Outcome

Phase 5 turns the credential-free product into a deployable Google Cloud system without moving judgment into the UI or handing state authority to a language model. It adds a public edge, private task worker, supervised Google ADK service, transactional persistence, private media, asynchronous delivery, workload identities, and visible deployment proof.

The local build remains the default. A fresh clone can exercise the same API and checkpoint flow with no account, key, or paid request; Google adapters activate only when `YANGE_RUNTIME=google` is supplied by infrastructure.

## Runtime topology

| Boundary | Exposure | Authority | Failure behaviour |
|---|---|---|---|
| React web + edge API | Public Cloud Run service | Session, validation, signed media intents, task enqueue | Returns explicit readiness/adapter state; cannot call worker without IAM |
| Deterministic worker | Private Cloud Run service | Domain commands, event projection, WearCast checkpoints, outbox | Resumes from saved checkpoint; duplicate trigger returns prior receipt |
| Yange Steward | Private Cloud Run service using Google ADK + Gemini 3.5 Flash | Inspect state, reason, and request approved worker tools | Cannot import Firestore/Storage or commit state directly |
| Firestore | IAM only | Per-user event ledger, current projection, workflow receipt, outbox | Event, projection, and outbox records commit in one transaction |
| Cloud Storage | Private bucket | Rewritten wardrobe image bytes | Short-lived signed PUT/GET URLs; pixels never enter domain events |
| Cloud Tasks + Scheduler | OIDC-authenticated | Deferred WearCast execution and periodic sweeps | Stable task IDs, bounded retries, exponential backoff, concurrency cap |
| Pub/Sub | IAM only | Domain-event fan-out and audit stream | Transactional outbox replay, ordered per-user keys, dead-letter topic |

The edge and worker share one immutable Node image but receive different roles and service accounts. Route guards hide `/internal/*` on the edge and `/v1/*` on the worker. The worker has no session secret or media permission; the edge has no Vertex AI or Pub/Sub permission.

## Model authority boundary

Gemini is useful where ambiguity exists: care-label extraction, inspiration-image description, score explanation, and ADK tool selection. It is deliberately not the source of truth for garment availability, care compatibility, Personal Match, drying safety, event commits, or idempotency.

Structured Vertex responses use versioned JSON schemas and runtime parsers. Trusted envelope fields are written after model output, so a response cannot replace its request ID, adapter identity, mode, contract version, or generation time. Extracted care evidence remains `needs-review`; the model cannot manufacture `user-confirmed` evidence. Explanation responses may cite only factor keys produced by the deterministic scorer.

The ADK agent has two narrow tools:

1. `inspect_wardrobe_twin(user_id)` reads the committed private projection.
2. `run_verified_wearcast(user_id, trigger_id, triggered_at)` asks the worker to evaluate and, if valid, commit a checkpointed run.

Both calls use Cloud Run identity tokens. The agent service cannot access databases or media and cannot bypass worker validation.

## Transactional state and asynchronous action

Every user is an isolated Firestore partition. Appending events performs one transaction that:

1. ignores already-present event IDs;
2. assigns a monotonic projection sequence;
3. writes new immutable event documents;
4. rebuilds and writes the current projection; and
5. creates one stable outbox record per event.

Publishing happens after commit. If Pub/Sub is unavailable, the workflow decision remains valid and the failed outbox record is retried by a 15-minute recovery sweep. At-least-once delivery is expected: event IDs, operation IDs, trigger IDs, task names, and Pub/Sub attributes remain stable across retries.

## Weather, calendar, and cost discipline

The worker uses Application Default Credentials to request Google Weather hourly forecasts for Kampala and validate them through the existing seven-day contract. Concurrent calls are coalesced and a successful forecast is cached for 25 minutes inside each warm worker instance. Drying results remain opportunities, never guarantees.

The Google Calendar adapter is optional and read-only. The chosen calendar must be shared with the worker service account; no OAuth refresh token or client secret is stored in Yange.

Cost controls are part of the architecture:

- edge, worker, and agent scale to zero;
- maximum instance counts are two, two, and one;
- Cloud Tasks dispatches at most two concurrent requests and two per second;
- weather calls are cached and happen in the worker, not per browser render;
- media objects under `temporary/` expire after one day;
- logs omit secrets, tokens, signed URLs, images, and prompt content;
- the deployment guide requires a billing budget alert before the public demo.

## Regional and security choices

Cloud Run, Firestore, Storage, and Pub/Sub data persistence use `africa-south1`, near the Kampala demo. Cloud Tasks and Scheduler use `me-central1` because Cloud Tasks does not currently offer an African region; task payloads contain only opaque user/trigger IDs and timestamps, never wardrobe media. Vertex AI uses the global endpoint required by the selected Gemini model.

Cloud Run services use attached service identities rather than downloaded keys. The public edge alone permits unauthenticated invocation. Worker and agent calls require `roles/run.invoker`; task creation uses a dedicated OIDC identity with narrowly scoped `iam.serviceAccountUser`. Session signing material lives in Secret Manager and is exposed only to the edge.

## Observability and judge proof

The API writes single-line structured JSON logs carrying request ID, severity, component, route, latency, opaque user partition, and Cloud Trace correlation when `X-Cloud-Trace-Context` is present. `/healthz` proves process health; `/readyz` fails closed on missing production configuration; `/v1/runtime` exposes only sanitized adapter and architecture metadata.

The **Cloud proof** screen uses those endpoints, stages a server-side 50% wardrobe-risk scenario, fires the real API boundary, polls for a durable terminal receipt, and renders all six checkpoints. In local mode it labels itself **Local cloud rehearsal**. After deployment the identical surface labels itself **Google Cloud live** from server evidence rather than a frontend flag.

## Acceptance gates

- Local API and web run without credentials.
- Edge, worker, and agent build as immutable containers.
- Google mode fails readiness when required values are absent.
- Internal and public route surfaces are role-separated.
- A Firestore transaction cannot write events without its matching projection and outbox.
- Cloud Task identity, task name, and handler trigger remain stable on retry.
- An outbox failure is persisted and later publish succeeds without a second domain event.
- Malformed Vertex output and trusted-field spoofing fail closed.
- The ADK service has no database or media import.
- Terraform formats and validates against the pinned Google provider.
- Tests, strict type checking, production build, Python syntax, high-severity audit, desktop, and phone checks pass.
