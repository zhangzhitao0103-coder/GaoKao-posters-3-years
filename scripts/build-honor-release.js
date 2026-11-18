const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const root = path.resolve(__dirname, "..");
const source = require("vm").runInNewContext;
const context = { window: {} };
source(fs.readFileSync(path.join(root, "outputs/honor-board/data.js"), "utf8"), context);
const items = context.window.HONOR_MATERIALS;
const base = new URL(items.length ? "https://pub-ceb3a66b5d2b48a1b9138364de4f3495.r2.dev" : "");
const output = path.join(root, "outputs/honor-release");
const fields = ["thumbUrl", "previewUrl", "imageUrl", "copyUrl"];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const assets = new Map();
  for (const item of items) {
    for (const field of fields) {
      const url = item[field];
      if (!url || assets.has(url)) continue;
      const input = fs.readFileSync(path.resolve(root, url));
      let data = input;
      if (data.length >= 1_000_000 || !url.endsWith(".webp")) {
        for (const quality of [94, 90, 86, 82, 78, 74, 70, 66, 60, 54, 48, 42, 36, 30]) {
          data = await sharp(input).rotate().webp({ quality, effort: 4 }).toBuffer();
          if (data.length < 1_000_000) break;
        }
      }
      if (data.length >= 1_000_000) throw new Error(`Cannot compress at full resolution: ${url}`);
      const hash = crypto.createHash("sha256").update(data).digest("hex").slice(0, 20);
      const key = `honor-board/${hash}.webp`;
      const file = `outputs/honor-release/${hash}.webp`;
      fs.writeFileSync(path.join(root, file), data);
      assets.set(url, { key, file, contentType: "image/webp" });
    }
  }
  const files = [...new Map([...assets.values()].map(asset => [asset.key, asset])).values()];
  for (const item of items) {
    for (const field of fields) {
      if (item[field]) item[field] = new URL(assets.get(item[field]).key, base).href;
    }
  }
  fs.writeFileSync(path.join(output, "upload-manifest.json"), JSON.stringify({ files }, null, 2));
  fs.writeFileSync(path.join(root, "honor-data.js"), `window.HONOR_MATERIALS = ${JSON.stringify(items, null, 2)};\n`);
  console.log(`${items.length} entries, ${files.length} objects, max ${Math.max(...files.map(x => fs.statSync(path.join(root, x.file)).size))} bytes`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
