import { supabase } from './supabase';
import { getProductos } from '../data/content';
import type { Bonif } from './escala';

export interface Acceso { ok: boolean; ultimo?: any; motivo?: string; nombre?: string; dc?: number; lista?: string; conPrecios?: boolean; precios?: Record<string, { u: number | null; e: number; esc?: Array<{ d: number; x?: number; u?: number }> | null; g?: string | null; bon?: Bonif | null }> }

/** Verifica RUC/DNI + clave en Supabase y devuelve los precios de SU lista, indexados por producto (slug). */
export async function accesoCliente(doc: string, clave: string): Promise<Acceso> {
  const sb = supabase();
  if (!sb) return { ok: false, motivo: 'servicio' };
  const { data, error } = await sb.rpc('cliente_acceso', { p_doc: doc, p_clave: clave });
  if (error || !data) return { ok: false, motivo: 'servicio' };
  if (!data.ok) return { ok: false, motivo: data.motivo === 'bloqueado' ? 'bloqueado' : 'invalido' };
  const porCodigo = (data.precios ?? {}) as Record<string, { u: number | null; e: number | null; esc?: Array<{ d: number; x?: number; u?: number }> | null; g?: string | null; bon?: Bonif | null }>;
  const precios: Record<string, { u: number | null; e: number; esc?: Array<{ d: number; x?: number; u?: number }> | null; g?: string | null; bon?: Bonif | null }> = {};
  if (data.con_precios) {
    const prods = await getProductos();
    for (const p of prods) {
      const c = (p.codigos || []).find((k: string) => porCodigo[k]?.e != null);
      if (c) precios[p.slug] = { u: porCodigo[c].u != null ? Number(porCodigo[c].u) : null, e: Number(porCodigo[c].e), esc: Array.isArray(porCodigo[c].esc) ? porCodigo[c].esc : null, g: porCodigo[c].g ?? null, bon: porCodigo[c].bon && porCodigo[c].bon.cada ? porCodigo[c].bon : null };
    }
    // El regalo se indica por código en la base; aquí se traduce al producto (slug) para mostrarlo en el pedido.
    for (const v of Object.values(precios)) if (v.bon?.regalo) v.bon = { ...v.bon, rs: prods.find((p) => (p.codigos || []).includes(v.bon!.regalo!))?.slug ?? null };
  }
  return { ok: true, ultimo: data.ultimo ?? null, dc: data.dc != null && Number(data.dc) > 0 ? Number(data.dc) : 0, nombre: data.nombre, lista: data.lista, conPrecios: !!data.con_precios, precios };
}
