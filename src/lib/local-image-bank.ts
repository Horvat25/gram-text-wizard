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

// Conta QUANTOS tokens distintos da query casam com a imagem (relevância real).
// Os tokens do banco são em inglês — então a query precisa conter o imagePrompt
// (inglês) da cena, não só o texto em português.
function matchScore(asset: LocalImageBankAsset, queryTokens: string[]) {
  const haystack = normalize(`${asset.category} ${asset.relativePath} ${asset.fileName} ${(asset.tokens || []).join(" ")}`);
  let matches = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) matches++;
  }
  return matches;
}

/**
 * Devolve imagens do banco que REALMENTE casam com a query (≥1 token em comum).
 * Nunca devolve imagem genérica/aleatória: se nada casa, devolve [] e o chamador
 * cai para a próxima fonte. `relaxed=true` permite preencher com as melhores
 * disponíveis quando o chamador aceita aproximação (ex.: completar lacunas).
 */
export async function pickLocalImageBankImages(
  query: string,
  count: number,
  opts: { relaxed?: boolean } = {},
): Promise<LocalImageBankAsset[]> {
  const manifest = await loadManifest();
  const assets = manifest?.assets || [];
  if (!assets.length) return [];

  const queryTokens = Array.from(new Set(
    normalize(query)
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  )).slice(0, 24);

  const scored = assets
    .map((asset, index) => {
      const matches = matchScore(asset, queryTokens);
      const categoryBoost = asset.category === "concepts" ? 0.3 : asset.category === "video-scenes" ? 0.2 : 0;
      // Desempate estável + leve variedade (nunca supera 1 token de match = 1.0).
      const jitter = ((index * 17) % 11) / 100 + Math.random() * 0.15;
      return { asset, matches, score: matches + categoryBoost + jitter };
    })
    .filter(({ asset }) => asset.category !== "icons")
    .sort((a, b) => b.score - a.score);

  // Só imagens com casamento real de token.
  const relevant = scored.filter(({ matches }) => matches >= 1);
  const pool = relevant.length > 0 ? relevant : (opts.relaxed ? scored : []);

  return pool.slice(0, count).map(({ asset }) => asset);
}

export async function getLocalImageBankStatus() {
  const manifest = await loadManifest();
  return {
    available: !!manifest?.assets?.length,
    count: manifest?.count || 0,
    generatedAt: manifest?.generatedAt || null,
  };
}
