// Single-server store: state in memory, saved to a JSON file after each write.
// Same read()/transact(fn) shape as tech/deploy-kit/pgstore.js.
'use strict';
const fs = require('fs');

function createFileStore({ file, seed }) {
  let state;
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { state = seed(); }
  state.auth = state.auth || {}; state.sessions = state.sessions || {};
  let timer = null;
  function save() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fs.writeFileSync(file + '.tmp', JSON.stringify(state));
      fs.renameSync(file + '.tmp', file);
    }, 300);
  }
  save();
  return {
    read: async () => state,
    // Runs fn on a copy and keeps it only if fn doesn't throw, like a database transaction.
    transact: async fn => { const draft = structuredClone(state); const out = await fn(draft); state = draft; save(); return out; }
  };
}
module.exports = { createFileStore };
