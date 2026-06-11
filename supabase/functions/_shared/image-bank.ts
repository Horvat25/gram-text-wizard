export interface ImageBankPick {
  imageUrl: string;
  source: "image-bank";
  sourceId: string;
  relativePath?: string;
}

// ─── Banco de imagens Neural Update (espelho na nuvem) ───
// Bucket público post-images do Supabase do BLOG. O sync do blog versiona
// manifests como manifest-{epoch}.json; pegamos sempre o mais novo.
// Pode ser sobrescrito por LOCAL_IMAGE_BANK_MANIFEST_URL / IMAGE_BANK_MANIFEST_URL.
const BLOG_SUPABASE_URL = "https://vjaqqkaabvwimfyxvmlz.supabase.co";
const BLOG_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqYXFxa2FhYnZ3aW1meXh2bWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTgxNzQsImV4cCI6MjA5MzU3NDE3NH0.29HfjRGq74ybRrtTQTtrauiZOScZoUlCHqnnE6TIous";
const BLOG_BUCKET = "post-images";
const BLOG_BANK_PREFIX = "b554d4ce-3916-4cc5-b780-6f985945022e/bank";

interface BankAsset {
  url: string;
  category: string;
  relativePath: string;
  fileName: string;
  tokens: string[];
  id: string;
}

