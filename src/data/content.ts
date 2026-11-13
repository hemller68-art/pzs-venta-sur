import { supabase } from '../lib/supabase';
import { negocioBase } from './negocio';
import type { Categoria, Cuenta, Medio, Negocio, Producto, Segmento } from './types';

// Caché corta para no consultar Supabase en cada visita.
const TTL = 30_000;
const cache = new Map<string, { t: number; v: unknown }>();
async function cached<T>(k: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  try {
    const v = await fn();
    cache.set(k, { t: Date.now(), v });
    return v;
  } catch (e) {
    // Si Supabase falla se usa el último dato bueno (o el de respaldo) y se reintenta en 10 s.
    console.error(`[content:${k}]`, e);
    const v = (hit?.v as T) ?? fallback;
    cache.set(k, { t: Date.now() - TTL + 10_000, v });
    return v;
  }
}

export async function getNegocio(): Promise<Negocio> {
  return cached('negocio', async () => {
    const sb = supabase();
    if (!sb) return negocioBase;
    const { data, error } = await sb.from('negocio').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    if (!data) return negocioBase;
    const limpio = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
    return { ...negocioBase, ...limpio } as Negocio;
  }, negocioBase);
}

/** Modo vigente: campaña solo si el interruptor está en campaña y la fecha de hoy cae dentro del rango (si hay rango). */
export function modoVigente(n: Negocio): 'campana' | 'normal' {
  if (n.modo !== 'campana') return 'normal';
  const hoy = new Date().toISOString().slice(0, 10);
  if (n.campana_inicio && hoy < n.campana_inicio) return 'normal';
  if (n.campana_fin && hoy > n.campana_fin) return 'normal';
  return 'campana';
}

export async function getCategorias(): Promise<Categoria[]> {
  return cached('categorias', async () => {
    const sb = supabase();
    if (!sb) return [];
    const { data, error } = await sb.from('categorias').select('id,nombre,slug,orden').eq('activa', true).order('orden').order('nombre');
    if (error) throw error;
    return (data ?? []) as Categoria[];
  }, [] as Categoria[]);
}

const PCOLS = 'id,slug,nombre,categoria_id,descripcion,colores,medidas,litros,unidades_empaque,bulto_emp,consultar,empaque_nombre,codigos,campana,destacado,orden,foto_url,galeria,video_url';
export async function getProductos(): Promise<Producto[]> {
  return cached('productos', async () => {
    const sb = supabase();
    if (!sb) return [];
    const { data, error } = await sb.from('productos').select(PCOLS).eq('activo', true).order('orden').order('nombre').limit(1000);
    if (error) throw error;
    return (data ?? []) as Producto[];
  }, [] as Producto[]);
}

export async function getMedios(): Promise<Record<string, Medio>> {
  return cached('medios', async () => {
    const sb = supabase();
    if (!sb) return {};
    const { data, error } = await sb.from('medios').select('slot,titulo,tipo,vertical_url,horizontal_url,alt,boton_texto,boton_url').eq('activo', true);
    if (error) throw error;
    return Object.fromEntries(((data ?? []) as Medio[]).filter((m) => m.vertical_url || m.horizontal_url).map((m) => [m.slot, m]));
  }, {} as Record<string, Medio>);
}

export async function getCuentas(): Promise<Cuenta[]> {
  return cached('cuentas', async () => {
    const sb = supabase();
    if (!sb) return [];
    const { data, error } = await sb.from('cuentas_bancarias').select('id,banco,titular,etiqueta,numero,cci,codigo_agente').eq('activa', true).order('orden');
    if (error) throw error;
    return (data ?? []) as Cuenta[];
  }, [] as Cuenta[]);
}

export async function getSegmentos(): Promise<Segmento[]> {
  return cached('segmentos', async () => {
    const sb = supabase();
    if (!sb) return [];
    const { data, error } = await sb.from('segmentos').select('slug,titulo,texto').eq('activo', true).order('orden');
    if (error) throw error;
    return (data ?? []) as Segmento[];
  }, [] as Segmento[]);
}
