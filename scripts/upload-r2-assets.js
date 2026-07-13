const fs = require("fs");
const path = require("path");
const { S3Client, HeadObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT_DIR, ".env.r2");
const MANIFEST_FILE = process.env.R2_UPLOAD_MANIFEST
  ? path.resolve(ROOT_DIR, process.env.R2_UPLOAD_MANIFEST)
  : path.join(ROOT_DIR, "outputs", "r2-assets", "upload-manifest.json");
const FAILED_UPLOADS_FILE = path.join(ROOT_DIR, "outputs", "r2-assets", "failed-uploads.json");
const UPLOAD_CONCURRENCY = Number.parseInt(process.env.R2_UPLOAD_CONCURRENCY || "4", 10);
const START_INDEX = Number.parseInt(process.env.R2_UPLOAD_START_INDEX || "0", 10);

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  process.exitCode = 1;
});

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
    await sendWithRetry(client, new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error && (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404)) return false;
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  return [
    "TimeoutError",
    "NetworkingError",
    "RequestTimeout",
    "SlowDown"
  ].includes(error?.name) || [
    "ETIMEDOUT",
    "ECONNRESET",
    "EAI_AGAIN",
    "ENOTFOUND"
  ].includes(error?.code) || [429, 500, 502, 503, 504].includes(error?.$metadata?.httpStatusCode);
}

async function sendWithRetry(client, command, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await client.send(command);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) break;
      await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function putObjectWithRetry(client, params, attempts = 5) {
  let lastError;
  const { filePath, ...putParams } = params;
  const body = await fs.promises.readFile(filePath);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await client.send(new PutObjectCommand({
        ...putParams,
        Body: body,
        ContentLength: body.length
      }));
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) break;
      await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
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
  const files = manifest.files.slice(Math.max(0, START_INDEX || 0));
  let uploaded = 0;
  let skipped = 0;
  let missing = 0;
  let processed = 0;
  let nextIndex = 0;
  const failed = [];

  async function uploadEntry(entry) {
    const localFile = path.join(ROOT_DIR, entry.file);
    if (!fs.existsSync(localFile)) {
      console.warn(`Missing local asset, skipped: ${entry.file}`);
      missing += 1;
      return;
    }

    if (!forceUpload && await objectExists(client, bucket, entry.key)) {
      skipped += 1;
      return;
    }

    await putObjectWithRetry(client, {
      Bucket: bucket,
      Key: entry.key,
      filePath: localFile,
      ContentType: entry.contentType
    });
    uploaded += 1;
  }

  async function worker() {
    while (nextIndex < files.length) {
      const entry = files[nextIndex];
      nextIndex += 1;
      try {
        await uploadEntry(entry);
      } catch (error) {
        failed.push({
          key: entry.key,
          file: entry.file,
          message: error?.message || String(error),
          code: error?.code,
          name: error?.name
        });
      }
      processed += 1;

      if (processed % 500 === 0) {
        console.log(`Processed ${processed}/${files.length}. Uploaded ${uploaded}, skipped ${skipped}, missing ${missing}, failed ${failed.length}`);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(UPLOAD_CONCURRENCY || 1, files.length));
  console.log(`Uploading ${files.length} files with concurrency ${workerCount}. Start index ${Math.max(0, START_INDEX || 0)}.`);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (failed.length) {
    fs.writeFileSync(FAILED_UPLOADS_FILE, JSON.stringify(failed, null, 2), "utf8");
    console.error(`Upload finished with ${failed.length} failed files. Failed list: ${path.relative(ROOT_DIR, FAILED_UPLOADS_FILE)}`);
    process.exitCode = 1;
    return;
  }

  if (fs.existsSync(FAILED_UPLOADS_FILE)) fs.unlinkSync(FAILED_UPLOADS_FILE);
  console.log(`Upload complete. Uploaded ${uploaded}, skipped ${skipped}, missing ${missing}, failed 0.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
