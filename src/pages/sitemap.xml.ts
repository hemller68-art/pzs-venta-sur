import type { APIRoute } from 'astro';
import { getProductos, getSegmentos } from '../data/content';
export const prerender = false;
export const GET: APIRoute = async ({ site }) => {
  const base = site!.origin;
  const urls = ['/', '/catalogo', '/cotizar', '/como-pagar', '/nosotros', '/contacto', '/privacidad', '/terminos', '/envios-y-reembolsos',
    ...(await getProductos()).map((p) => `/producto/${p.slug}`), ...(await getSegmentos()).map((s) => `/para/${s.slug}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
};
