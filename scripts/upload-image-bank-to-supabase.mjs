import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const defaultRoots = [
  "C:/Users/Mateus Horvat/neural-image-agent/bank",
  "C:/Users/Mateus Horvat/neural-update-tiktok/exports/video-images",
];

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.IMAGE_BANK_BUCKET || "image-bank";
const roots = (process.env.IMAGE_BANK_ROOTS || defaultRoots.join(";"))
  .split(";")
  .map((root) => root.trim())
  .filter(Boolean);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("[image-bank] Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para upload.");
  process.exit(1);
}

const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const outFile = path.resolve("public/image-bank-manifest.json");
const supabase = createClient(supabaseUrl, serviceRoleKey);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (imageExts.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

function inferCategory(relativePath) {
  const first = relativePath.split(/[\\/]/)[0]?.toLowerCase() || "misc";
  if (["concepts", "logos", "icons", "screens", "real-screens"].includes(first)) return first;
  if (/scene_\d+/i.test(relativePath)) return "video-scenes";
  return first || "misc";
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets?.some((item) => item.name === bucket)) return;

  const created = await supabase.storage.createBucket(bucket, { public: true });
  if (created.error && !/already exists/i.test(created.error.message || "")) throw created.error;
}

await ensureBucket();

const assets = [];
let uploaded = 0;
let failed = 0;

for (const root of roots) {
  const rootPath = path.resolve(root);
  const rootSlug = path.basename(rootPath).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const files = walk(rootPath);

  for (const filePath of files) {
    const relativePath = path.relative(rootPath, filePath).replace(/\\/g, "/");
    const storagePath = `${rootSlug}/${relativePath}`;
    const body = fs.readFileSync(filePath);
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, body, { contentType: contentType(filePath), upsert: true });

    if (error) {
      failed++;
      console.warn(`[image-bank] falhou: ${storagePath} - ${error.message}`);
      continue;
    }

    uploaded++;
    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const stat = fs.statSync(filePath);
    assets.push({
      id: `${rootSlug}:${relativePath}`.toLowerCase().replace(/[^a-z0-9._/-]+/g, "-"),
      sourceRoot: rootPath.replace(/\\/g, "/"),
      relativePath,
      category: inferCategory(relativePath),
      fileName: path.basename(filePath),
      url: data.publicUrl,
      publicUrl: data.publicUrl,
      size: stat.size,
      tokens: relativePath
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, "")
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3),
    });

    if (uploaded % 100 === 0) console.log(`[image-bank] ${uploaded}/${files.length} enviados de ${rootSlug}`);
  }
}

assets.sort((a, b) => a.category.localeCompare(b.category) || a.relativePath.localeCompare(b.relativePath));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      bucket,
      count: assets.length,
      assets,
    },
    null,
    2,
  ),
);

console.log(`[image-bank] Upload concluido: ${uploaded} enviados, ${failed} falhas`);
console.log(`[image-bank] Manifesto publico gerado: ${outFile}`);
console.log("[image-bank] Configure LOCAL_IMAGE_BANK_MANIFEST_URL para a URL publica desse manifesto.");
