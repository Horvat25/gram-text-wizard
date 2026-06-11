export interface ImageBankPick {
  imageUrl: string;
  source: "image-bank";
  sourceId: string;
  relativePath?: string;
}

const normalizeImageBankText = (value: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const tokenizeImageBankText = (value: string) =>
  normalizeImageBankText(value).match(/[a-z0-9]{3,}/g) || [];

function resolvePublicImageUrl(asset: any, manifestUrl: string): string | null {
  const rawUrl = asset?.publicUrl || asset?.url;
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (rawUrl.startsWith("/@fs/")) return null;

  try {
    return new URL(rawUrl, manifestUrl).toString();
  } catch {
    return null;
  }
}

export async function pickImageBankImages(query: string, count: number): Promise<ImageBankPick[]> {
  const manifestUrl = Deno.env.get("LOCAL_IMAGE_BANK_MANIFEST_URL") || Deno.env.get("IMAGE_BANK_MANIFEST_URL");
  if (!manifestUrl || count <= 0) return [];

  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      console.warn("[image-bank] manifest unavailable:", response.status);
      return [];
    }

    const manifest = await response.json();
    const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
    if (!assets.length) return [];

    const queryTokens = new Set(tokenizeImageBankText(query).slice(0, 32));
    const scored = assets
      .map((asset: any, index: number) => {
        const url = resolvePublicImageUrl(asset, manifestUrl);
        if (!url) return null;

        const tokens = Array.isArray(asset.tokens)
          ? asset.tokens
          : tokenizeImageBankText(`${asset.relativePath || ""} ${asset.fileName || ""} ${asset.category || ""}`);
        const overlap = tokens.reduce((sum: number, token: string) => sum + (queryTokens.has(token) ? 1 : 0), 0);
        const categoryBoost =
          asset.category === "concepts" ? 4 :
          asset.category === "video-scenes" ? 3 :
          asset.category === "screens" || asset.category === "real-screens" ? 2 :
          asset.category === "logos" ? 1 : 0;
        const variety = ((index * 17) % 13) / 10;

        return {
          url,
          asset,
          index,
          score: overlap * 8 + categoryBoost + variety,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.score - a.score || a.index - b.index);

    const unique = new Set<string>();
    const selected: ImageBankPick[] = [];
    for (const item of scored) {
      if (unique.has(item.url)) continue;
      unique.add(item.url);
      selected.push({
        imageUrl: item.url,
        source: "image-bank",
        sourceId: `image_bank_${item.asset.id || item.index}`,
        relativePath: item.asset.relativePath,
      });
      if (selected.length >= count) break;
    }

    console.log(`[image-bank] selected ${selected.length}/${count} images`);
    return selected;
  } catch (error) {
    console.warn("[image-bank] failed:", error);
    return [];
  }
}

export function shouldRequireImageBank() {
  return ["1", "true", "yes", "only"].includes((Deno.env.get("IMAGE_BANK_REQUIRED") || "").toLowerCase());
}
