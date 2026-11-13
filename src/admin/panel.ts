import { createClient } from '@supabase/supabase-js';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import writeExcelFile from 'write-excel-file/universal';
import { aplicarEscala } from '../lib/escala';

const sb = createClient(import.meta.env.PUBLIC_SUPABASE_URL ?? 'http://invalid.local', import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? 'x');
const app = document.getElementById('app')!;
const msgEl = document.getElementById('msg')!;
let to: any;
const aviso = (t: string) => { msgEl.textContent = t; msgEl.classList.add('on'); clearTimeout(to); to = setTimeout(() => msgEl.classList.remove('on'), 3500); };

type Kid = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) (e as any)[k] = v;
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c as any);
  return e;
}
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (n: number) => 'S/ ' + n.toFixed(2);
const fail = (e: any) => { console.error(e); aviso('Error: ' + (e?.message || e)); };

// ---------- Subida de archivos (las fotos se reducen y pasan a WebP antes de subir) ----------
async function reducir(file: File, max = 1400): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b || file), 'image/webp', 0.86));
}
async function subir(file: File, carpeta: string, nombre?: string, upsert = false): Promise<string> {
  const blob = await reducir(file);
  const ext = blob.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'bin').toLowerCase();
  const base = nombre ?? `${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ''))}`;
  const path = `${carpeta}/${base}.${ext}`;
  const { error } = await sb.storage.from('catalogo').upload(path, blob, { upsert, contentType: blob.type || file.type, cacheControl: '3600' });
  if (error) throw error;
  return sb.storage.from('catalogo').getPublicUrl(path).data.publicUrl + (upsert ? `?v=${Date.now()}` : '');
}

// Foto uniforme: recorta márgenes en blanco/transparentes y la centra en un cuadrado blanco (WebP)
async function normalizar(file: File, lado = 1000, relleno = 0.86): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k0 = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k0)), hh = Math.max(1, Math.round(bmp.height * k0));
  const a = document.createElement('canvas'); a.width = w; a.height = hh;
  const x = a.getContext('2d', { willReadFrequently: true })!; x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); x.drawImage(bmp, 0, 0, w, hh);
  const d = x.getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) for (let i = 0; i < w; i++) { const o = (y * w + i) * 4; if (d[o] < 240 || d[o + 1] < 240 || d[o + 2] < 240) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0 || (x1 - x0) < 20 || (y1 - y0) < 20) { x0 = 0; y0 = 0; x1 = w - 1; y1 = hh - 1; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const k = Math.min(lado * relleno / cw, lado * relleno / ch);
  const c = document.createElement('canvas'); c.width = lado; c.height = lado;
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, lado, lado); g.imageSmoothingQuality = 'high';
  g.drawImage(a, x0, y0, cw, ch, (lado - cw * k) / 2, (lado - ch * k) / 2, cw * k, ch * k);
  return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b || file), 'image/webp', 0.88));
}
async function subirFotoProducto(file: File, pr: any, relleno = 0.86): Promise<void> {
  const blob = await normalizar(file, 1000, relleno);
  const path = `fotos/${pr.slug}.webp`;
  const { error } = await sb.storage.from('catalogo').upload(path, blob, { upsert: true, contentType: 'image/webp', cacheControl: '3600' });
  if (error) throw error;
  const url = sb.storage.from('catalogo').getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
  const { error: e2 } = await sb.from('productos').update({ foto_url: url }).eq('id', pr.id);
  if (e2) throw e2;
}

// ---------- Editor genérico de tablas ----------
interface Campo { k: string; l: string; t?: 'text' | 'num' | 'bool' | 'area' | 'sel' | 'arr' | 'file' | 'date'; o?: [string, string][]; full?: boolean; accept?: string; maxMB?: number; carpeta?: string; ro?: boolean }
interface Cfg { tabla: string; pk: string; campos: Campo[]; titulo: (r: any) => string; nuevo: () => any; orden?: [string, boolean][]; filtro?: boolean; limite?: number; sinNuevo?: boolean; sinBorrar?: boolean; select?: string; extra?: (r: any, rec: () => void) => HTMLElement | null; barra?: (rec: () => void) => (HTMLElement | null)[] }

function inputDe(c: Campo, v: any): HTMLElement {
  let el: HTMLElement;
  if (c.t === 'bool') el = h('input', { type: 'checkbox', checked: !!v });
  else if (c.t === 'area') el = h('textarea', { value: v ?? '' });
  else if (c.t === 'sel') { const s = h('select', {}, ...(c.o ?? []).map(([val, lab]) => h('option', { value: val, textContent: lab }))); s.value = String(v ?? ''); el = s; }
  else if (c.t === 'num') el = h('input', { type: 'number', step: 'any', value: v ?? '' });
  else if (c.t === 'date') el = h('input', { type: 'date', value: v ?? '' });
  else if (c.t === 'arr') el = h('input', { type: 'text', value: Array.isArray(v) ? v.join(', ') : '' });
  else el = h('input', { type: 'text', value: v ?? '' });
  (el as any).dataset.k = c.k; if (c.ro) (el as any).disabled = true;
  return el;
}
function leerCampo(el: any, c: Campo) {
  if (c.t === 'bool') return el.checked;
  if (c.t === 'num') return el.value === '' ? null : Number(el.value);
  if (c.t === 'date') return el.value || null;
  if (c.t === 'arr') return el.value.split(',').map((x: string) => x.trim()).filter(Boolean);
  if (c.t === 'sel' && c.k.endsWith('_id')) return el.value === '' ? null : Number(el.value);
  return el.value;
}
function formFila(cfg: Cfg, r: any, alGuardar: () => void): HTMLElement {
  const cont = h('div', { class: 'grid' });
  const refs = new Map<string, HTMLElement>();
  for (const c of cfg.campos) {
    const inp = inputDe(c, r[c.k]); refs.set(c.k, inp);
    if (c.t === 'file') {
      const txt = inputDe({ ...c, t: 'text' }, r[c.k]);
      refs.set(c.k, txt);
      const f = h('input', { type: 'file', accept: c.accept ?? 'image/*', onchange: async (e: any) => {
        const file: File = e.target.files[0]; if (!file) return;
        if (c.maxMB && file.size > c.maxMB * 1048576) { aviso(`Pesa más de ${c.maxMB} MB. Usa un archivo más liviano.`); e.target.value = ''; return; }
        try { aviso('Subiendo…'); (txt as HTMLInputElement).value = await subir(file, c.carpeta ?? 'general'); aviso('Subido. Pulsa Guardar.'); } catch (x) { fail(x); }
      } });
      cont.append(h('label', { class: 'full' }, c.l, txt, f));
    } else cont.append(h('label', { class: c.full || c.t === 'area' ? 'full' : '' }, c.l, inp));
  }
  const guardar = h('button', { class: 'b', type: 'button', textContent: 'Guardar', onclick: async () => {
    const dato: any = {}; for (const c of cfg.campos) if (!c.ro) dato[c.k] = leerCampo(refs.get(c.k), c);
    try {
      const q = r[cfg.pk] !== undefined && r[cfg.pk] !== null && r.__nuevo !== true
        ? sb.from(cfg.tabla).update(dato).eq(cfg.pk, r[cfg.pk]) : sb.from(cfg.tabla).insert(dato);
      const { error } = await q; if (error) throw error;
      aviso('Guardado'); alGuardar();
    } catch (x) { fail(x); }
  } });
  const borrar = !cfg.sinBorrar && r.__nuevo !== true ? h('button', { class: 'b r', type: 'button', textContent: 'Borrar', onclick: async () => {
    if (!confirm('¿Borrar este registro?')) return;
    const { error } = await sb.from(cfg.tabla).delete().eq(cfg.pk, r[cfg.pk]); if (error) return fail(error);
    aviso('Borrado'); alGuardar();
  } }) : null;
  return h('div', {}, cont, h('div', { class: 'row' }, guardar, borrar, r.__nuevo !== true && cfg.extra ? cfg.extra(r, alGuardar) : null));
}
async function editor(cfg: Cfg, raiz: HTMLElement) {
  raiz.replaceChildren(h('p', { class: 'hint', textContent: 'Cargando…' }));
  let q: any = sb.from(cfg.tabla).select(cfg.select ?? '*');
  for (const [c, asc] of cfg.orden ?? []) q = q.order(c, { ascending: asc });
  const { data, error } = await q.limit(cfg.limite ?? 600); if (error) { raiz.replaceChildren(h('p', { textContent: 'Error: ' + error.message })); return; }
  const rec = () => editor(cfg, raiz);
  const lista = h('div');
  const pintar = (t: string) => {
    lista.replaceChildren(...(data as any[]).filter((r) => !t || cfg.titulo(r).toLowerCase().includes(t) || JSON.stringify(r).toLowerCase().includes(t)).map((r) => {
      const d = h('details', { class: 'card' }, h('summary', {}, h('span', { textContent: cfg.titulo(r) })));
      d.addEventListener('toggle', () => { if (d.open && d.childElementCount === 1) d.append(formFila(cfg, r, rec)); });
      return d;
    }));
  };
  const barra = h('div', { class: 'row' });
  if (!cfg.sinNuevo) barra.append(h('button', { class: 'b g', type: 'button', textContent: '+ Nuevo', onclick: () => {
    const c = h('div', { class: 'card' }, h('strong', { textContent: 'Nuevo registro' }), formFila(cfg, { ...cfg.nuevo(), __nuevo: true }, rec)); raiz.prepend(c);
  } }));
  if (cfg.barra) for (const b of cfg.barra(rec)) if (b) barra.append(b);
  if (cfg.filtro) barra.append(h('input', { type: 'search', placeholder: 'Buscar…', style: 'max-width:300px', oninput: (e: any) => pintar(e.target.value.trim().toLowerCase()) }));
  pintar('');
  raiz.replaceChildren(barra, h('div', { style: 'height:.7rem' }), lista);
}
async function opts(tabla: string, val: string, lab: string, vacio?: string): Promise<[string, string][]> {
  const { data } = await sb.from(tabla).select(`${val},${lab}`).order(lab);
  return [...(vacio !== undefined ? [['', vacio] as [string, string]] : []), ...((data as any[]) ?? []).map((r) => [String(r[val]), String(r[lab])] as [string, string])];
}

