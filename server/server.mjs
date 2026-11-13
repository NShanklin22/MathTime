// Starts the API: `node server.mjs`. Env:
//   DB_PATH          the SQLite file (default data/mathtime.db)
//   PORT, HOST       where to listen (default 127.0.0.1:3006; the Dockerfile sets HOST=0.0.0.0)
//   TRUST_PROXY=1    the caller's address is X-Real-IP, as nginx sets it (deploy/compose.yaml sets this)
//   COOKIE_INSECURE=1  drops the cookie's Secure flag, for local http development only
import { createServer } from 'node:http';
import { openDb } from './store.mjs';
import { createApp } from './app.mjs';

const dbPath = process.env.DB_PATH || 'data/mathtime.db';
const port = Number(process.env.PORT) || 3006;
const host = process.env.HOST || '127.0.0.1';
const trustProxy = process.env.TRUST_PROXY === '1';
const cookieSecure = process.env.COOKIE_INSECURE !== '1';

const db = openDb(dbPath);
const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, createApp({ db, cookieSecure, trustProxy }));

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to use another.` : err.message);
  process.exit(1);
});
server.listen(port, host, () => {
  const notes = [trustProxy && 'trusting X-Real-IP', !cookieSecure && 'cookie without Secure'].filter(Boolean);
  console.log(`MathTime API on ${host}:${port}, data in ${dbPath}${notes.length ? ` (${notes.join(', ')})` : ''}`);
});

// docker stop sends SIGTERM: finish what's in flight, then close the database cleanly.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
