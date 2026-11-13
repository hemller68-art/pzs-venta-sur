import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Modo servidor: el contenido (productos, modo campaña, medios, cuentas) se lee de Supabase en cada visita,
// así los cambios del panel /admin se ven al instante sin volver a compilar.
// Cuando tengas dominio definitivo, cámbialo aquí y en public/robots.txt.
export default defineConfig({
  site: 'https://venta-sur.online',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