// ---------- Imprimir / guardar PDF ----------
function imprimir(titulo: string, cuerpo: HTMLElement) {
  const w = window.open('', '_blank'); if (!w) return aviso('El navegador bloqueó la ventana. Permite ventanas emergentes.');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${titulo.replace(/[<>&]/g, '')}</title><style>body{font:13px/1.5 Arial,sans-serif;margin:24px;color:#000}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #444;padding:5px 8px;text-align:left}pre{white-space:pre-wrap;font:inherit}</style><body>${cuerpo.outerHTML}</body>`);
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400);
}
type Ext = { filas: any[]; total: number | null; faltan: number; cuentas: any[]; lista: string };
function docPedido(p: any, texto?: string, ext?: Ext) {
  const d = h('div', {}, h('h1', { textContent: 'PROLIMSO Zona Sur · ' + (texto ? 'Cotización' : 'Pedido') + (p.numero ? ' N° ' + p.numero : '') }),
    h('p', { textContent: `${new Date(p.created_at).toLocaleString('es-PE')} · ${p.doc_tipo} ${p.doc_num} · ${p.nombre}` }),
    h('p', { textContent: `${p.ciudad} · ${p.tipo_negocio} · WhatsApp ${p.whatsapp}${p.contacto ? ' · ' + p.contacto : ''}` }));
  if (texto) d.append(h('pre', { textContent: texto }));
  else {
    const conP = !!ext && ext.filas.some((f) => f.pe != null);
    const cab = ['Producto', 'Colores', 'Empaques', 'Unidades', ...(conP ? ['P. unidad', 'P. empaque', 'Subtotal'] : [])];
    const filas = (ext?.filas ?? p.items.map((i: any) => ({ i }))).map((f: any) => {
      const i = f.i; const base = [i.nombre, i.color || '—', String(i.empaques), String(i.unidades)];
      return conP ? [...base, f.pe != null ? money(f.pu) : 'consultar', f.pe != null ? money(f.pe) : '—', f.sub != null ? money(f.sub) : '—'] : base;
    });
    for (const b of (p.origen?.bonos ?? [])) filas.push([b.nombre + ' (BONIFICACIÓN)', '—', '—', String(b.uni), ...(conP ? [money(0), money(0), money(0)] : [])]);
    d.append(h('table', {}, h('thead', {}, h('tr', {}, ...cab.map((x) => h('th', { textContent: x })))),
      h('tbody', {}, ...filas.map((f: string[]) => h('tr', {}, ...f.map((x) => h('td', { textContent: x })))))));
    if (conP && ext!.total != null) {
      d.append(h('h2', { textContent: 'Total a depositar: ' + money(ext!.total), style: 'margin:.8rem 0 .2rem' }));
      d.append(h('p', { textContent: `Precios según la lista "${ext!.lista}".` + (ext!.faltan ? ` ${ext!.faltan} producto(s) sin precio en la lista: se cotizan aparte.` : '') + ' Precios incluyen IGV. Cotización válida por 7 días, sujeta a confirmación por tu asesor.' }));
      if (ext!.cuentas.length) d.append(h('p', { textContent: 'Cuentas para depositar:', style: 'font-weight:bold;margin-bottom:.2rem' }), ...ext!.cuentas.map((c: any) => h('p', { style: 'margin:.1rem 0', textContent: `${c.banco}${c.etiqueta ? ' (' + c.etiqueta + ')' : ''}${c.titular ? ' · ' + c.titular : ''}${c.numero ? ' · N° ' + c.numero : ''}${c.cci ? ' · CCI ' + c.cci : ''}${c.codigo_agente ? ' · Cód. agente ' + c.codigo_agente : ''}` })));
    } else d.append(h('p', { textContent: 'Aplican montos mínimos de venta por empaque cerrado. Los precios se confirman en la cotización.' }));
    if (p.origen?.condicion) d.append(h('p', { textContent: 'Condición de pago: ' + (({ contado: 'Contado', factura: 'Crédito con factura', letra: 'Crédito con letra' } as any)[p.origen.condicion] || p.origen.condicion) + (p.origen.descuento_pct > 0 && ext?.total != null ? ` · Descuento contado ${p.origen.descuento_pct}%: − ${money(Math.round(ext.total * p.origen.descuento_pct) / 100)} · TOTAL A PAGAR: ${money(ext.total - Math.round(ext.total * p.origen.descuento_pct) / 100)}` : '') }));
    if (p.origen?.transporte) d.append(h('p', { textContent: `Transporte: ${p.origen.transporte.agencia}${p.origen.transporte.datos ? ' · ' + p.origen.transporte.datos : ''}` }));
    if (p.observaciones) d.append(h('p', { textContent: 'Observaciones: ' + p.observaciones }));
  }
  return d;
}
async function extraPrecios(p: any, listaId: string, listas: any[]): Promise<Ext | undefined> {
  const lista = listas.find((l) => String(l.id) === String(listaId));
  const filas: any[] = p.items.map((i: any) => ({ i, pe: i.precio_empaque ?? null, pu: i.precio_unidad ?? null, sub: i.subtotal ?? null }));
  if (lista?.con_precios) {
    const [{ data: prods }, { data: pr }] = await Promise.all([sb.from('productos').select('slug,codigos').in('slug', p.items.map((i: any) => i.slug)), sb.from('precios').select('*').eq('lista_id', lista.id)]);
    const pm = new Map((prods ?? []).map((x: any) => [x.slug, x.codigos as string[]]));
    const prm = new Map((pr ?? []).map((x: any) => [x.codigo, x]));
    for (const f of filas) f.fila = (pm.get(f.i.slug) ?? []).map((c) => prm.get(c)).find(Boolean);
    for (const f of filas) {
      const fila: any = f.fila;
      if (fila?.precio_empaque != null) {
        const paq = fila.escala_grupo ? filas.reduce((a, o) => a + (o.fila?.escala_grupo === fila.escala_grupo ? o.i.empaques : 0), 0) : f.i.empaques;
        const ef = aplicarEscala({ u: fila.precio_unidad != null ? Number(fila.precio_unidad) : null, e: Number(fila.precio_empaque), esc: fila.escala }, (f.i.unidades / f.i.empaques) || 1, paq); f.pe = ef.e; f.pu = ef.u; f.sub = Math.round(f.pe * f.i.empaques * 100) / 100;
      }
    }
  }
  if (!filas.some((f) => f.pe != null)) return undefined;
  for (const f of filas) if (f.pe != null && f.pu == null) f.pu = f.pe / ((f.i.unidades / f.i.empaques) || 1);
  const { data: cuentas } = await sb.from('cuentas_bancarias').select('banco,titular,etiqueta,numero,cci,codigo_agente').eq('activa', true).order('orden');
  const total = Math.round(filas.reduce((a, f) => a + (f.sub ?? 0), 0) * 100) / 100;
  return { filas, total, faltan: filas.filter((f) => f.pe == null).length, cuentas: cuentas ?? [], lista: lista?.nombre ?? 'del cliente' };
}

// ---------- Pantallas ----------
type Pantalla = (r: HTMLElement) => Promise<void> | void;
const P: Record<string, Pantalla> = {};

