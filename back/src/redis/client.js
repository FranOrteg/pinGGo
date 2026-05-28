import Redis from 'ioredis';
import config from '../config/index.js';

let client;
let subscriber;

function createClient() {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.password && { password: config.redis.password }),
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
}

export async function connectRedis() {
  client = createClient();
  subscriber = createClient(); // separate connection required by pub/sub adapter

  await client.connect();
  await subscriber.connect();
  console.log('[redis] Connected');

  return { client, subscriber };
}

export function getRedis() {
  if (!client) throw new Error('Redis not initialized. Call connectRedis() first.');
  return client;
}

export function getSubscriber() {
  if (!subscriber) throw new Error('Redis subscriber not initialized.');
  return subscriber;
}
