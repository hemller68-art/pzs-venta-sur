# PROLIMSO Zona Sur

Web de campaña navideña + catálogo + cotización por WhatsApp + panel /admin.
Astro (servidor Node) + Supabase. Desarrollado por CC&M.

## Archivos importantes
- `supabase/schema.sql`  → tablas y seguridad. Se ejecuta PRIMERO.
- `supabase/seed.sql`    → 180 productos, 18 categorías y precios (Lista 1 e Infantas) sacados de tu Excel. Se ejecuta SEGUNDO.
- `.env.example`         → copia a `.env` y pon la URL y la clave anon de Supabase.
- `public/fotos/`        → 13 fotos de modelos de campaña (ya enlazadas en el seed).

## Pasos de puesta en marcha (uno a la vez)
1. Crea un proyecto NUEVO en Supabase.
2. Abre `schema.sql`, cambia `tu-correo@ejemplo.com` por tu correo de administrador, pega TODO el texto en Supabase > SQL Editor y ejecuta.
3. Pega `seed.sql` en el SQL Editor y ejecuta.
4. Supabase > Authentication > Providers > Email: apaga "Allow new users to sign up". En Authentication > Users crea tu usuario (mismo correo del paso 2).
5. Copia `.env.example` como `.env` y completa las dos variables.
6. `npm install` y `npm run dev` → http://localhost:4321 (panel en /admin).
7. Producción: `npm run build` y `node dist/server/entry.mjs`, o el Dockerfile (variables PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY como build args).

## Panel /admin
Pedidos y leads (con armado de cotización según la lista del cliente), Clientes (asignar lista), Precios (importar Excel, vigente/nuevo), Productos (fotos en bloque por código), Negocio y modo (campaña/todo el año, fechas, música, avisos, pixels), Cuentas (texto), Fotos y videos (9:16 y 16:9), Categorías y segmentos.
Las cuentas bancarias se escriben desde el panel; no hay ninguna en el código.
