import type { APIRoute } from 'astro';
import { getNegocio, getCategorias, getProductos } from '../data/content';
export const prerender = false;
// Resumen del sitio en texto simple para buscadores con IA (ChatGPT, Claude, Perplexity, Gemini).
export const GET: APIRoute = async ({ site }) => {
  const base = site!.origin;
  const [n, cats, prods] = await Promise.all([getNegocio(), getCategorias(), getProductos()]);
  const lineas = [
    `# ${n.nombre}`,
    '',
    `> Canal de venta mayorista de PROLIMSO para la zona sur del Perú (Arequipa, Cusco, Puno y Desaguadero). Productos plásticos de limpieza y hogar para ferreterías, distribuidores, negocios de limpieza y negocios de plásticos. Vendemos por empaque cerrado y cotizamos por WhatsApp.`,
    '',
    '## Quiénes somos',
    `- Sitio operado por ${n.legal_razon}${n.legal_ruc ? ` (RUC ${n.legal_ruc})` : ''}, representante comercial de ${n.prov_razon}, fabricante peruano de los productos.`,
    n.direccion ? `- Dirección: ${n.direccion}` : '',
    n.horario ? `- Horario: ${n.horario}` : '',
    n.telefono ? `- WhatsApp y teléfono: ${n.telefono}` : '',
    n.email || n.legal_email ? `- Correo: ${n.email || n.legal_email}` : '',
    '',
    '## Cómo comprar',
    '- Cliente nuevo: elige productos en el catálogo, arma tu lista en "Cotiza tu pedido" y la cotización llega por WhatsApp.',
    '- Cliente de cartera: ingresa con RUC y clave para ver los precios de tu lista y enviar el pedido.',
    '- Los depósitos se hacen solo a cuentas a nombre de ' + n.prov_razon + ' publicadas en la página Cómo pagar.',
    '',
    '## Páginas principales',
    `- [Catálogo](${base}/catalogo): ${prods.length} productos`,
    `- [Cotiza tu pedido](${base}/cotizar)`,
    `- [Cómo pagar](${base}/como-pagar)`,
    `- [Envíos y reembolsos](${base}/envios-y-reembolsos)`,
    `- [Nosotros](${base}/nosotros)`,
    `- [Contacto](${base}/contacto)`,
    '',
    '## Categorías',
    ...cats.map((c) => `- ${c.nombre}`),
  ].filter((l) => l !== '' || true);
  return new Response(lineas.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
