import type { EvidenceMeta } from "@yange/domain";

const labels: Record<EvidenceMeta["provenance"], string> = {
  "user-confirmed": "User confirmed",
  "label-extracted": "Label extracted",
  "ai-estimated": "AI estimated",
};

export function EvidenceBadge({ evidence }: { evidence: EvidenceMeta }) {
  return (
    <span
      className={`evidence-badge evidence-${evidence.provenance}`}
      title={`${Math.round(evidence.confidence * 100)}% extraction confidence · ${evidence.reviewStatus}`}
    >
      <i aria-hidden="true" />
      {labels[evidence.provenance]}
      {evidence.reviewStatus === "needs-review" && <em>Review</em>}
    </span>
  );
}
