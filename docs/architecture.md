# Yange architecture

## Central idea

Yange maintains a live Wardrobe Digital Twin. The current view is reconstructed from an append-only event ledger, making decisions reproducible, observable, and safe to replay.

## Architectural laws

1. AI proposes; validated domain rules commit.
2. Every autonomous action is observable, reversible, and idempotent.
3. Long-running workflows resume from checkpoints.
4. Integration failures are isolated behind adapters.
5. New capabilities subscribe to domain events instead of rewriting the core.

## Local-to-cloud boundary

The domain owns no network or framework code. It exposes commands, events, projections, scores, and policies. Interfaces supply persistence, multimodal analysis, weather, calendar, notifications, and time.

```text
Responsive web experience
        |
Application commands
        |
Pure domain engine ---- Event ledger ---- Current projection
        |
Ports: repository | multimodal | weather | calendar | notification | clock
        |
Local adapters now / Google Cloud adapters in Phase 5
```

## Phase 1 event flow

```text
User marks outfit worn
        |
Command validates outfit state
        |
Deterministic wear policies emit garment transition events
        |
Event ledger persists atomically
        |
Projection replay updates availability and readiness
        |
Activity timeline renders the same committed evidence
        |
Confidence Check-in updates contextual preference memory
```

## Reliability decisions

- Commands include operation IDs for idempotency.
- Invalid transitions emit nothing and return a domain error.
- Event projection is deterministic and can be rebuilt.
- External data is timestamped and carries freshness/confidence metadata.
- Model-produced structured data is versioned and validated before use.
- Confirmed user and care-label facts outrank AI estimates.
- Critical operations never depend on a WebGL or animation layer.
