import config from '../config/index.js';

export class LabitUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.status = 502;
  }
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function extraBody() {
  if (!config.labit.validateExtraBody) return {};
  try {
    return JSON.parse(config.labit.validateExtraBody);
  } catch {
    throw new Error('LABIT_VALIDATE_EXTRA_BODY is not valid JSON');
  }
}

export function isLabitValidationConfigured() {
  return Boolean(config.labit.validateUrl);
}

/**
 * Resolves an opaque Labit session token to its contact id by calling the Labit PHP API
 * server-to-server (the same way Skylab does: POST with { token } in a JSON body).
 *
 * Returns the contact id as a string, or null when Labit rejects the token.
 * Throws LabitUnavailableError when Labit cannot be reached or answers with a 5xx,
 * so an outage is reported as 502 instead of "invalid token".
 */
export async function resolveLabitContactId(token) {
  let response;
  try {
    response = await fetch(config.labit.validateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...extraBody(), token }),
      signal: AbortSignal.timeout(config.labit.timeoutMs),
      redirect: 'error',
    });
  } catch (err) {
    console.error('[labit] validation request failed:', err.name, err.message);
    throw new LabitUnavailableError('Skylab authentication service unavailable');
  }

  if (response.status >= 500) {
    console.error('[labit] validation endpoint answered', response.status);
    throw new LabitUnavailableError('Skylab authentication service unavailable');
  }
  if (!response.ok) return null; // 401/403/404…: token rejected

  let body;
  try {
    body = await response.json();
  } catch {
    // Labit PHP endpoints may answer 200 with a non-JSON error page for bad tokens
    return null;
  }

  const contactId = getPath(body, config.labit.contactIdPath);
  if (contactId === undefined || contactId === null || contactId === '' || contactId === false) {
    return null;
  }
  return String(contactId);
}
