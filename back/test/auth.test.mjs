// Integration test of the Skylab auth contract with an in-memory DB and a mock Labit API.
import { test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { v5 as uuidv5 } from 'uuid';

// ── Mock Labit API ───────────────────────────────────────────────────────────
const LABIT_TOKENS = { 'tok-69': 69, 'tok-70': '70' };
let labitMode = 'normal';
const labit = http.createServer((req, res) => {
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => {
    if (labitMode === 'down') { res.writeHead(500); return res.end('boom'); }
    if (labitMode === 'html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<b>Error</b>'); }
    const body = JSON.parse(data || '{}');
    if (labitMode === 'extra' && body.action !== 'whoami') { res.writeHead(400); return res.end(); }
    const id = LABIT_TOKENS[body.token];
    if (id === undefined) { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ contact_id: id, Name: 'x' }));
  });
});
await new Promise((r) => labit.listen(0, r));
process.env.LABIT_VALIDATE_URL = `http://127.0.0.1:${labit.address().port}/rest/whoami.php`;
process.env.JWT_ACCESS_SECRET = 'test_access_secret_1234567890';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_1234567890';

// ── In-memory users table (mocks db/pool.js) ─────────────────────────────────
const users = [];
let nextId = 1;
mock.module('../src/db/pool.js', {
  namedExports: {
    async queryOne(sql, params) {
      if (/FROM users WHERE uuid = \?/.test(sql)) return users.find((u) => u.uuid === params[0]) ?? null;
      throw new Error('unexpected queryOne: ' + sql);
    },
    async query(sql, params) {
      if (sql.startsWith('INSERT INTO users (uuid, username, email, password_hash, skylab_id, avatar_url)')) {
        const [uuid, username, email, password_hash, skylab_id, avatar_url] = params;
        users.push({ id: nextId++, uuid, username, email, password_hash, skylab_id: Number(skylab_id), avatar_url });
        return;
      }
      if (sql.startsWith('UPDATE users SET')) {
        const uuid = params[params.length - 1];
        const u = users.find((x) => x.uuid === uuid);
        const cols = sql.match(/SET (.*) WHERE/)[1].split(', ').map((c) => c.split(' = ')[0]);
        cols.forEach((c, i) => (u[c] = params[i]));
        return;
      }
      throw new Error('unexpected query: ' + sql);
    },
  },
});

const express = (await import('express')).default;
const cookieParser = (await import('cookie-parser')).default;
const jwt = (await import('jsonwebtoken')).default;
const authRouter = (await import('../src/api/auth/router.js')).default;
const { mirrorErrorMessage, errorHandler } = await import('../src/middleware/errorHandler.js');
const { authSocketMiddleware } = await import('../src/socket/middleware/authSocket.js');
const config = (await import('../src/config/index.js')).default;

