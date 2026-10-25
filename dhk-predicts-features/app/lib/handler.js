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
  const all = raw.map(p => normPhone(p)).filter(Boolean);
  if (isProd() && (!all.length || all.length !== raw.length)) throw new Error('ADMIN_PHONES must list valid phone numbers (E.164, e.g. +12025550123) in production.');
  if (isProd() && !process.env.ADMIN_SETUP_CODE) throw new Error('ADMIN_SETUP_CODE must be set in production when ADMIN_PHONES is set: it is the secret an admin presents at sign-up or login to get admin rights.');
  const list = [...new Set(all)]; // aliases of one number (01711.., +8801711..) count once
  const now = Date.now();
  if (isProd() && list.length < 2 && !(ADMINS.warnedAt > now - 36e5)) { ADMINS.warnedAt = now; console.warn('ADMIN_PHONES lists only ' + list.length + ' distinct admin number(s): set at least 2 before launch, or corrections cannot be approved. (Logged at most once an hour per instance.)'); }
  return list;
}
// Admin rights need the setup code (env ADMIN_SETUP_CODE). Unset outside production = old behaviour (number alone is enough), so local runs and tests work.
function setupState(body) {
  const want = process.env.ADMIN_SETUP_CODE, got = String((body && body.setup) || '');
  if (!want) return { given: false, ok: !isProd() };
  if (!got) return { given: false, ok: false };
  const h = x => crypto.createHash('sha256').update(x).digest();
  return { given: true, ok: crypto.timingSafeEqual(h(want), h(got)) };
}
// Admin = flag on the account AND the account's current number still in ADMIN_PHONES, checked on every request.
function syncAdmin(s, uid) {
  const u = uid && s.users && s.users[uid];
  if (u && u.admin) {
    const phone = Object.keys(s.auth || {}).find(p => s.auth[p].uid === uid);
    if (!phone || !ADMINS().includes(phone)) delete u.admin;
  }
  return uid;
}
function adminCount(s) {
  const ids = new Set();
  for (const p of ADMINS()) { const r = s.auth && s.auth[p], u = r && s.users[r.uid]; if (u && u.admin && !u.deleted && !u.bot) ids.add(r.uid); }
  return ids.size;
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

// Attempt limiter. Failures live in the state (state.attempts: key -> [count, first-failure time])
// so the limit holds across serverless instances. Keys are hashes: no plain phone number or IP is kept.
// Only FAILURES count, and a success never touches another caller's counters. Numbers (15 min window):
//   login:  6 failures per (ip, phone); 30 failures per ip across all phones;
//           a per-phone ceiling of 60 failures from all IPs together. Past that ceiling nobody is locked
//           out: each (ip, phone) pair just gets 2 tries instead of 6, so the owner (right password, own
//           IP) can still sign in during an attack from elsewhere.
//   reset:  its own buckets, 5 failures per (ip, phone) and 10 per ip across phones. It never blocks login.
// The map is pruned of expired entries on every call and capped at ATT_MAX entries (oldest dropped first).
const ATT_WIN = 15 * 60e3, ATT_MAX = 2000;
const LOGIN_PAIR = 6, LOGIN_PAIR_HOT = 2, LOGIN_IP = 30, LOGIN_PHONE = 60, RESET_PAIR = 5, RESET_IP = 10;
const akey = (...p) => tokHash('try:' + p.join('|')).slice(0, 24);
function attGet(state, k, now) {
  state.attempts = state.attempts || {};
  const a = state.attempts[k];
  return a && now - a[1] <= ATT_WIN ? a[0] : 0;
}
function attPrune(state, now) {
  const at = state.attempts = state.attempts || {}, ks = Object.keys(at);
  for (const k of ks) if (now - at[k][1] > ATT_WIN) delete at[k];
  const left = Object.keys(at);
  if (left.length > ATT_MAX) left.sort((x, y) => at[x][1] - at[y][1]).slice(0, left.length - ATT_MAX).forEach(k => delete at[k]);
}
function attBump(state, ks, now) {
  attPrune(state, now);
  for (const k of ks) { const a = state.attempts[k]; if (a && now - a[1] <= ATT_WIN) a[0]++; else state.attempts[k] = [1, now]; }
  attPrune(state, now);
}
const ipOf = ip => String(ip || '?');
function loginLimited(state, phone, ip, now) {
  const cap = attGet(state, akey('p', phone), now) >= LOGIN_PHONE ? LOGIN_PAIR_HOT : LOGIN_PAIR;
  return attGet(state, akey('ip', ip = ipOf(ip), phone), now) >= cap || attGet(state, akey('i', ip), now) >= LOGIN_IP;
}
function loginFail(state, phone, ip, now) { attBump(state, [akey('ip', ipOf(ip), phone), akey('i', ipOf(ip)), akey('p', phone)], now); }
function clearAttempts(state, phone, ip) { if (state.attempts) delete state.attempts[akey('ip', ipOf(ip), phone)]; }
function resetLimited(state, phone, ip, now) { return attGet(state, akey('rp', ipOf(ip), phone), now) >= RESET_PAIR || attGet(state, akey('ri', ipOf(ip)), now) >= RESET_IP; }
function resetFail(state, phone, ip, now) { attBump(state, [akey('rp', ipOf(ip), phone), akey('ri', ipOf(ip))], now); }
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
function signupBlocked(site, country, phone, teamOk) {
  if (!site || (teamOk && phone && ADMINS().includes(phone))) return false; // exempt only with the setup code
  if (country && (site.blockedIpCountries || []).includes(String(country).toUpperCase())) return true;
  return !!phone && (site.blockedPhoneCodes || []).some(c => phone.startsWith('+' + c));
}
function auth(state, body, now, country, ip) {
  state.auth = state.auth || {}; state.sessions = state.sessions || {};
  const phone = normPhone(body.phone, body.mode === 'signup' && state.site ? state.site.signupCountries : null), pin = String(body.pin || '');
  if (!phone) throw code('bad_phone');
  if (pin.length < 6 || pin.length > 64) throw code('bad_pin');
  if (loginLimited(state, phone, ip, now)) throw code('slow_down');
  const rec = state.auth[phone];
  if (body.mode === 'signup') {
    if (rec) { loginFail(state, phone, ip, now); throw code('phone_taken'); }
    const su = setupState(body);
    if (su.given && !su.ok) { if (resetLimited(state, '#setup', ip, now)) throw code('slow_down'); resetFail(state, '#setup', ip, now); throw code('bad_setup'); }
    if (signupBlocked(state.site, country, phone, su.ok)) throw code('not_available');
    // A21 + A31: both boxes must be ticked by the player; the client never pre-ticks them.
    if (body.adult !== true) throw code('need_adult');
    if (body.consent !== true) throw code('need_consent');
    const uid = 'u' + crypto.randomBytes(6).toString('hex'), salt = crypto.randomBytes(12).toString('hex');
    state.auth[phone] = { uid, salt, hash: crypto.scryptSync(pin, salt, 32).toString('hex') };
    const extra = { adultAt: now, consentAt: now, consentVer: PRIVACY_VERSION };
    if (ADMINS().includes(phone) && su.ok) extra.admin = true;
    Core.addUser(state, uid, body.name, now, extra);
    // A27 duplicate-account guard: the browser sends a random device id; 3+ accounts on one device are flagged to admins.
    const dev = String(body.device || '').slice(0, 64);
    if (dev) { const k = tokHash('dev:' + dev).slice(0, 24); state.devices = state.devices || {}; (state.devices[k] = state.devices[k] || []).push(uid); }
    Core.track(state, 'signup', uid, null, now);
    if (extra.admin) Core.audit(state, uid, 'login', { mode: 'signup' }, now);
    return { token: newSession(state, uid, now) };
  }
  // Same error and the same scrypt work whether or not the number has an account, so login doesn't reveal who plays.
  const h = crypto.scryptSync(pin, rec ? rec.salt : DUMMY_SALT, 32).toString('hex');
  if (!rec || !crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(rec.hash, 'hex'))) { loginFail(state, phone, ip, now); throw code('wrong_login'); }
  clearAttempts(state, phone, ip);
  revokeResets(state, r => r.uid === rec.uid); // the player got in with their password: any admin-issued code dies
  // Login-time grant: an existing player whose number is in ADMIN_PHONES becomes admin by presenting the setup code.
  const su = setupState(body);
  if (su.given && !su.ok) { if (resetLimited(state, '#setup', ip, now)) throw code('slow_down'); resetFail(state, '#setup', ip, now); throw code('bad_setup'); }
  if (su.given && su.ok && ADMINS().includes(phone) && state.users[rec.uid]) state.users[rec.uid].admin = true;
  if (state.users[rec.uid] && state.users[rec.uid].admin) Core.audit(state, rec.uid, 'login', { mode: 'login' }, now);
  return { token: newSession(state, rec.uid, now) };
}


