// Vercel Routing Middleware: blocks sign-ups and play from countries not open in the beta (A45).
// Runs before every request, static files included. BLOCKED_COUNTRIES (comma-separated ISO codes)
// overrides the default without a code change.
import { geolocation, next } from '@vercel/functions';

const BLOCKED = (process.env.BLOCKED_COUNTRIES ?? 'BD').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

export const config = { matcher: '/:path*' };

export default function middleware(request) {
  const country = (geolocation(request).country || '').toUpperCase();
  if (country && BLOCKED.includes(country) && !new URL(request.url).pathname.startsWith('/api/backup')) {
    return new Response('This beta is not available in your country yet.\nএই বেটা এখনো আপনার দেশে চালু হয়নি।\n',
      { status: 451, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
  return next();
}