P['Pedidos'] = async (r) => {
  const [{ data: peds, error }, { data: cls }, { data: listas }] = await Promise.all([
    sb.from('pedidos').select('*').order('created_at', { ascending: false }).limit(5000),
    sb.from('clientes').select('doc_tipo,doc_num,lista_id,whatsapp,desc_contado'), sb.from('listas_precio').select('*').order('orden')]);
  if (error) { r.append('Error: ' + error.message); return; }
  const clMap = new Map((cls ?? []).map((c: any) => [c.doc_tipo + c.doc_num, c]));
  const filtro = h('select', {}, ...['', 'nuevo', 'atendido', 'cotizado', 'cerrado', 'descartado'].map((e) => h('option', { value: e, textContent: e || 'Todos los estados' })));
  const cont = h('div');
  // Historial: buscador (cliente, documento, WhatsApp, producto), rango de fechas y paginación de 50 en 50.
  const norm = (t: string) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = h('input', { type: 'search', placeholder: 'Buscar cliente, RUC/DNI, WhatsApp o producto…', style: 'min-width:280px;flex:1' }) as HTMLInputElement;
  const desde = h('input', { type: 'date', style: 'width:auto', title: 'Desde' }) as HTMLInputElement;
  const hasta = h('input', { type: 'date', style: 'width:auto', title: 'Hasta' }) as HTMLInputElement;
  const mes = h('input', { type: 'month', style: 'width:auto', title: 'Mes' }) as HTMLInputElement;
  const info = h('p', { class: 'hint', style: 'margin:.4rem 0' });
  const mas = h('button', { class: 'b g', type: 'button', textContent: 'Ver más pedidos' });
  let tope = 50;
  const dia = (d: string) => new Date(d).toLocaleDateString('sv-SE');
  const visibles = () => {
    const t = norm(q.value.trim());
    return (peds ?? []).filter((p: any) => (!filtro.value || p.estado === filtro.value)
      && (!desde.value || dia(p.created_at) >= desde.value) && (!hasta.value || dia(p.created_at) <= hasta.value)
      && (!t || t.split(/\s+/).every((w) => norm([p.nombre, p.doc_num, p.whatsapp, p.contacto, p.ciudad, p.observaciones, ...(p.items ?? []).map((i: any) => i.nombre)].join(' ')).includes(w))));
  };
  const pintar = () => {
    const v = visibles();
    cont.replaceChildren(...v.slice(0, tope).map((p: any) => tarjeta(p)));
    const monto = v.reduce((a: number, p: any) => a + (Number(p.origen?.total) || 0), 0);
    info.textContent = `${v.length} pedido(s)` + (monto ? ` · suma con precios: ${money(monto)}` : '') + (v.length > tope ? ` · mostrando ${tope}` : '');
    mas.hidden = v.length <= tope;
  };
  mas.addEventListener('click', () => { tope += 50; pintar(); });
  mes.addEventListener('change', () => {
    if (!mes.value) { desde.value = ''; hasta.value = ''; } else { const [y, m] = mes.value.split('-').map(Number); desde.value = `${mes.value}-01`; hasta.value = `${mes.value}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; }
    tope = 50; pintar();
  });
  [q, desde, hasta, filtro].forEach((el) => el.addEventListener(el === q ? 'input' : 'change', () => { tope = 50; pintar(); }));
  function tarjeta(p: any) {
    const cl: any = clMap.get(p.doc_tipo + p.doc_num);
    const est = h('select', { onchange: async (e: any) => { const { error } = await sb.from('pedidos').update({ estado: e.target.value }).eq('id', p.id); error ? fail(error) : (p.estado = e.target.value, aviso('Estado actualizado')); } },
      ...['nuevo', 'atendido', 'cotizado', 'cerrado', 'descartado'].map((e) => h('option', { value: e, textContent: e })));
    est.value = p.estado; est.style.width = 'auto';
    const quote = h('div');
    const selLista = h('select', { style: 'width:auto' }, h('option', { value: '', textContent: 'Sin lista' }), ...(listas ?? []).map((l: any) => h('option', { value: String(l.id), textContent: l.nombre + (l.con_precios ? '' : ' (sin precios)') })));
    selLista.value = cl?.lista_id ? String(cl.lista_id) : '';
    const card = h('div', { class: 'card' },
      h('div', { class: 'row', style: 'margin:0' }, h('span', { class: 'bd ' + p.clasificacion, textContent: 'Lead ' + p.clasificacion }), p.origen?.cartera ? h('span', { class: 'bd A', textContent: 'CARTERA' + (p.origen.lista ? ' · ' + p.origen.lista : '') + (p.origen.total ? ' · ' + money(Number(p.origen.total)) : '') }) : null, h('strong', { textContent: (p.numero ? p.numero + ' · ' : '') + p.nombre }),
        h('span', { class: 'hint', style: 'margin:0', textContent: new Date(p.created_at).toLocaleString('es-PE') }), est),
      h('p', { textContent: `${p.doc_tipo} ${p.doc_num} · ${p.ciudad} · ${p.tipo_negocio} · volumen ${p.volumen} · WhatsApp ${p.whatsapp}${p.contacto ? ' · ' + p.contacto : ''}` }),
      p.origen?.condicion ? h('p', { textContent: `Condición de pago: ${({ contado: 'Contado', factura: 'Crédito con factura', letra: 'Crédito con letra' } as any)[p.origen.condicion] || p.origen.condicion}${p.origen.descuento ? ` · Descuento contado ${p.origen.descuento_pct}%: − ${money(p.origen.descuento)} · A pagar ${money(p.origen.total_pagar)}` : ''}` }) : null,
      p.origen?.transporte ? h('p', { textContent: `Transporte: ${p.origen.transporte.agencia}${p.origen.transporte.datos ? ' · ' + p.origen.transporte.datos : ''}` }) : null,
      h('ul', { style: 'margin:.4rem 0 0 1.2rem' }, ...(p.origen?.bonos ?? []).map((b: any) => h('li', { textContent: `BONIFICACIÓN: ${b.nombre} — ${b.uni} unid. · S/ 0.00` })), ...p.items.map((i: any) => h('li', { textContent: `${i.nombre}${i.color ? ' (' + i.color + ')' : ''}: ${i.empaques} empaque(s) = ${i.unidades} unid.${i.subtotal != null ? ' · ' + money(Number(i.subtotal)) : ''}` }))),
      p.observaciones ? h('p', { class: 'hint', textContent: 'Obs.: ' + p.observaciones }) : null,
      h('div', { class: 'row' },
        h('span', { class: 'hint', style: 'margin:0', textContent: 'Lista de precios:' }), selLista,
        h('button', { class: 'b s', type: 'button', textContent: cl ? 'Guardar lista' : 'Registrar y asignar lista', onclick: async () => {
          const lid = selLista.value ? Number(selLista.value) : null;
          const { error } = cl
            ? await sb.from('clientes').update({ lista_id: lid }).eq('doc_tipo', p.doc_tipo).eq('doc_num', p.doc_num)
            : await sb.from('clientes').upsert({ doc_tipo: p.doc_tipo, doc_num: p.doc_num, nombre: p.nombre, whatsapp: p.whatsapp, ciudad: p.ciudad, tipo_negocio: p.tipo_negocio, lista_id: lid }, { onConflict: 'doc_tipo,doc_num' });
          if (error) return fail(error); aviso(cl ? 'Lista guardada.' : 'Cliente registrado con su lista. Genera su clave en la pestaña Clientes.'); (clMap as any).set(p.doc_tipo + p.doc_num, { ...(cl ?? {}), lista_id: lid }); card.replaceWith(tarjeta(p)); } }),
        h('button', { class: 'b', type: 'button', textContent: 'Armar cotización', onclick: () => cotizar(p, cl, listas ?? [], quote) }),
        h('button', { class: 'b s', type: 'button', textContent: 'PDF para el cliente', onclick: async () => { const ext = await extraPrecios(p, selLista.value, listas ?? []); if (!ext) aviso('Sin precios: elige una lista de precios arriba para imprimirlo con precios.'); imprimir('Pedido ' + (p.numero || '') + ' ' + p.nombre, docPedido(p, undefined, ext)); } }),
        p.origen?.cartera && p.origen?.total ? (() => { const inp = h('input', { type: 'number', step: 'any', min: '0', style: 'width:80px', value: String(p.origen.descuento_pct ?? '') }) as HTMLInputElement; return h('span', { class: 'row', style: 'margin:0' }, h('span', { class: 'hint', style: 'margin:0', textContent: 'Descuento contado %:' }), inp, h('button', { class: 'b s', type: 'button', textContent: 'Aplicar', onclick: async () => { const pct = Number(inp.value) || 0; const o2: any = { ...p.origen }; if (pct > 0) { o2.descuento_pct = pct; o2.descuento = Math.round(Number(p.origen.total) * pct) / 100; o2.total_pagar = Math.round((Number(p.origen.total) - o2.descuento) * 100) / 100; } else { delete o2.descuento_pct; delete o2.descuento; delete o2.total_pagar; } const { error } = await sb.from('pedidos').update({ origen: o2 }).eq('id', p.id); if (error) return fail(error); p.origen = o2; aviso(pct > 0 ? `Descuento ${pct}% aplicado` : 'Descuento quitado'); card.replaceWith(tarjeta(p)); } })); })() : null,
        (p.whatsapp || cl?.whatsapp) ? h('a', { href: `https://wa.me/51${p.whatsapp || cl.whatsapp}`, target: '_blank', rel: 'noopener', textContent: 'Abrir WhatsApp del cliente' }) : null),
      quote);
    return card;
  }
  const exportar = async () => {
    aviso('Preparando Excel…');
    const { data: todos, error: e2 } = await sb.from('pedidos').select('*').order('created_at', { ascending: true }).limit(5000);
    if (e2) return fail(e2);
    const f = (d: string) => new Date(d).toLocaleString('es-PE');
    const mapa = new Map<string, any>();
    for (const p of (todos ?? []).filter((x: any) => !x.origen?.cartera)) {
      const k = p.doc_tipo + p.doc_num; const c = mapa.get(k);
      if (!c) mapa.set(k, { ...p, n: 1, primero: p.created_at, ultimo: p.created_at, estado: p.estado }); else { c.n++; c.ultimo = p.created_at; c.estado = p.estado; c.whatsapp = p.whatsapp || c.whatsapp; c.clasificacion = p.clasificacion; }
    }
    const head = (t: string) => ({ value: t, fontWeight: 'bold' as const, backgroundColor: '#e9e2f7' });
    const t = (v: any) => ({ value: String(v ?? ''), type: String });
    const clientes = [...mapa.values()].reverse();
    const hojaC = [['Tipo doc.', 'Documento', 'Nombre o razón social', 'Contacto', 'WhatsApp', 'Ciudad', 'Tipo de negocio', 'Lead', 'N° pedidos', 'Primer pedido', 'Último pedido', 'Estado', 'Observaciones'].map(head),
      ...clientes.map((c) => [t(c.doc_tipo), t(c.doc_num), t(c.nombre), t(c.contacto), t(c.whatsapp), t(c.ciudad), t(c.tipo_negocio), t(c.clasificacion), { value: c.n, type: Number }, t(f(c.primero)), t(f(c.ultimo)), t(c.estado), t(c.observaciones)])];
    const hojaP = [['Fecha', 'Tipo doc.', 'Documento', 'Nombre', 'WhatsApp', 'Ciudad', 'Producto', 'Color', 'Empaques', 'Unidades', 'Estado'].map(head),
      ...(todos ?? []).filter((x: any) => !x.origen?.cartera).flatMap((p: any) => (p.items ?? []).map((i: any) => [t(f(p.created_at)), t(p.doc_tipo), t(p.doc_num), t(p.nombre), t(p.whatsapp), t(p.ciudad), t(i.nombre), t(i.color), { value: Number(i.empaques) || 0, type: Number }, { value: Number(i.unidades) || 0, type: Number }, t(p.estado)]))];
    if (!clientes.length) return aviso('Aún no hay clientes nuevos para exportar.');
    const blob = await writeExcelFile([{ data: hojaC, sheet: 'Clientes nuevos', columns: [{ width: 9 }, { width: 14 }, { width: 38 }, { width: 22 }, { width: 13 }, { width: 16 }, { width: 18 }, { width: 6 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 11 }, { width: 40 }] }, { data: hojaP, sheet: 'Pedidos', columns: [{ width: 18 }, { width: 9 }, { width: 14 }, { width: 34 }, { width: 13 }, { width: 16 }, { width: 38 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 11 }] }]).toBlob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `clientes-nuevos-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    aviso(`Excel descargado: ${clientes.length} clientes nuevos.`);
  };
  const exportarHistorial = async () => {
    const v = visibles(); if (!v.length) return aviso('No hay pedidos con ese filtro.');
    aviso('Preparando historial…');
    const f = (d: string) => new Date(d).toLocaleString('es-PE');
    const head = (x: string) => ({ value: x, fontWeight: 'bold' as const, backgroundColor: '#e9e2f7' });
    const t = (x: any) => ({ value: String(x ?? ''), type: String });
    const n = (x: any) => ({ value: Number(x) || 0, type: Number });
    const p2 = (x: number) => String(x).padStart(2, '0');
    const nro = (p: any) => p.numero || ('#' + p.id);
    const cond = (c: string) => (({ contado: 'Contado', factura: 'Crédito con factura', letra: 'Crédito con letra' } as any)[c] || c || '');
    const hojaP = [['N° pedido', 'Fecha', 'Hora', 'Cliente', 'RUC/DNI', 'Lista', 'Condición de pago', 'Agencia', 'Transportista', 'N° productos', 'Empaques', 'Unidades', 'Total', 'Descuento', 'Total a pagar', 'Estado', 'Observaciones', 'Bonificaciones', 'WhatsApp', 'Ciudad', 'Cliente de cartera'].map(head),
      ...v.map((p: any) => { const d = new Date(p.created_at), it = p.items ?? [], tot = p.origen?.total; return [t(nro(p)), t(d.toLocaleDateString('es-PE')), t(`${p2(d.getHours())}:${p2(d.getMinutes())}`), t(p.nombre), t(p.doc_num), t(p.origen?.lista), t(cond(p.origen?.condicion)), t(p.origen?.transporte?.agencia), t(p.origen?.transporte?.datos), n(it.length), n(it.reduce((a: number, i: any) => a + (Number(i.empaques) || 0), 0)), n(it.reduce((a: number, i: any) => a + (Number(i.unidades) || 0), 0)), tot != null ? n(tot) : t(''), p.origen?.descuento ? n(p.origen.descuento) : t(''), p.origen?.total_pagar != null ? n(p.origen.total_pagar) : tot != null ? n(tot) : t(''), t(p.estado), t(p.observaciones), t((p.origen?.bonos ?? []).map((b: any) => `${b.nombre} ${b.uni} unid.`).join('; ')), t(p.whatsapp), t(p.ciudad), t(p.origen?.cartera ? 'Sí' : 'No')]; })];
    const hojaD = [['N° pedido', 'Fecha', 'Documento', 'Cliente', 'Producto', 'Color', 'Empaques', 'Unidades', 'Subtotal'].map(head),
      ...v.flatMap((p: any) => (p.items ?? []).map((i: any) => [t(nro(p)), t(new Date(p.created_at).toLocaleDateString('es-PE')), t(p.doc_num), t(p.nombre), t(i.nombre), t(i.color), n(i.empaques), n(i.unidades), i.subtotal != null ? n(i.subtotal) : t('')]))];
    const blob = await writeExcelFile([
      { data: hojaP, sheet: 'Pedidos', columns: [17, 11, 7, 34, 14, 10, 18, 22, 28, 10, 10, 10, 12, 11, 13, 11, 40, 36, 13, 14, 9].map((width) => ({ width })) },
      { data: hojaD, sheet: 'Detalle de productos', columns: [17, 11, 14, 34, 40, 14, 10, 10, 12].map((width) => ({ width })) }]).toBlob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pedidos-${mes.value || new Date().toISOString().slice(0, 10)}.xlsx`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    aviso(`Historial descargado: ${v.length} pedidos.`);
  };
  r.append(h('h2', { textContent: 'Pedidos y leads' }), h('p', { class: 'hint', textContent: 'Historial de todos los pedidos que envían tus clientes, con todos sus datos. Lead A = mejor oportunidad.' }),
    h('div', { class: 'row' }, q), h('div', { class: 'row' }, filtro, h('span', { class: 'hint', style: 'margin:0', textContent: 'Mes' }), mes, h('span', { class: 'hint', style: 'margin:0', textContent: 'o Desde' }), desde, h('span', { class: 'hint', style: 'margin:0', textContent: 'Hasta' }), hasta),
    h('div', { class: 'row' }, h('button', { class: 'b', type: 'button', textContent: 'Descargar Excel del mes / filtro', onclick: exportarHistorial }), h('button', { class: 'b g', type: 'button', textContent: 'Descargar clientes nuevos (Excel)', onclick: exportar })),
    info, cont, h('div', { class: 'row' }, mas));
  pintar();
};

async function cotizar(p: any, cl: any, listas: any[], dest: HTMLElement) {
  const sel = h('select', {}, ...listas.map((l) => h('option', { value: l.id, textContent: l.nombre + (l.con_precios ? '' : ' (solo nombres, sin precios)') })));
  if (cl?.lista_id) sel.value = String(cl.lista_id);
  const nuevos = h('input', { type: 'checkbox' });
  const area = h('textarea', { style: 'min-height:200px;margin-top:.6rem' });
  const gen = async () => {
    const lista = listas.find((l) => String(l.id) === sel.value); if (!lista) return;
    const slugs = p.items.map((i: any) => i.slug);
    const [{ data: prods }, { data: pr }] = await Promise.all([sb.from('productos').select('slug,codigos').in('slug', slugs), sb.from('precios').select('*').eq('lista_id', lista.id)]);
    const pm = new Map((prods ?? []).map((x: any) => [x.slug, x.codigos as string[]]));
    const prm = new Map((pr ?? []).map((x: any) => [x.codigo, x]));
    let total = 0, sinPrecio = 0;
    const filaDe = (i: any): any => (pm.get(i.slug) ?? []).map((c) => prm.get(c)).find(Boolean);
    const lineas = p.items.map((i: any) => {
      const fila: any = filaDe(i);
      const base = `• ${i.nombre}${i.color ? ' (' + i.color + ')' : ''}: ${i.empaques} empaque${i.empaques === 1 ? '' : 's'} (${i.unidades} unid.)`;
      if (!lista.con_precios) return base;
      const pe = nuevos.checked ? (fila?.nuevo_empaque ?? fila?.precio_empaque) : fila?.precio_empaque;
      const pu = nuevos.checked ? (fila?.nuevo_unidad ?? fila?.precio_unidad) : fila?.precio_unidad;
      if (pe == null) { sinPrecio++; return base + ' — consultar precio'; }
      const ef = aplicarEscala({ u: pu != null ? Number(pu) : null, e: Number(pe), esc: fila?.escala }, (i.unidades / i.empaques) || 1, fila?.escala_grupo ? p.items.reduce((a: number, o: any) => a + (filaDe(o)?.escala_grupo === fila.escala_grupo ? o.empaques : 0), 0) : i.empaques);
      const sub = ef.e * i.empaques; total += sub;
      return `${base} × ${money(ef.u)} c/u = ${money(sub)}${ef.promo ? ' (precio por volumen)' : ''}`;
    });
    area.value = [`Hola ${p.contacto || p.nombre}, esta es tu cotización:`, '', ...lineas, ...(p.origen?.bonos ?? []).map((b: any) => `• BONIFICACIÓN: ${b.nombre} — ${b.uni} unid. (S/ 0.00)`), ...(lista.con_precios ? ['', `Total: ${money(total)}${sinPrecio ? ' (faltan ' + sinPrecio + ' por precio)' : ''}`] : ['', 'Te confirmamos los precios por este medio.']), '', 'Aplican montos mínimos de venta por empaque cerrado.'].join('\n');
  };
  sel.addEventListener('change', gen); nuevos.addEventListener('change', gen);
  dest.replaceChildren(h('div', { class: 'row' }, h('label', {}, 'Lista de precios', sel), h('label', { style: 'display:flex;gap:.4rem;align-items:center' }, nuevos, 'Usar precios nuevos')), area,
    h('div', { class: 'row' },
      h('button', { class: 'b s', type: 'button', textContent: 'Copiar', onclick: () => navigator.clipboard.writeText(area.value).then(() => aviso('Copiado')) }),
      h('button', { class: 'b s', type: 'button', textContent: 'Imprimir cotización (PDF)', onclick: () => imprimir('Cotización ' + p.nombre, docPedido(p, area.value)) }),
      h('button', { class: 'b g', type: 'button', textContent: 'Enviar por WhatsApp', onclick: () => window.open(`https://wa.me/51${p.whatsapp}?text=${encodeURIComponent(area.value)}`, '_blank', 'noopener') })));
  gen();
}

const nuevaClave = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const normT = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

P['Clientes'] = async (r) => {
  const listas = await opts('listas_precio', 'id', 'nombre', '— Sin lista asignada —');
  r.append(h('h2', { textContent: 'Clientes de cartera' }), h('p', { class: 'hint', textContent: 'Cada cliente entra a cotizar con su RUC/DNI + su clave de 6 dígitos y ve los precios de SU lista. Quien entra sin clave (cliente nuevo) solo ve la relación de productos. Todo es editable: lista, clave, activo/inactivo.' }));
  const c = h('div');
  const importar = h('input', { type: 'file', accept: '.xlsx', style: 'display:none', onchange: async (e: any) => {
    const file: File = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      aviso('Leyendo Excel…');
      const filas = (await readXlsxFile(file)) as any[][];
      const cab = (filas[0] ?? []).map((x) => normT(String(x ?? '')));
      const col = (...n: string[]) => cab.findIndex((x) => n.some((k) => x.includes(k)));
      const iDoc = col('ruc o dni', 'ruc', 'dni', 'documento'), iTipo = col('tipo'), iNom = col('razon', 'nombre'), iLista = col('lista'), iWa = col('whatsapp', 'celular', 'telefono'), iCiu = col('ciudad');
      if (iDoc < 0 || iNom < 0) return aviso('El Excel debe tener las columnas "RUC o DNI" y "Razón social o nombre".');
      const { data: ls } = await sb.from('listas_precio').select('id,nombre');
      const lid = (t: string) => { const n = normT(t); if (!n) return undefined; return (ls ?? []).find((l: any) => normT(l.nombre) === n)?.id ?? (ls ?? []).find((l: any) => normT(l.nombre).includes(n) || n.includes(normT(l.nombre)))?.id; };
      const grupos = new Map<string, any[]>(); const sinLista = new Set<string>(); let malos = 0, total = 0;
      for (const f of filas.slice(1)) {
        let doc = String(f[iDoc] ?? '').replace(/\D/g, ''); if (!doc) continue;
        if (doc.length === 7) doc = doc.padStart(8, '0');
        if (doc.length !== 11 && doc.length !== 8) { malos++; continue; }
        const nombre = String(f[iNom] ?? '').trim(); if (!nombre) { malos++; continue; }
        const fila: any = { doc_tipo: doc.length === 11 ? 'RUC' : 'DNI', doc_num: doc, nombre };
        if (iLista >= 0 && String(f[iLista] ?? '').trim()) { const id = lid(String(f[iLista])); if (id) fila.lista_id = id; else sinLista.add(String(f[iLista])); }
        if (iWa >= 0) { const w = String(f[iWa] ?? '').replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, ''); if (/^9\d{8}$/.test(w)) fila.whatsapp = w; }
        if (iCiu >= 0 && String(f[iCiu] ?? '').trim()) fila.ciudad = String(f[iCiu]).trim();
        const k = Object.keys(fila).sort().join(','); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(fila); total++;
      }
      if (!total) return aviso('No encontré clientes válidos en el Excel.');
      if (!confirm(`Se cargarán o actualizarán ${total} clientes por RUC/DNI (sin duplicar; no se cambian sus claves).${sinLista.size ? '\nListas no reconocidas (quedan sin cambio): ' + [...sinLista].join(', ') : ''}${malos ? '\nFilas omitidas por documento o nombre inválido: ' + malos : ''}\n¿Continuar?`)) return;
      for (const arr of grupos.values()) for (let i = 0; i < arr.length; i += 200) { const { error } = await sb.from('clientes').upsert(arr.slice(i, i + 200), { onConflict: 'doc_tipo,doc_num' }); if (error) throw error; }
      const n = await generarFaltantes();
      aviso(`Listo: ${total} clientes cargados. Claves nuevas generadas: ${n}.`); editor(cfg, c);
    } catch (x) { fail(x); }
  } });
  async function generarFaltantes() {
    const { data, error } = await sb.from('clientes').select('id,clave').or('clave.is.null,clave.eq.').limit(2000); if (error) throw error;
    const ids = (data ?? []).map((x: any) => x.id);
    for (let i = 0; i < ids.length; i += 20) await Promise.all(ids.slice(i, i + 20).map((id: number) => sb.from('clientes').update({ clave: nuevaClave() }).eq('id', id)));
    return ids.length;
  }
  const cfg: Cfg = { tabla: 'clientes', pk: 'id', filtro: true, orden: [['nombre', true]], limite: 2000, titulo: (x) => `${x.activo === false ? '⛔ ' : ''}${x.nombre} · ${x.doc_tipo} ${x.doc_num}${x.clave ? ' · clave ' + x.clave : ' · SIN CLAVE'}`,
    nuevo: () => ({ doc_tipo: 'RUC', doc_num: '', nombre: '', whatsapp: '', ciudad: '', tipo_negocio: '', lista_id: null, clave: nuevaClave(), activo: true, notas: '' }),
    campos: [{ k: 'doc_tipo', l: 'Documento', t: 'sel', o: [['RUC', 'RUC'], ['DNI', 'DNI']] }, { k: 'doc_num', l: 'Número' }, { k: 'nombre', l: 'Razón social / nombre' }, { k: 'whatsapp', l: 'WhatsApp' },
      { k: 'ciudad', l: 'Ciudad' }, { k: 'tipo_negocio', l: 'Tipo de negocio' }, { k: 'lista_id', l: 'Lista de precios asignada', t: 'sel', o: listas }, { k: 'clave', l: 'Clave de acceso (6 dígitos)' }, { k: 'activo', l: 'Activo (puede entrar a cotizar)', t: 'bool' }, { k: 'notas', l: 'Notas', t: 'area' }, { k: 'desc_contado', l: 'Condiciones comerciales · Descuento por pago al contado (%) — vacío = no aplica (ej. 2)', t: 'num' }],
    extra: (x, rec) => h('span', { class: 'row', style: 'margin:0' },
      h('button', { class: 'b s', type: 'button', textContent: 'Generar clave nueva', onclick: async () => { if (x.clave && !confirm('Se reemplazará la clave actual. ¿Continuar?')) return; const { error } = await sb.from('clientes').update({ clave: nuevaClave(), intentos: 0, bloqueo_hasta: null }).eq('id', x.id); error ? fail(error) : (aviso('Clave nueva generada'), rec()); } }),
      x.whatsapp && x.clave ? h('a', { href: `https://wa.me/51${x.whatsapp}?text=${encodeURIComponent(`Hola ${x.nombre}, tu acceso para cotizar con tus precios en la web de PROLIMSO Zona Sur:\nUsuario: tu ${x.doc_tipo} ${x.doc_num}\nClave: ${x.clave}\nIngresa en la página y pulsa "Cotiza tu pedido".`)}`, target: '_blank', rel: 'noopener', textContent: 'Enviar clave por WhatsApp' }) : null),
    barra: () => [
      h('button', { class: 'b g', type: 'button', textContent: 'Importar clientes (Excel)', onclick: () => importar.click() }), importar,
      h('button', { class: 'b s', type: 'button', textContent: 'Generar claves faltantes', onclick: async () => { try { const n = await generarFaltantes(); aviso(`Claves generadas: ${n}`); editor(cfg, c); } catch (x) { fail(x); } } }),
    ] };
  r.append(c);
  await editor(cfg, c);
};

