# Phase 5 verification record

Phase 5 was verified on 15 August 2026 without Google credentials. Cloud deployment verification is intentionally deferred to the final credential-connection step in `docs/google-cloud-setup.md`.

## Automated gates

Run from the repository root:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
python -m compileall -q services/yange_steward
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

Observed results:

- 54 TypeScript tests passed across 17 test files and six workspaces; two credential-free Python policy tests also passed for the ADK service.
- `@yange/cloud`: 12 tests covering readiness, least-privilege role configuration, transaction semantics, outbox retry, Cloud Tasks deduplication, Vertex schema/authority rejection, weather-cache coalescing, and stored-media validation.
- `@yange/api`: six tests covering local readiness, durable server-side WearCast execution, cross-origin and edge/worker isolation, malformed workflow identities, and server-side session expiry.
- Existing domain, contract, orchestrator, and image-pipeline suites remained green.
- Strict TypeScript checks passed for all six workspaces.
- The Node API bundle, production Vite application, and all library builds succeeded.
- Google ADK Python sources compiled under Python 3.12.
- ADK contract tests proved the agent cannot import Firestore/Storage and retains the user-agency instruction.
- Terraform 1.9.8 formatted and validated the configuration against locked Google provider 7.44.0.
- The dependency audit reported no high or critical vulnerabilities. Eight moderate transitive findings remain in Google client-library dependency chains; npm offers only a forced breaking major upgrade, so CI blocks high severity while these upstream packages are monitored.

## Contract and failure evidence

- Firestore append is designed as a single event/projection/outbox transaction and ignores existing event documents.
- Workflow repositories accept asynchronous durable adapters without changing browser-local implementations.
- Failed outbox delivery records an attempt and error; retry publishes the same outbox identity and reaches `published`.
- Cloud Tasks uses a stable task name and treats `ALREADY_EXISTS` as a deduplicated success.
- Google-mode readiness fails closed when project, edge media, worker URL, task identity, allowed origin, or session secret is absent.
- Edge and worker route guards expose disjoint public/private surfaces.
- Vertex adapters reject malformed output, forbidden action fields, false confirmation, and unsupported factor citations.
- Trusted response-envelope values cannot be overwritten by model JSON.
- Concurrent weather requests collapse into one provider call, and cached results are returned as defensive copies.
- Static ADK contract tests prohibit Firestore/Storage imports and require user-agency language.

## Local cloud rehearsal

Run both processes:

```powershell
npm.cmd run dev:cloud
```

The React app runs at `http://127.0.0.1:4173` and the Node boundary at `http://127.0.0.1:8080`. The **Cloud proof** surface reads sanitized runtime evidence, stages pressure in an isolated server-side twin, runs WearCast, and displays a terminal six-checkpoint receipt. It must say **Local cloud rehearsal**, never Google Cloud live.

## Browser walkthrough

The local rehearsal was exercised in the in-app Chromium browser at the normal desktop viewport and at 390 × 844:

1. Opened **Cloud proof** and confirmed the server-reported **Local cloud rehearsal** badge, `yange-api-local`, the Gemini 3.5 Flash boundary, opaque session partition, and 7/7 architecture passport.
2. Ran the proof from a clean server partition.
3. Confirmed all six checkpoints reached committed state: nine forecast periods validated, one risk simulated through two branches, 13 domain events committed, and three stable notifications delivered.
4. Confirmed the receipt exposed the run ID, WearCast decision ID, one attempt, zero initial duplicates, and three notifications.
5. Reloaded the page and confirmed the latest durable receipt restored automatically without rerunning the workflow.
6. Fired the exact trigger again and confirmed the same run/decision/notification values while `Duplicate triggers` changed from zero to one.
7. Switched to 390 × 844 and confirmed `scrollWidth === clientWidth` (375 CSS pixels after browser chrome), the checkpoint stack, 7/7 passport, vertical authority boundary, receipt grid, and footer all remained legible.
8. Reset the isolated server partition and confirmed the receipt was removed.

Observed results:

- No document-level horizontal overflow at desktop or phone width.
- Browser console contained no warnings or errors before or after reset.
- The responsive tab rail intentionally scrolls within itself while the document width remains fixed.
- The UI never represented the manual forecast or in-memory adapters as deployed Google services.

## Credential-time gates

Phase 5 is code-complete only after the following are captured once the funded project is connected:

- public edge `/healthz`, `/readyz`, and `/v1/runtime` responses;
- Cloud Proof six-checkpoint receipt with **Google Cloud live**;
- private worker rejected without an identity token and succeeded through Cloud Tasks;
- Firestore transaction/outbox documents and private Storage access;
- Cloud Scheduler sweep plus Cloud Tasks retry settings;
- Pub/Sub audit subscription and dead-letter topic;
- ADK trace showing inspect-before-action and the verified worker tool;
- Vertex AI Gemini 3.5 Flash request evidence;
- structured Cloud Logging entry with request/trace correlation; and
- one rollback or isolated-failure demonstration.

No local verification result is represented as deployed proof. The deployment checklist is explicit so the final credential step is connection and evidence capture, not unfinished application engineering.
