import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { getRedis } from '../redis/client.js';

const {
  previewMaxSourceBytes: MAX_SOURCE_SIZE,
  libreofficeTimeoutMs: LIBREOFFICE_TIMEOUT_MS,
  pdftoppmTimeoutMs: PDFTOPPM_TIMEOUT_MS,
  conversionConcurrency: CONVERSION_CONCURRENCY,
  previewFailureTtlSeconds: FAILURE_TTL_SECONDS,
} = config.files;
const MAX_SOURCE_MB = Math.round(MAX_SOURCE_SIZE / (1024 * 1024));
const MAX_PROCESS_OUTPUT = 10 * 1024 * 1024; // cap captured stdout/stderr
const S3_PRESIGN_TTL = 3600;
const THUMBNAIL_MAX_PX = 1200; // longest side; independent of the page size (A0 plans…)

const OFFICE_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.ms-powerpoint',
]);

export function isOfficeType(fileType) {
  return OFFICE_MIME_TYPES.has(fileType);
}

const isPdfType = (fileType) => fileType === 'application/pdf';

function getS3Client() {
  return new S3Client({
    region: config.s3.region,
    credentials: config.s3.accessKeyId
      ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
      : undefined, // falls back to IAM role / env vars when deployed on EC2/ECS
  });
}

export function getThumbnailKey(originalKey) {
  const ext = path.extname(originalKey);
  const base = originalKey.slice(0, -ext.length || undefined);
  return `thumbnails/${base}_thumb.png`;
}

/** Full PDF rendition of an Office file, shown by the in-app document viewer. */
export function getPreviewPdfKey(originalKey) {
  const ext = path.extname(originalKey);
  const base = originalKey.slice(0, -ext.length || undefined);
  return `previews/${base}.pdf`;
}

function getExtForType(fileType) {
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'xlsx';
  if (fileType.includes('word') || fileType.includes('doc')) return 'docx';
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'pptx';
  return 'bin';
}

async function headObject(s3, bucket, key) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    return null;
  }
}

function signThumbnailUrl(s3, bucket, thumbKey) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: thumbKey }),
    { expiresIn: S3_PRESIGN_TTL }
  );
}

/** Inline PDF URL: no attachment disposition so pdf.js and browsers can render it. */
function signPdfUrl(s3, bucket, key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: 'application/pdf' }),
    { expiresIn: S3_PRESIGN_TTL }
  );
}

// ────────────────────────────── Process execution ──────────────────────────────

/**
 * Caps how many LibreOffice/pdftoppm processes run at once: a big deck can take
 * ~1 GB of RAM, and several in parallel would get the instance OOM-killed. The
 * rest wait in a FIFO queue.
 */
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

const limitConversion = createLimiter(CONVERSION_CONCURRENCY);

/**
 * Spawns a process detached (own process group) so that on timeout we can kill
 * the whole group (e.g. LibreOffice spawns soffice.bin children) instead of
 * leaving orphans behind.
 */
function runProcess(command, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (d) => {
      if (stdout.length < MAX_PROCESS_OUTPUT) stdout += d;
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_PROCESS_OUTPUT) stderr += d;
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
      reject(
        Object.assign(new Error(`${command} timed out after ${timeoutMs}ms`), {
          code: 'ETIMEDOUT',
        })
      );
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        Object.assign(
          new Error(
            `${command} exited with code ${code}${signal ? ` (${signal})` : ''}`
          ),
          { code: 'EXIT_FAILURE', stderr: stderr.slice(-2000) }
        )
      );
    });
  });
}

const runLimited = (command, args, opts) => limitConversion(() => runProcess(command, args, opts));

// ────────────────────────────── Files ──────────────────────────────

const tooLarge = () =>
  Object.assign(new Error(`Source file exceeds the ${MAX_SOURCE_MB} MB limit for previews`), {
    code: 'TOO_LARGE',
  });

/** Aborts the stream as soon as the source exceeds the preview size cap. */
class SizeLimitTransform extends Transform {
  constructor(limit) {
    super();
    this.limit = limit;
    this.total = 0;
  }

  _transform(chunk, _enc, cb) {
    this.total += chunk.length;
    if (this.total > this.limit) {
      cb(tooLarge());
      return;
    }
    cb(null, chunk);
  }
}

