// Tiny static file server for development and the browser tests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 5480;
const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  // Only answer to our own address, so DNS rebinding can't reach the files.
  if (!hosts.includes(String(req.headers.host).toLowerCase())) {
    res.writeHead(403).end();
    return;
  }
  let path, file;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    file = normalize(join(root, path === '/' ? 'index.html' : path));
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  // No path outside the project, and nothing dotted (.git, .gitignore, ..),
  // including Windows short names for them (GIT~1).
  if (!file.startsWith(root) || path.split(/[\\/]/).some((part) => part.startsWith('.') || part.includes('~'))) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to use another.` : err.message,
  );
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => console.log(`MathTime on http://127.0.0.1:${port}`));
