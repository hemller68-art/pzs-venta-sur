-- PROLIMSO Zona Sur: esquema completo para Supabase.
-- Ejecutar COMPLETO en Supabase > SQL Editor (pega el texto, no el nombre del archivo).
-- ANTES de ejecutar: cambia 'tu-correo@ejemplo.com' por el correo del administrador.
-- Después: Authentication > Providers > Email > apaga "Allow new users to sign up" y crea tu usuario administrador.

-- ================= Administradores =================
create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('tu-correo@ejemplo.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ================= Negocio y modo campaña (una sola fila) =================
create table if not exists public.negocio (
  id int primary key default 1 check (id = 1),
  nombre text not null default 'PROLIMSO Zona Sur',
  eslogan text default 'Trabajando para ti',
  whatsapp text default '51903004679',
  telefono text default '+51 903 004 679',
  email text default '',
  direccion text default '',
  horario text default '',
  modo text not null default 'campana' check (modo in ('campana','normal')),
  campana_inicio date,
  campana_fin date,
  campana_titulo text default 'Campaña Navideña para tu negocio',
  campana_texto text default 'Cestos, canastas y tachos para vender más esta temporada. Arma tu lista y te cotizamos por WhatsApp.',
  normal_titulo text default 'Productos de limpieza y plásticos para tu negocio',
  normal_texto text default 'Fabricante peruano para ferreterías, distribuidores y negocios de limpieza. Arma tu lista y te cotizamos por WhatsApp.',
  musica_url text default '',
  musica_volumen numeric not null default 0.4 check (musica_volumen between 0 and 1),
  musica_activa boolean not null default false,
  aviso_minimo text not null default 'Aplican montos mínimos de venta por empaque cerrado.',
  monto_minimo numeric,
  mensaje_whatsapp text default 'Hola, quiero cotizar estos productos:',
  gracias_texto text default 'Recibimos tu lista. Te responderemos por WhatsApp con tu cotización.',
  pago_texto text default 'Deposita solo después de recibir tu cotización por WhatsApp y envíanos la constancia de pago.',
  pixel_meta text default '',
  pixel_tiktok text default '',
  ga4 text default '',
  facebook_url text default '',
  instagram_url text default '',
  tiktok_url text default '',
  updated_at timestamptz default now()
);
insert into public.negocio (id) values (1) on conflict do nothing;

-- ================= Catálogo =================
create table if not exists public.categorias (
  id bigint generated always as identity primary key,
  nombre text not null, slug text not null unique, orden int not null default 0, activa boolean not null default true
);

create table if not exists public.productos (
  id bigint generated always as identity primary key,
  slug text not null unique,
  nombre text not null,
  categoria_id bigint references public.categorias(id) on delete set null,
  descripcion text default '',
  colores text default '',
  medidas text default '',
  litros text default '',
  unidades_empaque int not null default 1 check (unidades_empaque >= 1),
  empaque_nombre text not null default 'empaque',
  codigos text[] not null default '{}',
  campana boolean not null default false,
  destacado boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0,
  foto_url text default '',
  galeria text[] not null default '{}',
  video_url text default '',
  created_at timestamptz default now()
);
create index if not exists productos_cat on public.productos (categoria_id);
create index if not exists productos_campana on public.productos (campana) where activo;

-- ================= Listas de precios (SOLO administrador: nunca públicas) =================
create table if not exists public.listas_precio (
  id bigint generated always as identity primary key,
  nombre text not null unique, orden int not null default 0, con_precios boolean not null default true
);
insert into public.listas_precio (nombre, orden, con_precios) values
  ('Lista 1', 1, true), ('Infantas', 2, true), ('Desaguadero', 3, false) on conflict do nothing;

create table if not exists public.precios (
  lista_id bigint not null references public.listas_precio(id) on delete cascade,
  codigo text not null,
  descripcion text default '',
  unidades_empaque int,
  precio_unidad numeric,
  precio_empaque numeric,
  nuevo_unidad numeric,
  nuevo_empaque numeric,
  vigente_desde date default current_date,
  primary key (lista_id, codigo)
);

-- ================= Clientes y pedidos =================
create table if not exists public.clientes (
  id bigint generated always as identity primary key,
  doc_tipo text not null check (doc_tipo in ('RUC','DNI')),
  doc_num text not null,
  nombre text not null, whatsapp text default '', ciudad text default '', tipo_negocio text default '',
  lista_id bigint references public.listas_precio(id) on delete set null,
  notas text default '',
  created_at timestamptz default now(),
  unique (doc_tipo, doc_num)
);

create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  doc_tipo text not null check (doc_tipo in ('RUC','DNI')),
  doc_num text not null,
  nombre text not null,
  contacto text default '',
  whatsapp text not null,
  ciudad text not null,
  tipo_negocio text default '',
  volumen text default '',
  items jsonb not null default '[]'::jsonb,
  observaciones text default '',
  clasificacion text not null default 'C' check (clasificacion in ('A','B','C')),
  origen jsonb not null default '{}'::jsonb,
  modo text default '',
  estado text not null default 'nuevo' check (estado in ('nuevo','atendido','cotizado','cerrado','descartado'))
);
create index if not exists pedidos_fecha on public.pedidos (created_at desc);
create index if not exists pedidos_doc on public.pedidos (doc_tipo, doc_num);

-- ================= Cuentas para depósito, medios y segmentos =================
create table if not exists public.cuentas_bancarias (
  id bigint generated always as identity primary key,
  banco text not null, titular text default '', etiqueta text default 'Cuenta',
  numero text default '', cci text default '', codigo_agente text default '',
  orden int not null default 0, activa boolean not null default true
);

