const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const FILES = ["index.html", "styles.css", "app.js", "data.js"];

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

for (const file of FILES) {
  const source = path.join(ROOT_DIR, file);
  const target = path.join(DIST_DIR, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required site file: ${file}`);
  }
  fs.copyFileSync(source, target);
}

console.log(`Built static site in ${path.relative(ROOT_DIR, DIST_DIR)} with ${FILES.length} files.`);