const app = express();
app.use(mirrorErrorMessage);
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use(errorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
after(() => { server.close(); labit.close(); });

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const fran = { skylabId: '69', email: 'fran@labit.es', username: 'Fran Ortiz', avatarUrl: 'https://img/fran.png', skylabToken: 'tok-69' };

test('exchange: valid Labit token → 200 with accessToken carrying uuid/email/username/exp', async () => {
  const r = await post('/api/auth/exchange-token', fran);
  assert.equal(r.status, 200);
  const p = jwt.decode(r.body.accessToken);
  assert.equal(p.uuid, uuidv5('fran@labit.es', NS));
  assert.equal(p.sub, p.uuid);
  assert.equal(p.email, 'fran@labit.es');
  assert.equal(p.username, 'Fran Ortiz');
  assert.ok(p.exp - p.iat >= 8 * 3600 - 1, 'access token lasts 8h');
  assert.equal(users.length, 1);
  assert.equal(users[0].skylab_id, 69);
});

test('exchange: numeric skylabId and "Bearer " prefix on the token are accepted', async () => {
  const r = await post('/api/auth/exchange-token', { ...fran, skylabId: 69, skylabToken: 'Bearer tok-69' });
  assert.equal(r.status, 200);
  assert.equal(users.length, 1, 'same email → same user');
});

test('exchange: token of another contact → 401 with message', async () => {
  const r = await post('/api/auth/exchange-token', { ...fran, skylabToken: 'tok-70' });
  assert.equal(r.status, 401);
  assert.equal(r.body.message, 'Invalid Skylab token');
});

test('exchange: unknown token → 401', async () => {
  const r = await post('/api/auth/exchange-token', { ...fran, skylabToken: 'nope' });
  assert.equal(r.status, 401);
  assert.equal(r.body.message, 'Invalid Skylab token');
});

test('exchange: Labit answers HTML/200 → 401 (not a crash)', async () => {
  labitMode = 'html';
  const r = await post('/api/auth/exchange-token', fran);
  labitMode = 'normal';
  assert.equal(r.status, 401);
});

test('exchange: Labit down → 502 with message', async () => {
  labitMode = 'down';
  const r = await post('/api/auth/exchange-token', fran);
  labitMode = 'normal';
  assert.equal(r.status, 502);
  assert.match(r.body.message, /unavailable/);
});

test('exchange: missing fields / non-numeric skylabId → 400 with message', async () => {
  let r = await post('/api/auth/exchange-token', { email: 'a@b.c' });
  assert.equal(r.status, 400);
  assert.ok(r.body.message);
  r = await post('/api/auth/exchange-token', { ...fran, skylabId: '8892470d-9574' });
  assert.equal(r.status, 400);
});

test('exchange: does not overwrite username/avatar edited in PinGGo', async () => {
  users[0].username = 'Fran (editado)';
  users[0].avatar_url = 'avatars/x/custom.png';
  const r = await post('/api/auth/exchange-token', { ...fran, username: 'Otro Nombre', avatarUrl: 'https://img/new.png' });
  assert.equal(r.status, 200);
  assert.equal(users[0].username, 'Fran (editado)');
  assert.equal(users[0].avatar_url, 'avatars/x/custom.png');
  assert.equal(jwt.decode(r.body.accessToken).username, 'Fran (editado)');
});

test('exchange: fallback email <id>@skylab.labit.es gives a distinct deterministic uuid', async () => {
  const r = await post('/api/auth/exchange-token', { skylabId: '70', email: '70@skylab.labit.es', username: 'Fran Ortiz', skylabToken: 'tok-70' });
  assert.equal(r.status, 200);
  assert.equal(jwt.decode(r.body.accessToken).uuid, uuidv5('70@skylab.labit.es', NS));
  assert.equal(users.length, 2, 'same display name allowed for two users');
});

test('exchange: LABIT_VALIDATE_EXTRA_BODY is merged into the request', async () => {
  labitMode = 'extra';
  config.labit.validateExtraBody = '{"action":"whoami"}';
  const r = await post('/api/auth/exchange-token', fran);
  config.labit.validateExtraBody = '';
  labitMode = 'normal';
  assert.equal(r.status, 200);
});

const signExpired = (secondsAgo, extra = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: users[0].uuid, uuid: users[0].uuid, email: users[0].email, username: 'x', sat: now - secondsAgo - 3600, iat: now - secondsAgo - 3600, exp: now - secondsAgo, ...extra }, process.env.JWT_ACCESS_SECRET);
};

test('refresh: expired Bearer token within grace → new token, original sat preserved', async () => {
  const old = signExpired(3600);
  const r = await post('/api/auth/refresh', null, { Authorization: `Bearer ${old}` });
  assert.equal(r.status, 200);
  const p = jwt.decode(r.body.accessToken);
  assert.ok(p.exp > Date.now() / 1000);
  assert.equal(p.sat, jwt.decode(old).sat);
  assert.equal(p.username, 'Fran (editado)', 'username re-read from DB');
});

test('refresh: expired beyond grace → 401 with message', async () => {
  const r = await post('/api/auth/refresh', null, { Authorization: `Bearer ${signExpired(8 * 24 * 3600)}` });
  assert.equal(r.status, 401);
  assert.equal(r.body.message, 'Session expired');
});

test('refresh: session older than SESSION_MAX_AGE → 401', async () => {
  const now = Math.floor(Date.now() / 1000);
  const r = await post('/api/auth/refresh', null, { Authorization: `Bearer ${signExpired(60, { sat: now - 31 * 24 * 3600 })}` });
  assert.equal(r.status, 401);
});

test('refresh: forged signature → 401; no credentials → 401', async () => {
  const forged = jwt.sign({ sub: users[0].uuid, exp: Math.floor(Date.now() / 1000) + 60 }, 'wrong-secret');
  let r = await post('/api/auth/refresh', null, { Authorization: `Bearer ${forged}` });
  assert.equal(r.status, 401);
  r = await post('/api/auth/refresh', null);
  assert.equal(r.status, 401);
});

test('REST: /me with expired token → 401 (triggers front refresh)', async () => {
  const r = await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${signExpired(60)}` } });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, 'Invalid or expired token');
});

test('socket: accepts valid and grace-expired tokens, rejects beyond grace / missing', () => {
  const run = (token) => {
    const socket = { handshake: { auth: token ? { token } : {} }, data: {} };
    let err;
    authSocketMiddleware(socket, (e) => (err = e));
    return { err, user: socket.data.user };
  };
  const fresh = jwt.sign({ sub: 'u', uuid: 'u', sat: Math.floor(Date.now() / 1000) }, process.env.JWT_ACCESS_SECRET, { expiresIn: '8h' });
  assert.equal(run(fresh).err, undefined);
  assert.equal(run(fresh).user.sub, 'u');
  assert.equal(run(signExpired(3600)).err, undefined);
  assert.ok(run(signExpired(8 * 24 * 3600)).err);
  assert.ok(run(null).err);
});
