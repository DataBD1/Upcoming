// The JSON API, independent of where state lives. `store` is anything with
// read() and transact(fn): lib/filestore.js locally, tech/deploy-kit/pgstore.js on Vercel.
'use strict';
const crypto = require('crypto');
const Core = require('../core.js');
const Sms = require('./sms.js');
require('../social.js').install(Core); // Rival B port: groups, leagues, streaks

// Version of the privacy notice a player agreed to (A31). Bump when the lawyer's edits land.
const PRIVACY_VERSION = 'draft-1';
// Fail closed (main build's lib/secrets.ts pattern, A27): in production a missing or
// unparseable ADMIN_PHONES is a hard error at startup, not a silent "nobody is admin".
const isProd = () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
function ADMINS() {
  const raw = (process.env.ADMIN_PHONES || '').split(',').map(x => x.trim()).filter(Boolean);
  const list = raw.map(p => normPhone(p)).filter(Boolean);
  if (isProd() && (!list.length || list.length !== raw.length)) throw new Error('ADMIN_PHONES must list valid phone numbers (E.164, e.g. +12025550123) in production.');
  if (isProd() && list.length < 2 && !ADMINS.warned) { ADMINS.warned = true; console.warn('ADMIN_PHONES has only ' + list.length + ' number: set 2 or more before launch, or corrections cannot be approved.'); }
  return list;
}

// A43: phones are stored in E.164 (+8801712345678, +12025550123). Bangladeshi local
// input (01XXXXXXXXX, Bangla digits too) still works and becomes +880. Which countries
// may sign up is app-wide data: state.site.signupCountries (calling codes; empty = all).
function normPhone(p, countries) {
  p = String(p || '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).trim();
  const plus = p.startsWith('+') || p.startsWith('00');
  let d = p.replace(/\D/g, '');
  if (p.startsWith('00')) d = d.slice(2);
  if (!plus) {
    if (/^01[3-9]\d{8}$/.test(d)) d = '880' + d.slice(1);       // BD local
    else if (!/^8801[3-9]\d{8}$/.test(d)) return null;           // without +, only BD numbers
  }
  if (d.startsWith('880') && !/^8801[3-9]\d{8}$/.test(d)) return null;
  if (d.startsWith('1') && d.length !== 11) return null;           // NANP: +1 and 10 digits
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  if (countries && countries.length && !countries.some(c => d.startsWith(String(c)))) return null;
  return '+' + d;
}

const tokHash = t => crypto.createHash('sha256').update(t).digest('hex');
function code(c) { const e = new Error(c); e.code = c; return e; }

// Login attempts live in the state so the limit holds across serverless instances.
// Keyed by a hash of the number, so no plain phone number is kept for failed or unknown logins.
function limited(state, phone, now) {
  state.attempts = state.attempts || {};
  for (const p of Object.keys(state.attempts)) if (now - state.attempts[p][1] > 15 * 60e3) delete state.attempts[p];
  const k = tokHash('try:' + phone).slice(0, 24), a = state.attempts[k];
  if (!a || now - a[1] > 15 * 60e3) { state.attempts[k] = [1, now]; return false; }
  return ++a[0] > 6;
}
function clearAttempts(state, phone) { if (state.attempts) delete state.attempts[tokHash('try:' + phone).slice(0, 24)]; }
// Sessions are [uid, signed-in time] and expire 30 days after sign-in. (Bare uid strings from older states still work.)
const SESSION_MS = 30 * 864e5;
function newSession(state, uid, now) {
  const t = crypto.randomBytes(24).toString('base64url');
  for (const k of Object.keys(state.sessions)) { const v = state.sessions[k]; if (Array.isArray(v) && now - v[1] > SESSION_MS) delete state.sessions[k]; }
  state.sessions[tokHash(t)] = [uid, now];
  return t;
}
function sessUid(v, now) { return !v ? null : Array.isArray(v) ? (now - v[1] > SESSION_MS ? null : v[0]) : v; }
const DUMMY_SALT = crypto.randomBytes(12).toString('hex'), DUMMY_HASH = crypto.scryptSync('x', DUMMY_SALT, 32).toString('hex');
// A45: is sign-up closed for this IP country or phone? Numbers in ADMIN_PHONES (the team) are exempt.
function signupBlocked(site, country, phone) {
  if (!site || (phone && ADMINS().includes(phone))) return false;
  if (country && (site.blockedIpCountries || []).includes(String(country).toUpperCase())) return true;
  return !!phone && (site.blockedPhoneCodes || []).some(c => phone.startsWith('+' + c));
}
function auth(state, body, now, country) {
  state.auth = state.auth || {}; state.sessions = state.sessions || {};
  const phone = normPhone(body.phone, body.mode === 'signup' && state.site ? state.site.signupCountries : null), pin = String(body.pin || '');
  if (!phone) throw code('bad_phone');
  if (pin.length < 6 || pin.length > 64) throw code('bad_pin');
  if (limited(state, phone, now)) throw code('slow_down');
  const rec = state.auth[phone];
  if (body.mode === 'signup') {
    if (rec) throw code('phone_taken');
    if (signupBlocked(state.site, country, phone)) throw code('not_available');
    // A21 + A31: both boxes must be ticked by the player; the client never pre-ticks them.
    if (body.adult !== true) throw code('need_adult');
    if (body.consent !== true) throw code('need_consent');
    const uid = 'u' + crypto.randomBytes(6).toString('hex'), salt = crypto.randomBytes(12).toString('hex');
    state.auth[phone] = { uid, salt, hash: crypto.scryptSync(pin, salt, 32).toString('hex') };
    const extra = { adultAt: now, consentAt: now, consentVer: PRIVACY_VERSION };
    if (ADMINS().includes(phone)) extra.admin = true;
    Core.addUser(state, uid, body.name, now, extra);
    clearAttempts(state, phone);
    // A27 duplicate-account guard: the browser sends a random device id; 3+ accounts on one device are flagged to admins.
    const dev = String(body.device || '').slice(0, 64);
    if (dev) { const k = tokHash('dev:' + dev).slice(0, 24); state.devices = state.devices || {}; (state.devices[k] = state.devices[k] || []).push(uid); }
    Core.track(state, 'signup', uid, null, now);
    if (extra.admin) Core.audit(state, uid, 'login', { mode: 'signup' }, now);
    return { token: newSession(state, uid, now) };
  }
  // Same error and the same scrypt work whether or not the number has an account, so login doesn't reveal who plays.
  const h = crypto.scryptSync(pin, rec ? rec.salt : DUMMY_SALT, 32).toString('hex');
  if (!rec || !crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(rec.hash, 'hex'))) throw code('wrong_login');
  clearAttempts(state, phone);
  if (state.users[rec.uid] && state.users[rec.uid].admin) Core.audit(state, rec.uid, 'login', { mode: 'login' }, now);
  return { token: newSession(state, rec.uid, now) };
}


