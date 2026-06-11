import fs from "node:fs";
import path from "node:path";

const defaultRoots = [
  "C:/Users/Mateus Horvat/neural-image-agent/bank",
  "C:/Users/Mateus Horvat/neural-update-tiktok/exports/video-images",
];

const roots = (process.env.IMAGE_BANK_ROOTS || defaultRoots.join(";"))
  .split(";")
  .map((root) => root.trim())
  .filter(Boolean);
const publicBaseUrl = (process.env.IMAGE_BANK_PUBLIC_BASE || "").replace(/\/+$/, "");

const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const outFile = path.resolve("public/image-bank-manifest.json");

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (imageExts.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function toViteFsUrl(filePath) {
  return `/@fs/${filePath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

function inferCategory(relativePath) {
  const first = relativePath.split(/[\\/]/)[0]?.toLowerCase() || "misc";
  if (["concepts", "logos", "icons", "screens", "real-screens"].includes(first)) return first;
  if (/scene_\d+/i.test(relativePath)) return "video-scenes";
  return first || "misc";
}

const assets = [];

for (const root of roots) {
  const rootPath = path.resolve(root);
  for (const filePath of walk(rootPath)) {
    const relativePath = path.relative(rootPath, filePath).replace(/\\/g, "/");
    const stat = fs.statSync(filePath);
    assets.push({
      id: `${path.basename(rootPath)}:${relativePath}`.toLowerCase().replace(/[^a-z0-9._/-]+/g, "-"),
      sourceRoot: rootPath.replace(/\\/g, "/"),
      relativePath,
      category: inferCategory(relativePath),
      fileName: path.basename(filePath),
      url: toViteFsUrl(filePath),
      publicUrl: publicBaseUrl ? `${publicBaseUrl}/${encodeURI(relativePath).replace(/%5C/g, "/")}` : undefined,
      size: stat.size,
      tokens: relativePath
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, "")
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3),
    });
  }
}

assets.sort((a, b) => a.category.localeCompare(b.category) || a.relativePath.localeCompare(b.relativePath));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      roots: roots.map((root) => path.resolve(root).replace(/\\/g, "/")),
      count: assets.length,
      assets,
    },
    null,
    2,
  ),
);

console.log(`[image-bank] Manifest gerado: ${outFile}`);
console.log(`[image-bank] ${assets.length} imagens indexadas`);
