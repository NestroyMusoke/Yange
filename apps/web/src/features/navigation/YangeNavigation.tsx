import type { YangeView } from "../judge/JudgeMode";
import { ViewIcon } from "./ViewIcon";

const destinations: ReadonlyArray<{
  id: YangeView;
  label: string;
  description: string;
}> = [
  { id: "today", label: "Today", description: "One clear look" },
  { id: "studio", label: "Studio", description: "Build your wardrobe" },
  { id: "atelier", label: "Atelier", description: "Plan with evidence" },
  { id: "wearcast", label: "WearCast", description: "See what is ahead" },
  { id: "cloud", label: "Cloud", description: "Keep your wardrobe in sync" },
  { id: "judge", label: "Review", description: "See what Yange has learned" },
  { id: "activity", label: "Activity", description: "See recent changes" },
];

export interface YangeNavigationProps {
  activeView: YangeView;
  indicators: Partial<Record<YangeView, string | number>>;
  onNavigate: (view: YangeView) => void;
}

/**
 * The sole application navigation. Screens supply no markup, icons or styling;
 * they only become the active destination through this shell-level component.
 */
export function YangeNavigation({ activeView, indicators, onNavigate }: YangeNavigationProps) {
  return (
    <nav className="view-tabs" aria-label="Yange views">
      {destinations.map((destination) => {
        const active = activeView === destination.id;
        const indicator = indicators[destination.id];

        return (
          <button
            type="button"
            key={destination.id}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
            aria-label={`${destination.label}: ${destination.description}`}
            title={destination.description}
            onClick={() => onNavigate(destination.id)}
          >
            <span className="view-tab-icon"><ViewIcon view={destination.id} /></span>
            <span className="view-tab-copy"><strong>{destination.label}</strong></span>
            {indicator !== undefined && indicator !== null && indicator !== 0 && (
              <span className="count">{indicator}</span>
            )}
            {destination.id === "cloud" && <span className="proof-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}