/** Streams an S3 object straight to disk, keeping memory bounded regardless of file size. */
async function downloadToTemp(s3, bucket, key, destPath, limit = MAX_SOURCE_SIZE) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(res.Body, new SizeLimitTransform(limit), createWriteStream(destPath, { flags: 'wx' }));
}

async function uploadFromDisk(s3, bucket, key, filePath, contentType) {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: await readFile(filePath), ContentType: contentType })
  );
}

async function renderPdfPageToPng(pdfPath, tmpDir) {
  const prefix = path.join(tmpDir, uuidv4());
  await runLimited(
    'pdftoppm',
    ['-png', '-scale-to', String(THUMBNAIL_MAX_PX), '-singlefile', '-f', '1', '-l', '1', pdfPath, prefix],
    { timeoutMs: PDFTOPPM_TIMEOUT_MS }
  );
  return `${prefix}.png`;
}

/** Converts an Office file to PDF inside tmpDir and returns the PDF path. */
async function convertOfficeToPdf(inputPath, tmpDir) {
  // Isolated profile dir per run avoids LibreOffice profile lock contention
  // between concurrent conversions and lives inside tmpDir (cleaned up after).
  const profileDir = path.join(tmpDir, 'lo_profile');
  await runLimited(
    'libreoffice',
    [
      `-env:UserInstallation=file://${profileDir}`,
      '--headless',
      '--norestore',
      '--nologo',
      '--nolockcheck',
      '--convert-to',
      'pdf',
      '--outdir',
      tmpDir,
      inputPath,
    ],
    { timeoutMs: LIBREOFFICE_TIMEOUT_MS }
  );

  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(tmpDir, `${base}.pdf`);
}