// ---- Admin password reset -------------------------------------------------------
// An admin issues a one-time code (valid 1 hour) for a player who forgot their password and
// passes it on by hand. The player enters it with a new password on the login screen. Only a
// hash of the code is stored, the action is audited, and all of the player's sessions end.
const RESET_MS = 36e5;
// An admin account can not be reset in the app (whoever holds the server config recovers it). Players can.
const isAdminAcct = (s, phone, uid) => !!(s.users[uid] && s.users[uid].admin) || ADMINS().includes(phone);
function revokeResets(s, pred) { for (const k of Object.keys(s.resets || {})) if (pred(s.resets[k])) delete s.resets[k]; }
function issueReset(s, adminUid, phoneIn, now) {
  if (!adminUid || !s.users[adminUid] || !s.users[adminUid].admin) throw code('forbidden');
  const phone = normPhone(phoneIn), rec = phone && s.auth && s.auth[phone];
  if (!rec) throw code('no_account');
  if (isAdminAcct(s, phone, rec.uid)) throw code('admin_reset_denied');
  s.resets = s.resets || {};
  for (const k of Object.keys(s.resets)) if (s.resets[k].exp < now) delete s.resets[k];
  for (const k of Object.keys(s.resets)) if (s.resets[k].uid === rec.uid) delete s.resets[k]; // one live code per player
  const token = crypto.randomBytes(9).toString('base64url');
  s.resets[tokHash('reset:' + token)] = { uid: rec.uid, exp: now + RESET_MS, by: adminUid };
  Core.audit(s, adminUid, 'resetpw', { user: rec.uid }, now);
  return { code: token, minutes: RESET_MS / 6e4 };
}
function useReset(s, body, now, ip) {
  s.auth = s.auth || {}; s.sessions = s.sessions || {}; s.resets = s.resets || {};
  const phone = normPhone(body.phone), pin = String(body.pin || '');
  if (!phone) throw code('bad_phone');
  if (pin.length < 6 || pin.length > 64) throw code('bad_pin');
  if (resetLimited(s, phone, ip, now)) throw code('slow_down');
  const rec = s.auth[phone], k = tokHash('reset:' + String(body.code || '').trim()), r = s.resets[k];
  // The issuing admin must still be an admin now; a code from a demoted or deleted admin is void.
  if (!rec || !r || r.exp < now || r.uid !== rec.uid || !(r.by && s.users[r.by] && s.users[r.by].admin)) { resetFail(s, phone, ip, now); throw code('bad_reset'); }
  if (isAdminAcct(s, phone, rec.uid)) { delete s.resets[k]; throw code('admin_reset_denied'); }
  delete s.resets[k];
  rec.salt = crypto.randomBytes(12).toString('hex');
  rec.hash = crypto.scryptSync(pin, rec.salt, 32).toString('hex');
  for (const t of Object.keys(s.sessions)) { const v = s.sessions[t]; if ((Array.isArray(v) ? v[0] : v) === rec.uid) delete s.sessions[t]; }
  clearAttempts(s, phone, ip);
  Core.audit(s, rec.uid, 'resetpw_used', { user: rec.uid, by: r.by }, now); // no code, no secrets
  return { token: newSession(s, rec.uid, now) };
}

