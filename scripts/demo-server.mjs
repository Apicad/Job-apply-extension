import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Map([
  ['/', ['demo/index.html', 'text/html']],
  ['/sample-resume.txt', ['demo/sample-resume.txt', 'text/plain']],
  ...['greenhouse-live', 'lever', 'ashby'].map(name => [`/${name}.html`, [`tests/fixtures/${name}.html`, 'text/html']]),
]);

export function createDemoServer() {
  return http.createServer(async (request, response) => {
    // This server is a read-only practice surface, never an application endpoint.
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end('Practice only. Submissions are disabled.'); return; }
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = files.get(pathname);
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const content = await readFile(path.join(root, file[0]));
      response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { response.writeHead(500); response.end('Demo files are missing. Extract the complete bundle first.'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const raw = process.argv[2] ?? '5179';
  if (!/^\d+$/.test(raw) || Number(raw) > 65535) throw Error('Usage: node scripts/demo-server.mjs [port]');
  const server = createDemoServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port is busy. Run: node scripts/demo-server.mjs 0' : error.message); process.exitCode = 1; });
  server.listen(Number(raw), '127.0.0.1', () => console.log(`Open http://127.0.0.1:${server.address().port}/ in Chrome. Practice only; no submissions. Press Ctrl+C to stop.`));
}
