import { useEffect, useMemo, useState } from "react";
import { createLaundryPlan, type LaundryCluster, type TwinState } from "@yange/domain";
import { GarmentPreview } from "./GarmentPreview";

interface LaundryLabProps {
  state: TwinState;
  onQueue(garmentIds: string[]): boolean;
}

function titleCase(value: string): string {
  return value.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function ClusterCard({ cluster, state, index }: { cluster: LaundryCluster; state: TwinState; index: number }) {
  return (
    <article className="laundry-cluster">
      <div className="load-number"><span>Load</span><strong>{String(index + 1).padStart(2, "0")}</strong></div>
      <div className="load-content">
        <div className="load-heading"><div><span>{titleCase(cluster.colourFamily)} family</span><h3>{titleCase(cluster.washMethod)}</h3></div><em>No internal conflicts</em></div>
        <div className="load-garments">{cluster.garmentIds.map((id) => <GarmentPreview key={id} garment={state.garments[id]} compact />)}</div>
        <p className="load-instruction">{cluster.instruction}</p>
        <div className="drying-routes">
          {cluster.dryingRoutes.map((route) => (
            <div key={route.method}><span>{titleCase(route.method)}</span><p>{route.garmentIds.map((id) => state.garments[id].name).join(" · ")}</p></div>
          ))}
        </div>
        <div className="safety-basis">{cluster.safetyBasis.map((basis) => <span key={basis}>{basis}</span>)}</div>
      </div>
    </article>
  );
}

export function LaundryLab({ state, onQueue }: LaundryLabProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const plan = useMemo(() => createLaundryPlan(state), [state]);
  const queueable = Object.values(state.garments)
    .filter((garment) => ["top", "bottom", "outerwear"].includes(garment.category))
    .filter((garment) => ["available", "rewearable", "airing"].includes(garment.state))
    .sort((left, right) => left.name.localeCompare(right.name));

  useEffect(() => {
    const available = new Set(queueable.map((garment) => garment.id));
    setSelected((current) => current.filter((id) => available.has(id)));
  }, [state]);

  function toggle(id: string): void {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setSaved(false);
  }

  function selectDemoBasket(): void {
    const suggestions = ["cream-blouse", "chocolate-trousers", "indigo-shirt", "ivory-knit"];
    const available = new Set(queueable.map((garment) => garment.id));
    setSelected(suggestions.filter((id) => available.has(id)));
    setSaved(false);
  }

  function queue(): void {
    if (selected.length && onQueue(selected)) {
      setSelected([]);
      setSaved(true);
    }
  }

  const garmentName = (id: string) => state.garments[id]?.name ?? id;

  return (
    <section className="intelligence-panel" aria-labelledby="laundry-lab-title">
      <div className="intelligence-heading">
        <div>
          <h2 id="laundry-lab-title">Let the safest garment set the rules.</h2>
          <p>Yange automatically creates independent wash groups, then routes each piece to its own labelled drying method.</p>
        </div>
        <div className="engine-chip care-engine-chip"><span /> Care labels set the rules</div>
      </div>

      <div className="laundry-status-rail">
        <div><strong>{plan.inputGarmentIds.length}</strong><span>pieces waiting</span></div>
        <i />
        <div><strong>{plan.incompatibilityEdges.length}</strong><span>unsafe pairings blocked</span></div>
        <i />
        <div><strong>{plan.clusters.length}</strong><span>safe wash groups</span></div>
        <i />
        <div><strong>{plan.holdouts.length}</strong><span>held for review</span></div>
      </div>

      <div className="laundry-queue-card">
        <div className="queue-heading"><div><h3>Which pieces actually need washing?</h3><p>Yange never assumes every wear means a wash. Add only what you decided is ready.</p></div><button type="button" className="quiet-action" onClick={selectDemoBasket} disabled={!queueable.length}>Select demo basket</button></div>
        {queueable.length ? (
          <div className="laundry-selector">
            {queueable.map((garment) => (
              <label key={garment.id} className={selected.includes(garment.id) ? "selected" : ""}>
                <input type="checkbox" checked={selected.includes(garment.id)} onChange={() => toggle(garment.id)} />
                <GarmentPreview garment={garment} compact />
              </label>
            ))}
          </div>
        ) : <p className="queue-empty">No unreserved clothing is waiting to be added.</p>}
        <div className="queue-footer"><span>{selected.length ? `${selected.length} selected · clustering begins after commit` : saved ? "Basket committed and reclustered." : "Nothing selected"}</span><button type="button" className="primary-action compact-action" disabled={!selected.length} onClick={queue}>Move selected to laundry</button></div>
      </div>

      {plan.inputGarmentIds.length === 0 ? (
        <div className="laundry-empty"><span aria-hidden="true">≈</span><div><h3>No laundry conflicts yet.</h3><p>Wear an outfit or add the sample basket to see how care labels separate different materials into safe loads.</p></div></div>
      ) : (
        <div className="laundry-plan">
          <div className="results-heading"><div><h3>{plan.clusters.length} safe {plan.clusters.length === 1 ? "load" : "loads"}, with every separation explained.</h3></div><span>Care plan ready</span></div>
          <div className="laundry-clusters">{plan.clusters.map((cluster, index) => <ClusterCard key={cluster.id} cluster={cluster} state={state} index={index} />)}</div>

          {plan.holdouts.length > 0 && (
            <section className="care-holdouts"><div><h3>These pieces need your review.</h3></div><ul>{plan.holdouts.map((holdout) => <li key={holdout.garmentId}><strong>{garmentName(holdout.garmentId)}</strong><span>{holdout.detail}</span></li>)}</ul></section>
          )}

          <details className="conflict-trace">
            <summary>Why these pieces were separated</summary>
            <div className="conflict-trace-body">
              <p>Each line shows a care-label conflict that cannot share one recommended load.</p>
              {plan.incompatibilityEdges.length ? (
                <ol>{plan.incompatibilityEdges.map((edge) => <li key={`${edge.leftGarmentId}-${edge.rightGarmentId}`}><span>{garmentName(edge.leftGarmentId)}</span><i aria-hidden="true" /><span>{garmentName(edge.rightGarmentId)}</span><em>{edge.detail}</em></li>)}</ol>
              ) : <p className="queue-empty">No incompatible pairings were found among the confirmed care profiles.</p>}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