// ---- Phone OTP scaffold (B9) ----------------------------------------------------
// Off unless OTP_ENABLED=1 and an SMS provider is configured (lib/sms.js). In production it also needs
// OTP_DAILY_CAP (an explicit hard cap on sends per day) and OTP_SECRET (HMAC key for codes), else it stays off.
// A code is 6 digits, stored as an HMAC, valid 5 minutes, 5 tries (tries carry over when a new code is sent).
// Limits per hour: 3 sends and 10 verify attempts per number, 10 sends and 30 verify attempts per IP.
// Per day: OTP_DAILY_CAP in total and a budget per destination country (OTP_COUNTRY_CAPS, "44:40,1:60").
// Only destination countries in OTP_COUNTRIES (calling codes, default 44,1,971,880) get a code.
// Never for admin accounts (a SIM swap must not give admin access). Unknown, admin, rate-limited and
// provider-failure cases all get the same reply, sent immediately; the SMS goes out after the reply.
// Verifying signs in an existing account; it does not create one (sign-up still uses a password).
// State: top-level maps otpcodes and otpsends (key -> record / timestamps) plus otp {day, n}.
const OTP_MS = 5 * 60e3, HOUR = 36e5, DAY = 864e5, OTP_MAX_KEYS = 20000;
const OTP_CAPS = { 880: 150, 1: 60, 44: 40, 971: 20 }; // default sends per country per rolling 24h
const otpSecret = () => process.env.OTP_SECRET || (isProd() ? '' : 'dev-only-otp-secret');
const otpCap = () => Number(process.env.OTP_DAILY_CAP) > 0 ? Number(process.env.OTP_DAILY_CAP) : (isProd() ? 0 : 200);
const otpOn = () => process.env.OTP_ENABLED === '1' && Sms.available() && !!otpSecret() && otpCap() > 0;
const otpMac = t => crypto.createHmac('sha256', otpSecret()).update(t).digest('hex');
const otpCountries = () => (process.env.OTP_COUNTRIES || '44,1,971,880').split(',').map(x => x.trim().replace(/^\+/, '')).filter(x => /^\d{1,4}$/.test(x));
function otpCountry(phone) { // longest allowed calling code the number starts with, else null
  const d = phone.slice(1); let best = null;
  for (const c of otpCountries()) if (d.startsWith(c) && (!best || c.length > best.length)) best = c;
  return best;
}
function otpCountryCap(c) {
  for (const kv of (process.env.OTP_COUNTRY_CAPS || '').split(',')) { const [k, v] = kv.split(':'); if (k && k.trim().replace(/^\+/, '') === c && Number(v) >= 0) return Number(v); }
  return OTP_CAPS[c] != null ? OTP_CAPS[c] : 20;
}
function otpAdmin(s, rec) {
  try { if (ADMINS().includes(rec.phone)) return true; } catch { return true; } // misconfigured admin list: fail closed
  return !!(s.users && s.users[rec.uid] && s.users[rec.uid].admin);
}
function otpPrep(s, now) {
  if (!otpOn()) throw code('otp_unavailable');
  s.otpcodes = s.otpcodes || {}; s.otpsends = s.otpsends || {};
  if (!s.otp) s.otp = { day: '', n: 0 };
  for (const k of Object.keys(s.otpcodes)) if (s.otpcodes[k].exp < now) delete s.otpcodes[k];
  for (const k of Object.keys(s.otpsends)) { const w = k.startsWith('c:') ? DAY : HOUR; s.otpsends[k] = s.otpsends[k].filter(t => now - t < w); if (!s.otpsends[k].length) delete s.otpsends[k]; }
  return s;
}
// Counts one event under key k; true when the limit is already reached (the event is still counted).
function otpHit(s, k, max, now) {
  const a = s.otpsends[k] = s.otpsends[k] || [];
  const over = a.length >= max; a.push(now); if (a.length > max + 5) a.splice(0, a.length - max - 5);
  return over;
}
const otpKeys = (phone, ip) => ({ pk: otpMac('otpk:' + phone).slice(0, 24), ik: otpMac('otpi:' + (ip || '?')).slice(0, 24) });
function otpSendCheck(s, phone, ip, now) {
  otpPrep(s, now);
  const { pk, ik } = otpKeys(phone, ip), rec = s.auth && s.auth[phone], cc = otpCountry(phone);
  const c = String(crypto.randomInt(0, 1e6)).padStart(6, '0'), h = otpMac('otpcode:' + phone + ':' + c); // same work for every number
  if (Object.keys(s.otpsends).length > OTP_MAX_KEYS) return { skip: true };
  const day = new Date(now).toISOString().slice(0, 10);
  if (s.otp.day !== day) { s.otp.day = day; s.otp.n = 0; }
  const slow = otpHit(s, 's:' + pk, 3, now) | otpHit(s, 'si:' + ik, 10, now); // both counted for every number
  if (slow || !rec || !cc || otpAdmin(s, Object.assign({ phone }, rec))) return { skip: true };
  const ck = 'c:' + cc;
  if (s.otp.n >= otpCap() || (s.otpsends[ck] || []).length >= otpCountryCap(cc)) return { skip: true };
  (s.otpsends[ck] = s.otpsends[ck] || []).push(now); s.otp.n++;
  const old = s.otpcodes[pk]; // a new code replaces the old one but keeps its failed tries
  s.otpcodes[pk] = { h, exp: now + OTP_MS, tries: old ? old.tries : 0 };
  return { code: c, pk, h, cc };
}
function otpVerify(s, body, ip, now) {
  s.auth = s.auth || {}; s.sessions = s.sessions || {};
  const phone = normPhone(body.phone);
  if (!phone) throw code('bad_phone');
  otpPrep(s, now);
  const { pk, ik } = otpKeys(phone, ip), r = s.otpcodes[pk], rec = s.auth[phone];
  const slow = otpHit(s, 'v:' + pk, 10, now) | otpHit(s, 'vi:' + ik, 30, now);
  const h = otpMac('otpcode:' + phone + ':' + String(body.code || '').trim()), want = r ? r.h : otpMac('otpcode:none');
  const same = crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(want, 'hex'));
  if (slow) throw code('slow_down');
  if (!r || !rec || otpAdmin(s, Object.assign({ phone }, rec))) throw code('bad_otp');
  if (++r.tries > 5 || !same) throw code('bad_otp');
  delete s.otpcodes[pk];
  return { token: newSession(s, rec.uid, now) };
}
// The SMS goes out after the reply, so timing and body never reveal whether a number has an account.
const otpPending = new Set();
function otpAfter(p) {
  p = p.catch(e => console.error('otp send failed:', e && e.code || e && e.message)); // server-side only, never returned
  if (process.env.VERCEL) { try { require('@vercel/functions').waitUntil(p); } catch { /* falls back to a detached promise */ } }
  otpPending.add(p); p.then(() => otpPending.delete(p));
}
async function otpDeliver(store, phone, x) {
  try { await Sms.send(phone, 'DHK Predicts: your code is ' + x.code + '. It expires in 5 minutes. Do not share it with anyone.'); }
  catch (e) { // a failed send leaves no usable code and gives the daily budget back
    console.error('otp provider failed for ' + Sms.mask(phone) + ': ' + (e && (e.code || e.message)));
    await store.transact(s => { const c = s.otpcodes && s.otpcodes[x.pk]; if (c && c.h === x.h) delete s.otpcodes[x.pk]; if (s.otp && s.otp.n > 0) s.otp.n--; const a = s.otpsends && s.otpsends['c:' + x.cc]; if (a && a.length) a.pop(); });
  }
}

