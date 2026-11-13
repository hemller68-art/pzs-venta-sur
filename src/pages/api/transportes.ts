import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { rucValido, dniValido } from '../../data/validar';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const golpes = new Map<string, number[]>();
function limitado(ip: string) {
  const ahora = Date.now();
  const l = (golpes.get(ip) ?? []).filter((t) => ahora - t < 600_000);
  l.push(ahora); golpes.set(ip, l);
  if (golpes.size > 5000) golpes.clear();
  return l.length > 30;
}

// Lista de agencias de transporte para el cierre de pedido: solo clientes de cartera con clave válida.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'Solicitud no válida.' }, 400); }
  const doc = String(b.doc ?? '').replace(/\D/g, '').slice(0, 11), clave = String(b.clave ?? '').replace(/\D/g, '').slice(0, 8);
  if (!(doc.length === 11 ? rucValido(doc) : dniValido(doc)) || !clave) return json({ error: 'Datos no válidos.' }, 422);
  if (limitado(clientAddress || 'x')) return json({ error: 'Demasiadas consultas.' }, 429);
  const sb = supabase();
  if (!sb) return json({ lista: [], mis: {} });
  const { data, error } = await sb.rpc('cliente_transportes', { p_doc: doc, p_clave: clave });
  if (error || !data?.ok) return json({ lista: [], mis: {} });
  return json({ lista: data.lista ?? [], mis: data.mis ?? {} });
};
