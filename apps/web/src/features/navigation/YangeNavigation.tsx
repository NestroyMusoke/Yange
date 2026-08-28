import { useEffect, useRef, useState } from "react";
import type { YangeView } from "../judge/JudgeMode";
import { ViewIcon } from "./ViewIcon";

const primaryDestinations: ReadonlyArray<{
  id: YangeView;
  label: string;
  description: string;
}> = [
  { id: "today", label: "Today", description: "See what matters now" },
  { id: "studio", label: "Wardrobe", description: "Add and care for your clothes" },
  { id: "atelier", label: "Outfits", description: "Choose what to wear" },
  { id: "wearcast", label: "Laundry", description: "Keep future outfits ready" },
];

const moreDestinations: ReadonlyArray<{
  id: YangeView;
  label: string;
  description: string;
}> = [
  { id: "judge", label: "Style memory", description: "See what Yange has learned" },
  { id: "activity", label: "Activity", description: "See your wardrobe history" },
  { id: "cloud", label: "Connected services", description: "Check cloud and agent connections" },
];

const moreViews = new Set<YangeView>(moreDestinations.map((destination) => destination.id));

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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function close(event: PointerEvent) {
      if (!moreRoot.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  return (
    <nav className="view-tabs" aria-label="Yange views">
      {primaryDestinations.map((destination) => {
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
      <div className="more-destination" ref={moreRoot}>
        <button
          type="button"
          className={moreViews.has(activeView) ? "active" : ""}
          aria-current={moreViews.has(activeView) ? "page" : undefined}
          aria-expanded={moreOpen}
          aria-controls="yange-more-menu"
          aria-label="More Yange destinations"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span className="view-tab-icon"><ViewIcon view="more" /></span>
          <span className="view-tab-copy"><strong>More</strong></span>
        </button>
        {moreOpen && (
          <div id="yange-more-menu" className="more-menu" data-liquid-glass>
            <span className="more-menu-heading">More from Yange</span>
            {moreDestinations.map((destination) => {
              const active = activeView === destination.id;
              const indicator = indicators[destination.id];
              return (
                <button
                  type="button"
                  key={destination.id}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setMoreOpen(false);
                    onNavigate(destination.id);
                  }}
                >
                  <span className="view-tab-icon"><ViewIcon view={destination.id} /></span>
                  <span><strong>{destination.label}</strong><small>{destination.description}</small></span>
                  {indicator !== undefined && indicator !== null && indicator !== 0 && <em>{indicator}</em>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