create table if not exists public.medios (
  slot text primary key,
  titulo text not null default '',
  tipo text not null default 'foto' check (tipo in ('foto','video','enlace')),
  vertical_url text default '',      -- formato 9:16 (celular)
  horizontal_url text default '',    -- formato 16:9 (computadora)
  alt text default '',
  boton_texto text default '', boton_url text default '',
  activo boolean not null default true
);
insert into public.medios (slot, titulo) values
  ('portada','Portada'),('reel_01','Video 1'),('reel_02','Video 2'),('reel_03','Video 3'),('reel_04','Video 4'),('reel_05','Video 5'),('reel_06','Video 6'),('reel_07','Video 7'),('reel_08','Video 8'),('reel_09','Video 9'),('reel_10','Video 10'),('reel_11','Video 11'),('reel_12','Video 12'),('compartir','Imagen para compartir en redes'),
  ('seg_limpieza','Banner: limpieza'),('seg_ferreterias','Banner: ferreterías'),('seg_distribuidores','Banner: distribuidores'),('seg_plasticos','Banner: negocios de plásticos')
  on conflict do nothing;

create table if not exists public.segmentos (
  slug text primary key, titulo text not null, texto text default '', orden int not null default 0, activo boolean not null default true
);
insert into public.segmentos (slug, titulo, texto, orden) values
  ('limpieza','Canal Institucional','Productos de limpieza para empresas, colegios, hoteles y oficinas, con pedido por empaque cerrado.',1),
  ('ferreterias','Canal mayorista','Productos de alta rotación en plástico resistente, con pedido por empaque cerrado.',2),
  ('distribuidores','Canal distribuidor','Surtido completo y cotización por volumen para tu zona.',3),
  ('plasticos','Retail','Cestos, canastas, tachos y organizadores para tu línea de venta.',4)
  on conflict do nothing;

-- ================= Seguridad (RLS) =================
alter table public.admins enable row level security;
alter table public.negocio enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.listas_precio enable row level security;
alter table public.precios enable row level security;
alter table public.clientes enable row level security;
alter table public.pedidos enable row level security;
alter table public.cuentas_bancarias enable row level security;
alter table public.medios enable row level security;
alter table public.segmentos enable row level security;

create policy "admins: solo admin" on public.admins for select using (public.is_admin());

create policy "negocio: lectura publica" on public.negocio for select using (true);
create policy "negocio: admin escribe" on public.negocio for all using (public.is_admin()) with check (public.is_admin());

create policy "categorias: lectura publica" on public.categorias for select using (activa or public.is_admin());
create policy "categorias: admin escribe" on public.categorias for all using (public.is_admin()) with check (public.is_admin());

create policy "productos: lectura publica" on public.productos for select using (activo or public.is_admin());
create policy "productos: admin escribe" on public.productos for all using (public.is_admin()) with check (public.is_admin());

-- Listas de precios y precios: SOLO administrador (la web pública nunca los lee)
create policy "listas: solo admin" on public.listas_precio for all using (public.is_admin()) with check (public.is_admin());
create policy "precios: solo admin" on public.precios for all using (public.is_admin()) with check (public.is_admin());
create policy "clientes: solo admin" on public.clientes for all using (public.is_admin()) with check (public.is_admin());

create policy "pedidos: cualquiera puede enviar" on public.pedidos for insert to anon, authenticated
  with check (
    estado = 'nuevo'
    and length(nombre) between 1 and 160
    and length(whatsapp) between 6 and 40
    and length(ciudad) between 1 and 80
    and length(coalesce(observaciones,'')) <= 2000
    and jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 80
    and ((doc_tipo = 'RUC' and doc_num ~ '^[0-9]{11}$') or (doc_tipo = 'DNI' and doc_num ~ '^[0-9]{8}$'))
  );
create policy "pedidos: admin lee" on public.pedidos for select using (public.is_admin());
create policy "pedidos: admin edita" on public.pedidos for update using (public.is_admin()) with check (public.is_admin());
create policy "pedidos: admin borra" on public.pedidos for delete using (public.is_admin());

create policy "cuentas: lectura publica" on public.cuentas_bancarias for select using (activa or public.is_admin());
create policy "cuentas: admin escribe" on public.cuentas_bancarias for all using (public.is_admin()) with check (public.is_admin());

create policy "medios: lectura publica" on public.medios for select using (activo or public.is_admin());
create policy "medios: admin escribe" on public.medios for all using (public.is_admin()) with check (public.is_admin());

create policy "segmentos: lectura publica" on public.segmentos for select using (activo or public.is_admin());
create policy "segmentos: admin escribe" on public.segmentos for all using (public.is_admin()) with check (public.is_admin());

-- ================= Almacenamiento de fotos, videos y música =================
insert into storage.buckets (id, name, public) values ('catalogo', 'catalogo', true) on conflict (id) do nothing;
create policy "catalogo: lectura publica" on storage.objects for select using (bucket_id = 'catalogo');
create policy "catalogo: admin sube" on storage.objects for insert to authenticated with check (bucket_id = 'catalogo' and public.is_admin());
create policy "catalogo: admin cambia" on storage.objects for update to authenticated using (bucket_id = 'catalogo' and public.is_admin());
create policy "catalogo: admin borra" on storage.objects for delete to authenticated using (bucket_id = 'catalogo' and public.is_admin());
