-- Datos legales de tu empresa + Libro de Reclamaciones virtual.
-- Ejecutar UNA vez en Supabase > SQL Editor. Se puede repetir sin riesgo.

alter table public.negocio add column if not exists legal_razon text default '';
alter table public.negocio add column if not exists legal_ruc text default '';
alter table public.negocio add column if not exists legal_direccion text default '';
alter table public.negocio add column if not exists legal_email text default '';
alter table public.negocio add column if not exists prov_razon text default 'PROLIMSO S.A.C.';
alter table public.negocio add column if not exists prov_ruc text default '';

update public.negocio set
  legal_razon = case when coalesce(legal_razon,'') = '' then 'CÍRCULO COMERCIAL Y MERCADEO E.I.R.L.' else legal_razon end,
  legal_ruc   = case when coalesce(legal_ruc,'')   = '' then '20613162705' else legal_ruc end,
  prov_razon  = case when coalesce(prov_razon,'')  = '' then 'PROLIMSO S.A.C.' else prov_razon end
where id = 1;

create sequence if not exists public.reclamos_seq;

create table if not exists public.reclamos (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  created_at timestamptz not null default now(),
  tipo text not null check (tipo in ('reclamo','queja')),
  nombre text not null,
  doc_tipo text not null check (doc_tipo in ('DNI','CE','RUC','Pasaporte')),
  doc_num text not null,
  domicilio text not null,
  telefono text default '',
  email text not null,
  menor_edad boolean not null default false,
  apoderado text default '',
  bien text not null check (bien in ('producto','servicio')),
  monto text default '',
  descripcion_bien text default '',
  detalle text not null,
  pedido_consumidor text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','atendido')),
  respuesta text default '',
  fecha_respuesta date
);
alter table public.reclamos enable row level security;
drop policy if exists "reclamos: admin lee" on public.reclamos;
drop policy if exists "reclamos: admin edita" on public.reclamos;
drop policy if exists "reclamos: admin borra" on public.reclamos;
create policy "reclamos: admin lee" on public.reclamos for select using (public.is_admin());
create policy "reclamos: admin edita" on public.reclamos for update using (public.is_admin()) with check (public.is_admin());
create policy "reclamos: admin borra" on public.reclamos for delete using (public.is_admin());

-- El público NO inserta directo: solo a través de esta función, que valida todo y devuelve el código.
create or replace function public.registrar_reclamo(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare cod text; n bigint;
begin
  if length(coalesce(p->>'nombre','')) not between 3 and 160 then raise exception 'nombre'; end if;
  if length(coalesce(p->>'doc_num','')) not between 6 and 20 then raise exception 'doc'; end if;
  if length(coalesce(p->>'domicilio','')) not between 5 and 250 then raise exception 'domicilio'; end if;
  if coalesce(p->>'email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email'; end if;
  if length(coalesce(p->>'detalle','')) not between 10 and 3000 then raise exception 'detalle'; end if;
  if length(coalesce(p->>'pedido_consumidor','')) not between 5 and 2000 then raise exception 'pedido'; end if;
  n := nextval('public.reclamos_seq');
  cod := 'LR-' || to_char(now() at time zone 'America/Lima', 'YYYY') || '-' || lpad(n::text, 6, '0');
  insert into public.reclamos (codigo, tipo, nombre, doc_tipo, doc_num, domicilio, telefono, email, menor_edad, apoderado, bien, monto, descripcion_bien, detalle, pedido_consumidor)
  values (cod, p->>'tipo', p->>'nombre', p->>'doc_tipo', p->>'doc_num', p->>'domicilio', left(coalesce(p->>'telefono',''), 20), p->>'email',
          coalesce((p->>'menor_edad')::boolean, false), left(coalesce(p->>'apoderado',''), 160), p->>'bien', left(coalesce(p->>'monto',''), 30),
          left(coalesce(p->>'descripcion_bien',''), 500), p->>'detalle', p->>'pedido_consumidor');
  return cod;
end $$;
revoke all on function public.registrar_reclamo(jsonb) from public;
grant execute on function public.registrar_reclamo(jsonb) to anon, authenticated;
