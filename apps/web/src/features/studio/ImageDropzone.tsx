import { useId, useState, type DragEvent } from "react";
import type { AnalysisImageKind } from "@yange/contracts";
import type { CaptureSlotState } from "./useCaptureQueue";

interface ImageDropzoneProps {
  kind: AnalysisImageKind;
  title: string;
  description: string;
  slot: CaptureSlotState;
  optional?: boolean;
  onFile(file: File): void;
  onDemo(): void;
  onRetry(): void;
  onRemove(): void;
}

const statusLabels: Record<CaptureSlotState["status"], string> = {
  empty: "Waiting for an image",
  validating: "Checking file safety…",
  compressing: "Rewriting and compressing on device…",
  ready: "Private on-device copy ready",
  analyzing: "Reading visual evidence…",
  failed: "Needs attention",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageDropzone({
  kind,
  title,
  description,
  slot,
  optional = false,
  onFile,
  onDemo,
  onRetry,
  onRemove,
}: ImageDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const busy = ["validating", "compressing", "analyzing"].includes(slot.status);

  function acceptDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <article className={`capture-slot capture-${slot.status}`}>
      <div className="capture-heading">
        <div>
          <h3>{title}</h3>
          <span className="capture-kind">{optional ? "Optional" : "Required"}</span>
        </div>
        {slot.asset && (
          <button type="button" className="text-action" onClick={onRemove} disabled={busy}>
            Replace
          </button>
        )}
      </div>

      <label
        className={`drop-surface ${dragging ? "is-dragging" : ""}`}
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={acceptDrop}
      >
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          capture={kind === "care-label" ? "environment" : undefined}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        {slot.previewUrl ? (
          <img src={slot.previewUrl} alt={`${title} preview`} />
        ) : (
          <div className="drop-empty" aria-hidden="true">
            <span>＋</span>
            <small>Drop or choose image</small>
          </div>
        )}
      </label>

      <p className="capture-description">{description}</p>
      <div className="capture-status" role="status" aria-live="polite">
        <span className="status-pulse" aria-hidden="true" />
        <div>
          <strong>{statusLabels[slot.status]}</strong>
          {slot.asset && (
            <small>
              {slot.asset.width} × {slot.asset.height} · {formatBytes(slot.asset.byteLength)}
              {slot.asset.originalBytes > slot.asset.byteLength &&
                ` · ${Math.round((1 - slot.asset.byteLength / slot.asset.originalBytes) * 100)}% smaller`}
            </small>
          )}
          {slot.error && <small className="capture-error">{slot.error}</small>}
        </div>
      </div>

      <div className="capture-actions">
        {slot.status === "empty" && (
          <button type="button" className="text-action" onClick={onDemo}>
            Use demo capture
          </button>
        )}
        {slot.status === "failed" && (
          <button type="button" className="secondary-action" onClick={onRetry}>
            Retry safely
          </button>
        )}
      </div>
    </article>
  );
}
