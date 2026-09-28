export function errorHandler(err, req, res, _next) {
  const status = err.status ?? err.statusCode ?? 500;
  const message = status >= 500 && status !== 502 ? 'Internal server error' : err.message || 'Error';

  if (status >= 500) {
    console.error('[error]', err);
  }

  res.status(status).json({
    error: message,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * The Skylab front reads `message` from error bodies; PinGGo's own front reads `error`.
 * Mirror `error` into `message` on every error response so both work.
 */
export function mirrorErrorMessage(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (
      res.statusCode >= 400 &&
      body && typeof body === 'object' && !Array.isArray(body) &&
      body.error !== undefined && body.message === undefined
    ) {
      body = { ...body, message: body.error };
    }
    return json(body);
  };
  next();
}
