import { useMemo, useState } from "react";
import type { Garment, LookDna, StyleProfile, TwinState } from "@yange/domain";
import { RuntimeMultimodalAnalyzer } from "../../aiRuntime";
import { CapturePanel } from "./CapturePanel";
import { LookDnaPanel } from "./LookDnaPanel";
import { StyleDnaPanel } from "./StyleDnaPanel";
import { useCaptureQueue } from "./useCaptureQueue";
import { WardrobeGallery } from "./WardrobeGallery";
import type { YangeView } from "../judge/JudgeMode";

type StudioStep = "capture" | "style" | "inspiration";

interface WardrobeStudioProps {
  state: TwinState;
  onAddGarment(garment: Garment): boolean;
  onUpdateGarment(garment: Garment): boolean;
  onArchiveGarment(garmentId: string): boolean;
  onStartPersonalWardrobe(): boolean;
  onSaveStyle(profile: StyleProfile): boolean;
  onSaveLook(look: LookDna): boolean;
  onNavigate(view: YangeView): void;
}

const steps: Array<{ id: StudioStep; label: string; detail: string }> = [
  { id: "capture", label: "Add clothes", detail: "Photo and optional care label" },
  { id: "style", label: "Preferences", detail: "Colours, fit and comfort" },
  { id: "inspiration", label: "Inspiration", detail: "Save a look you love" },
];

export function WardrobeStudio({ state, onAddGarment, onUpdateGarment, onArchiveGarment, onStartPersonalWardrobe, onSaveStyle, onSaveLook, onNavigate }: WardrobeStudioProps) {
  const [activeStep, setActiveStep] = useState<StudioStep>("capture");
  const [confirmPersonal, setConfirmPersonal] = useState(false);
  const queue = useCaptureQueue();
  const analyzer = useMemo(() => new RuntimeMultimodalAnalyzer(), []);
  const userGarments = useMemo(
    () => Object.values(state.garments).filter((garment) => garment.source === "user-added" && !garment.archived).reverse(),
    [state.garments],
  );
  const looks = useMemo(() => Object.values(state.inspirationLooks).reverse(), [state.inspirationLooks]);

  function trackGlassPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 720 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - bounds.top}px`);
  }

  return (
    <div className="wardrobe-studio">
      <section className="studio-intro">
        <div>
          <h2>Your wardrobe,<br />remembered <span>beautifully.</span></h2>
          <p>
            Add the pieces you own, the care they need and the looks that inspire you.
          </p>
        </div>
        <div className="studio-proof-stage" data-liquid-glass-root>
          <div
            className="studio-proof"
            data-liquid-glass
            onPointerMove={trackGlassPointer}
            onPointerLeave={(event) => {
              event.currentTarget.style.setProperty("--mx", "50%");
              event.currentTarget.style.setProperty("--my", "50%");
            }}
          >
            <span><strong>{userGarments.length}</strong> captured pieces</span>
            <span><strong>{looks.length}</strong> inspiration looks</span>
            <span><strong>Private</strong> wardrobe</span>
          </div>
        </div>
      </section>

      <section id="wardrobe-mode" className={`wardrobe-mode-card mode-${state.wardrobeMode}`} data-liquid-glass>
        <div>
          <span>{state.wardrobeMode === "personal" ? "Personal wardrobe" : "Sample wardrobe active"}</span>
          <strong>{state.wardrobeMode === "personal" ? "Only your confirmed pieces shape recommendations." : "Explore first, then switch when your real wardrobe is ready."}</strong>
        </div>
        {state.wardrobeMode === "demo" && (confirmPersonal ? (
          <div className="wardrobe-mode-confirm"><small>Sample garments and outfits will leave your wardrobe. Captured pieces stay.</small><button type="button" className="primary-action" onClick={() => { if (onStartPersonalWardrobe()) setConfirmPersonal(false); }}>Use only my clothes</button><button type="button" className="quiet-action" onClick={() => setConfirmPersonal(false)}>Not yet</button></div>
        ) : <button type="button" className="quiet-action" onClick={() => setConfirmPersonal(true)}>Start my wardrobe</button>)}
      </section>

      <nav className="studio-steps" aria-label="Wardrobe Studio steps">
        {steps.map((step) => (
          <button
            type="button"
            key={step.id}
            className={activeStep === step.id ? "active" : ""}
            aria-current={activeStep === step.id ? "step" : undefined}
            onClick={() => setActiveStep(step.id)}
          >
            <div><strong>{step.label}</strong><small>{step.detail}</small></div>
          </button>
        ))}
      </nav>

      <div hidden={activeStep !== "capture"}>
        <CapturePanel
          queue={queue}
          analyzer={analyzer}
          existingGarments={userGarments}
          onAddGarment={onAddGarment}
          essentialsActionLabel={state.wardrobeMode === "personal" ? "Create my first outfit" : "Use only my clothes"}
          onEssentialsReady={() => {
            if (state.wardrobeMode === "personal") {
              onNavigate("atelier");
            } else {
              setConfirmPersonal(true);
              document.getElementById("wardrobe-mode")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
        />
      </div>
      <div hidden={activeStep !== "style"}>
        <StyleDnaPanel profile={state.styleProfile} onSave={onSaveStyle} />
      </div>
      <div hidden={activeStep !== "inspiration"}>
        <LookDnaPanel queue={queue} analyzer={analyzer} onSave={onSaveLook} />
      </div>

      <WardrobeGallery garments={userGarments} looks={looks} onUpdate={onUpdateGarment} onArchive={onArchiveGarment} />
    </div>
  );
}
