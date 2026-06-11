// Gera public/image-bank-manifest.json a partir do ESPELHO NA NUVEM do banco
// de imagens Neural Update (bucket público post-images do Supabase do blog).
//
// Substitui o manifest local (/@fs/C:\...) que só funcionava em dev: as URLs
// daqui são públicas e funcionam no app publicado. O formato de saída é o
// mesmo que src/lib/local-image-bank.ts já consome.
//
// O bucket é só-INSERT, então o sync versiona manifests (manifest-{epoch}.json)
// — este script lista e pega o mais novo. A anon key é a chave PUBLICÁVEL do
// blog (pública por design); pode sobrescrever via env.
//
// Uso:  node scripts/build-cloud-image-bank-manifest.mjs
import fs from "node:fs";
import path from "node:path";

const SUPA_URL = (process.env.BLOG_SUPABASE_URL || "https://vjaqqkaabvwimfyxvmlz.supabase.co").replace(/\/+$/, "");
const ANON_KEY = process.env.BLOG_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqYXFxa2FhYnZ3aW1meXh2bWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTgxNzQsImV4cCI6MjA5MzU3NDE3NH0.29HfjRGq74ybRrtTQTtrauiZOScZoUlCHqnnE6TIous";
const BUCKET = "post-images";
const BANK_PREFIX = process.env.BLOG_BANK_PREFIX || "b554d4ce-3916-4cc5-b780-6f985945022e/bank";

const outFile = path.resolve("public/image-bank-manifest.json");

function renderUrl(baseUrl, file, { width, height, quality = 78 }) {
  const u = new URL(`${baseUrl}/${file}`);
  u.pathname = u.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  u.searchParams.set("width", String(width));
  u.searchParams.set("height", String(height));
  u.searchParams.set("resize", "cover");
  u.searchParams.set("format", "webp");
  u.searchParams.set("quality", String(quality));
  return u.toString();
}

async function latestManifest() {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: BANK_PREFIX, limit: 100, search: "manifest" }),
  });
  if (!res.ok) throw new Error(`lista do bucket falhou: HTTP ${res.status}`);
  const files = await res.json();
  let best = null;
  let legacy = false;
  for (const f of files || []) {
    const m = String(f.name || "").match(/^manifest-(\d+)\.json$/);
    if (m) { const ts = Number(m[1]); if (!best || ts > best.ts) best = { ts, name: f.name }; }
    else if (f.name === "manifest.json") legacy = true;
  }
  const name = best ? best.name : (legacy ? "manifest.json" : null);
  if (!name) throw new Error("nenhum manifest no bucket — rode o sync no repo do blog");
  const mres = await fetch(`${SUPA_URL}/storage/v1/object/public/${BUCKET}/${BANK_PREFIX}/${name}`);
  if (!mres.ok) throw new Error(`download do manifest falhou: HTTP ${mres.status}`);
  return mres.json();
}

const cloud = await latestManifest();

const assets = (cloud.images || []).map((img) => ({
  id: `bank-concepts:${img.file}`.toLowerCase(),
  sourceRoot: `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${BANK_PREFIX}`,
  relativePath: `concepts/${(img.topic || "tech").replace(/\s+/g, "-")}/${img.file}`,
  category: "concepts",
  fileName: img.file,
  // url padrão = 9:16 (stories/reels é o formato principal do app)
  url: renderUrl(cloud.baseUrl, img.file, { width: 1080, height: 1920 }),
  urls: {
    original: `${cloud.baseUrl}/${img.file}`,
    blog: renderUrl(cloud.baseUrl, img.file, { width: 1200, height: 675 }),
    instagram: renderUrl(cloud.baseUrl, img.file, { width: 1080, height: 1080 }),
    story: renderUrl(cloud.baseUrl, img.file, { width: 1080, height: 1920 }),
  },
  size: 0,
  tokens: [...new Set([...(img.tags || []), ...String(img.topic || "").split(/\s+/)])].filter((t) => t.length >= 3),
}));

assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "cloud",
  roots: [`${SUPA_URL}/storage/v1/object/public/${BUCKET}/${BANK_PREFIX}`],
  count: assets.length,
  assets,
}, null, 2));

console.log(`[image-bank] Manifest da NUVEM gerado: ${outFile}`);
console.log(`[image-bank] ${assets.length} imagens públicas indexadas`);
