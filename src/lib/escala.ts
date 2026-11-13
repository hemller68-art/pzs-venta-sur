/** Descuento por escala (cantidad de paquetes) calculado SOBRE el precio de la matriz principal.
 *  Cada tramo: d = desde cuántos paquetes; x = descuento por unidad en soles respecto al precio base (0 en el primer tramo).
 *  Si cambias el precio en la matriz, la escala se mueve sola. (Compatibilidad: un tramo con u fijo usa ese precio exacto.)
 *  g = grupo: los paquetes de todos los productos del mismo grupo (colores de un modelo) se suman para elegir el tramo. */
export interface Tramo { d: number; x?: number; u?: number }
export interface Bonif { cada: number; uni: number; base?: 'u' | 'p'; grupo?: string; regalo?: string; rs?: string | null }
export interface PrecioBase { u: number | null; e: number; esc?: Tramo[] | null; g?: string | null; bon?: Bonif | null }
export interface PrecioFinal { u: number; e: number; promo: boolean; desde?: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function aplicarEscala(pr: PrecioBase, uemp: number, paquetes: number): PrecioFinal {
  const base = pr.u != null ? Number(pr.u) : pr.e / (uemp || 1);
  const tramos = Array.isArray(pr.esc) ? pr.esc.filter((t) => t && t.d > 0 && (t.x != null || t.u != null)) : [];
  const tramo = [...tramos].sort((a, b) => b.d - a.d).find((t) => paquetes >= t.d);
  if (!tramo) return { u: base, e: pr.e, promo: false };
  const u = r2(tramo.x != null ? base - Number(tramo.x) : Number(tramo.u));
  if (Math.abs(u - base) < 0.0001) return { u: base, e: pr.e, promo: false, desde: tramo.d };
  return { u, e: r2(u * (uemp || 1)), promo: u < base, desde: tramo.d };
}

/** Bonificación (regalo a S/ 0.00, no cambia el precio): por cada `cada` paquetes (base 'p', por defecto) o `cada` unidades (base 'u')
 *  se regalan `uni` unidades. Si varios productos comparten `grupo` se suman entre sí (ej. Swing Negro + Swing Color);
 *  el regalo es del producto `rs` (slug) o, si no lo hay, del mismo producto. Devuelve las líneas de regalo del pedido. */
export function bonosPedido(items: { slug: string; empaques: number; unidades: number }[], bonDe: (slug: string) => Bonif | null | undefined): { slug: string; uni: number }[] {
  const m = new Map<string, { b: Bonif; slug: string; total: number }>();
  for (const it of items) {
    const b = bonDe(it.slug);
    if (!b || !(b.cada > 0) || !(b.uni > 0)) continue;
    const k = b.grupo || it.slug;
    const e = m.get(k) ?? { b, slug: b.rs || it.slug, total: 0 };
    e.total += b.base === 'u' ? it.unidades : it.empaques;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ slug: e.slug, uni: Math.floor(e.total / e.b.cada) * e.b.uni })).filter((x) => x.uni > 0);
}

export function ventaMin(uemp: number, bulto: number | null | undefined, emp = 'empaque'): string {
  const plural = (n: number, w: string) => (n === 1 ? w : w + 's');
  if (bulto && bulto > 1) return `venta mínima ${bulto} ${plural(bulto, emp)}`;
  if (uemp === 1) return 'Venta por unidad';
  return uemp > 0 ? `1 ${emp} x ${uemp} unidades` : '';
}
