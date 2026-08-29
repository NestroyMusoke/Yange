import { useEffect, useMemo, useRef, useState } from "react";
import {
  MIRROR_CONTRACT_VERSION,
  type MirrorJobResponseV1,
} from "@yange/contracts";
import type { Garment, OutfitCandidate, TwinState } from "@yange/domain";
import {
  createMirrorJob,
  createMirrorUploadIntent,
  deleteMirrorJob,
  getMirrorJob,
  probeCloudRuntime,
} from "../../cloudRuntime";
import { prepareMirrorPerson, type PreparedMirrorPerson } from "../../media/mirrorImage";
import { YangeWordmark } from "../brand/YangeWordmark";

interface YangeMirrorProps {
  candidate: OutfitCandidate;
  state: TwinState;
}

type MirrorUiState = "checking" | "idle" | "preparing" | "uploading" | "queued" | "generating" | "ready" | "blocked" | "failed" | "deleted";

function supportedGarments(candidate: OutfitCandidate, state: TwinState): Garment[] {
  return candidate.garmentIds
    .map((id) => state.garments[id])
    .filter((garment): garment is Garment => Boolean(
      garment &&
      garment.imageAssetId &&
      garment.source === "user-added" &&
      (garment.category === "top" || garment.category === "outerwear"),
    ));
}

function storageKey(candidateId: string): string {
  return `yange:mirror:${candidateId}`;
}

