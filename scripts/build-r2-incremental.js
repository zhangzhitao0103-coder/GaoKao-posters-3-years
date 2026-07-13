const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");
const sharp = require("sharp");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT_DIR, "data.js");
const ENV_FILE = path.join(ROOT_DIR, ".env.r2");
const OUTPUT_DIR = path.join(ROOT_DIR, "outputs", "r2-incremental");
const THUMBS_DIR = path.join(OUTPUT_DIR, "thumbs");
const PREVIEWS_DIR = path.join(OUTPUT_DIR, "previews");
const ORIGINALS_DIR = path.join(OUTPUT_DIR, "originals");
const MANIFEST_FILE = path.join(OUTPUT_DIR, "upload-manifest.json");
const R2_DATA_FILE = path.join(OUTPUT_DIR, "data.r2.js");
const OLD_DATA_REF = process.env.R2_OLD_DATA_REF || "HEAD:data.js";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    values[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

function readMaterialsFromText(source) {
  const match = source.match(/window\.MATERIALS\s*=\s*([\s\S]*?);\s*$/);
  if (!match) throw new Error("Could not parse window.MATERIALS");
  return JSON.parse(match[1]);
}

function localPathFromUrl(sourcePath) {
  const relativePath = decodeURIComponent(sourcePath.replace(/^\.\//, ""));
  return path.join(ROOT_DIR, relativePath);
}

function safeSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function objectNameFor(item, sourceFile) {
  const ext = path.extname(sourceFile).toLowerCase();
  const hash = crypto.createHash("md5").update(item.sourcePath).digest("hex").slice(0, 10);
  return [item.year, safeSlug(item.category), safeSlug(item.province || "未知省份"), item.id, hash].filter(Boolean).join("_") + ext;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function publicUrl(baseUrl, key) {
  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function buildDerivative(sourceFile, targetFile, width, quality) {
  await sharp(sourceFile)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toFile(targetFile);
}

async function main() {
  const env = loadEnv(ENV_FILE);
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!publicBaseUrl) throw new Error("Missing R2_PUBLIC_BASE_URL in .env.r2");

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });

  const currentMaterials = readMaterialsFromText(fs.readFileSync(DATA_FILE, "utf8"));
  const oldDataText = childProcess.execFileSync("git", ["show", OLD_DATA_REF], {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024
  });
  const oldMaterials = readMaterialsFromText(oldDataText);
  const oldBySourcePath = new Map(oldMaterials.map((item) => [item.sourcePath, item]));
  const uploadFiles = [];
  const nextMaterials = [];
  let reused = 0;
  let generated = 0;

  for (const item of currentMaterials) {
    const oldItem = oldBySourcePath.get(item.sourcePath);
    if (oldItem) {
      nextMaterials.push({
        ...item,
        thumbUrl: oldItem.thumbUrl,
        previewUrl: oldItem.previewUrl,
        imageUrl: oldItem.imageUrl
      });
      reused += 1;
      continue;
    }

    const sourceFile = localPathFromUrl(item.sourcePath);
    if (!fs.existsSync(sourceFile)) throw new Error(`Missing source image: ${item.sourcePath}`);

    const originalName = objectNameFor(item, sourceFile);
    const previewName = originalName.replace(/\.[^.]+$/, ".webp");
    const originalKey = `originals/${originalName}`;
    const previewKey = `previews/${previewName}`;
    const thumbKey = `thumbs/${previewName}`;
    const originalFile = path.join(ORIGINALS_DIR, originalName);
    const previewFile = path.join(PREVIEWS_DIR, previewName);
    const thumbFile = path.join(THUMBS_DIR, previewName);

    fs.copyFileSync(sourceFile, originalFile);
    await buildDerivative(sourceFile, previewFile, 1400, 82);
    await buildDerivative(sourceFile, thumbFile, 520, 76);

    uploadFiles.push(
      { key: thumbKey, file: path.relative(ROOT_DIR, thumbFile).replace(/\\/g, "/"), contentType: "image/webp" },
      { key: previewKey, file: path.relative(ROOT_DIR, previewFile).replace(/\\/g, "/"), contentType: "image/webp" },
      { key: originalKey, file: path.relative(ROOT_DIR, originalFile).replace(/\\/g, "/"), contentType: contentTypeFor(sourceFile) }
    );

    nextMaterials.push({
      ...item,
      thumbUrl: publicUrl(publicBaseUrl, thumbKey),
      previewUrl: publicUrl(publicBaseUrl, previewKey),
      imageUrl: publicUrl(publicBaseUrl, originalKey)
    });
    generated += 1;
  }

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    publicBaseUrl,
    files: uploadFiles
  }, null, 2), "utf8");
  fs.writeFileSync(R2_DATA_FILE, [
    "/* Auto-generated by scripts/build-r2-incremental.js. Copy to data.js after R2 upload is verified. */",
    `window.MATERIALS = ${JSON.stringify(nextMaterials, null, 2)};`,
    ""
  ].join("\n"), "utf8");

  console.log(`Reused ${reused} existing materials. Generated ${generated} changed materials.`);
  console.log(`Upload files: ${uploadFiles.length}`);
  console.log(`Manifest: ${path.relative(ROOT_DIR, MANIFEST_FILE)}`);
  console.log(`R2 data file: ${path.relative(ROOT_DIR, R2_DATA_FILE)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
