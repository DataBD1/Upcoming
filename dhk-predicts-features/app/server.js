// Dhaka Predicts (rival A) server. Zero dependencies: needs only Node 18+.
//   node server.js            -> http://localhost:8080
//   PORT=3000 ADMIN_PHONES=01711000000 node server.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const Core = require('./core.js');
const { serveApi } = require('./lib/handler.js');
const { createFileStore } = require('./lib/filestore.js');

const PORT = +process.env.PORT || 8080;
const store = createFileStore({ file: process.env.DATA_FILE || path.join(__dirname, 'data.json'), seed: () => Core.seed(Date.now()) });
const PUB = path.join(__dirname, 'public');

// ---- static files, compressed once at boot ------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const files = {};
function load(urlPath, file) {
  const raw = fs.readFileSync(file), type = TYPES[path.extname(file)] || 'application/octet-stream';
  files[urlPath] = { raw, type, br: zlib.brotliCompressSync(raw), gz: zlib.gzipSync(raw, { level: 9 }),
    etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"' };
}
for (const f of fs.readdirSync(PUB)) load('/' + f, path.join(PUB, f));
load('/core.js', path.join(__dirname, 'core.js'));
files['/'] = files['/index.html'];

function sendFile(req, res, f) {
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304); return res.end(); }
  const ae = req.headers['accept-encoding'] || '';
  const enc = /\bbr\b/.test(ae) ? 'br' : /gzip/.test(ae) ? 'gzip' : null;
  const h = { 'Content-Type': f.type, ETag: f.etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff' };
  if (enc) h['Content-Encoding'] = enc;
  res.writeHead(200, h); res.end(enc === 'br' ? f.br : enc === 'gzip' ? f.gz : f.raw);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return serveApi(store, req, res);
  const f = files[url.pathname];
  if (f && req.method === 'GET') return sendFile(req, res, f);
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
}).listen(PORT, () => console.log('Dhaka Predicts on http://localhost:' + PORT + (process.env.ADMIN_PHONES ? '  admins: ' + process.env.ADMIN_PHONES : '')));