// ---- Admin password reset -------------------------------------------------------
// An admin issues a one-time code (valid 1 hour) for a player who forgot their password and
// passes it on by hand. The player enters it with a new password on the login screen. Only a
// hash of the code is stored, the action is audited, and all of the player's sessions end.
const RESET_MS = 36e5;
function issueReset(s, adminUid, phoneIn, now) {
  if (!adminUid || !s.users[adminUid] || !s.users[adminUid].admin) throw code('forbidden');
  const phone = normPhone(phoneIn), rec = phone && s.auth && s.auth[phone];
  if (!rec) throw code('no_account');
  s.resets = s.resets || {};
  for (const k of Object.keys(s.resets)) if (s.resets[k].exp < now) delete s.resets[k];
  for (const k of Object.keys(s.resets)) if (s.resets[k].uid === rec.uid) delete s.resets[k]; // one live code per player
  const token = crypto.randomBytes(9).toString('base64url');
  s.resets[tokHash('reset:' + token)] = { uid: rec.uid, exp: now + RESET_MS };
  Core.audit(s, adminUid, 'resetpw', { user: rec.uid }, now);
  return { code: token, minutes: RESET_MS / 6e4 };
}
function useReset(s, body, now) {
  s.auth = s.auth || {}; s.sessions = s.sessions || {}; s.resets = s.resets || {};
  const phone = normPhone(body.phone), pin = String(body.pin || '');
  if (!phone) throw code('bad_phone');
  if (pin.length < 6 || pin.length > 64) throw code('bad_pin');
  if (limited(s, phone, now)) throw code('slow_down');
  const rec = s.auth[phone], k = tokHash('reset:' + String(body.code || '').trim()), r = s.resets[k];
  if (!rec || !r || r.exp < now || r.uid !== rec.uid) throw code('bad_reset');
  delete s.resets[k];
  rec.salt = crypto.randomBytes(12).toString('hex');
  rec.hash = crypto.scryptSync(pin, rec.salt, 32).toString('hex');
  for (const t of Object.keys(s.sessions)) { const v = s.sessions[t]; if ((Array.isArray(v) ? v[0] : v) === rec.uid) delete s.sessions[t]; }
  clearAttempts(s, phone);
  return { token: newSession(s, rec.uid, now) };
}

