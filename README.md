# Yange

**Your Friday outfit depends on a shirt that is still in the laundry. Yange notices before you do.**

Yange is an autonomous wardrobe-readiness agent. It tracks what is wearable, reads confirmed care evidence, watches future plans and weather, and completes the safe parts of the laundry workflow before a dirty garment becomes a failed plan.

I built Yange alone in Kampala, Uganda, from a problem I kept living: my wardrobe had clothes, but no memory—and I was spending up to 30 minutes reconstructing its state in my head.

**[Open the live product](https://yange-kdxt2klboq-bq.a.run.app/)** · **[Read the build story](https://medium.com/@franciamusoke/i-lost-30-minutes-a-day-to-my-closet-so-i-built-an-agent-that-remembers-what-i-cant-39b9bc11e89a)** · **[Run it locally](#run-yange)**

[![WearCast autonomous wardrobe planning with durable checkpoints, replay safety and failure recovery](docs/submission-assets/05-wearcast-reliability.png)](docs/submission-assets/05-wearcast-reliability.png)

<sub>The core Taskmaster workflow: a scheduled trigger becomes a forecast-aware intervention, persists through six durable checkpoints, and produces each domain effect once even when transport retries. Click for the full-resolution architecture.</sub>

## The one chore Yange owns

The hard part of getting dressed is not generating an outfit description. It is keeping tomorrow's real options open while garments are being worn, aired, washed and dried.

One Friday explains the agent:

1. **A plan creates a dependency.** The user reserves an outfit for Friday. Its garments are now part of a future commitment, not just cards in a gallery.
2. **Reality changes.** Wearing another outfit moves each garment independently into available, rewearable, airing or laundry state according to confirmed material and care evidence.
3. **Yange wakes up without being asked.** Cloud Scheduler creates a stable trigger. Cloud Tasks invokes an authenticated private worker, which rebuilds the latest wardrobe state instead of trusting stale client memory.
4. **It simulates before acting.** WearCast acquires a timestamped forecast, clones the wardrobe projection, and compares doing nothing with a safe intervention.
5. **It completes the safe work.** If a dirty dependency threatens Friday, Yange separates compatible wash groups, finds a forecast-backed drying opportunity, reserves a verified fallback when necessary, and prepares one concise notification.
6. **It leaves a receipt.** One Firestore transaction records the intervention, current projection, workflow checkpoint and outbox message. Retries resume; they do not repeat the chore.

The user does not have to reopen a chat, remember which garment matters, ask whether the weather changed, or reconstruct what the agent already knew.

## Why this is a Taskmaster agent

| Taskmaster requirement | What Yange does | Inspectable evidence |
| --- | --- | --- |
| Owns a messy multi-step chore | Turns future outfit dependencies, garment state, care rules and weather into a readiness intervention | [WearCast implementation](packages/domain/src/wearcast.ts) and [domain tests](packages/domain) |
| Acts instead of only advising | Commits validated wardrobe interventions, wash plans, fallback reservations and notification outbox records | [Checkpointed orchestrator](packages/orchestrator) |
| Runs asynchronously | Cloud Scheduler → Cloud Tasks → authenticated private worker | [Production architecture](#production-architecture) |
| Survives retries | Stable trigger, operation and notification keys prevent duplicate effects | [WearCast reliability diagram](docs/submission-assets/05-wearcast-reliability.png) |
| Knows when not to act | Unknown care, stale weather or an unnecessary intervention produces a safe hold or no-op | [Failure boundaries](#failure-is-contained-not-hidden) |
| Proves what happened | Append-only events, workflow receipts, structured logs and live Cloud Console evidence | [Google Cloud proof](#live-google-cloud-proof) |

This is the distinction at the centre of Yange: **Gemini can interpret ambiguity, but deterministic policy decides whether the chore is safe to complete.**

## Built from a real story

I am **Musoke Nestroy**. Some mornings I spent as much as 30 minutes standing in front of my wardrobe—not because I lacked clothes, but because I was trying to remember too many changing facts at once: what I had worn, what still needed washing, which pieces I was overusing, what Kampala's weather might do, where I was going and what had made me feel confident before.

Laundry was the same problem in another form. I reread care labels, separated garments by memory, guessed whether the weather would let them dry, and sometimes discovered too late that a future outfit depended on something in the basket.

That confusion is not mine alone. A [2017 survey of 500 people in the UK](https://www.laundryandcleaningnews.com/news/over-half-of-people-find-clothing-care-labels-confusing-5768936/) found that 56% found clothing-care symbols confusing. A [2023 study of 159 Family and Consumer Sciences students in Ghana](https://www.scipublications.com/journal/index.php/jad/article/view/703) found that 42.1% did not understand care-label information; most could not identify several common drying and bleaching symbols.

I realised I was not facing an outfit-generation problem. I was facing a **memory, state and forward-planning problem**.

In Luganda, *yange* means **mine**. That became the promise: my wardrobe, my evidence, my routines—and an agent that does the work of paying attention before I have to.

## From care label to autonomous action

WearCast can only be useful if its inputs are trustworthy. Yange therefore builds the chore from evidence rather than model confidence.

### 1. Capture once

A user photographs a garment and its care label. Gemini 3.5 Flash Lite proposes observable facts through a versioned JSON contract. Runtime validation rejects malformed output, and uncertain material or care facts wait for human confirmation.

[![A real bedroom garment photo becomes a clean wardrobe asset while evidence extraction remains independent](docs/submission-assets/01-capture-to-clean-wardrobe.png)](docs/submission-assets/01-capture-to-clean-wardrobe.png)

<sub>One upload produces two independent results: a reviewable evidence proposal and a clean transparent wardrobe cutout. If background removal fails, the original remains usable and Gemini analysis continues.</sub>

### 2. Let the safest garment set the rules

Confirmed care evidence becomes an incompatibility graph. Unknown or unreviewed garments are held out instead of guessed. Accepted groups expose their strictest wash, bleach and drying requirements.

[![Confirmed care evidence blocks unsafe garment pairings and creates explained wash groups](docs/submission-assets/03-care-safe-laundry.png)](docs/submission-assets/03-care-safe-laundry.png)

<sub>Laundry Lab is the visible proof surface for the underlying policy: unsafe pairings are blocked, safe groups are explained, and a held garment cannot quietly enter an autonomous wash recommendation.</sub>

### 3. Simulate the future

WearCast combines the current Wardrobe Digital Twin with timestamped weather and future outfit dependencies. It calculates whether doing nothing is safe, whether washing now preserves the plan, whether drying conditions are credible, and whether a fallback should be reserved.

### 4. Commit once

The private worker revalidates every intervention at execution time. Firestore atomically writes the immutable event, rebuilt current projection, workflow receipt and transactional outbox record. Pub/Sub and notification delivery can retry without repeating the wardrobe mutation.

```text
Scheduled or user trigger
  -> public Cloud Run edge validates the typed command
  -> Cloud Tasks invokes a private worker with OIDC identity
  -> worker rebuilds the current Wardrobe Digital Twin
  -> timestamped forecast + future dependencies become simulation context
  -> deterministic policies choose act, hold or do nothing
  -> one Firestore transaction commits event + projection + receipt + outbox
  -> Pub/Sub and notifications resume from durable checkpoints
```

## Production architecture

Yange follows one authority rule throughout the system:

> **AI proposes. Validated domain rules commit.**

[![Yange production architecture with public edge, private execution, Google ADK, Vertex AI, Firestore, Cloud Tasks, Pub/Sub and Storage](docs/submission-assets/06-production-architecture.png)](docs/submission-assets/06-production-architecture.png)

<sub>The complete system is role-separated: a public edge accepts typed commands; authenticated private services execute and reason; Firestore preserves transactional truth; Cloud Tasks, Scheduler and Pub/Sub move durable work. Click for full resolution.</sub>

The domain engine has no React, browser, Gemini or Google Cloud dependency. External systems live behind replaceable ports, long-running work resumes from checkpoints, and every autonomous mutation is validated again at the worker boundary.

### Google AI responsibilities

| Capability | Model or framework | Authority boundary |
| --- | --- | --- |
| Garment, care-label and inspiration evidence | Gemini 3.5 Flash Lite on Vertex AI | Produces schema-constrained proposals; uncertain facts require confirmation |
| Outfit explanation | Gemini 3.5 Flash on Vertex AI | Explains an already-computed result; cannot choose garments or mutate state |
| Supervised reasoning | Google ADK with Gemini 3.5 Flash | Inspects wardrobe state or requests a verified WearCast run through two narrow tools |
| Optional garment preview | Google Virtual Try-On `virtual-try-on-001` | Produces one temporary visualization outside the wardrobe ledger |
| Availability, care safety, ranking, transitions and commits | Pure TypeScript domain engine | Sole decision authority |

The two Gemini variants are intentional: Flash Lite handles frequent schema-constrained visual extraction; Flash handles higher-level explanation and supervised ADK reasoning. Neither can bypass the policies that decide and commit wardrobe state.

### Multimodal intake does not block the chore

[![Yange vision pipeline separates critical evidence extraction from non-critical browser background removal](docs/submission-assets/04-vision-pipeline.png)](docs/submission-assets/04-vision-pipeline.png)

The critical lane prepares private media, calls Gemini, validates the structured proposal, exposes uncertainty and waits for confirmation. Background removal runs independently in a Web Worker with ONNX Runtime Web. A slow or failed cutout cannot block evidence analysis or wardrobe creation.

### Failure is contained, not hidden

| Failure | Safe outcome |
| --- | --- |
| Gemini returns malformed or uncertain data | Reject the contract or request confirmation; commit no trusted fact |
| Weather is missing or stale | Preserve the last timestamped context or hold the intervention; never manufacture certainty |
| A scheduler or task delivers twice | Return the existing execution receipt; repeat no domain effect |
| Notification delivery fails | Keep the valid wardrobe intervention and resume from the notification checkpoint |
| Background removal fails | Keep the original image and continue evidence extraction |
| WebGL or virtual preview fails | Leave WearCast, wardrobe state and every recommendation untouched |

The deeper rationale is documented in [docs/architecture.md](docs/architecture.md).

## Live Google Cloud proof

The public build is not a local simulation. It runs in project `yange-agentic-prod-2026` in `africa-south1` with a public product edge and two authentication-required private services.

| Proof | Inspect it |
| --- | --- |
| Live product | [yange-kdxt2klboq-bq.a.run.app](https://yange-kdxt2klboq-bq.a.run.app/) |
| Health | [`/health`](https://yange-kdxt2klboq-bq.a.run.app/health) |
| Runtime boundary receipt | [`/v1/runtime`](https://yange-kdxt2klboq-bq.a.run.app/v1/runtime) |
| Dated deployment receipt | [Redacted live verification from 29 August 2026](docs/evidence/live-deployment-2026-08-29.md) |
| Automated verification | 108 TypeScript tests, strict typechecking, production builds, Terraform validation and dependency gating |
| CI | [![Yange verification workflow](https://github.com/NestroyMusoke/Yange/actions/workflows/ci.yml/badge.svg)](https://github.com/NestroyMusoke/Yange/actions/workflows/ci.yml) |

[![Unedited Google Cloud Run console showing Yange's public edge and two authenticated private services](docs/submission-assets/google-cloud-run-services.png)](docs/submission-assets/google-cloud-run-services.png)

<sub>Unedited Cloud Run console: `yange` accepts public product traffic; `yange-worker` and `yange-steward` require authentication.</sub>

[![Unedited Google Cloud Logs Explorer showing successful Yange worker and Scheduler activity](docs/submission-assets/google-cloud-logs-explorer.png)](docs/submission-assets/google-cloud-logs-explorer.png)

<sub>Unedited Logs Explorer: successful private-worker traffic, Cloud Scheduler execution and completion events in the production project.</sub>

[![Unedited Google Cloud Monitoring console showing Yange operational dashboards](docs/submission-assets/google-cloud-monitoring.png)](docs/submission-assets/google-cloud-monitoring.png)

<sub>Unedited Monitoring console: operational surfaces for Cloud Storage, Cloud Tasks, Logs, Pub/Sub and Vertex AI.</sub>

## The rest of Yange supports the chore

Yange is a complete wardrobe product, but these layers are deliberately downstream of the Taskmaster spine:

- **Outfit planning** ranks only combinations made from garments that are actually available. Hard constraints run before a deterministic five-factor Personal Match score; Gemini explains the completed result.
- **Inspiration analysis** extracts palette, silhouette, layering and occasion cues from an uploaded image. Those cues influence ranking but cannot invent inventory.
- **Confidence Check-ins** record how the user felt after wearing an outfit, creating contextual preference evidence rather than body judgement.
- **Style Aura** turns that accumulated evidence into a slowly changing WebGL palette. One interaction can move the projection by no more than 8%, and the visual layer cannot write events or change a recommendation.
- **Yange Mirror** is an optional, adult-consent preview after selection. It produces one temporary image, makes no fit claim and cannot influence wardrobe state.

[![Live Yange journey from outfit wear to confidence memory and a personal Style Aura](docs/assets/yange-product-demo.gif)](https://yange-kdxt2klboq-bq.a.run.app/)

<sub>The interface reflects accumulated state after the work is done. Style Aura is a visual receipt of learning—not the agent's decision engine.</sub>

This hierarchy matters: capture gives the agent evidence; feedback makes it personal; the Aura makes learning visible. **WearCast remains the autonomous worker that protects the future plan.**

## Run Yange

### Requirements

- Node.js 22 or newer
- npm 10 or newer
- No credentials required for the complete local rehearsal

### Local product

```powershell
git clone https://github.com/NestroyMusoke/Yange.git
cd Yange
npm.cmd install
npm.cmd run dev
```

Open the URL printed by Vite. Local mode uses deterministic adapters so contributors can reproduce the wardrobe loop without spending money or weakening the production authority boundaries.

### Production-shaped local edge

```powershell
npm.cmd run dev:cloud
```

Open `http://127.0.0.1:4173/`.

### Verify the repository

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

The full release gate is also available as:

```powershell
.\scripts\verify-phase6.ps1
```

### Deploy to Google Cloud

```powershell
.\scripts\deploy-google-cloud.ps1 -ProjectId YOUR_PROJECT_ID
```

The deployment script builds the role-separated edge, worker and private Google ADK service; provisions the required infrastructure with Terraform; and probes the public URL. See [docs/google-cloud-setup.md](docs/google-cloud-setup.md) for IAM, budget safeguards, Calendar sharing and rollback.

## Repository map

| Path | Responsibility |
| --- | --- |
| `packages/domain` | Commands, events, projections, care safety, outfit scoring and WearCast policies |
| `packages/orchestrator` | Durable checkpoints, retry, resume and duplicate-trigger protection |
| `packages/cloud` | Firestore, Storage, Tasks, Pub/Sub, Weather, Calendar and Vertex AI adapters |
| `apps/api` | Public edge, private worker routes, sessions, security headers and static delivery |
| `apps/web` | Responsive product, accessible fallbacks, local persistence and guided journey |
| `packages/contracts` | Versioned model requests, responses and runtime validation |
| `services/yange_steward` | Private Google ADK agent with two workload-identity tools |
| `infra/terraform` | Least-privilege identities and production infrastructure |
| `docs` | Architecture, experiment records, evidence and deployment guide |

## Privacy and honest limits

- Original images are not stored in the event ledger. Events contain opaque asset IDs; private media uses short-lived signed URLs.
- Missing or unreviewed care evidence fails closed and is excluded from autonomous wash groups.
- The public deployment currently runs without Google Calendar connected. Weather-aware planning and manual occasion context remain available.
- Direct TikTok ingestion is not implemented; a user can upload a saved frame for inspiration analysis.
- Yange does not decide what objectively flatters a body or skin tone. It learns user-controlled preferences.
- Mirror supports one photographed top or outerwear piece for a consenting adult. It is not a fit, size or comfort estimator. See the [experiment and safety record](docs/yange-mirror.md).
- Shopping and price discovery remain future work. Yange currently focuses on extracting more use and longer life from clothes the user already owns.

## Built from experience, engineered to act

Yange began with a question I was asking every morning: *What can I actually wear?*

Building it revealed the more important question:

> **Can an agent notice that tomorrow's options are shrinking—and safely do the work that keeps them open?**

That is the Taskmaster I built. It is live now.

Built alone by **Musoke Nestroy** in Kampala, Uganda, for the All Things Agentic Hackathon.
