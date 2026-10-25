// Realistic-ish heavy state: 10k players, half of them traders with a 200-entry trade log (cap is 500) and positions in 30 markets (about 10 days of 3 daily markets).
const APP = '/home/user/upcoming/dhk-predicts-features/app', N = +process.argv[2] || 10000, KEY = 'h' + N;
const { createStore } = require(APP + '/lib/pgstore.js'), Core = require(APP + '/core.js');
(async () => {
  const st = require(APP + '/bench/seed.js')(N);
  for (let i = 0; i < N; i += 2) { const uid = 'u' + i.toString(36).padStart(6, '0'); st.log = st.log || {}; st.log[uid] = Array.from({ length: 200 }, (_, j) => ({ at: Date.now() - j * 1000, id: 'q1-2026-10-27-122_' + (j % 30), kind: 'buy', side: j % 2 ? 'y' : 'n', pts: 10 + j % 50, sh: 12.34 }));
    st.pos[uid] = st.pos[uid] || {}; for (let m = 0; m < 30; m++) st.pos[uid]['q1-2026-10-' + m + '-122_50'] = { y: 10.5, n: 0, spent: 12, sy: 12, sn: 0, net: 12, counted: 1, paid: 20 }; }
  const store = createStore({ url: 'postgres://t:t@localhost:54410/postgres', key: KEY, seed: () => ({}) });
  await store.transact(d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, st); }); await store.transact(d => { d.x = 1; }); await store.end(); console.log('seeded', KEY, 'json MB', (JSON.stringify(st).length / 1048576).toFixed(1)); process.exit(0);
})();
