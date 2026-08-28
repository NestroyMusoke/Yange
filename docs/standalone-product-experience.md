# Yange standalone product experience

## Product promise

Yange helps someone use the clothes they already own with less daily effort. A new user should reach a useful personal outfit without needing to understand agents, workflows, evidence ledgers, or the hackathon architecture.

The primary audience is anyone who can photograph a garment and answer a few plain-language questions. The experience must remain legible for first-time smartphone users while retaining inspectable evidence for technical reviewers.

## First-value journey

The first meaningful outcome is a complete outfit made only from the user's wardrobe. The shortest honest path is:

1. Add a top.
2. Add a bottom.
3. Add shoes.
4. Switch from the sample wardrobe to personal mode.
5. Create a first outfit.
6. Mark the outfit as worn.
7. Record a confidence check-in so Yange begins learning.

Care labels, inspiration, outerwear, jewellery, deeper preferences, laundry automation, and connected services remain available, but they do not block first value.

## Information architecture

```text
Yange
├── Today
│   ├── Next outfit
│   ├── Readiness and risks
│   └── Next recommended action
├── Wardrobe
│   ├── Add clothes
│   ├── Preferences
│   └── Inspiration
├── Outfits
│   ├── Create a look
│   ├── Planned looks
│   └── Wear and confidence check-in
├── Laundry
│   ├── Availability pressure
│   ├── Weather-aware washing windows
│   ├── Safe loads and fallbacks
│   └── Notifications
└── More
    ├── Style memory
    ├── Activity
    └── Connected services
```

The main navigation represents user jobs. Implementation concepts such as Studio, Atelier, Judge Mode, and Cloud remain internal view identifiers and never need to be learned by a customer.

## The Yange Thread

The Yange Thread is a persistent, state-aware guidance rail. It always answers three questions:

- What has Yange understood so far?
- What is the single best next action?
- What useful result will that action unlock?

Its five milestones are essentials, personal mode, first outfit, first wear, and first confidence memory. It derives progress from the event-sourced wardrobe state, not from a dismissible tutorial checklist, so it remains truthful across refreshes and devices once cloud persistence is active.

## Progressive disclosure

- Everyday navigation contains four jobs plus More.
- Capture shows one primary action at a time: photograph, analyse, review, save, then add the next missing essential.
- Background removal starts immediately and never blocks garment analysis. Original and clean views are visibly comparable.
- Laundry exposes the current status and one customer action. Reproducibility controls live in a collapsed Demo controls disclosure.
- Technical receipts, evidence, failure recovery, and service readiness remain inspectable without becoming the default vocabulary.

## Copy rules

- Name the object or outcome the person recognises: Wardrobe, Outfits, Laundry.
- Buttons state the result: Add shoes next, Create my first outfit, Check now.
- Every success message names what happened and what should happen next.
- Every error says what was preserved and how to recover.
- Do not sell the architecture inside the product UI.

## Accessibility and resilience

- Current navigation and capture steps use `aria-current`.
- All core actions remain keyboard reachable and visibly focused.
- Reduced motion preserves a frozen Aura and removes nonessential transitions.
- The original garment photo remains available whenever separation fails.
- Advanced workflows expose checkpoint receipts so a failure can resume without duplicating actions.

## Product measurements

Measure the funnel without storing wardrobe photographs or garment names in analytics:

- first garment photo prepared
- first garment analysis completed
- first garment saved
- essential wardrobe completed
- personal mode enabled
- first outfit created
- first outfit marked worn
- first confidence check-in recorded

The most important product metrics are time to first saved garment, time to first personal outfit, completion rate between each milestone, and the percentage of users who return to log a wear.
