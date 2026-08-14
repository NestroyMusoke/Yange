# Yange Phase 4 specification

## Outcome

Phase 4 proves that Yange can notice a future wardrobe problem and complete useful work without a chat request. A transparent local scheduler trigger will:

1. acquire a validated seven-day Kampala forecast;
2. simulate the user's existing outfit commitments without changing the live wardrobe;
3. compare the consequences of **Do nothing** and **Autopilot**;
4. detect outfit-dependency and 50%-wardrobe-capacity risks;
5. choose a forecast-aware laundry opportunity;
6. reserve a feasible fallback outfit when recovery is uncertain;
7. queue and deliver an in-app notification;
8. resume safely after a failed adapter call; and
9. ignore duplicate delivery of the same scheduler trigger.

The local build remains free and credentialless. Forecasts and notification delivery use deterministic adapters implementing the same ports later used by Google Cloud integrations.

## Architectural boundary

Phase 4 adds a dedicated `@yange/orchestrator` package between adapters and the pure domain.

```text
Scheduler trigger
      |
ForecastProvider port ---- deterministic local forecast
      |
Checkpointed WearCast workflow ---- WorkflowRepository
      |
Pure forecast policy + branch simulator
      |
Validated idempotent domain command
      |
Append-only event sink ---- replayed Wardrobe Digital Twin
      |
NotificationGateway port ---- deterministic local delivery
```

The orchestrator may sequence work, retry ports, and persist checkpoints. It may not bypass domain commands or edit projected state. React renders workflow and domain evidence but does not decide the intervention.

## Forecast contract

`ForecastProvider.sevenDay()` returns a versioned snapshot containing:

- provider identity, issue time, location, and IANA time zone;
- at least seven calendar days of ordered forecast periods;
- start/end time, temperature, precipitation probability, humidity, wind, daylight, and condition for every period.

Runtime validation rejects malformed dates, overlapping periods, impossible percentages, negative wind, temperatures outside -50–60°C, stale issue times, or less than seven days of coverage. The local adapter calls itself `manual-kampala-forecast-v1`; the UI never presents it as live weather.

## Drying suitability

Yange calculates a conservative suitability score for each future forecast period. The score considers:

- precipitation probability and rain condition;
- relative humidity;
- useful versus unsafe wind;
- temperature;
- daylight; and
- whether the period finishes before the endangered outfit.

The result is a ranked opportunity, not a promise that clothing will be dry at an exact minute. Garment thickness, spin efficiency, shade, airflow, and local microclimate remain unknown. The UI therefore says **drying opportunity**, publishes its assumptions, and retains the care label's drying method as the authority.

An outdoor window fails closed when there is rain, precipitation probability above 35%, dangerous wind, no daylight, or extreme humidity. Indoor and flat-dry routes remain visible but are never falsely described as forecast-protected outdoor drying.

## Risk policies

WearCast evaluates planned outfits inside the seven-day horizon.

### Outfit dependency risk

A dependency is endangered when it is in `laundry`, `drying`, or `airing`. A garment reserved for the outfit is treated as protected. Severity rises as the event approaches and as the number of blocked dependencies increases.

### Wardrobe capacity risk

Core clothing means tops, bottoms, and outerwear. When at least 50% of those pieces are in laundry, drying, or airing, WearCast emits a capacity warning. The numerator, denominator, threshold, and affected garment IDs are stored in the decision receipt.

### Fallback policy

If a planned event is endangered, the existing deterministic outfit generator receives the forecast and occasion snapshot. It can use only currently feasible garments. The leading verified candidate becomes a proposed fallback. Committing Autopilot reruns the candidate through the normal `planOutfit` command and reserves every dependency through events.

## Non-destructive branch simulation

Both branches start from the same cloned Digital Twin and forecast snapshot:

| Branch | Allowed effects in simulation | Expected result |
|---|---|---|
| Do nothing | Advance time only | Exposes unresolved outfits and capacity risk |
| Autopilot | Apply proposed laundry window and fallback in a cloned branch | Shows protected outfits, interventions, and residual risk |

Neither branch writes the event ledger. Only the later validated commit step may create events.

## Workflow checkpoints

Each scheduler trigger has one stable `triggerId` and the checkpoints:

1. `triggered`
2. `forecast-acquired`
3. `decision-simulated`
4. `interventions-committed`
5. `notifications-delivered`
6. `completed`

The workflow repository saves after every checkpoint and after every individual notification delivery. Retry uses the same trigger ID and resumes after the last successful checkpoint. A completed trigger replay returns the existing execution and increments a duplicate-delivery counter without appending events or delivering another notification.

This mirrors the failure assumptions of the target cloud stack. Google Cloud Tasks documents that a non-zero number of duplicate executions can occur and handlers must make duplicates non-catastrophic. Pub/Sub defaults to at-least-once delivery and recommends idempotent subscribers. Google Cloud Workflows also distinguishes retry policies for idempotent and non-idempotent steps. See the official [Cloud Tasks duplicate-execution guidance](https://docs.cloud.google.com/tasks/docs/common-pitfalls), [Pub/Sub subscription semantics](https://docs.cloud.google.com/pubsub/docs/subscription-overview), and [Workflows retry documentation](https://docs.cloud.google.com/workflows/docs/reference/syntax/retrying).

## Event commit

One autonomy decision can emit:

- `AutonomyRunCommitted`;
- zero or more `LaundryWindowScheduled` events;
- an `OutfitPlanned` event plus garment reservations for a fallback;
- `OutfitRecoveryActivated` linking the endangered and fallback outfits;
- one or more `NotificationQueued` events; and
- later `NotificationDelivered` events.

The commit is idempotent by operation ID. Notification delivery is a separate checkpoint so an outage cannot roll back a sound wardrobe decision or duplicate it during retry.

## Demo scenario

The judge-facing scenario is explicit and reproducible:

1. **Stage Friday pressure** moves the cream blouse, chocolate trousers, and ivory knit to laundry. This reaches exactly 50% of core clothing and endangers the seeded Friday Rooftop outfit.
2. **Fire scheduler with notification outage** acquires the forecast, calculates the best drying opportunity, compares branches, commits a fallback and laundry intervention, then deliberately fails delivery.
3. **Resume paused run** skips completed checkpoints and delivers the already-queued notification.
4. **Replay exact trigger** proves there are no duplicate events, reservations, or deliveries.

Every control is labelled as a demo-time trigger. No screen claims that a background browser timer is production infrastructure.

## Acceptance gates

- Identical state, forecast, and time produce identical decisions and rankings.
- Simulation never mutates its input Digital Twin or event ledger.
- The 50% capacity threshold fires at 0.5 and not below it.
- A forecast period failing an outdoor-safety condition is never chosen as an outdoor window.
- Fallback candidates exclude laundry, drying, airing, and unrelated reserved pieces.
- One trigger commits at most one autonomy plan.
- Failure after commit resumes at notification delivery without duplicating domain events.
- Replaying a completed trigger produces zero new events and zero deliveries.
- Workflow checkpoints survive reload through a replaceable repository.
- A forecast or notification adapter failure degrades only its capability.
- Existing Phase 1–3 event ledgers replay unchanged.
- Desktop and 390 px views have no horizontal document overflow.
- Tests, strict type checking, production build, browser console, and dependency audit pass.