// ---- Phone OTP scaffold (B9) ----------------------------------------------------
// Off unless OTP_ENABLED=1 and an SMS provider is configured (lib/sms.js). A code is 6 digits,
// stored hashed, valid 5 minutes, 5 tries. Limits: 3 sends per number per hour, 10 per IP per hour,
// and a daily cap on total sends (OTP_DAILY_CAP, default 200) so a flood cannot run up the SMS bill.
// Verifying signs in an existing account; it does not create one (sign-up still uses a password).
const OTP_MS = 5 * 60e3, HOUR = 36e5;
const otpOn = () => process.env.OTP_ENABLED === '1' && Sms.available();
function otpPrep(s, phone, ip, now) {
  if (!otpOn()) throw code('otp_unavailable');
  s.otp = s.otp || { codes: {}, sends: {}, day: '', n: 0 };
  const o = s.otp;
  for (const k of Object.keys(o.codes)) if (o.codes[k].exp < now) delete o.codes[k];
  for (const k of Object.keys(o.sends)) { o.sends[k] = o.sends[k].filter(t => now - t < HOUR); if (!o.sends[k].length) delete o.sends[k]; }
  return o;
}
function otpSendCheck(s, phone, ip, now) {
  const o = otpPrep(s, phone, ip, now);
  if (!s.auth || !s.auth[phone]) return { skip: true }; // same reply for unknown numbers, nothing is sent
  const pk = tokHash('otp:' + phone).slice(0, 24), ik = tokHash('ip:' + (ip || '?')).slice(0, 24);
  const day = new Date(now).toISOString().slice(0, 10);
  if (o.day !== day) { o.day = day; o.n = 0; }
  if ((o.sends[pk] || []).length >= 3 || (o.sends[ik] || []).length >= 10 || o.n >= (Number(process.env.OTP_DAILY_CAP) || 200)) throw code('slow_down');
  const c = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  (o.sends[pk] = o.sends[pk] || []).push(now); (o.sends[ik] = o.sends[ik] || []).push(now); o.n++;
  o.codes[pk] = { h: tokHash('otpcode:' + phone + ':' + c), exp: now + OTP_MS, tries: 0 };
  return { code: c };
}
function otpVerify(s, body, now) {
  s.auth = s.auth || {}; s.sessions = s.sessions || {};
  const phone = normPhone(body.phone);
  if (!phone) throw code('bad_phone');
  const o = otpPrep(s, phone, null, now), pk = tokHash('otp:' + phone).slice(0, 24), r = o.codes[pk], rec = s.auth[phone];
  if (!r || !rec) throw code('bad_otp');
  if (++r.tries > 5) { delete o.codes[pk]; throw code('bad_otp'); }
  const h = tokHash('otpcode:' + phone + ':' + String(body.code || '').trim());
  if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(r.h, 'hex'))) throw code('bad_otp');
  delete o.codes[pk];
  return { token: newSession(s, rec.uid, now) };
}

