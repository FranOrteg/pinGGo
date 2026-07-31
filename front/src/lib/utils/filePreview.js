import { getViewUrl } from '../api/download.js';

const previewCache = new Map();
let pdfjsLib = null;
let pdfjsLoading = false;
let pdfjsPromise = null;

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'text/xml',
  'text/markdown',
  'application/json',
  'application/javascript',
  'application/xml',
]);

const OFFICE_BINARY_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
]);

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  if (pdfjsLoading) return pdfjsPromise;

  pdfjsLoading = true;
  pdfjsPromise = import('pdfjs-dist/build/pdf.mjs').then(async (mod) => {
    const lib = mod;
    const workerUrl = `https://unpkg.com/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjsLib = lib;
    pdfjsLoading = false;
    return lib;
  }).catch((err) => {
    pdfjsLoading = false;
    throw err;
  });

  return pdfjsPromise;
}

export function isPreviewable(fileType) {
  if (!fileType) return false;
  if (OFFICE_BINARY_TYPES.has(fileType)) return false;
  return (
    fileType === 'text/csv' ||
    fileType.includes('pdf') ||
    isTextLike(fileType)
  );
}

export function isPdf(fileType) {
  return fileType?.includes('pdf') ?? false;
}

export function isCsvOrSheet(fileType) {
  if (!fileType) return false;
  return fileType === 'text/csv';
}

export function isTextLike(fileType) {
  if (!fileType) return false;
  return TEXT_MIME_TYPES.has(fileType);
}

async function fetchTextContent(messageId) {
  const cacheKey = `text:${messageId}`;
  if (previewCache.has(cacheKey)) return previewCache.get(cacheKey);

  const url = await getViewUrl(messageId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  const text = await res.text();

  previewCache.set(cacheKey, text);
  return text;
}

export async function getPdfPreviewDataUrl(messageId) {
  const cacheKey = `pdf:${messageId}`;
  if (previewCache.has(cacheKey)) return previewCache.get(cacheKey);

  const lib = await loadPdfJs();
  const url = await getViewUrl(messageId);

  const doc = await lib.getDocument({ url }).promise;
  const page = await doc.getPage(1);

  const unscaled = page.getViewport({ scale: 1 });
  const targetWidth = 320;
  const scale = targetWidth / unscaled.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  previewCache.set(cacheKey, dataUrl);
  doc.cleanup();
  return dataUrl;
}

export async function getCsvPreview(messageId) {
  const cacheKey = `csv:${messageId}`;
  if (previewCache.has(cacheKey)) return previewCache.get(cacheKey);

  const text = await fetchTextContent(messageId);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    const result = { headers: [], rows: [] };
    previewCache.set(cacheKey, result);
    return result;
  }

  const parseCsvLine = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseCsvLine(lines[0]);
  const maxDataRows = 5;
  const rows = lines.slice(1, maxDataRows + 1).map(parseCsvLine);

  const result = { headers, rows };
  previewCache.set(cacheKey, result);
  return result;
}

export async function getTextPreview(messageId) {
  const cacheKey = `textcontent:${messageId}`;
  if (previewCache.has(cacheKey)) return previewCache.get(cacheKey);

  const text = await fetchTextContent(messageId);
  const maxChars = 2000;
  const truncated = text.length > maxChars ? text.slice(0, maxChars) + '…' : text;

  previewCache.set(cacheKey, truncated);
  return truncated;
}
