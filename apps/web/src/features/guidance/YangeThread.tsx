import type { YangeView } from "../judge/JudgeMode";
import type { YangeJourney } from "./journey";

interface YangeThreadProps {
  journey: YangeJourney;
  activeView: YangeView;
  onNavigate(view: YangeView): void;
}

export function YangeThread({ journey, activeView, onNavigate }: YangeThreadProps) {
  const alreadyHere = activeView === journey.next.view;
  return (
    <aside className="yange-thread-stage" aria-label="Your Yange journey" data-liquid-glass-root>
      <div className="yange-thread" data-liquid-glass>
        <div className="yange-thread-progress" aria-label={`${journey.progress}% of your first Yange journey complete`}>
          <span className="thread-spool" aria-hidden="true" />
          <div className="thread-track" aria-hidden="true">
            {journey.milestones.map((milestone) => (
              <i key={milestone.id} className={milestone.complete ? "is-complete" : ""} />
            ))}
          </div>
          <span className="thread-count">{journey.completed}/{journey.milestones.length}</span>
        </div>
        <div className="yange-thread-copy" aria-live="polite">
          <span>{journey.next.eyebrow}</span>
          <strong>{journey.next.title}</strong>
          <small>{journey.next.detail}</small>
        </div>
        <button
          type="button"
          className="thread-action"
          onClick={() => {
            onNavigate(journey.next.view);
            if (alreadyHere) document.getElementById("view-start")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {journey.next.action}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </aside>
  );
}
