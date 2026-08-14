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
          <p className="eyebrow">Yange Decision Atelier · Phase 3</p>
          <h2>Beautiful reasoning you can inspect.</h2>
          <p>One room for dressing decisions. One room for care decisions. Both grounded in the same live wardrobe state.</p>
        </div>
        <div className="atelier-proof">
          <span><strong>{planned}</strong> agent plans</span>
          <span><strong>{laundry}</strong> laundry pieces</span>
          <span><strong>100%</strong> traceable scores</span>
        </div>
      </section>

      <nav className="atelier-tabs" aria-label="Decision Atelier rooms">
        <button type="button" className={mode === "outfit" ? "active" : ""} onClick={() => setMode("outfit")}><span>01</span><div><strong>Outfit Atelier</strong><small>Generate · explain · reserve</small></div></button>
        <button type="button" className={mode === "laundry" ? "active" : ""} onClick={() => setMode("laundry")}><span>02</span><div><strong>Laundry Lab</strong><small>Cluster · separate · protect</small></div>{laundry > 0 && <em>{laundry}</em>}</button>
      </nav>

      <div hidden={mode !== "outfit"}><OutfitAtelier state={state} onPlan={onPlan} /></div>
      <div hidden={mode !== "laundry"}><LaundryLab state={state} onQueue={onQueueLaundry} /></div>
    </div>
  );
}
