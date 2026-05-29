export default {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : ['http://localhost:5173', 'http://localhost:4000'],

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
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d',
  },

  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.AWS_REGION || 'eu-west-1',
  },
};
