// Pedido del visitante: por producto, empaques (docenas) por color. Se guarda en su navegador (con try/catch: puede estar bloqueado).
export interface Linea { slug: string; nombre: string; foto: string; uemp: number; cols: Record<string, number> }
const K = 'pzs_lista_v2';
export const MAX = 9_999_999;
let memoria: Linea[] = [];

export const suma = (l: Linea) => Object.values(l.cols).reduce((a, b) => a + b, 0);

export function leer(): Linea[] {
  try {
    const raw = localStorage.getItem(K);
    if (!raw) return memoria;
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return memoria;
    memoria = a.filter((l) => l && typeof l.slug === 'string' && l.cols && typeof l.cols === 'object' && suma(l) > 0).slice(0, 80);
    return memoria;
  } catch { return memoria; }
}
function guardar(l: Linea[]) {
  memoria = l;
  try { localStorage.setItem(K, JSON.stringify(l)); } catch { /* sin almacenamiento: queda en memoria de la página */ }
  window.dispatchEvent(new CustomEvent('lista:change'));
}
export function ponerLinea(base: Omit<Linea, 'cols'>, cols: Record<string, number>) {
  const limpio: Record<string, number> = {};
  for (const [k, v] of Object.entries(cols)) { const n = Math.max(0, Math.min(MAX, Math.floor(v))); if (n > 0) limpio[k.slice(0, 40)] = n; }
  const resto = leer().filter((x) => x.slug !== base.slug);
  guardar(Object.keys(limpio).length ? [...resto, { ...base, cols: limpio }] : resto);
}
export function quitar(slug: string) { guardar(leer().filter((x) => x.slug !== slug)); }
export function vaciar() { guardar([]); }
export function totales() {
  const l = leer();
  return { empaques: l.reduce((a, x) => a + suma(x), 0), unidades: l.reduce((a, x) => a + suma(x) * x.uemp, 0), lineas: l.length };
}