P['Precios'] = async (r) => {
  const { data: listas } = await sb.from('listas_precio').select('*').order('orden');
  const sel = h('select', {}, ...(listas ?? []).map((l: any) => h('option', { value: l.id, textContent: l.nombre })));
  const zona = h('div');
  r.append(h('h2', { textContent: 'Listas de precios' }), h('p', { class: 'hint', textContent: 'Solo tú ves esto. "Vigente" es el precio actual; "Nuevo" es el precio que entrará cuando renueves la lista. Importa el Excel o edita a mano.' }),
    h('div', { class: 'row' }, h('label', {}, 'Lista', sel),
      h('button', { class: 'b s', type: 'button', textContent: '+ Crear lista', onclick: async () => {
        const n = prompt('Nombre de la nueva lista'); if (!n) return; const con = confirm('¿Esta lista lleva precios?\nAceptar = con precios · Cancelar = solo nombres');
        const { error } = await sb.from('listas_precio').insert({ nombre: n.trim(), con_precios: con, orden: (listas?.length ?? 0) + 1 }); error ? fail(error) : (aviso('Lista creada. Recarga la pestaña.')); } })), zona);
  const cargar = async () => {
    const lista = (listas ?? []).find((l: any) => String(l.id) === sel.value); if (!lista) return;
    const { data, error } = await sb.from('precios').select('*').eq('lista_id', lista.id).order('codigo').limit(1500); if (error) return fail(error);
    const filas: any[] = data ?? [];
    const cols: [string, string][] = [['codigo', 'Código'], ['descripcion', 'Descripción'], ['unidades_empaque', 'Unid./empq.'], ['precio_unidad', 'Vigente c/u'], ['precio_empaque', 'Vigente empq.'], ['nuevo_unidad', 'Nuevo c/u'], ['nuevo_empaque', 'Nuevo empq.']];
    const cuerpo = h('tbody');
    const pintar = (t: string) => cuerpo.replaceChildren(...filas.filter((f) => !t || (f.codigo + f.descripcion).toLowerCase().includes(t)).map((f) => {
      const tr = h('tr'); tr.dataset.cod = f.codigo;
      const ins: Record<string, any> = {};
      for (const [k] of cols) {
        const num = !['codigo', 'descripcion'].includes(k);
        const i = h('input', { value: f[k] ?? '', type: num ? 'number' : 'text', step: 'any', disabled: k === 'codigo', style: k === 'descripcion' ? 'min-width:260px' : 'min-width:80px' });
        ins[k] = i;
        i.addEventListener('input', () => { f[k] = num ? (i.value === '' ? null : Number(i.value)) : i.value; f.__mod = true;
          const par: Record<string, string> = { precio_unidad: 'precio_empaque', nuevo_unidad: 'nuevo_empaque' };
          if (par[k] && f.unidades_empaque > 0) { f[par[k]] = f[k] == null ? null : Math.round(f[k] * f.unidades_empaque * 100) / 100; ins[par[k]].value = f[par[k]] ?? ''; } });
        tr.append(h('td', {}, i));
      }
      return tr;
    }));
    pintar('');
    const file = h('input', { type: 'file', accept: '.xlsx' });
    const imp = h('div');
    file.addEventListener('change', () => importar(file.files![0], lista, imp, cargar));
    zona.replaceChildren(
      h('div', { class: 'card' }, h('strong', { textContent: 'Importar desde Excel' }), h('p', { class: 'hint', textContent: lista.con_precios ? 'Sube el .xlsx de la lista. Elige las hojas y revisa antes de aplicar.' : 'Esta lista es solo de nombres: se importan códigos y descripciones, sin precios.' }), file, imp),
      h('div', { class: 'row' },
        h('input', { type: 'search', placeholder: 'Buscar código o producto…', style: 'max-width:300px', oninput: (e: any) => pintar(e.target.value.trim().toLowerCase()) }),
        h('button', { class: 'b', type: 'button', textContent: 'Guardar cambios', onclick: async () => {
          const mod = filas.filter((f) => f.__mod).map(({ __mod, ...x }) => x); if (!mod.length) return aviso('No hay cambios');
          const { error } = await sb.from('precios').upsert(mod, { onConflict: 'lista_id,codigo' }); if (error) return fail(error); filas.forEach((f) => delete f.__mod); aviso(`${mod.length} precios guardados`); } }),
        lista.con_precios ? h('button', { class: 'b g', type: 'button', textContent: 'Pasar precios NUEVOS a vigentes', onclick: async () => {
          if (!confirm('Los precios "Nuevo" pasarán a ser "Vigente" y las columnas Nuevo quedarán vacías. ¿Continuar?')) return;
          const con = filas.filter((f) => f.nuevo_empaque != null || f.nuevo_unidad != null).map(({ __mod, ...f }) => ({ ...f, precio_unidad: f.nuevo_unidad ?? f.precio_unidad, precio_empaque: f.nuevo_empaque ?? f.precio_empaque, nuevo_unidad: null, nuevo_empaque: null, vigente_desde: new Date().toISOString().slice(0, 10) }));
          if (!con.length) return aviso('No hay precios nuevos');
          const { error } = await sb.from('precios').upsert(con, { onConflict: 'lista_id,codigo' }); error ? fail(error) : (aviso(`${con.length} precios actualizados`), cargar()); } }) : null),
      h('p', { class: 'hint', textContent: `${filas.length} filas` }),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ...cols.map(([, l]) => h('th', { textContent: l })))), cuerpo)));
  };
  sel.addEventListener('change', cargar); cargar();
};

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const nv = (v: any) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null);
function mapear(filas: any[][]) {
  const hi = filas.findIndex((f) => norm(f[0]).startsWith('cod') || norm(f[0]) === 'sku'); if (hi < 0) return [];
  const H = filas[hi].map(norm); const idx = (fn: (x: string) => boolean) => H.findIndex(fn);
  const m = {
    desc: idx((x) => /producto|descrip|linea/.test(x) && !/nuevo/.test(x)),
    emp: idx((x) => x === 'empq' || x === 'empaque' || x === 'empq.'),
    und: idx((x) => (x === 'und' || x === 'unid' || x === 'precio und') && true),
    pemp: idx((x) => /precio/.test(x) && /emp|pqte/.test(x) && !/nuevo/.test(x)),
    nund: idx((x) => /nuevo/.test(x) && /und|unid/.test(x)),
    nemp: idx((x) => /nuevo/.test(x) && /precio/.test(x)),
  };
  const out: any[] = [];
  for (const f of filas.slice(hi + 1)) {
    const cod = String(f[0] ?? '').replace(/\s+/g, ' ').trim(); if (!cod || !/\d/.test(cod) || cod.length > 20) continue;
    const empaque = m.emp >= 0 ? Number(f[m.emp]) : NaN;
    out.push({ codigo: cod, descripcion: String(f[m.desc >= 0 ? m.desc : 1] ?? '').replace(/\s+/g, ' ').trim(), unidades_empaque: isFinite(empaque) && empaque > 0 ? Math.round(empaque) : null,
      precio_unidad: m.und >= 0 ? nv(f[m.und]) : null, precio_empaque: m.pemp >= 0 ? nv(f[m.pemp]) : null, nuevo_unidad: m.nund >= 0 ? nv(f[m.nund]) : null, nuevo_empaque: m.nemp >= 0 ? nv(f[m.nemp]) : null });
  }
  return out;
}
async function importar(file: File | undefined, lista: any, dest: HTMLElement, recargar: () => void) {
  if (!file) return;
  try {
    const hojas = await readSheetNames(file);
    const checks = hojas.map((n) => ({ n, c: h('input', { type: 'checkbox', checked: !/cuenta|detergente|kids|quimico/i.test(n) }) }));
    const res = h('p', { class: 'hint' });
    const todo: any[] = [];
    dest.replaceChildren(h('p', { class: 'hint', textContent: 'Marca las hojas que corresponden a esta lista:' }), ...checks.map((x) => h('label', { style: 'display:flex;gap:.4rem;align-items:center' }, x.c, x.n)),
      h('div', { class: 'row' }, h('button', { class: 'b s', type: 'button', textContent: 'Revisar', onclick: async () => {
        todo.length = 0;
        for (const x of checks) if (x.c.checked) { const filas = await readXlsxFile(file, { sheet: x.n }); todo.push(...mapear(filas as any[][])); }
        const ult = new Map(todo.map((t) => [t.codigo, t])); todo.length = 0; todo.push(...ult.values());
        res.textContent = `Se aplicarán ${todo.length} productos a "${lista.nombre}". Ejemplo: ${todo.slice(0, 2).map((t) => `${t.codigo} ${t.descripcion} ${t.precio_empaque ?? ''}`).join(' | ')}`;
      } }), h('button', { class: 'b', type: 'button', textContent: 'Aplicar a esta lista', onclick: async () => {
        if (!todo.length) return aviso('Primero pulsa Revisar');
        const filas = todo.map((t) => ({ ...t, lista_id: lista.id, ...(lista.con_precios ? {} : { precio_unidad: null, precio_empaque: null, nuevo_unidad: null, nuevo_empaque: null }) }));
        for (let i = 0; i < filas.length; i += 200) { const { error } = await sb.from('precios').upsert(filas.slice(i, i + 200), { onConflict: 'lista_id,codigo' }); if (error) return fail(error); }
        aviso('Lista actualizada'); recargar();
      } })), res);
  } catch (e) { fail(e); }
}