let cachedAssets: BankAsset[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

const normalizeImageBankText = (value: string) =>
  (value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const tokenizeImageBankText = (value: string) =>
  normalizeImageBankText(value).match(/[a-z0-9]{3,}/g) || [];

function renderUrl(baseUrl: string, file: string): string {
  const u = new URL(`${baseUrl}/${file}`);
  u.pathname = u.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  u.searchParams.set("width", "1080");
  u.searchParams.set("height", "1920");
  u.searchParams.set("resize", "cover");
  u.searchParams.set("format", "webp");
  u.searchParams.set("quality", "78");
  return u.toString();
}

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

// Manifesto via env (formato do app: { assets: [...] })
async function loadAssetsFromEnvManifest(manifestUrl: string): Promise<BankAsset[]> {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    console.warn("[image-bank] env manifest unavailable:", response.status);
    return [];
  }
  const manifest = await response.json();
  const rawAssets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  return rawAssets
    .map((asset: any, index: number) => {
      const url = resolvePublicImageUrl(asset, manifestUrl);
      if (!url) return null;
      return {
        url,
        category: asset.category || "concepts",
        relativePath: asset.relativePath || "",
        fileName: asset.fileName || "",
        tokens: Array.isArray(asset.tokens)
          ? asset.tokens
          : tokenizeImageBankText(`${asset.relativePath || ""} ${asset.fileName || ""} ${asset.category || ""}`),
        id: String(asset.id || index),
      };
    })
    .filter(Boolean) as BankAsset[];
}

// Manifesto direto do Supabase do blog (formato do sync: { images: [...], baseUrl })
async function loadAssetsFromBlogCloud(): Promise<BankAsset[]> {
  const listRes = await fetch(`${BLOG_SUPABASE_URL}/storage/v1/object/list/${BLOG_BUCKET}`, {
    method: "POST",
    headers: {
      apikey: BLOG_ANON_KEY,
      Authorization: `Bearer ${BLOG_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: BLOG_BANK_PREFIX, limit: 100, search: "manifest" }),
  });
  if (!listRes.ok) {
    console.warn("[image-bank] blog bucket list failed:", listRes.status);
    return [];
  }

  const files = await listRes.json();
  let best: { ts: number; name: string } | null = null;
  let legacy = false;
  for (const f of files || []) {
    const m = String(f.name || "").match(/^manifest-(\d+)\.json$/);
    if (m) {
      const ts = Number(m[1]);
      if (!best || ts > best.ts) best = { ts, name: f.name };
    } else if (f.name === "manifest.json") legacy = true;
  }
  const name = best ? best.name : legacy ? "manifest.json" : null;
  if (!name) {
    console.warn("[image-bank] nenhum manifest no bucket do blog");
    return [];
  }

  const manifestRes = await fetch(
    `${BLOG_SUPABASE_URL}/storage/v1/object/public/${BLOG_BUCKET}/${BLOG_BANK_PREFIX}/${name}`,
  );
  if (!manifestRes.ok) {
    console.warn("[image-bank] manifest download failed:", manifestRes.status);
    return [];
  }

  const cloud = await manifestRes.json();
  const baseUrl = cloud.baseUrl || `${BLOG_SUPABASE_URL}/storage/v1/object/public/${BLOG_BUCKET}/${BLOG_BANK_PREFIX}`;
  return (cloud.images || []).map((img: any, index: number) => ({
    url: renderUrl(baseUrl, img.file),
    category: "concepts",
    relativePath: `concepts/${String(img.topic || "tech").replace(/\s+/g, "-")}/${img.file}`,
    fileName: img.file || "",
    tokens: [
      ...new Set([
        ...(img.tags || []),
        ...String(img.topic || "").split(/\s+/),
      ]),
    ].filter((t: string) => t.length >= 3).map((t: string) => normalizeImageBankText(t)),
    id: `bank:${img.file || index}`,
  }));
}

async function loadBankAssets(): Promise<BankAsset[]> {
  const now = Date.now();
  if (cachedAssets && now - cacheTimestamp < CACHE_TTL_MS) return cachedAssets;

  const manifestUrl = Deno.env.get("LOCAL_IMAGE_BANK_MANIFEST_URL") || Deno.env.get("IMAGE_BANK_MANIFEST_URL");
  let assets: BankAsset[] = [];

  try {
    if (manifestUrl) {
      assets = await loadAssetsFromEnvManifest(manifestUrl);
    }
    if (!assets.length) {
      assets = await loadAssetsFromBlogCloud();
    }
  } catch (error) {
    console.warn("[image-bank] load failed:", error);
  }

  if (assets.length) {
    cachedAssets = assets;
    cacheTimestamp = now;
    console.log(`[image-bank] ${assets.length} assets carregados`);
  }
  return assets;
}

export async function pickImageBankImages(query: string, count: number): Promise<ImageBankPick[]> {
  if (count <= 0) return [];

  const assets = await loadBankAssets();
  if (!assets.length) return [];

  const queryTokens = new Set(tokenizeImageBankText(query).slice(0, 32));
  const scored = assets
    .map((asset, index) => {
      const overlap = asset.tokens.reduce((sum, token) => sum + (queryTokens.has(token) ? 1 : 0), 0);
      const categoryBoost =
        asset.category === "concepts" ? 4 :
        asset.category === "video-scenes" ? 3 :
        asset.category === "screens" || asset.category === "real-screens" ? 2 :
        asset.category === "logos" ? 1 : 0;
      const variety = ((index * 17) % 13) / 10 + Math.random() * 0.4;

      return { asset, index, score: overlap * 8 + categoryBoost + variety };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  // Prefere imagens com pelo menos 1 token relevante; completa com as melhores restantes.
  const relevant = scored.filter((item) => item.score >= 8);
  const pool = relevant.length >= count ? relevant : scored;

  const unique = new Set<string>();
  const selected: ImageBankPick[] = [];
  for (const item of pool) {
    if (unique.has(item.asset.url)) continue;
    unique.add(item.asset.url);
    selected.push({
      imageUrl: item.asset.url,
      source: "image-bank",
      sourceId: `image_bank_${item.asset.id}`,
      relativePath: item.asset.relativePath,
    });
    if (selected.length >= count) break;
  }

  console.log(`[image-bank] selected ${selected.length}/${count} images (${relevant.length} relevantes)`);
  return selected;
}

export function shouldRequireImageBank() {
  return ["1", "true", "yes", "only"].includes((Deno.env.get("IMAGE_BANK_REQUIRED") || "").toLowerCase());
}
