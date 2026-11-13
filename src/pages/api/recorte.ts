import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { Buffer } from 'node:buffer';

export const prerender = false;

// Entrega una foto de producto SIN el fondo blanco (PNG con transparencia) para usarla sobre fondos de color.
// Solo acepta fotos del propio sitio (/fotos/...) o del almacenamiento de Supabase del proyecto.
const permitido = (u: string, origen: string): URL | null => {
  try {
    if (u.startsWith('/') && !u.startsWith('//')) return new URL(u, origen);
    const x = new URL(u);
    const sb = new URL((import.meta.env.PUBLIC_SUPABASE_URL as string) || 'http://x.invalid');
    if (x.protocol === 'https:' && x.host === sb.host) return x;
  } catch { /* url inválida */ }
  return null;
};

const cache = new Map<string, Buffer>();

async function recortar(buf: Buffer): Promise<Buffer> {
  const base = sharp(buf).rotate().resize({ width: 560, height: 560, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const claro = (i: number) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    return Math.min(r, g, b) >= 232 && Math.max(r, g, b) - Math.min(r, g, b) <= 22;
  };
  const fondo = new Uint8Array(n);
  const cola: number[] = [];
  const push = (i: number) => { if (!fondo[i] && claro(i)) { fondo[i] = 1; cola.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (cola.length) {
    const i = cola.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  // Fondo -> transparente; borde del producto (pegado al fondo y casi blanco) -> semitransparente para suavizar.
  for (let i = 0; i < n; i++) {
    if (fondo[i]) { data[i * 4 + 3] = 0; continue; }
    const x = i % w, y = (i / w) | 0;
    const vecino = (x > 0 && fondo[i - 1]) || (x < w - 1 && fondo[i + 1]) || (y > 0 && fondo[i - w]) || (y < h - 1 && fondo[i + w]);
    if (vecino && Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= 205) data[i * 4 + 3] = 110;
  }
  const rgba = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const alfa = await sharp(rgba).extractChannel(3).blur(0.9).toColourspace('b-w').raw().toBuffer();
  const rgb = await sharp(rgba).removeAlpha().raw().toBuffer();
  const fin = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { fin[i * 4] = rgb[i * 3]; fin[i * 4 + 1] = rgb[i * 3 + 1]; fin[i * 4 + 2] = rgb[i * 3 + 2]; fin[i * 4 + 3] = alfa[i]; }
  return sharp(fin, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

export const GET: APIRoute = async ({ url }) => {
  const u = permitido(url.searchParams.get('u') || '', url.origin);
  if (!u) return new Response('no', { status: 400 });
  const k = u.href;
  let out = cache.get(k);
  if (!out) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return new Response('no', { status: 404 });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 6_000_000) return new Response('grande', { status: 413 });
      out = await recortar(buf);
      if (cache.size > 40) cache.clear();
      cache.set(k, out);
    } catch (e) { console.error('[recorte]', e); return new Response('error', { status: 500 }); }
  }
  return new Response(out, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
};