P['Productos'] = async (r) => {
  const cats = await opts('categorias', 'id', 'nombre', '— Sin categoría —');
  const fotos = h('div', { class: 'card' }, h('strong', { textContent: 'Subir fotos en bloque (quedan todas del mismo tamaño, con fondo blanco)' }),
    h('p', { class: 'hint', textContent: 'Elige todas las fotos juntas. Si el archivo se llama como el código (ej. DETER004.jpg) se asigna solo; si no, escoge el producto en la lista y pulsa "Subir fotos".' }));
  const resu = h('p', { class: 'hint' });
  const lista = h('div'); const dprods: any[] = []; let pend: { f: File; sel: HTMLSelectElement }[] = [];
  const btn = h('button', { class: 'b g', type: 'button', textContent: 'Subir fotos', style: 'display:none;margin-top:8px', onclick: async () => {
    let ok = 0, mal: string[] = []; btn.setAttribute('disabled', '1');
    for (const it of pend) {
      const pr = dprods.find((p) => String(p.id) === it.sel.value); if (!pr) { mal.push(it.f.name + ' (sin producto)'); continue; }
      try { await subirFotoProducto(it.f, pr); ok++; resu.textContent = `Subidas: ${ok} de ${pend.length}…`; } catch (x) { mal.push(it.f.name + ' (error)'); console.error(x); }
    }
    btn.removeAttribute('disabled'); resu.textContent = `Listo. Subidas: ${ok}.${mal.length ? ' Con problema: ' + mal.join(', ') : ''} Recarga con Ctrl+F5 para ver todo.`;
  } });
  fotos.append(h('input', { type: 'file', multiple: true, accept: 'image/*', onchange: async (e: any) => {
    const archivos: File[] = [...e.target.files]; if (!archivos.length) return;
    const { data } = await sb.from('productos').select('id,slug,nombre,codigos,foto_url').order('nombre').limit(2000);
    dprods.length = 0; dprods.push(...(data ?? [])); pend = []; lista.innerHTML = '';
    for (const f of archivos) {
      const clave = f.name.replace(/\.[^.]+$/, '').trim().toLowerCase();
      const auto = dprods.find((p: any) => p.slug === clave || (p.codigos ?? []).some((c: string) => c.toLowerCase() === clave));
      const sel = h('select', {}, h('option', { value: '', textContent: '— elige el producto —' }), ...dprods.map((p: any) => h('option', { value: String(p.id), textContent: `${p.nombre} · ${(p.codigos ?? []).join(' ')}${p.foto_url ? '' : ' (sin foto)'}` }))) as HTMLSelectElement;
      if (auto) sel.value = String(auto.id);
      pend.push({ f, sel });
      lista.append(h('div', { style: 'display:flex;gap:8px;align-items:center;margin:6px 0' }, h('img', { src: URL.createObjectURL(f), style: 'width:56px;height:56px;object-fit:contain;background:#fff;border:1px solid #ddd' }), h('span', { textContent: f.name, style: 'min-width:140px;font-size:12px' }), sel));
    }
    btn.style.display = ''; resu.textContent = `${archivos.length} fotos listas. Revisa la lista y pulsa "Subir fotos".`;
  } }), lista, btn, resu);
  const c = h('div');
  const normInfo = h('p', { class: 'hint' });
  const normCard = h('div', { class: 'card' }, h('strong', { textContent: 'Uniformar todas las fotos del catálogo' }),
    h('p', { class: 'hint', textContent: 'Recorta márgenes y centra cada foto en un cuadrado blanco del mismo tamaño. Tarda unos minutos; no cierres la página hasta que diga "Listo".' }),
    h('button', { class: 'b g', type: 'button', textContent: 'Uniformar fotos ahora', onclick: async (e: any) => {
      const b = e.target as HTMLButtonElement; b.disabled = true;
      const { data } = await sb.from('productos').select('id,slug,foto_url').neq('foto_url', '').not('foto_url', 'is', null).limit(2000);
      const lista = (data ?? []) as any[]; let ok = 0; const mal: string[] = [];
      for (const pr of lista) {
        try {
          const resp = await fetch(pr.foto_url.split('?')[0]); if (!resp.ok) throw new Error('descarga ' + resp.status);
          const blob = await resp.blob();
          await subirFotoProducto(new File([blob], pr.slug + '.img', { type: blob.type || 'image/webp' }), pr);
          ok++; normInfo.textContent = `Procesadas ${ok} de ${lista.length}…`;
        } catch (x) { mal.push(pr.slug); console.error(x); }
      }
      normInfo.textContent = `Listo. Uniformadas: ${ok} de ${lista.length}.${mal.length ? ' Con problema: ' + mal.join(', ') : ''} Pulsa Ctrl+F5 para verlas.`; b.disabled = false;
    } }), normInfo);
  const { data: conFoto } = await sb.from('productos').select('id,slug,nombre,foto_url').neq('foto_url', '').not('foto_url', 'is', null).order('nombre').limit(2000);
  const ajProd = h('select', {}, h('option', { value: '', textContent: '— elige el producto —' }), ...(conFoto ?? []).map((p: any) => h('option', { value: String(p.id), textContent: p.nombre }))) as HTMLSelectElement;
  const ajTam = h('select', {}, h('option', { value: '0.78', textContent: 'Un poco más chico (78%)' }), h('option', { value: '0.70', textContent: 'Más chico (70%)' }), h('option', { value: '0.62', textContent: 'Mucho más chico (62%)' }), h('option', { value: '0.86', textContent: 'Normal (86%)' }), h('option', { value: '0.92', textContent: 'Más grande (92%)' })) as HTMLSelectElement;
  const ajInfo = h('p', { class: 'hint' });
  const ajCard = h('div', { class: 'card' }, h('strong', { textContent: 'Ajustar el tamaño de una foto' }),
    h('p', { class: 'hint', textContent: 'Si una foto se ve más grande o más chica que las demás en el catálogo, elígela aquí y cambia su tamaño dentro del cuadro. No necesitas volver a subirla.' }),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, ajProd, ajTam,
      h('button', { class: 'b g', type: 'button', textContent: 'Aplicar', onclick: async (e: any) => {
        const pr = (conFoto ?? []).find((p: any) => String(p.id) === ajProd.value); if (!pr) { ajInfo.textContent = 'Elige primero el producto.'; return; }
        const b = e.target as HTMLButtonElement; b.disabled = true; ajInfo.textContent = 'Procesando…';
        try {
          const resp = await fetch(pr.foto_url.split('?')[0]); if (!resp.ok) throw new Error('descarga ' + resp.status);
          const blob = await resp.blob();
          await subirFotoProducto(new File([blob], pr.slug + '.img', { type: blob.type || 'image/webp' }), pr, parseFloat(ajTam.value));
          ajInfo.textContent = 'Listo. Pulsa Ctrl+F5 en la web para verla.';
        } catch (x) { console.error(x); ajInfo.textContent = 'No se pudo: ' + ((x as any)?.message || x); }
        b.disabled = false;
      } })), ajInfo);
  r.append(h('h2', { textContent: 'Productos' }), fotos, normCard, ajCard, c);
  await editor({ tabla: 'productos', pk: 'id', filtro: true, orden: [['orden', true], ['nombre', true]], titulo: (x) => `${x.activo ? '' : '[oculto] '}${x.nombre}${x.campana ? ' · campaña' : ''}`,
    nuevo: () => ({ consultar: false, slug: '', nombre: '', categoria_id: null, descripcion: '', colores: '', medidas: '', litros: '', unidades_empaque: 12, empaque_nombre: 'empaque', codigos: [], campana: false, destacado: false, activo: true, orden: 0, foto_url: '', galeria: [], video_url: '' }),
    campos: [{ k: 'nombre', l: 'Nombre' }, { k: 'slug', l: 'Identificador (sin espacios)' }, { k: 'categoria_id', l: 'Categoría', t: 'sel', o: cats }, { k: 'unidades_empaque', l: 'Unidades por empaque', t: 'num' }, { k: 'bulto_emp', l: 'Venta mínima (empaques por bulto)', t: 'num' }, { k: 'consultar', l: 'Consultar disponibilidad (descontinuado / sin stock fijo)', t: 'bool' }, { k: 'empaque_nombre', l: 'Nombre del empaque (caja, docena…)' },
      { k: 'codigos', l: 'Códigos (separados por coma)', t: 'arr', full: true }, { k: 'colores', l: 'Colores' }, { k: 'medidas', l: 'Medidas' }, { k: 'litros', l: 'Litros' }, { k: 'descripcion', l: 'Descripción', t: 'area' },
      { k: 'foto_url', l: 'Foto principal', t: 'file', carpeta: 'fotos', full: true }, { k: 'video_url', l: 'Video (opcional)', t: 'file', accept: 'video/*', carpeta: 'videos', maxMB: 20, full: true },
      { k: 'campana', l: 'Es de campaña', t: 'bool' }, { k: 'destacado', l: 'Destacado', t: 'bool' }, { k: 'activo', l: 'Visible en la web', t: 'bool' }, { k: 'orden', l: 'Orden', t: 'num' }] }, c);
};

