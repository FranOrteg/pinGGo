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

const MAX_SOURCE_SIZE = 25 * 1024 * 1024; // 25 MB — same cap as upload
const LIBREOFFICE_TIMEOUT_MS = 30000;
const PDFTOPPM_TIMEOUT_MS = 20000;
const MAX_PROCESS_OUTPUT = 10 * 1024 * 1024; // cap captured stdout/stderr
const S3_PRESIGN_TTL = 3600;

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

// Deduplicates concurrent generations for the same thumbnail key.
const inFlight = new Map();

function getS3Client() {
  return new S3Client({
    region: config.s3.region,
    credentials: config.s3.accessKeyId
      ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
      : undefined, // falls back to IAM role / env vars when deployed on EC2/ECS
  });
}

function getThumbnailKey(originalKey) {
  const ext = path.extname(originalKey);
  const base = originalKey.slice(0, -ext.length || undefined);
  return `thumbnails/${base}_thumb.png`;
}

function getExtForType(fileType) {
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'xlsx';
  if (fileType.includes('word') || fileType.includes('doc')) return 'docx';
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'pptx';
  return 'bin';
}

async function fileExistsInS3(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

function signThumbnailUrl(s3, bucket, thumbKey) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: thumbKey }),
    { expiresIn: S3_PRESIGN_TTL }
  );
}

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

/** Aborts the stream as soon as the source exceeds the 25 MB cap. */
class SizeLimitTransform extends Transform {
  constructor(limit) {
    super();
    this.limit = limit;
    this.total = 0;
  }

  _transform(chunk, _enc, cb) {
    this.total += chunk.length;
    if (this.total > this.limit) {
      cb(
        Object.assign(new Error('Source file exceeds the 25 MB limit for thumbnails'), {
          code: 'TOO_LARGE',
        })
      );
      return;
    }
    cb(null, chunk);
  }
}

/** Streams the source straight to disk, keeping memory bounded regardless of file size. */
async function downloadSourceToTemp(s3, bucket, key, destPath) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(
    res.Body,
    new SizeLimitTransform(MAX_SOURCE_SIZE),
    createWriteStream(destPath, { flags: 'wx' })
  );
}

async function renderPdfPageToPng(pdfPath, tmpDir) {
  const prefix = path.join(tmpDir, uuidv4());
  await runProcess(
    'pdftoppm',
    ['-png', '-r', '200', '-singlefile', '-f', '1', '-l', '1', pdfPath, prefix],
    { timeoutMs: PDFTOPPM_TIMEOUT_MS }
  );
  return readFile(`${prefix}.png`);
}

async function convertOfficeToPng(inputPath, tmpDir) {
  // Isolated profile dir per run avoids LibreOffice profile lock contention
  // between concurrent conversions and lives inside tmpDir (cleaned up after).
  const profileDir = path.join(tmpDir, 'lo_profile');
  await runProcess(
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
  const pdfPath = path.join(tmpDir, `${base}.pdf`);
  return renderPdfPageToPng(pdfPath, tmpDir);
}

async function generateAndStoreThumbnail(s3, bucket, thumbKey, fileKey, fileType) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'thumb-'));
  try {
    const ext = path.extname(fileKey) || `.${getExtForType(fileType)}`;
    const sourcePath = path.join(tmpDir, `source${ext}`);
    await downloadSourceToTemp(s3, bucket, fileKey, sourcePath);

    let pngBuffer;
    if (fileType === 'application/pdf') {
      pngBuffer = await renderPdfPageToPng(sourcePath, tmpDir);
    } else if (isOfficeType(fileType)) {
      pngBuffer = await convertOfficeToPng(sourcePath, tmpDir);
    } else {
      return null;
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbKey,
        Body: pngBuffer,
        ContentType: 'image/png',
      })
    );

    return signThumbnailUrl(s3, bucket, thumbKey);
  } finally {
    // Guaranteed cleanup of every temp file (source, PDF, PNG, LibreOffice profile)
    // even when an error is thrown mid-way.
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function getThumbnailUrl(messageUuid, { fileKey, fileType }) {
  const s3 = getS3Client();
  const bucket = config.s3.bucket;
  const thumbKey = getThumbnailKey(fileKey);

  // Reuse an already-generated thumbnail when present.
  if (await fileExistsInS3(s3, bucket, thumbKey)) {
    const url = await signThumbnailUrl(s3, bucket, thumbKey);
    return { url, generated: false };
  }

  // Deduplicate: if the same thumbnail is already being generated, await it.
  const pending = inFlight.get(thumbKey);
  if (pending) return pending;

  const task = (async () => {
    const url = await generateAndStoreThumbnail(s3, bucket, thumbKey, fileKey, fileType);
    return { url, generated: true };
  })();
  inFlight.set(thumbKey, task);
  task.finally(() => inFlight.delete(thumbKey)).catch(() => {});

  return task;
}
