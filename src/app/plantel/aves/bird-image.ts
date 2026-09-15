import { getApiUrl } from "../../../lib/http/api-client";

export const FALLBACK_BIRD_IMAGE = "/assets/imagery/birds/great-tit-header-hd.webp";

export function resolveBirdImageUrl(imageUrl?: string | null): string {
  return imageUrl ? getApiUrl(imageUrl) : FALLBACK_BIRD_IMAGE;
}