P['Negocio y modo'] = async (r) => {
  r.append(h('h2', { textContent: 'Negocio, modo campaña y música' }), h('p', { class: 'hint', textContent: 'Cambia aquí entre "Campaña navideña" (morado) y "Todo el año" (azul). Con fechas, la campaña se apaga sola al terminar.' }));
  const c = h('div'); r.append(c);
  await editor({ tabla: 'negocio', pk: 'id', sinNuevo: true, sinBorrar: true, titulo: () => 'Datos del negocio', nuevo: () => ({}),
    campos: [{ k: 'modo', l: 'Modo de la web', t: 'sel', o: [['campana', 'Campaña navideña (morado)'], ['normal', 'Todo el año (azul)']] }, { k: 'campana_inicio', l: 'Campaña desde', t: 'date' }, { k: 'campana_fin', l: 'Campaña hasta', t: 'date' },
      { k: 'campana_titulo', l: 'Título (campaña)', full: true }, { k: 'campana_texto', l: 'Texto (campaña)', t: 'area' }, { k: 'normal_titulo', l: 'Título (todo el año)', full: true }, { k: 'normal_texto', l: 'Texto (todo el año)', t: 'area' }, { k: 'campana_etiqueta', l: 'Etiqueta sobre el título (campaña; vacío = Campaña navideña)', full: true }, { k: 'normal_etiqueta', l: 'Etiqueta sobre el título (todo el año; vacío = nombre del negocio)', full: true },
      { k: 'aviso_minimo', l: 'Aviso de montos mínimos', t: 'area' }, { k: 'mensaje_whatsapp', l: 'Primera línea del mensaje de WhatsApp' }, { k: 'gracias_texto', l: 'Texto de la página de gracias', t: 'area' }, { k: 'pago_texto', l: 'Aviso de la página Cómo pagar', t: 'area' },
      { k: 'musica_url', l: 'Música (MP3 menor a 2 MB, libre de derechos)', t: 'file', accept: 'audio/*', carpeta: 'musica', maxMB: 2, full: true }, { k: 'musica_volumen', l: 'Volumen (0 a 1)', t: 'num' }, { k: 'musica_activa', l: 'Mostrar botón de música', t: 'bool' },
      { k: 'nombre', l: 'Nombre del sitio' }, { k: 'eslogan', l: 'Eslogan' }, { k: 'whatsapp', l: 'WhatsApp (con 51, sin +)' }, { k: 'telefono', l: 'Teléfono visible' }, { k: 'email', l: 'Correo' }, { k: 'direccion', l: 'Dirección' }, { k: 'horario', l: 'Horario' },
      { k: 'legal_razon', l: 'Tu empresa: razón social (para textos legales)', full: true }, { k: 'legal_ruc', l: 'Tu empresa: RUC' }, { k: 'legal_email', l: 'Tu empresa: correo para reclamos y datos' }, { k: 'legal_direccion', l: 'Tu empresa: domicilio legal', full: true }, { k: 'prov_razon', l: 'Proveedor que factura (ej. PROLIMSO S.A.C.)' }, { k: 'prov_ruc', l: 'RUC del proveedor' },
      { k: 'facebook_url', l: 'Enlace de tu página de Facebook (https://…)', full: true }, { k: 'instagram_url', l: 'Enlace de tu Instagram (https://…)', full: true }, { k: 'tiktok_url', l: 'Enlace de tu TikTok (https://…)', full: true },
      { k: 'pixel_meta', l: 'ID Pixel de Meta' }, { k: 'pixel_tiktok', l: 'ID Pixel de TikTok' }, { k: 'ga4', l: 'ID de Google Analytics (G-…)' }] }, c);
};

