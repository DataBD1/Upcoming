// Thundering herd: K server copies cold-start (or hit their TTL reload) at the same moment.   node 10-herd.js <key> <K>
const { fork } = require('child_process'); const key = process.argv[2], K = +process.argv[3];
let ready = 0; const res = []; const kids = [];
for (let i = 0; i < K; i++) { const c = fork(__dirname + '/10-herd-child.js', [key], { silent: false }); kids.push(c);
  c.on('message', m => { if (m === 'ready') { if (++ready === K) { t0 = Date.now(); kids.forEach(k => k.send('go')); } } else { res.push(m); if (res.length === K) { const ms = res.map(r => r.ms).sort((a, b) => a - b); console.log(`${key} x${K} simultaneous cold starts: wall ${Date.now() - t0} ms | per-copy load min ${ms[0]} median ${ms[K >> 1]} max ${ms[K - 1]} ms | rss each ~${res[0].rss} MB, total ~${res.reduce((a, r) => a + r.rss, 0)} MB`); process.exit(0); } } }); }
let t0;
