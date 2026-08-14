# Yange Phase 3 specification

## Outcome

Phase 3 turns wardrobe evidence into two explainable decisions:

1. **Outfit Atelier:** generate feasible looks from garments that are actually usable, score each look deterministically against explicit Style DNA, confidence memory, occasion, weather, and care practicality, then reserve one through validated domain events.
2. **Laundry Lab:** turn garments marked for laundry into conservative, material-safe wash clusters, separate incompatible pieces with a visible graph trace, and hold back anything whose care evidence is unknown or unreviewed.

Everything remains credential-free. A deterministic explanation adapter demonstrates the future Gemini boundary, but the model cannot select garments, calculate scores, reserve items, or decide wash compatibility.

## Architectural laws

1. **Constraints choose; language explains.** The pure domain engine creates candidates and scores. The explanation adapter receives the result after the decision.
2. **A score must be reproducible.** Every Personal Match result carries its weighted factor breakdown, input context, and engine version.
3. **Care uncertainty fails closed.** Unknown or `needs-review` wash evidence is a holdout, not a guessed load.
4. **Reservations are events.** Planning a look appends the outfit and each garment reservation atomically and idempotently.
5. **Manual context uses the production port.** Local weather and calendar forms create timestamped adapter snapshots implementing the same interfaces later used by live services.

## Decision flow

```text
Manual weather + calendar adapters
            |
Versioned planning context snapshot
            |
Pure constraint generator ---- unavailable / reserved garments rejected
            |
Deterministic Personal Match scorer (v1)
            |
Ranked candidates + factor trace
            |
Explanation-only adapter (no commands or garment mutation fields)
            |
User chooses a candidate
            |
Validated PlanOutfit command
            |
OutfitPlanned + GarmentStateChanged reservation events
            |
Replayed Wardrobe Digital Twin + Agent Activity
```

## Outfit constraints

A feasible candidate requires:

- exactly one usable top;
- exactly one usable bottom;
- exactly one usable pair of shoes;
- zero or one usable outer layer;
- zero or one usable accessory;
- no garment in `laundry`, `drying`, `airing`, or already `reserved`;
- no duplicate garment ID;
- at most 120 combinations evaluated, with stable lexical tie-breaking.

Context does not silently override feasibility. For example, rain may lower a look's context score when no protective layer exists, but Yange will explain that trade-off rather than claiming the outfit is weatherproof.

## Personal Match v1

The score is a weighted, integer result from 0 to 100:

| Factor | Weight | Evidence |
|---|---:|---|
| Availability | 20% | Current Digital Twin state |
| Colour relationship | 25% | Preferred/avoided colours and self-selected relationship |
| Style & confidence memory | 20% | Fit/style words plus observed confidence signals |
| Occasion & weather | 25% | Timestamped manual context snapshot |
| Care practicality | 10% | Comfort priorities and confirmed care burden |

Each factor stores its raw score, weight, weighted points, evidence keys, and human-readable detail. The final score is calculated by the domain and never accepted from a model response.

## Laundry safety graph

Each laundry garment is a graph node. An incompatibility edge is added when any conservative rule says the two pieces should not share a wash process:

- different wash methods (`machine-cold`, `machine-warm`, `hand-wash`, `dry-clean`);
- light and dark/vivid colour families;
- a confirmed note says `wash separately`, warns of colour transfer, or requires similar colours;
- one item requires professional care;
- a care field is unreviewed or unknown (the item becomes a holdout before graph colouring).

A stable greedy graph-colouring pass creates independent sets: no edge may exist between two garments in the same recommended cluster. Every cluster publishes:

- exact wash method;
- the strictest bleach instruction;
- separate drying routes inside the wash cluster;
- garment IDs and care evidence quality;
- a plain-language reason for the grouping.

This intentionally prefers extra loads over garment damage. The [FTC Care Labeling Rule](https://www.ftc.gov/legal-library/browse/rules/care-labeling-textile-wearing-apparel-certain-piece-goods-text) requires reliable care instructions and warnings when a procedure could harm the product or other products cleaned with it. [FTC implementation guidance](https://www.ftc.gov/business-guidance/resources/clothes-captioning-complying-care-labeling-rule) specifically discusses `wash separately` and `wash with like colors` warnings. [ISO 3758:2023](https://www.iso.org/standard/74401.html) defines care symbols around the most severe treatment that does not cause irreversible damage. Yange treats those sources as the rationale for a conservative rule engine, not as a substitute for the garment's own confirmed label.

## Context ports

`WeatherContextProvider` and `CalendarContextProvider` return validated snapshots with:

- source identity;
- location or event identity;
- observation timestamp;
- temperature, precipitation probability, and condition;
- occasion, dress code, start time, and optional notes.

Manual adapters reject impossible temperatures, precipitation outside 0–100%, invalid dates, and stale snapshots. Phase 5 can add live adapters without changing the planning engine.

## Explanation boundary

The explanation contract version `1.0` accepts a completed candidate and returns only:

- a headline;
- concise rationale;
- trade-offs;
- cited score-factor keys;
- adapter identity and timestamp.

It contains no event, state, action, score, or garment-selection field. Runtime validation rejects malformed citations. If the adapter fails, ranked looks and factor traces remain fully usable.

## Acceptance gates

- Identical state and context produce byte-for-byte equivalent ranked candidates.
- Laundry, drying, airing, and reserved garments never appear in a new candidate.
- A planned candidate replays into one outfit plus reserved garment states.
- Reusing the operation ID emits no duplicate events.
- Explanation failure cannot remove or change a candidate.
- Unknown or unreviewed care evidence is held out.
- No incompatibility edge appears inside a recommended cluster.
- Manual context adapters reject invalid and stale input.
- Phase 1 and Phase 2 ledgers continue to replay.
- Desktop and 390 px mobile views have no horizontal document overflow.
- Tests, strict type checking, production build, browser console, and dependency audit pass.