P['Reclamos'] = async (r) => {
  const { data, error } = await sb.from('reclamos').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) { r.append('Error: ' + error.message + ' (¿ejecutaste legal-reclamos.sql en Supabase?)'); return; }
  const lista = (data ?? []) as any[];
  const pend = lista.filter((x) => x.estado === 'pendiente').length;
  r.append(h('h2', { textContent: 'Libro de Reclamaciones' }), h('p', { class: 'hint', textContent: `Tienes ${pend} pendiente(s). Debes responder cada reclamo en un máximo de 30 días calendario.` }));
  if (!lista.length) { r.append(h('p', { textContent: 'Aún no hay reclamos registrados.' })); return; }
  for (const x of lista) {
    const dias = Math.floor((Date.now() - new Date(x.created_at).getTime()) / 86400000);
    const est = h('select', { style: 'width:auto' }, h('option', { value: 'pendiente', textContent: 'pendiente' }), h('option', { value: 'atendido', textContent: 'atendido' })); est.value = x.estado;
    const resp = h('textarea', { style: 'min-height:90px', placeholder: 'Respuesta enviada al cliente…' }); resp.value = x.respuesta || '';
    r.append(h('div', { class: 'card' },
      h('div', { class: 'row', style: 'margin:0' }, h('strong', { textContent: x.codigo }), h('span', { class: 'bd ' + (x.estado === 'pendiente' ? 'B' : 'A'), textContent: x.estado }), h('span', { class: 'hint', style: 'margin:0', textContent: new Date(x.created_at).toLocaleString('es-PE') + (x.estado === 'pendiente' ? ` · hace ${dias} día(s)` : '') })),
      h('p', { textContent: `${x.tipo.toUpperCase()} · ${x.nombre} · ${x.doc_tipo} ${x.doc_num} · ${x.telefono || 'sin teléfono'} · ${x.email}` }),
      h('p', { textContent: `Domicilio: ${x.domicilio}${x.menor_edad ? ' · Menor de edad, apoderado: ' + x.apoderado : ''}` }),
      h('p', { textContent: `Sobre ${x.bien}${x.descripcion_bien ? ': ' + x.descripcion_bien : ''}${x.monto ? ' · Monto S/ ' + x.monto : ''}` }),
      h('p', { textContent: 'Detalle: ' + x.detalle }), h('p', { textContent: 'Pide: ' + x.pedido_consumidor }),
      resp,
      h('div', { class: 'row' }, est,
        h('button', { class: 'b g', type: 'button', textContent: 'Guardar respuesta', onclick: async () => {
          const { error: e } = await sb.from('reclamos').update({ estado: est.value, respuesta: resp.value, fecha_respuesta: est.value === 'atendido' ? new Date().toISOString().slice(0, 10) : null }).eq('id', x.id);
          e ? fail(e) : aviso('Guardado.'); } }),
        h('a', { href: `mailto:${x.email}?subject=${encodeURIComponent('Respuesta a tu reclamo ' + x.codigo)}`, textContent: 'Escribir al correo' }),
        x.telefono ? h('a', { href: `https://wa.me/51${String(x.telefono).replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '')}`, target: '_blank', rel: 'noopener', textContent: 'WhatsApp' }) : null)));
  }
};

