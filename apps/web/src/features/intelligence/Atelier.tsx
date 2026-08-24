import { useState } from "react";
import type { OutfitCandidate, TwinState } from "@yange/domain";
import { LaundryLab } from "./LaundryLab";
import { OutfitAtelier } from "./OutfitAtelier";

interface AtelierProps {
  state: TwinState;
  onPlan(candidate: OutfitCandidate): boolean;
  onQueueLaundry(garmentIds: string[]): boolean;
}

export function Atelier({ state, onPlan, onQueueLaundry }: AtelierProps) {
  const [mode, setMode] = useState<"outfit" | "laundry">("outfit");
  const planned = Object.values(state.outfits).filter((outfit) => outfit.source === "agent-planned").length;
  const laundry = Object.values(state.garments).filter((garment) => garment.state === "laundry").length;

  return (
    <div className="atelier-shell">
      <section className="atelier-intro">
        <div>
          <h2>Dress the moment. Care for what you own.</h2>
          <p>Plan a complete look or prepare laundry without losing track of either.</p>
        </div>
        <div className="atelier-proof">
          <span><strong>{planned}</strong> planned looks</span>
          <span><strong>{laundry}</strong> laundry pieces</span>
          <span><strong>Personal</strong> match</span>
        </div>
      </section>

      <nav className="atelier-tabs" aria-label="Decision Atelier rooms">
        <button type="button" aria-pressed={mode === "outfit"} className={mode === "outfit" ? "active" : ""} onClick={() => setMode("outfit")}><div><strong>Outfit Atelier</strong><small>Choose, explain, reserve</small></div></button>
        <button type="button" aria-pressed={mode === "laundry"} className={mode === "laundry" ? "active" : ""} onClick={() => setMode("laundry")}><div><strong>Laundry Lab</strong><small>Separate loads safely</small></div>{laundry > 0 && <em>{laundry}</em>}</button>
      </nav>

      <div hidden={mode !== "outfit"}><OutfitAtelier state={state} onPlan={onPlan} /></div>
      <div hidden={mode !== "laundry"}><LaundryLab state={state} onQueue={onQueueLaundry} /></div>
    </div>
  );
}
