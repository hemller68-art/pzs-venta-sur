import type { Producto } from './types';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Clave del modelo: ignora "Cabezal", el tipo de mango, tildes y detalles de medida. */
export function claveModelo(nombre: string): string {
  let n = sinTildes(nombre);
  n = n.replace(/^cabezal( de)? /, '');
  n = n.split(',')[0].replace(/\+.*$/, '');
  n = n.replace(/amarrilla/g, 'amarilla').replace(/^escoba /, '').replace(/ con base/, '');
  n = n.replace(/^(cesto .*?)\s*n[°º]\s*\d+.*$/, '$1');
  n = n.replace(/^(tacho \w+) \d+\s*l\b.*$/, '$1');
  n = n.replace(/^(cooler \w+) \d+.*$/, '$1');
  // Silla Bartola: cada color es su propia tarjeta (blanca y azul se muestran por separado).
  if (!/^silla bartola/.test(n)) n = n.replace(/^(silla \w+) .*$/, '$1');
  n = n.replace(/^(set .*?)\s*\(.*$/, '$1').replace(/^(set .*?) (cm|cp|sm)$/, '$1');
  n = n.replace(/^trapeador (mopa )/, '$1').replace(/^trapeador (tela)/, 'mopa $1');
  n = n.replace(/ de /g, ' ').replace(/(\d+)\s*cm\b/g, '$1');
  return n.replace(/\s+/g, ' ').trim();
}

export interface Grupo { titulo: string; foto_url: string; vars: Producto[]; principal: Producto; presentaciones: string[]; }

const etiqueta = (p: Producto) => {
  const m = p.nombre.match(/^set .*? (cm|cp|sm)\b/i);
  if (m) return ({ cm: 'Con tubo (Cm)', cp: 'Con palo (Cp)', sm: 'Sin mango (Sm)' } as Record<string, string>)[m[1].toLowerCase()];
  if (/^cabezal/i.test(p.nombre)) return 'Cabezal';
  const ta = p.nombre.match(/^tacho .*? (\d+)\s*l\b/i);
  if (ta) return `${ta[1]} L`;
  const co = p.nombre.match(/^cooler \w+ (\d+)\s*(.*)$/i);
  if (co) return `${co[1]} L${co[2] ? ' ' + co[2] : ''}`;
  const ce = p.nombre.match(/^cesto .*?(n[°º]\s*\d+)/i);
  if (ce) return ce[1].replace(/n[°º]\s*/i, 'N° ');
  const partes = p.nombre.split(',');
  return partes.length > 1 ? partes.slice(1).join(',').replace(/\+.*$/, '').trim() : '';
};

/** Agrupa las presentaciones del mismo modelo en una sola tarjeta. */
export function agrupar(productos: Producto[]): Grupo[] {
  const mapa = new Map<string, Producto[]>();
  for (const p of productos) {
    const k = `${p.categoria_id ?? ''}|${claveModelo(p.nombre)}`;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(p);
  }
  return [...mapa.values()].map((vars) => {
    const principal = vars.find((v) => !/^cabezal/i.test(v.nombre)) || vars[0];
    // Portada: si hay un color blanco con foto, ese; si no, el primero que tenga foto.
    const foto = (vars.find((v) => v.foto_url && /\bblanco\s*$/i.test(v.nombre)) || vars.find((v) => v.foto_url) || principal).foto_url || '';
    const limpio = (t: string) => t.replace(/amarrilla/gi, (m) => (m[0] === 'A' ? 'Amarilla' : 'amarilla'));
    const quitaColor = (t: string) =>
      t.replace(/\s*\(.*\)?\s*$/, '').replace(/^(set .*?) (cm|cp|sm)$/i, '$1').replace(/\s+(color|blanco humo|blanco h|blanco|moro|taupe|marr[oó]n)$/i, '').replace(/\s+(color|blanco humo|blanco h|blanco|moro|taupe|marr[oó]n)$/i, '').trim();
    const sinN = (t: string) => (/^cesto /i.test(t) ? t.replace(/\s*N[°º]\s*\d+.*$/i, '') : /^tacho /i.test(t) ? t.replace(/\s+\d+\s*L\b.*$/i, '') : /^cooler /i.test(t) ? t.replace(/\s+\d+.*$/, '') : t);
    const titulo = limpio(vars.length > 1 ? sinN(quitaColor(principal.nombre.split(',')[0].trim())) : principal.nombre);
    const pres = vars.length > 1 ? vars.map(etiqueta).filter(Boolean) : [];
    return { titulo, foto_url: foto, vars, principal, presentaciones: [...new Set(pres)] };
  });
}
