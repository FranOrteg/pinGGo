/**
 * Shared response for generated previews (thumbnails, Office PDFs):
 *   200 { url }                       ready
 *   202 { status: 'pending' }         being generated; a socket event follows
 *   422 { error, reason }             can't be generated (too large, timeout, unsupported…)
 */
export function sendAssetStatus(res, result) {
  if (result.status === 'ready') return res.json({ url: result.url });
  if (result.status === 'pending') return res.status(202).json({ status: 'pending' });
  return res.status(422).json({ error: 'Preview not available', reason: result.reason });
}
