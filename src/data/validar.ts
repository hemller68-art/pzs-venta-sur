/** RUC peruano: 11 dígitos, empieza con 10, 15, 17 o 20, y el último dígito es el verificador (módulo 11). */
export function rucValido(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  if (!['10', '15', '17', '20'].includes(ruc.slice(0, 2))) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * Number(ruc[i]), 0);
  const dv = (11 - (suma % 11)) % 10;
  return dv === Number(ruc[10]);
}
/** DNI: solo se valida el formato (8 dígitos). */
export const dniValido = (dni: string) => /^\d{8}$/.test(dni);

/** Clasificación del lead: A = RUC 20 con volumen alto; B = RUC 10 o volumen medio; C = DNI o volumen bajo. */
export function clasificar(tipo: 'RUC' | 'DNI', doc: string, volumen: string): 'A' | 'B' | 'C' {
  if (tipo === 'RUC' && doc.startsWith('20') && volumen === 'Alto') return 'A';
  if (tipo === 'RUC' && (doc.startsWith('10') || doc.startsWith('15') || doc.startsWith('17'))) return 'B';
  if (tipo === 'RUC' && volumen === 'Medio') return 'B';
  if (tipo === 'RUC' && volumen === 'Alto') return 'B';
  return 'C';
}
export const CIUDADES = ['Arequipa', 'Cusco', 'Puno', 'Juliaca', 'Tacna', 'Moquegua', 'Ilo', 'Desaguadero', 'Abancay', 'Otra'];
export const TIPOS_NEGOCIO = ['Limpieza', 'Ferretería', 'Distribuidor de limpieza', 'Negocio de plásticos', 'Otro'];
export const VOLUMENES = ['Bajo', 'Medio', 'Alto'];
