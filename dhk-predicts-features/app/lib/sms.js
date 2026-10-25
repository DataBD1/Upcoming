// SMS sending for the OTP scaffold (B9). Pick a provider with SMS_PROVIDER:
//   console  prints the message to the server log, phone number masked (local testing only; refused in production)
//   webhook  POSTs {to, text} as JSON to SMS_WEBHOOK_URL (a local gateway or a small relay to one);
//            SMS_WEBHOOK_TOKEN, if set, is sent as a Bearer token
// Anything else, or nothing, means OTP is not available.
'use strict';
const isProd = () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

// Logs and errors never carry a full phone number: +447700900111 -> +44*******111.
const mask = p => { p = String(p || ''); return p.length <= 6 ? '***' : p.slice(0, 3) + '*'.repeat(p.length - 6) + p.slice(-3); };

function available() {
  const p = process.env.SMS_PROVIDER;
  if (p === 'console') return !isProd();
  if (p === 'webhook') return /^https:\/\//.test(process.env.SMS_WEBHOOK_URL || '');
  return false;
}
async function send(to, text) {
  const p = process.env.SMS_PROVIDER;
  if (!available()) throw Object.assign(new Error('otp_unavailable'), { code: 'otp_unavailable' });
  if (p === 'console') { console.log('[sms:console] to ' + mask(to) + ': ' + text); return; }
  const r = await fetch(process.env.SMS_WEBHOOK_URL, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, process.env.SMS_WEBHOOK_TOKEN ? { Authorization: 'Bearer ' + process.env.SMS_WEBHOOK_TOKEN } : {}),
    body: JSON.stringify({ to, text }), signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw Object.assign(new Error('otp_send_failed'), { code: 'otp_send_failed' });
}
module.exports = { available, send, mask };