// Returns [status, body]. A failed login attempt still counts toward the limit,
// so auth errors are returned from inside the transaction instead of thrown.
async function handleApi(store, { method, name, body, token, ua, country, ip }) {
  const now = Date.now();
  try {
    if (!/^[a-z]{2,20}$/.test(name)) throw code('unknown'); // action names are plain lowercase words
    if (name === 'auth') {
      if (method !== 'POST') throw code('use_post');
      const r = await store.transact(s => { Core.migrate(s); try { return [200, auth(s, body, now, country)]; } catch (e) { if (!e.code) throw e; return [400, { error: e.code }]; } });
      return r;
    }
    if (name === 'resetpw' || name === 'usereset') {
      if (method !== 'POST') throw code('use_post');
      return await store.transact(s => {
        Core.migrate(s);
        try {
          if (name === 'usereset') return [200, useReset(s, body, now)];
          const uid = (token && s.sessions && sessUid(s.sessions[tokHash(token)], now)) || null;
          return [200, issueReset(s, uid, body.phone, now)];
        } catch (e) { if (!e.code) throw e; return [e.code === 'forbidden' ? 403 : 400, { error: e.code }]; }
      });
    }
    if (name === 'otpsend') {
      if (method !== 'POST') throw code('use_post');
      const phone = normPhone(body.phone); if (!phone) throw code('bad_phone');
      let sendCode = null;
      const r = await store.transact(s => { Core.migrate(s); try { const x = otpSendCheck(s, phone, ip, now); sendCode = x.code || null; return [200, { ok: true }]; } catch (e) { if (!e.code) throw e; return [400, { error: e.code }]; } });
      if (sendCode) { try { await Sms.send(phone, 'Your code: ' + sendCode + ' (valid 5 minutes)'); } catch (e) { return [400, { error: e.code || 'otp_send_failed' }]; } }
      return r;
    }
    if (name === 'otpverify') {
      if (method !== 'POST') throw code('use_post');
      return await store.transact(s => { Core.migrate(s); try { return [200, otpVerify(s, body, now)]; } catch (e) { if (!e.code) throw e; return [400, { error: e.code }]; } });
    }
    if (name === 'logout') {
      if (token) await store.transact(s => { delete s.sessions[tokHash(token)]; });
      return [200, { ok: true }];
    }
    const uidIn = s => (token && s.sessions && sessUid(s.sessions[tokHash(token)], now)) || null;
    if (name === 'account') {
      const s = Core.migrate(await store.read()), uid = uidIn(s);
      const out = Core.act(s, uid, 'account', body, now);
      out.profile.phone = Object.keys(s.auth || {}).find(p => s.auth[p].uid === uid) || null;
      return [200, out];
    }
    // Changing phone or deleting the account needs the password again.
    if (name === 'chphone' || name === 'delete') {
      if (method !== 'POST') throw code('use_post');
      return await store.transact(s => {
        Core.migrate(s);
        try {
          const uid = uidIn(s); if (!uid) throw code('login');
          const phone = Object.keys(s.auth).find(p => s.auth[p].uid === uid), rec = s.auth[phone];
          if (limited(s, phone, now)) throw code('slow_down');
          const h = crypto.scryptSync(String(body.pin || ''), rec.salt, 32).toString('hex');
          if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(rec.hash, 'hex'))) throw code('wrong_pin');
          delete s.attempts[phone];
          if (name === 'chphone') {
            const np = normPhone(body.phone, s.site && s.site.signupCountries);
            if (!np) throw code('bad_phone');
            if (s.auth[np]) throw code('phone_taken');
            s.auth[np] = rec; delete s.auth[phone];
            if (s.users[uid].admin) { const demoted = !ADMINS().includes(np); Core.audit(s, uid, 'chphone', { user: uid, demoted }, now); if (demoted) delete s.users[uid].admin; }
            return [200, { ok: true }];
          }
          if (s.users[uid].admin) Core.audit(s, uid, 'delete', { user: uid }, now);
          delete s.auth[phone];
          if (s.attempts) delete s.attempts[phone];
          for (const k of Object.keys(s.sessions)) if (sessUid(s.sessions[k], now) === uid || (Array.isArray(s.sessions[k]) && s.sessions[k][0] === uid)) delete s.sessions[k];
          Core.deleteUser(s, uid, now);
          return [200, { ok: true }];
        } catch (e) { if (!e.code) throw e; return [e.code === 'login' ? 401 : 400, { error: e.code }]; }
      });
    }
    if (Core.isWrite(name)) {
      if (method !== 'POST') throw code('use_post');
      if (name === 'feedback') body.ua = ua;
      return [200, await store.transact(s => Core.act(s, uidIn(s), name, body, now))];
    }
    const s = await store.read({ events: name === 'metrics' });
    if (name === 'users' && body.q) {
      // Phone search: resolve the number to an account here, since core.js never sees phones.
      const ph = normPhone(body.q);
      if (ph) body = { uid: s.auth && s.auth[ph] ? s.auth[ph].uid : '__none__' };
    }
    const out = Core.act(s, uidIn(s), name, body, now);
    if (name === 'home') { out.signupOpen = !signupBlocked(out.site, country, null); out.otp = otpOn(); }
    if (name === 'inbox') out.adminCount = ADMINS().length;
    return [200, out];
  } catch (e) {
    if (!e.code) console.error(e);
    return [e.code === 'login' ? 401 : e.code ? 400 : 500, { error: e.code || 'server' }];
  }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body); // Vercel pre-parses JSON
  return new Promise((ok, bad) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 4096) { bad(code('too_large')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { bad(code('bad_json')); } });
  });
}

// Node http adapter shared by server.js and api/index.js.
async function serveApi(store, req, res) {
  const url = new URL(req.url, 'http://x');
  let body;
  try { body = req.method === 'POST' ? await readBody(req) : Object.fromEntries(url.searchParams); }
  catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: e.code || 'bad_json' })); }
  const [status, out] = await handleApi(store, {
    method: req.method, name: url.pathname.replace(/^\/api\//, ''), body,
    token: (req.headers.authorization || '').replace(/^Bearer /, ''), ua: req.headers['user-agent'],
    country: req.headers['x-vercel-ip-country'] || null, // set by Vercel; absent locally
    ip: String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim()
  });
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(out));
}

module.exports = { handleApi, serveApi, normPhone, ADMINS };