export function YangeMirror({ candidate, state }: YangeMirrorProps) {
  const garments = useMemo(() => supportedGarments(candidate, state), [candidate, state]);
  const [selectedGarmentId, setSelectedGarmentId] = useState(garments[0]?.id ?? "");
  const [prepared, setPrepared] = useState<PreparedMirrorPerson | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [job, setJob] = useState<MirrorJobResponseV1 | null>(null);
  const [uiState, setUiState] = useState<MirrorUiState>("checking");
  const [configured, setConfigured] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(4);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [processingAccepted, setProcessingAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const announcedReady = useRef(false);
  const selectedGarment = garments.find((garment) => garment.id === selectedGarmentId) ?? garments[0];

  useEffect(() => {
    let active = true;
    void probeCloudRuntime().then((runtime) => {
      if (!active) return;
      setConfigured(runtime.configuration.mirrorConfigured);
      setRegion(runtime.configuration.mirrorProcessingRegion);
      setDailyLimit(runtime.configuration.mirrorDailyLimit || 4);
      const remembered = window.localStorage.getItem(storageKey(candidate.id));
      if (remembered && runtime.configuration.mirrorConfigured) {
        void getMirrorJob(remembered).then((response) => {
          if (!active) return;
          setJob(response);
          setUiState(response.job.status);
        }).catch(() => {
          window.localStorage.removeItem(storageKey(candidate.id));
          if (active) setUiState("idle");
        });
      } else {
        setUiState("idle");
      }
    }).catch(() => {
      if (active) {
        setConfigured(false);
        setUiState("idle");
      }
    });
    return () => { active = false; };
  }, [candidate.id]);

  useEffect(() => {
    if (!prepared) {
      setPreviewUrl(null);
      return () => undefined;
    }
    const url = URL.createObjectURL(prepared.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  useEffect(() => {
    const jobId = job?.job.id;
    if (!jobId || (job.job.status !== "queued" && job.job.status !== "generating")) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await getMirrorJob(jobId);
        if (!active) return;
        setJob(response);
        setUiState(response.job.status);
        if (response.job.status === "ready" && !announcedReady.current) {
          announcedReady.current = true;
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Your Yange Mirror preview is ready", {
              body: `${response.job.garment.name} is ready to view in Outfits.`,
              icon: "/brand/yange-app-icon.png",
            });
          }
        }
      } catch {
        if (active) setError("The preview is still processing. Yange will check again.");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [job?.job.id, job?.job.status]);

  async function choosePhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    setUiState("preparing");
    setError(null);
    try {
      setPrepared(await prepareMirrorPerson(file));
      setUiState("idle");
    } catch (cause) {
      setPrepared(null);
      setUiState("idle");
      setError(cause instanceof Error ? cause.message : "The photo could not be prepared.");
    }
  }

  async function generate(): Promise<void> {
    if (!prepared || !selectedGarment?.imageAssetId || !adultConfirmed || !rightsConfirmed || !processingAccepted) return;
    setUiState("uploading");
    setError(null);
    try {
      const intent = await createMirrorUploadIntent(prepared);
      const uploaded = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.requiredHeaders,
        body: prepared.blob,
      });
      if (!uploaded.ok) throw new Error(`Private photo upload returned ${uploaded.status}.`);
      const now = new Date().toISOString();
      const response = await createMirrorJob({
        contractVersion: MIRROR_CONTRACT_VERSION,
        requestId: crypto.randomUUID(),
        outfitCandidateId: candidate.id,
        personImage: {
          assetId: prepared.assetId,
          mimeType: prepared.mimeType,
          byteLength: prepared.byteLength,
          width: prepared.width,
          height: prepared.height,
        },
        garment: {
          garmentId: selectedGarment.id,
          assetId: selectedGarment.imageAssetId,
          name: selectedGarment.name,
          category: selectedGarment.category as "top" | "outerwear",
        },
        consent: {
          adultConfirmed: true,
          imageRightsConfirmed: true,
          privateProcessingAccepted: true,
          retention: "delete-person-after-generation",
          acceptedAt: now,
        },
        requestedAt: now,
      });
      setJob(response);
      setUiState(response.job.status);
      window.localStorage.setItem(storageKey(candidate.id), response.job.id);
      setPrepared(null);
    } catch (cause) {
      setUiState("failed");
      const message = cause instanceof Error ? cause.message : "The preview could not be started.";
      setError(message === "MIRROR_OUTFIT_CHANGED"
        ? "The reserved outfit changed in the cloud. Wait a moment, then try again."
        : message === "MIRROR_DAILY_LIMIT_REACHED"
          ? `You have used today's ${dailyLimit} private Mirror previews. Try again tomorrow.`
          : message);
    }
  }

  async function removePreview(): Promise<void> {
    if (job?.job.id) {
      await deleteMirrorJob(job.job.id).catch(() => undefined);
    }
    window.localStorage.removeItem(storageKey(candidate.id));
    announcedReady.current = false;
    setJob(null);
    setPrepared(null);
    setAdultConfirmed(false);
    setRightsConfirmed(false);
    setProcessingAccepted(false);
    setError(null);
    setUiState("deleted");
  }

  const busy = ["checking", "preparing", "uploading", "queued", "generating"].includes(uiState);

  return (
    <section className={`yange-mirror mirror-${uiState}`} aria-labelledby="yange-mirror-title" data-liquid-glass-root data-liquid-glass>
      <div className="mirror-seam" aria-hidden="true"><i /></div>
      <header className="mirror-heading">
        <div>
          <span>Yange Mirror</span>
          <h3 id="yange-mirror-title">See one wardrobe piece on you.</h3>
          <p>This is an optional visualization after planning. It cannot change this outfit’s Personal Match, reservation or your Style Aura.</p>
        </div>
        <em>Adult preview · 1 garment · 1 image</em>
      </header>

      {!garments.length ? (
        <div className="mirror-unavailable">
          <strong>Add a photographed top to use Mirror.</strong>
          <p>This look uses sample pieces or garments without a saved photo. Capture your own top in Wardrobe, then plan it here.</p>
        </div>
      ) : !configured ? (
        <div className="mirror-unavailable">
          <strong>Mirror is not enabled in this runtime.</strong>
          <p>Your outfit remains fully planned. Private try-on generation is available only on Yange’s configured Google Cloud service.</p>
        </div>
      ) : job?.job.status === "ready" && job.resultUrl ? (
        <div className="mirror-result">
          <figure>
            <img src={job.resultUrl} alt={`AI visualization of ${job.job.garment.name} on the uploaded person`} />
            <figcaption>AI visualization, not a fit guarantee.</figcaption>
          </figure>
          <div className="mirror-result-copy">
            <span>Private preview ready</span>
            <h4>{job.job.garment.name}</h4>
            <p>Your person photo was deleted after generation. The result is scheduled for automatic deletion after one day, or you can remove it now.</p>
            <div className="mirror-actions">
              <button type="button" className="quiet-action" onClick={() => void removePreview()}>Delete preview</button>
            </div>
          </div>
        </div>
      ) : job && (job.job.status === "queued" || job.job.status === "generating") ? (
        <div className="mirror-processing" role="status" aria-live="polite">
          <div className="mirror-progress" aria-hidden="true"><i /></div>
          <div>
            <span>{job.job.status === "queued" ? "Preview queued" : "Dressing the garment"}</span>
            <h4>You can keep using <YangeWordmark />.</h4>
            <p>This usually takes about half a minute. Yange will keep the job safe if you leave this screen.</p>
          </div>
        </div>
      ) : job && (job.job.status === "blocked" || job.job.status === "failed") ? (
        <div className="mirror-unavailable" role="alert">
          <strong>{job.job.status === "blocked" ? "This photo was stopped by the adult safety check." : "The preview stopped safely."}</strong>
          <p>{job.job.failure?.message ?? "Your outfit and wardrobe were not changed."} Your person photo has been deleted.</p>
          <button type="button" className="quiet-action" onClick={() => void removePreview()}>Clear and choose another photo</button>
        </div>
      ) : (
        <div className="mirror-workbench">
          <div className="mirror-photo-stage">
            {previewUrl ? (
              <img src={previewUrl} alt="Your prepared private Mirror photo" />
            ) : (
              <div className="mirror-photo-empty" aria-hidden="true"><span /><i /></div>
            )}
            <label className="mirror-photo-control">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                capture="user"
                disabled={busy}
                onChange={(event) => void choosePhoto(event.currentTarget.files?.[0])}
              />
              <strong>{prepared ? "Change full-body photo" : "Choose a full-body photo"}</strong>
              <small>One adult, head to toe, good light, fitted or simple clothing</small>
            </label>
          </div>

          <div className="mirror-controls">
            <label className="field-group">
              <span>Preview this piece</span>
              <select value={selectedGarment?.id ?? ""} onChange={(event) => setSelectedGarmentId(event.target.value)}>
                {garments.map((garment) => <option value={garment.id} key={garment.id}>{garment.name}</option>)}
              </select>
            </label>
            <div className="mirror-consent" aria-label="Mirror consent">
              <label><input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} /><span>I confirm that I am 18 or older.</span></label>
              <label><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /><span>This is me, or I have permission to use this photo.</span></label>
              <label><input type="checkbox" checked={processingAccepted} onChange={(event) => setProcessingAccepted(event.target.checked)} /><span>Process this photo privately in {region ?? "a supported Google region"}, then delete the person photo after the attempt.</span></label>
            </div>
            {error && <p className="mirror-error" role="alert">{error}</p>}
            <button
              type="button"
              className="primary-action"
              disabled={!prepared || !adultConfirmed || !rightsConfirmed || !processingAccepted || busy}
              onClick={() => void generate()}
            >
              {uiState === "preparing" ? "Preparing photo…" : uiState === "uploading" ? "Starting private preview…" : "Preview on me"}
            </button>
            <details className="mirror-privacy">
              <summary>Privacy and limits</summary>
              <p>One result is generated only when you ask. Yange allows {dailyLimit} attempts per day, never logs the images, and schedules the private result for deletion after one day. Generated images can contain visual errors and do not predict sizing or fit.</p>
            </details>
          </div>
        </div>
      )}
    </section>
  );
}
