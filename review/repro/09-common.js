// Shared helpers for the 09-otp repro scripts. Not an attack tool: local sandbox only.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), cp = require('child_process');
const APP = '/home/user/upcoming/dhk-predicts-features/app';
const SCR = '/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/09';
fs.mkdirSync(SCR, { recursive: true });
// Self-signed cert so SMS_WEBHOOK_URL can be a real https://localhost server. Re-execs the caller
// with NODE_EXTRA_CA_CERTS set (it is only read at process start). Returns true if the caller must stop.
function ensureCert() {
  const k = SCR + '/k.pem', c = SCR + '/c.pem';
  if (!fs.existsSync(c)) cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', k, '-out', c, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  if (process.env.NODE_EXTRA_CA_CERTS !== c) {
    const r = cp.spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_EXTRA_CA_CERTS: c } });
    process.exit(r.status);
  }
  return { key: fs.readFileSync(k), cert: fs.readFileSync(c) };
}
// Fake SMS gateway: records every {to,text}; `opts.delay` ms latency; `opts.status` HTTP status; `opts.handler` custom.
function webhook(port, opts = {}) {
  const tls = ensureCert(), got = [];
  const srv = https.createServer(tls, (req, res) => {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch {}
      got.push({ url: req.url, auth: req.headers.authorization, ...j });
      if (opts.handler) return opts.handler(req, res, j);
      setTimeout(() => { res.writeHead(opts.status || 200); res.end('ok'); }, opts.delay || 0);
    });
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ srv, got, close: () => srv.close() })));
}
function freshApp(tag) {
  const f = SCR + '/' + tag + '-' + process.pid + '.json';
  for (const k of Object.keys(require.cache)) if (k.startsWith(APP) && !k.includes('node_modules')) delete require.cache[k];
  const Core = require(APP + '/core.js'), { handleApi } = require(APP + '/lib/handler.js'), { createFileStore } = require(APP + '/lib/filestore.js');
  const store = createFileStore({ file: f, seed: () => Core.seed(Date.now()) });
  const call = (name, body, o = {}) => handleApi(store, { method: 'POST', name, body, token: o.token, ip: o.ip, country: null });
  return { store, call, handleApi, Core };
}
const signup = (call, phone, name = 'P') => call('auth', { mode: 'signup', phone, pin: 'secret12', name, adult: true, consent: true });
module.exports = { APP, SCR, webhook, freshApp, signup, ensureCert };
