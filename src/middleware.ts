import { defineMiddleware } from 'astro:middleware';

// Cabeceras de seguridad para todas las respuestas del servidor.
// Si agregas Google Analytics, Meta Pixel o TikTok Pixel, añade sus dominios a script-src, img-src y connect-src
// y actualiza la sección de cookies de /privacidad.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://analytics.tiktok.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.facebook.com https://*.facebook.net https://*.tiktok.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
  "frame-src https://www.youtube-nocookie.com https://www.facebook.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export const onRequest = defineMiddleware(async (_ctx, next) => {
  const res = await next();
  const h = res.headers;
  h.set('Content-Security-Policy', CSP);
  h.set('X-Frame-Options', 'DENY');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('Strict-Transport-Security', 'max-age=31536000');
  return res;
});
