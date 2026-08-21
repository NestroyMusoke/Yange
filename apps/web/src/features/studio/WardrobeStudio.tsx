import { useMemo, useState } from "react";
import { FakeGeminiMultimodalAdapter } from "@yange/contracts";
import type { Garment, LookDna, StyleProfile, TwinState } from "@yange/domain";
import { CapturePanel } from "./CapturePanel";
import { LookDnaPanel } from "./LookDnaPanel";
import { StyleDnaPanel } from "./StyleDnaPanel";
import { useCaptureQueue } from "./useCaptureQueue";
import { WardrobeGallery } from "./WardrobeGallery";

type StudioStep = "capture" | "style" | "inspiration";

interface WardrobeStudioProps {
  state: TwinState;
  onAddGarment(garment: Garment): boolean;
  onSaveStyle(profile: StyleProfile): boolean;
  onSaveLook(look: LookDna): boolean;
}

const steps: Array<{ id: StudioStep; number: string; label: string; detail: string }> = [
  { id: "capture", number: "01", label: "Capture a piece", detail: "Photo + care evidence" },
  { id: "style", number: "02", label: "Shape Style DNA", detail: "Your explicit preferences" },
  { id: "inspiration", number: "03", label: "Save inspiration", detail: "Extract outfit logic" },
];

export function WardrobeStudio({ state, onAddGarment, onSaveStyle, onSaveLook }: WardrobeStudioProps) {
  const [activeStep, setActiveStep] = useState<StudioStep>("capture");
  const queue = useCaptureQueue();
  const analyzer = useMemo(() => new FakeGeminiMultimodalAdapter({ latencyMs: 720 }), []);
  const userGarments = useMemo(
    () => Object.values(state.garments).filter((garment) => garment.source === "user-added").reverse(),
    [state.garments],
  );
  const looks = useMemo(() => Object.values(state.inspirationLooks).reverse(), [state.inspirationLooks]);

  return (
    <div className="wardrobe-studio">
      <section className="studio-intro">
        <div>
          <h2>Give the agent eyes—with boundaries.</h2>
          <p>
            Build a trustworthy wardrobe twin from images, your corrections, and the visual
            ideas you want to make your own.
          </p>
        </div>
        <div className="studio-proof">
          <span><strong>{userGarments.length}</strong> captured pieces</span>
          <span><strong>{looks.length}</strong> inspiration looks</span>
          <span><strong>Private</strong> media evidence</span>
        </div>
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
            <span>{step.number}</span>
            <div><strong>{step.label}</strong><small>{step.detail}</small></div>
          </button>
        ))}
      </nav>

      <div hidden={activeStep !== "capture"}>
        <CapturePanel queue={queue} analyzer={analyzer} onAddGarment={onAddGarment} />
      </div>
      <div hidden={activeStep !== "style"}>
        <StyleDnaPanel profile={state.styleProfile} onSave={onSaveStyle} />
      </div>
      <div hidden={activeStep !== "inspiration"}>
        <LookDnaPanel queue={queue} analyzer={analyzer} onSave={onSaveLook} />
      </div>

      <WardrobeGallery garments={userGarments} looks={looks} />
    </div>
  );
}