// Returns [status, body]. A failed login attempt still counts toward the limit,
// so auth errors are returned from inside the transaction instead of thrown.
async function handleApi(store, { method, name, body, token, ua, country, ip }) {
  const now = Date.now();
  try {
    if (!/^[a-z]{2,20}$/.test(name)) throw code('unknown'); // action names are plain lowercase words
    if (name === 'auth') {
      if (method !== 'POST') throw code('use_post');
      const r = await store.transact(s => { Core.migrate(s); try { return [200, auth(s, body, now, country, ip)]; } catch (e) { if (!e.code) throw e; return [400, { error: e.code }]; } });
      return r;
    }
    if (name === 'resetpw' || name === 'usereset') {
      if (method !== 'POST') throw code('use_post');
      return await store.transact(s => {
        Core.migrate(s);
        try {
          if (name === 'usereset') return [200, useReset(s, body, now, ip)];
          const uid = syncAdmin(s, (token && s.sessions && sessUid(s.sessions[tokHash(token)], now)) || null);
          return [200, issueReset(s, uid, body.phone, now)];
        } catch (e) { if (!e.code) throw e; return [e.code === 'forbidden' || e.code === 'admin_reset_denied' ? 403 : 400, { error: e.code }]; }
      });
    }
    if (name === 'otpsend') {
      if (method !== 'POST') throw code('use_post');
      const phone = normPhone(body.phone); if (!phone) throw code('bad_phone');
      let x = null;
      const r = await store.transact(s => { Core.migrate(s); try { x = otpSendCheck(s, phone, ip, now); return [200, { ok: true }]; } catch (e) { if (!e.code) throw e; return [400, { error: e.code }]; } });
      if (x && x.code) otpAfter(otpDeliver(store, phone, x));
      return r;
    }
    if (name === 'otpverify') {
      if (method !== 'POST') throw code('use_post');
      return await store.transact(s => { Core.migrate(s); try { return [200, otpVerify(s, body, ip, now)]; } catch (e) { if (!e.code) throw e; return [400, { error: e.code }]; } });
    }
    if (name === 'logout') {
      if (token) await store.transact(s => { delete s.sessions[tokHash(token)]; });
      return [200, { ok: true }];
    }
    const uidIn = s => syncAdmin(s, (token && s.sessions && sessUid(s.sessions[tokHash(token)], now)) || null);
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
          if (loginLimited(s, phone, ip, now)) throw code('slow_down');
          const h = crypto.scryptSync(String(body.pin || ''), rec.salt, 32).toString('hex');
          if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(rec.hash, 'hex'))) { loginFail(s, phone, ip, now); throw code('wrong_pin'); }
          clearAttempts(s, phone, ip);
          if (name === 'chphone') {
            const np = normPhone(body.phone, s.site && s.site.signupCountries);
            if (!np) throw code('bad_phone');
            if (s.auth[np]) throw code('phone_taken');
            s.auth[np] = rec; delete s.auth[phone];
            if (s.users[uid].admin) { Core.audit(s, uid, 'chphone', { user: uid, demoted: true }, now); delete s.users[uid].admin; revokeResets(s, r => r.by === uid); } // the old number must not stay claimable; the new one needs the setup code at login
            revokeResets(s, r => r.uid === uid);
            return [200, { ok: true }];
          }
          if (s.users[uid].admin) Core.audit(s, uid, 'delete', { user: uid }, now);
          delete s.auth[phone];
          revokeResets(s, r => r.uid === uid || r.by === uid);
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
    if (name === 'inbox') out.adminCount = adminCount(s);
    return [200, out];
  } catch (e) {
    // App errors carry a lowercase word code (bonus_taken, ...) and are the caller's fault: 4xx. A database
    // error (Postgres SQLSTATE such as 22P05, or ECONNRESET) is ours: 503 when trying again may work, else 500.
    // It is logged here without the connection string, and the client only sees { error: 'server' }.
    const app = typeof e.code === 'string' && /^[a-z][a-z0-9_]*$/.test(e.code) && !e.db;
    if (!app) console.error('api error in ' + String(name).slice(0, 20) + ':', e.db ? (e.code || '') + ' ' + String(e.message).split('\n')[0].replace(/(postgres(ql)?:\/\/)[^@\s]*@/gi, '$1***@').slice(0, 200) : e);
    return [app ? (e.code === 'login' ? 401 : 400) : (e.http || 500), { error: app ? e.code : 'server' }];
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

// Client IP for rate limits. On Vercel use the platform's own header; elsewhere the socket address.
// X-Forwarded-For is client-controlled, so it is ignored unless TRUST_PROXY=1 (one trusted proxy in front),
// and then only the right-most hop (the one that proxy appended) is used.
function clientIp(req) {
  const h = req.headers || {}, one = v => String(Array.isArray(v) ? v[0] : v || '').trim();
  let ip = '';
  if (process.env.VERCEL) ip = one(h['x-real-ip']) || one(h['x-vercel-forwarded-for']).split(',')[0].trim();
  else if (process.env.TRUST_PROXY === '1') ip = one(h['x-forwarded-for']).split(',').pop().trim();
  if (!ip) ip = (req.socket && req.socket.remoteAddress) || '';
  ip = ip.replace(/^::ffff:/, '');
  return require('net').isIP(ip) ? ip : '';
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
    ip: clientIp(req)
  });
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(out));
}

module.exports = { handleApi, serveApi, normPhone, ADMINS, clientIp, otpIdle: () => Promise.all([...otpPending]) };
