import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { getNegocio } from '../../data/content';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const limpio = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, ' ').trim().slice(0, max);

// Límite simple por IP: 5 reclamos cada 30 minutos (en memoria del servidor).
const golpes = new Map<string, number[]>();
function limitado(ip: string) {
  const ahora = Date.now();
  const l = (golpes.get(ip) ?? []).filter((t) => ahora - t < 1_800_000);
  l.push(ahora); golpes.set(ip, l);
  if (golpes.size > 5000) golpes.clear();
  return l.length > 5;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'Solicitud no válida.' }, 400); }
  if (b.web) return json({ ok: true, codigo: 'LR-0' }); // honeypot
  if (Date.now() - Number(b.t || 0) < 3000) return json({ error: 'Intenta de nuevo en unos segundos.' }, 429);
  if (limitado(clientAddress || 'x')) return json({ error: 'Demasiados envíos. Escríbenos por WhatsApp.' }, 429);
  const sb = supabase();
  if (!sb) return json({ error: 'El servicio no está disponible por ahora. Escríbenos por WhatsApp.' }, 503);

  const doc_tipo = ['DNI', 'CE', 'RUC', 'Pasaporte'].includes(b.doc_tipo) ? b.doc_tipo : '';
  const doc_num = limpio(b.doc_num, 20).replace(/[^A-Za-z0-9]/g, '');
  if (!doc_tipo) return json({ error: 'Elige el tipo de documento.', campo: 'doc_tipo' }, 422);
  if (doc_tipo === 'DNI' && !/^\d{8}$/.test(doc_num)) return json({ error: 'El DNI debe tener 8 dígitos.', campo: 'doc_num' }, 422);
  if (doc_tipo === 'RUC' && !/^\d{11}$/.test(doc_num)) return json({ error: 'El RUC debe tener 11 dígitos.', campo: 'doc_num' }, 422);
  if (doc_num.length < 6) return json({ error: 'Ingresa tu número de documento.', campo: 'doc_num' }, 422);
  const nombre = limpio(b.nombre, 160); if (nombre.length < 3) return json({ error: 'Ingresa tu nombre completo.', campo: 'nombre' }, 422);
  const domicilio = limpio(b.domicilio, 250); if (domicilio.length < 5) return json({ error: 'Ingresa tu domicilio.', campo: 'domicilio' }, 422);
  const email = limpio(b.email, 120); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Ingresa un correo válido: ahí enviamos tu constancia.', campo: 'email' }, 422);
  const tipo = b.tipo === 'queja' ? 'queja' : 'reclamo';
  const bien = b.bien === 'servicio' ? 'servicio' : 'producto';
  const detalle = limpio(b.detalle, 3000); if (detalle.length < 10) return json({ error: 'Cuéntanos con más detalle lo ocurrido.', campo: 'detalle' }, 422);
  const pedido_consumidor = limpio(b.pedido_consumidor, 2000); if (pedido_consumidor.length < 5) return json({ error: 'Indica qué solución esperas.', campo: 'pedido_consumidor' }, 422);
  if (b.consent !== true) return json({ error: 'Debes aceptar el uso de tus datos para atender tu reclamo.', campo: 'consent' }, 422);
  const menor = b.menor_edad === true;
  const apoderado = limpio(b.apoderado, 160);
  if (menor && apoderado.length < 3) return json({ error: 'Indica el nombre del padre, madre o apoderado.', campo: 'apoderado' }, 422);

  const payload = { tipo, nombre, doc_tipo, doc_num, domicilio, telefono: limpio(b.telefono, 20), email, menor_edad: menor, apoderado, bien, monto: limpio(b.monto, 30), descripcion_bien: limpio(b.descripcion_bien, 500), detalle, pedido_consumidor };
  const { data, error } = await sb.rpc('registrar_reclamo', { p: payload });
  if (error || !data) { console.error('reclamo', error); return json({ error: 'No pudimos registrar tu reclamo. Intenta de nuevo o escríbenos por WhatsApp.' }, 500); }
  const codigo = String(data);

  // Copia al correo del consumidor (opcional): solo si el servidor tiene RESEND_API_KEY y RECLAMOS_FROM configurados.
  let enviado = false;
  const key = (import.meta as any).env?.RESEND_API_KEY || process.env.RESEND_API_KEY, from = (import.meta as any).env?.RECLAMOS_FROM || process.env.RECLAMOS_FROM;
  if (key && from) {
    try {
      const n = await getNegocio();
      const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      const html = `<h2>Hoja de Reclamación ${esc(codigo)}</h2><p>Fecha: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}</p><p><b>Proveedor del sitio:</b> ${esc(n.legal_razon)} · RUC ${esc(n.legal_ruc)} · ${esc(n.legal_direccion)}<br><b>Proveedor del producto:</b> ${esc(n.prov_razon)}</p><p><b>Consumidor:</b> ${esc(nombre)} · ${doc_tipo} ${esc(doc_num)}<br>${esc(domicilio)}<br>${esc(email)}</p><p><b>${tipo === 'queja' ? 'Queja' : 'Reclamo'}</b> sobre ${bien}.</p><p><b>Detalle:</b> ${esc(detalle)}</p><p><b>Pedido del consumidor:</b> ${esc(pedido_consumidor)}</p><p>La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>`;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [email], ...(n.legal_email ? { cc: [n.legal_email] } : {}), subject: `Hoja de Reclamación ${codigo} · ${n.legal_razon}`, html }) });
      enviado = r.ok;
    } catch (e) { console.error('correo reclamo', e); }
  }
  return json({ ok: true, codigo, correo: enviado });
};
