const num = (value, fallback) => (value !== undefined && value !== '' ? Number(value) : fallback);

export default {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : ['http://localhost:5173', 'http://localhost:4000', 'http://localhost:5000'],

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'pinggo',
    user: process.env.DB_USER || 'pinggo',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    timezone: 'Z',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_in_production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production',
    // Access token lifetime. Long enough that a Socket.IO reconnect (which reuses the
    // handshake token) rarely needs the grace window below.
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '8h',
    // Refresh cookie lifetime (standalone PinGGo front only)
    refreshExpiresIn: '7d',
    // An expired access token can still be exchanged at /api/auth/refresh (and is accepted
    // on socket reconnect) if it expired less than this many seconds ago.
    refreshGraceSeconds: num(process.env.JWT_REFRESH_GRACE_SECONDS, 7 * 24 * 3600),
    // Absolute session cap counted from the original login/exchange: refresh stops working
    // after this, forcing a new exchange against Labit.
    sessionMaxAgeSeconds: num(process.env.SESSION_MAX_AGE_SECONDS, 30 * 24 * 3600),
  },

  // Server-to-server validation of the opaque Labit session token received in the exchange.
  labit: {
    // Endpoint of the Labit PHP API that resolves a session token to its contact.
    validateUrl: process.env.LABIT_VALIDATE_URL || '',
    // Extra JSON fields merged into the request body next to { token } (e.g. {"action":"me"}).
    validateExtraBody: process.env.LABIT_VALIDATE_EXTRA_BODY || '',
    // Dotted path to the contact id in the JSON response (e.g. "contact_id" or "data.0.contact_id").
    contactIdPath: process.env.LABIT_CONTACT_ID_PATH || 'contact_id',
    timeoutMs: num(process.env.LABIT_VALIDATE_TIMEOUT_MS, 5000),
  },

  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.AWS_REGION || 'eu-west-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },

  files: {
    // Uploads go browser → S3 with a presigned PUT, so this cap costs the server nothing
    uploadMaxBytes: num(process.env.UPLOAD_MAX_MB, 1024) * 1024 * 1024,
    // Above this, files still upload/download but get no thumbnail or Office PDF preview
    previewMaxSourceBytes: num(process.env.PREVIEW_MAX_SOURCE_MB, 300) * 1024 * 1024,
    libreofficeTimeoutMs: num(process.env.LIBREOFFICE_TIMEOUT_MS, 240000),
    pdftoppmTimeoutMs: num(process.env.PDFTOPPM_TIMEOUT_MS, 60000),
    // LibreOffice/pdftoppm processes allowed at once (each big deck can take ~1 GB of RAM)
    conversionConcurrency: Math.max(1, num(process.env.CONVERSION_CONCURRENCY, 2)),
    // A failed conversion is not retried for this long
    previewFailureTtlSeconds: num(process.env.PREVIEW_FAILURE_TTL_SECONDS, 6 * 3600),
  },
};