async function withTempDir(prefix, fn) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await fn(tmpDir);
  } finally {
    // Guaranteed cleanup of every temp file (source, PDF, PNG, LibreOffice profile)
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ────────────────────────────── Failure memo ──────────────────────────────
// A conversion that failed (timeout, crash, too large) is not retried on every
// render of the message by every client. Redis when available, memory otherwise.

const localFailures = new Map(); // fileKey → { reason, expiresAt }
const failureKey = (fileKey) => `preview-failed:${fileKey}`;

async function getFailure(fileKey) {
  try {
    const reason = await getRedis().get(failureKey(fileKey));
    if (reason) return reason;
  } catch {
    /* fall back to the in-process memo */
  }
  const local = localFailures.get(fileKey);
  if (local && local.expiresAt > Date.now()) return local.reason;
  localFailures.delete(fileKey);
  return null;
}

async function rememberFailure(fileKey, reason) {
  localFailures.set(fileKey, { reason, expiresAt: Date.now() + FAILURE_TTL_SECONDS * 1000 });
  try {
    await getRedis().set(failureKey(fileKey), reason, 'EX', FAILURE_TTL_SECONDS);
  } catch {
    /* best-effort */
  }
}

function failureReason(err) {
  if (err?.code === 'TOO_LARGE') return 'too_large';
  if (err?.code === 'ETIMEDOUT') return 'timeout';
  return 'conversion_failed';
}

// ────────────────────────────── Jobs ──────────────────────────────
// One job per source file: the Office → PDF conversion feeds both the thumbnail
// and the document viewer, so a file is never converted twice at the same time.

const jobs = new Map(); // `${kind}:${fileKey}` → Promise

function runJob(key, fileKey, work) {
  const existing = jobs.get(key);
  if (existing) return { job: existing, started: false };

  const job = work().catch(async (err) => {
    console.error(`[previews] ${key} failed:`, err.message, err.stderr ?? '');
    await rememberFailure(fileKey, failureReason(err));
    throw err;
  });
  jobs.set(key, job);
  job.finally(() => jobs.delete(key)).catch(() => {});
  return { job, started: true };
}

/** Office: PDF rendition (reused if already in S3) + first-page thumbnail. */
function officeJob(s3, bucket, fileKey, fileType) {
  return runJob(`office:${fileKey}`, fileKey, () =>
    withTempDir('office-', async (tmpDir) => {
      const pdfKey = getPreviewPdfKey(fileKey);
      const thumbKey = getThumbnailKey(fileKey);
      let pdfPath = path.join(tmpDir, 'preview.pdf');

      if (await headObject(s3, bucket, pdfKey)) {
        await downloadToTemp(s3, bucket, pdfKey, pdfPath, Infinity);
      } else {
        const ext = path.extname(fileKey) || `.${getExtForType(fileType)}`;
        const sourcePath = path.join(tmpDir, `source${ext}`);
        await downloadToTemp(s3, bucket, fileKey, sourcePath);
        pdfPath = await convertOfficeToPdf(sourcePath, tmpDir);
        await uploadFromDisk(s3, bucket, pdfKey, pdfPath, 'application/pdf');
      }

      if (!(await headObject(s3, bucket, thumbKey))) {
        const pngPath = await renderPdfPageToPng(pdfPath, tmpDir);
        await uploadFromDisk(s3, bucket, thumbKey, pngPath, 'image/png');
      }
    })
  );
}

/** PDF: first-page thumbnail only (the viewer reads the original). */
function pdfThumbnailJob(s3, bucket, fileKey) {
  return runJob(`pdf:${fileKey}`, fileKey, () =>
    withTempDir('pdfthumb-', async (tmpDir) => {
      const sourcePath = path.join(tmpDir, 'source.pdf');
      await downloadToTemp(s3, bucket, fileKey, sourcePath);
      const pngPath = await renderPdfPageToPng(sourcePath, tmpDir);
      await uploadFromDisk(s3, bucket, getThumbnailKey(fileKey), pngPath, 'image/png');
    })
  );
}

/** Fails fast (no download) when the source is over the preview cap. */
async function checkSourceSize(s3, bucket, fileKey) {
  const head = await headObject(s3, bucket, fileKey);
  if (head?.ContentLength > MAX_SOURCE_SIZE) {
    await rememberFailure(fileKey, 'too_large');
    return 'too_large';
  }
  return null;
}

/**
 * Status of a generated asset, never waiting for a conversion:
 *   { status: 'ready', url }
 *   { status: 'pending', job, started } — job resolves to { status: 'ready', url } or rejects
 *   { status: 'unavailable', reason }   — 'too_large' | 'timeout' | 'conversion_failed' | 'unsupported'
 * `started` is true for the caller that launched the job, so only it notifies clients.
 */
async function resolveAsset({ fileKey, fileType, assetKey, sign, startJob }) {
  const s3 = getS3Client();
  const bucket = config.s3.bucket;

  if (await headObject(s3, bucket, assetKey)) {
    return { status: 'ready', url: await sign(s3, bucket, assetKey) };
  }

  const failed = await getFailure(fileKey);
  if (failed) return { status: 'unavailable', reason: failed };

  // Joining a running job skips the size check: it was done by whoever started it
  const running = jobs.get(`office:${fileKey}`) || jobs.get(`pdf:${fileKey}`);
  if (!running) {
    const tooBig = await checkSourceSize(s3, bucket, fileKey);
    if (tooBig) return { status: 'unavailable', reason: tooBig };
  }

  const { job, started } = startJob(s3, bucket, fileKey, fileType);
  const result = job.then(async () => ({ status: 'ready', url: await sign(s3, bucket, assetKey) }));
  // callers that only joined the job don't await it; keep its failure from becoming
  // an unhandled rejection (that would crash the process)
  result.catch(() => {});
  return { status: 'pending', started, job: result };
}

export function getThumbnailStatus({ fileKey, fileType }) {
  if (!isPdfType(fileType) && !isOfficeType(fileType)) {
    return Promise.resolve({ status: 'unavailable', reason: 'unsupported' });
  }
  return resolveAsset({
    fileKey,
    fileType,
    assetKey: getThumbnailKey(fileKey),
    sign: signThumbnailUrl,
    startJob: isPdfType(fileType)
      ? (s3, bucket, key) => pdfThumbnailJob(s3, bucket, key)
      : officeJob,
  });
}

/** PDF the document viewer renders: the original PDF, or the Office conversion. */
export async function getDocumentPreviewStatus({ fileKey, fileType }) {
  if (isPdfType(fileType)) {
    return { status: 'ready', url: await signPdfUrl(getS3Client(), config.s3.bucket, fileKey) };
  }
  if (!isOfficeType(fileType)) return { status: 'unavailable', reason: 'unsupported' };
  return resolveAsset({
    fileKey,
    fileType,
    assetKey: getPreviewPdfKey(fileKey),
    sign: signPdfUrl,
    startJob: officeJob,
  });
}
