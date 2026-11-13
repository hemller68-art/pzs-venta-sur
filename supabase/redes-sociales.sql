-- Redes sociales de la web. Ejecutar UNA vez en Supabase > SQL Editor (se puede repetir sin riesgo).
alter table public.negocio add column if not exists facebook_url text default '';
alter table public.negocio add column if not exists instagram_url text default '';
alter table public.negocio add column if not exists tiktok_url text default '';