P['Transportistas'] = async (r) => {
  r.append(h('h2', { textContent: 'Transportistas (agencias)' }), h('p', { class: 'hint', textContent: 'Lista que ven los clientes de cartera al cerrar su pedido. El teléfono/datos que escribas aquí se autocompletan al elegir la agencia (si el cliente ya usó esa agencia, se usa lo que él puso). Busca por nombre, RUC o dirección.' }));
  const c = h('div'); r.append(c);
  await editor({ tabla: 'transportistas', pk: 'id', filtro: true, limite: 3000, orden: [['nombre', true]], titulo: (x) => `${x.activo ? '' : '[oculto] '}${x.nombre}${x.telefono ? ' · ' + x.telefono : ''}`, nuevo: () => ({ codigo: '', nombre: '', direccion: '', ruc: '', telefono: '', activo: true }),
    campos: [{ k: 'nombre', l: 'Agencia / razón social' }, { k: 'telefono', l: 'Teléfono / datos (se autocompleta en el pedido)' }, { k: 'direccion', l: 'Dirección' }, { k: 'ruc', l: 'RUC' }, { k: 'codigo', l: 'Código' }, { k: 'activo', l: 'Visible para clientes', t: 'bool' }] }, c);
};

P['Cuentas'] = async (r) => {
  r.append(h('h2', { textContent: 'Cuentas para depósito' }), h('p', { class: 'hint', textContent: 'Se publican como texto con botón "Copiar" en la página Cómo pagar.' }));
  const c = h('div'); r.append(c);
  await editor({ tabla: 'cuentas_bancarias', pk: 'id', orden: [['orden', true]], titulo: (x) => `${x.banco} · ${x.etiqueta}`, nuevo: () => ({ banco: '', titular: '', etiqueta: 'Cuenta', numero: '', cci: '', codigo_agente: '', orden: 0, activa: true }),
    campos: [{ k: 'banco', l: 'Banco' }, { k: 'etiqueta', l: 'Etiqueta (Cuenta soles, Cuenta dólares…)' }, { k: 'titular', l: 'Titular' }, { k: 'numero', l: 'Número de cuenta' }, { k: 'cci', l: 'CCI' }, { k: 'codigo_agente', l: 'Código de agente' }, { k: 'orden', l: 'Orden', t: 'num' }, { k: 'activa', l: 'Visible', t: 'bool' }] }, c);
};

P['Fotos y videos'] = async (r) => {
  r.append(h('h2', { textContent: 'Fotos y videos (9:16 y 16:9)' }), h('p', { class: 'hint', textContent: 'Cada espacio acepta una versión vertical 9:16 (celular) y una horizontal 16:9 (computadora). Sube un archivo MP4 de hasta 20 MB (recomendado: 720×1280 o 1280×720, menos de 10 MB) o pega un enlace de YouTube o Facebook para videos más largos.' }));
  const c = h('div'); r.append(c);
  await editor({ tabla: 'medios', pk: 'slot', sinNuevo: true, sinBorrar: true, orden: [['slot', true]], titulo: (x) => `${x.titulo} (${x.slot})${x.vertical_url || x.horizontal_url ? ' ✓' : ''}`, nuevo: () => ({}),
    campos: [{ k: 'titulo', l: 'Título interno' }, { k: 'tipo', l: 'Tipo', t: 'sel', o: [['foto', 'Foto'], ['video', 'Video'], ['enlace', 'Enlace']] },
      { k: 'vertical_url', l: 'Versión vertical 9:16 (sube un archivo, o pega un enlace de YouTube o Facebook)', t: 'file', accept: 'image/*,video/*', carpeta: 'medios', maxMB: 20, full: true }, { k: 'horizontal_url', l: 'Versión horizontal 16:9 (archivo o enlace de YouTube o Facebook)', t: 'file', accept: 'image/*,video/*', carpeta: 'medios', maxMB: 20, full: true },
      { k: 'alt', l: 'Descripción (accesibilidad)' }, { k: 'boton_texto', l: 'Texto del botón' }, { k: 'boton_url', l: 'Enlace del botón' }, { k: 'activo', l: 'Visible', t: 'bool' }] }, c);
};

P['Categorías y segmentos'] = async (r) => {
  r.append(h('h2', { textContent: 'Categorías' }));
  const a = h('div'); r.append(a, h('h2', { textContent: 'Segmentos (tipos de negocio)', style: 'margin-top:1.4rem' }));
  const b = h('div'); r.append(b);
  await editor({ tabla: 'categorias', pk: 'id', orden: [['orden', true]], titulo: (x) => x.nombre, nuevo: () => ({ nombre: '', slug: '', orden: 0, activa: true }),
    campos: [{ k: 'nombre', l: 'Nombre' }, { k: 'slug', l: 'Identificador' }, { k: 'orden', l: 'Orden', t: 'num' }, { k: 'activa', l: 'Visible', t: 'bool' }] }, a);
  await editor({ tabla: 'segmentos', pk: 'slug', orden: [['orden', true]], titulo: (x) => x.titulo, nuevo: () => ({ slug: '', titulo: '', texto: '', orden: 0, activo: true }),
    campos: [{ k: 'titulo', l: 'Título' }, { k: 'slug', l: 'Identificador' }, { k: 'texto', l: 'Texto', t: 'area' }, { k: 'orden', l: 'Orden', t: 'num' }, { k: 'activo', l: 'Visible', t: 'bool' }] }, b);
};

// ---------- Arranque: acceso y menú ----------
function login(motivo = '') {
  const e = h('input', { type: 'email', placeholder: 'Correo', autocomplete: 'username' }), p = h('input', { type: 'password', placeholder: 'Contraseña', autocomplete: 'current-password' });
  const err = h('p', { style: 'color:#b3261e', textContent: motivo });
  const go = async () => {
    err.textContent = ''; const { error } = await sb.auth.signInWithPassword({ email: e.value.trim(), password: p.value });
    if (error) { err.textContent = 'Correo o contraseña incorrectos.'; return; } arrancar();
  };
  p.addEventListener('keydown', (k) => { if (k.key === 'Enter') go(); });
  app.replaceChildren(h('div', { class: 'card login' }, h('h2', { textContent: 'Administrador' }), e, p, h('button', { class: 'b', type: 'button', textContent: 'Entrar', onclick: go }), err));
}
async function arrancar() {
  const { data: { session } } = await sb.auth.getSession(); if (!session) return login();
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) { await sb.auth.signOut(); return login('Esta cuenta no tiene permiso de administrador.'); }
  const nombres = Object.keys(P); const cont = h('main');
  const nav = h('nav');
  const ir = async (n: string) => { nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.textContent === n))); cont.replaceChildren(); try { await P[n](cont); } catch (x) { fail(x); } };
  nombres.forEach((n) => nav.append(h('button', { type: 'button', textContent: n, onclick: () => ir(n) })));
  app.replaceChildren(h('header', {}, h('b', { textContent: 'PROLIMSO Zona Sur · Administrador' }), h('div', {}, h('a', { href: '/', target: '_blank', style: 'color:#fff;margin-right:1rem', textContent: 'Ver web' }), h('button', { class: 'b g', type: 'button', textContent: 'Salir', onclick: async () => { await sb.auth.signOut(); login(); } }))), nav, cont);
  ir(nombres[0]);
}
arrancar();
