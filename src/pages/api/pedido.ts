import { aplicarEscala, bonosPedido } from '../../lib/escala';
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { getNegocio, getProductos, modoVigente } from '../../data/content';
import { accesoCliente } from '../../lib/acceso';
import { rucValido, dniValido, clasificar, CIUDADES, TIPOS_NEGOCIO } from '../../data/validar';

export const prerender = false;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const limpio = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);

// Límite simple por IP: 6 envíos cada 10 minutos (en memoria del servidor).
const golpes = new Map<string, number[]>();
function limitado(ip: string) {
  const ahora = Date.now();
  const l = (golpes.get(ip) ?? []).filter((t) => ahora - t < 600_000);
  l.push(ahora); golpes.set(ip, l);
  if (golpes.size > 5000) golpes.clear();
  return l.length > 6;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'Solicitud no válida.' }, 400); }
  if (b.web) return json({ ok: true, wa: '' }); // honeypot: los bots lo llenan
  if (Date.now() - Number(b.t || 0) < 2000) return json({ error: 'Intenta de nuevo en unos segundos.' }, 429);
  if (limitado(clientAddress || 'x')) return json({ error: 'Demasiados envíos. Escríbenos por WhatsApp.' }, 429);

  const sb = supabase();
  if (!sb) return json({ error: 'El servicio no está disponible por ahora. Escríbenos por WhatsApp.' }, 503);

  const tipo = b.doc_tipo === 'DNI' ? 'DNI' : 'RUC';
  const doc = limpio(b.doc_num, 11).replace(/\D/g, '');
  if (tipo === 'RUC' ? !rucValido(doc) : !dniValido(doc)) return json({ error: tipo === 'RUC' ? 'El RUC no es válido (11 dígitos).' : 'El DNI debe tener 8 dígitos.', campo: 'doc_num' }, 422);
  // Cliente de cartera: se vuelve a verificar documento + clave en el servidor (no se confía en precios del navegador).
  const clave = limpio(b.clave, 8).replace(/\D/g, '');
  let acc: Awaited<ReturnType<typeof accesoCliente>> | null = null;
  if (clave) {
    acc = await accesoCliente(doc, clave);
    if (!acc.ok) return json({ error: acc.motivo === 'servicio' ? 'No pudimos verificar tu clave. Intenta de nuevo.' : 'Tu clave ya no es válida. Ingresa de nuevo.', reautenticar: acc.motivo !== 'servicio' }, acc.motivo === 'servicio' ? 503 : 401);
  }
  const cartera = !!acc?.ok;
  let nombre = '', whatsapp = '', ciudad = '', tipoNeg = '', condicion = '', tipoDoc = 'cotizacion';
  if (cartera) {
    // Cliente activo: sus datos ya están registrados. Solo se pide agencia de transportes, datos del transportista, observaciones y condición de pago.
    nombre = limpio(acc!.nombre, 120) || doc;
    if (limpio(b.ag_nombre, 80).length < 2) return json({ error: 'Indica la agencia de transportes.', campo: 'ag_nombre' }, 422);
    condicion = limpio(b.condicion, 10);
    if (!['contado', 'factura', 'letra'].includes(condicion)) return json({ error: 'Elige la condición de pago.', campo: 'condicion' }, 422);
    tipoDoc = limpio(b.tipo_doc, 12);
    if (!['cotizacion', 'pedido'].includes(tipoDoc)) return json({ error: 'Elige si es Cotización o Pedido.', campo: 'tipo_doc' }, 422);
  } else {
    nombre = limpio(b.nombre, 120); if (nombre.length < 3) return json({ error: 'Ingresa tu razón social o nombre.', campo: 'nombre' }, 422);
    whatsapp = limpio(b.whatsapp, 20).replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
    if (!/^9\d{8}$/.test(whatsapp)) return json({ error: 'Ingresa un WhatsApp de 9 dígitos que empiece con 9.', campo: 'whatsapp' }, 422);
    ciudad = limpio(b.ciudad, 60);
    if (!CIUDADES.includes(ciudad)) return json({ error: 'Elige tu ciudad.', campo: 'ciudad' }, 422);
    if (ciudad === 'Otra') { ciudad = limpio(b.ciudad_otra, 60); if (ciudad.length < 2) return json({ error: 'Escribe tu ciudad.', campo: 'ciudad_otra' }, 422); }
    tipoNeg = limpio(b.tipo_negocio, 40); if (!TIPOS_NEGOCIO.includes(tipoNeg)) return json({ error: 'Elige el tipo de negocio.', campo: 'tipo_negocio' }, 422);
    if (b.consent !== true) return json({ error: 'Debes aceptar el uso de tus datos.', campo: 'consent' }, 422);
  }
  const precios = acc?.conPrecios ? acc.precios ?? {} : null;

  // Los productos se vuelven a leer del catálogo del servidor: no se confía en nombres ni unidades del navegador.
  const catalogo = new Map((await getProductos()).map((p) => [p.slug, p]));
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 80).map((i: any) => {
    const p = catalogo.get(String(i.slug));
    if (!p) return null;
    const acc = new Map<string, number>();
    for (const c of (Array.isArray(i.cols) ? i.cols : []).slice(0, 30)) {
      const q = Math.max(0, Math.min(9_999_999, Math.floor(Number(c?.qty) || 0)));
      const nom = limpio(c?.color, 40); if (q > 0) acc.set(nom, (acc.get(nom) ?? 0) + q);
    }
    const total = [...acc.values()].reduce((x, y) => x + y, 0);
    if (!total) return null;
    const color = [...acc].filter(([k]) => k && k !== 'Único').map(([k, q]) => `${q} ${k}`).join(', ');
    return { slug: p.slug, nombre: p.nombre + (p.consultar ? ' (consultar disponibilidad)' : ''), empaques: total, unidades: total * p.unidades_empaque, empaque: p.empaque_nombre || 'empaque', color, cols: [...acc].map(([k, q]) => ({ color: k, qty: q })) };
  }).filter(Boolean) as any[];
  // Precio por escala: los paquetes se cuentan por producto o, si tiene grupo, sumando todo el grupo (ej. colores de un mismo modelo).
  for (const it of items) {
    const pr: any = precios?.[it.slug]; if (!pr) continue;
    const paq = pr.g ? items.reduce((a: number, o: any) => a + ((precios as any)[o.slug]?.g === pr.g ? o.empaques : 0), 0) : it.empaques;
    const ef = aplicarEscala(pr, it.unidades / it.empaques, paq);
    it.precio_empaque = ef.e; it.precio_unidad = ef.u; it.subtotal = Math.round(it.empaques * ef.e * 100) / 100; if (ef.promo) it.promo = true;
  }
  // Bonificaciones (regalos a S/ 0.00): se calculan en el servidor con la lista del cliente.
  const bonos = precios ? bonosPedido(items, (sl) => (precios as any)[sl]?.bon).map((b) => ({ nombre: catalogo.get(b.slug)?.nombre || b.slug, uni: b.uni })) : [];
  const totalEmp = items.reduce((a: number, i: any) => a + i.empaques, 0);
  const volumen = totalEmp >= 50 ? 'Alto' : totalEmp >= 10 ? 'Medio' : 'Bajo'; // se calcula con el tamaño del pedido
  if (!items.length) return json({ error: 'Tu lista está vacía.' }, 422);

  const n = await getNegocio();
  const agNombre = limpio(b.ag_nombre, 80), agContacto = limpio(b.ag_contacto, 80), agRuc = limpio(b.ag_ruc, 11).replace(/\D/g, '');
  if (agRuc && !rucValido(agRuc)) return json({ error: 'El RUC de la agencia no es válido (11 dígitos).', campo: 'ag_ruc' }, 422);
  const agencia = [agNombre && `Agencia: ${agNombre}`, agRuc && `RUC agencia: ${agRuc}`, agContacto && `Contacto agencia: ${agContacto}`].filter(Boolean).join(' | ');
  const obsCliente = limpio(b.observaciones, 500);
  const observaciones = [agencia, obsCliente].filter(Boolean).join('\n');
  const o = b.origen && typeof b.origen === 'object' ? b.origen : {};
  const montoTotal = Math.round(items.reduce((a: number, i: any) => a + (i.subtotal || 0), 0) * 100) / 100;
  const origen: Record<string, unknown> = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'].map((k) => [k, limpio(o[k], 80)]).filter(([, v]) => v));
  if (bonos.length) origen.bonos = bonos;
  origen.tipo_doc = tipoDoc;
  const etq = tipoDoc === 'pedido' ? 'Pedido' : 'Cotización';
  if (acc?.ok) { origen.cartera = true; origen.lista = acc.lista || ''; if (precios) origen.total = montoTotal; }
  // Condición de pago y descuento por contado (solo clientes con descuento activado en el Panel; se calcula aquí, no en el navegador).
  let descuento = 0, descPct = 0;
  if (cartera) {
    origen.condicion = condicion;
    origen.transporte = { agencia: agNombre, datos: agContacto };
    if (condicion === 'contado' && precios && (acc!.dc ?? 0) > 0) { descPct = acc!.dc!; descuento = Math.round(montoTotal * descPct) / 100; descuento = Math.round(descuento * 100) / 100; origen.descuento_pct = descPct; origen.descuento = descuento; origen.total_pagar = Math.round((montoTotal - descuento) * 100) / 100; }
  }
  const { data: numero, error } = await sb.rpc('registrar_pedido', { p: {
    doc_tipo: tipo, doc_num: doc, nombre, contacto: cartera ? '' : limpio(b.contacto, 80), whatsapp, ciudad, tipo_negocio: tipoNeg, volumen,
    items, observaciones, clasificacion: clasificar(tipo, doc, volumen), origen, modo: modoVigente(n),
  } });
  if (error) { console.error('[pedido]', error.message); return json({ error: 'No pudimos guardar tu lista. Escríbenos por WhatsApp.' }, 500); }
  const nro = typeof numero === 'string' ? numero : '';

  const lineas = items.map((i) => `• ${i.nombre}${i.color ? ` (${i.color})` : ''}: ${i.empaques} ${i.empaque}${i.empaques === 1 ? '' : 's'} (${i.unidades} unid.)${i.subtotal != null ? ` — S/ ${(i.precio_unidad ?? i.precio_empaque / (i.unidades / i.empaques || 1)).toFixed(2)} c/u · S/ ${i.precio_empaque.toFixed(2)} por empaque = S/ ${i.subtotal.toFixed(2)}` : ''}`);
  const msg = [n.mensaje_whatsapp, nro && `${etq} N° ${nro}`, ...lineas, ...bonos.map((b) => `• BONIFICACIÓN: ${b.nombre} — ${b.uni} unid. (S/ 0.00)`), precios ? `TOTAL: S/ ${montoTotal.toFixed(2)} (sujeto a confirmación)` : acc?.ok ? 'Precios: por confirmar' : '', cartera ? `Condición de pago: ${({ contado: 'Contado', factura: 'Crédito con factura', letra: 'Crédito con letra' } as any)[condicion]}` : '', descuento ? `Descuento por contado (${descPct}%): − S/ ${descuento.toFixed(2)} · TOTAL A PAGAR: S/ ${(montoTotal - descuento).toFixed(2)}` : '', acc?.ok ? `Cliente de cartera${acc.lista ? ' · ' + acc.lista : ''}` : '', '', `${tipo}: ${doc}`, `${nombre}`, ciudad ? `Ciudad: ${ciudad}` : '', agencia && agencia.replace(/ \| /g, '\n'), obsCliente && `Obs.: ${obsCliente}`].filter((x) => x !== '' || true).filter((x) => x !== false && x !== undefined && x !== null).join('\n');
  // Aviso por correo al negocio (opcional): solo si el servidor tiene RESEND_API_KEY y RECLAMOS_FROM configurados.
  try {
    const key = (import.meta as any).env?.RESEND_API_KEY || process.env.RESEND_API_KEY, from = (import.meta as any).env?.RECLAMOS_FROM || process.env.RECLAMOS_FROM, to = (import.meta as any).env?.RESEND_TO || process.env.RESEND_TO || n.email || n.legal_email;
    console.log('[aviso] clave:', !!key, '| remitente:', from || '(vacío)', '| destino:', to || '(vacío)');
    if (key && from && to) {
      const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      const html = `<h2>${cartera ? (tipoDoc === 'pedido' ? 'PEDIDO cerrado' : 'COTIZACIÓN de cliente de cartera') : 'Nueva solicitud de cotización'} ${esc(nro)}: ${esc(nombre)}</h2><p>${esc(tipo)} ${esc(doc)}${cartera ? ' · cliente de cartera' : ''}</p><pre style="font-family:inherit">${esc(msg)}</pre>`;
      const rr = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject: `${cartera ? (tipoDoc === 'pedido' ? 'PEDIDO cerrado' : 'COTIZACIÓN cartera') : 'Nueva cotización'} · ${nombre}`, html }) });
      console.log('[aviso] Resend respondió', rr.status, (await rr.text()).slice(0, 300));
    }
  } catch (e) { console.error('aviso pedido', e); }
  return json({ ok: true, numero: nro, wa: cartera ? '' : `https://wa.me/${n.whatsapp}?text=${encodeURIComponent(msg)}`, cerrado: cartera });
};
