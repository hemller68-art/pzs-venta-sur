import type { APIRoute } from 'astro';
import { accesoCliente } from '../../lib/acceso';
import { rucValido, dniValido } from '../../data/validar';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Límite por IP: 12 intentos cada 10 minutos (además del bloqueo por cliente que hace la base de datos).
const golpes = new Map<string, number[]>();
function limitado(ip: string) {
  const ahora = Date.now();
  const l = (golpes.get(ip) ?? []).filter((t) => ahora - t < 600_000);
  l.push(ahora); golpes.set(ip, l);
  if (golpes.size > 5000) golpes.clear();
  return l.length > 12;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'Solicitud no válida.' }, 400); }
  const doc = String(b.doc ?? '').replace(/\D/g, '').slice(0, 11), clave = String(b.clave ?? '').replace(/\D/g, '').slice(0, 8);
  if (!(doc.length === 11 ? rucValido(doc) : dniValido(doc))) return json({ error: 'Documento no válido.' }, 422);
  if (!clave) return json({ error: 'Ingresa tu clave.' }, 422);
  if (limitado(clientAddress || 'x')) return json({ error: 'Demasiados intentos. Prueba en unos minutos o escríbenos por WhatsApp.' }, 429);
  const a = await accesoCliente(doc, clave);
  if (!a.ok) {
    const msg = a.motivo === 'bloqueado' ? 'Acceso bloqueado por 15 minutos por intentos fallidos. Escríbenos por WhatsApp.' : a.motivo === 'servicio' ? 'El servicio no está disponible por ahora.' : 'Documento o clave incorrectos.';
    return json({ error: msg }, a.motivo === 'servicio' ? 503 : 401);
  }
  return json({ ok: true, dc: a.dc || 0, ultimo: a.ultimo, nombre: a.nombre, conPrecios: a.conPrecios, precios: a.precios });
};
