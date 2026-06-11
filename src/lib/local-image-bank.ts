export interface LocalImageBankAsset {
  id: string;
  category: string;
  relativePath: string;
  fileName: string;
  url: string;
  size: number;
  tokens?: string[];
}

interface LocalImageBankManifest {
  generatedAt: string;
  count: number;
  assets: LocalImageBankAsset[];
}

let manifestPromise: Promise<LocalImageBankManifest | null> | null = null;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/image-bank-manifest.json", { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
}

function scoreAsset(asset: LocalImageBankAsset, queryTokens: string[], index: number) {
  const haystack = normalize(`${asset.category} ${asset.relativePath} ${asset.fileName} ${(asset.tokens || []).join(" ")}`);
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 8;
  }

  if (asset.category === "concepts") score += 4;
  if (asset.category === "video-scenes") score += 3;
  if (asset.category === "logos") score += 2;
  if (/scene_0?1|hook/i.test(asset.relativePath)) score += 2;

  // Shuffle variety: deterministic base + small random offset so each render picks different images.
  score += ((index * 17) % 11) / 10 + Math.random() * 1.5;
  return score;
}

export async function pickLocalImageBankImages(query: string, count: number): Promise<LocalImageBankAsset[]> {
  const manifest = await loadManifest();
  const assets = manifest?.assets || [];
  if (!assets.length) return [];

  const queryTokens = normalize(query)
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 16);

  return assets
    .map((asset, index) => ({ asset, score: scoreAsset(asset, queryTokens, index) }))
    .filter(({ asset }) => asset.category !== "icons" || count > 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ asset }) => asset);
}

export async function getLocalImageBankStatus() {
  const manifest = await loadManifest();
  return {
    available: !!manifest?.assets?.length,
    count: manifest?.count || 0,
    generatedAt: manifest?.generatedAt || null,
  };
}
