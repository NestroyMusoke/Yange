import { cutoutAssetId } from "../../media/garmentCutoutProtocol";
import { useMediaUrl } from "./useCaptureQueue";

export interface GarmentPhotoSource {
  url: string | null;
  originalUrl: string | null;
  cutoutUrl: string | null;
  isCutout: boolean;
}

export function useGarmentPhoto(assetId: string | null): GarmentPhotoSource {
  const originalUrl = useMediaUrl(assetId);
  const cutoutUrl = useMediaUrl(
    assetId ? cutoutAssetId(assetId) : null,
    { cloudFallback: false },
  );
  return {
    url: cutoutUrl ?? originalUrl,
    originalUrl,
    cutoutUrl,
    isCutout: Boolean(cutoutUrl),
  };
}
