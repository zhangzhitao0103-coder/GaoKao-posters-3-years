const fs = require("fs");
const path = require("path");
const { S3Client, HeadObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT_DIR, ".env.r2");
const MANIFEST_FILE = path.join(ROOT_DIR, "outputs", "r2-assets", "upload-manifest.json");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Missing .env.r2. Copy .env.r2.example and fill in your Cloudflare R2 credentials.");
  }

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

function requireValue(env, name) {
  if (!env[name]) throw new Error(`Missing ${name} in .env.r2`);
  return env[name];
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error && (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404)) return false;
    throw error;
  }
}

async function main() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new Error("Missing upload manifest. Run npm.cmd run build:r2-assets first.");
  }

  const env = loadEnv(ENV_FILE);
  const accountId = requireValue(env, "CLOUDFLARE_ACCOUNT_ID");
  const bucket = requireValue(env, "R2_BUCKET");
  const accessKeyId = requireValue(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = requireValue(env, "R2_SECRET_ACCESS_KEY");
  const forceUpload = process.env.R2_FORCE_UPLOAD === "1";

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  let uploaded = 0;
  let skipped = 0;

  for (const entry of manifest.files) {
    const localFile = path.join(ROOT_DIR, entry.file);
    if (!fs.existsSync(localFile)) {
      console.warn(`Missing local asset, skipped: ${entry.file}`);
      continue;
    }

    if (!forceUpload && await objectExists(client, bucket, entry.key)) {
      skipped += 1;
      continue;
    }

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: entry.key,
      Body: fs.createReadStream(localFile),
      ContentType: entry.contentType
    }));
    uploaded += 1;

    if (uploaded % 100 === 0) {
      console.log(`Uploaded ${uploaded}, skipped ${skipped}`);
    }
  }

  console.log(`Upload complete. Uploaded ${uploaded}, skipped ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
