import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;
// Cortacircuitos: si Supabase no responde, durante 15 s se deja de consultar y el sitio usa su último dato bueno.
// Así una caída de Supabase no deja cada visita esperando varios segundos.
let caidoHasta = 0;
const resistente: typeof fetch = async (input, init) => {
  if (Date.now() < caidoHasta) throw new Error('Supabase en pausa por fallos recientes');
  try {
    const r = await fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(5000) });
    if (r.status >= 500) caidoHasta = Date.now() + 15_000;
    return r;
  } catch (e) {
    caidoHasta = Date.now() + 15_000;
    throw e;
  }
};
/** Devuelve el cliente de Supabase, o null si aún no hay variables de entorno (la web usa datos de ejemplo). */
export function supabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  client ??= createClient(url!, key!, { auth: { persistSession: false }, db: { retry: false }, global: { fetch: resistente } });
  return client;
}
