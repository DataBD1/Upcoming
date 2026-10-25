// Builds a state with N players for load tests: users, cheap password records, sessions, positions, events.
'use strict';
const crypto = require('crypto');
const Core = require('../core.js');
module.exports = function seedState(N) {
  const st = Core.seed(Date.now()), now = Date.now(), open = st.markets.filter(m => m.status === 'open').map(m => m.id);
  const salt = 'aa'.repeat(12), hash = 'bb'.repeat(32);
  st.auth = {}; st.sessions = {};
  for (let i = 0; i < N; i++) {
    const uid = 'u' + i.toString(36).padStart(6, '0'), phone = '+4477' + String(i).padStart(8, '0');
    Core.addUser(st, uid, 'P' + i, now - (i % 14) * 864e5, { adultAt: now, consentAt: now, consentVer: 'draft-1' });
    st.auth[phone] = { uid, salt, hash };
    if (i % 5 < 3) st.sessions[crypto.createHash('sha256').update('tok' + i).digest('hex')] = [uid, now - (i % 20) * 864e5];
    Core.track(st, 'signup', uid, null, now - (i % 14) * 864e5);
    if (i % 2 === 0) for (let j = 0; j < 2; j++) { try { Core.act(st, uid, 'buy', { id: open[(i + j) % open.length], side: i % 2 ? 'y' : 'n', amount: 20 }, now); } catch (e) { } }
  }
  return st;
};
