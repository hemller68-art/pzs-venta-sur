-- PROLIMSO Zona Sur: ESCALAS por volumen calculadas SOBRE el precio de la matriz principal.
-- Ejecutar UNA vez en Supabase > SQL Editor. Se puede repetir sin riesgo.
-- Cada tramo guarda el descuento por unidad (x, en soles) respecto al precio base: si cambias el precio en la matriz, la escala se mueve sola.
-- Tramos de cestos (paquetes): 1-4, 5-9, 10-29, 30-59, 60-99, 100 o más. Tramos de sillas: 1-4, 5-9, 10-19, 20-29, 30-39, 40 o más.
-- Los paquetes de todos los colores de un mismo modelo de silla se SUMAN (escala_grupo).

alter table public.precios add column if not exists escala jsonb;
alter table public.precios add column if not exists escala_grupo text;

-- CESTOS (Lista 1 e Infantas): se conserva el precio base que ya tienen en la matriz.
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":0.5},{"d":10,"x":1.0},{"d":30,"x":1.5},{"d":60,"x":2.0},{"d":100,"x":3.0}]'::jsonb where codigo in ('CES0002','CES0003','CES0004','CES0027','CES0028','CES0029') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":0.5},{"d":10,"x":1.1},{"d":30,"x":1.7},{"d":60,"x":2.3},{"d":100,"x":3.6}]'::jsonb where codigo in ('CES0024','CES0025','CES0026') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":0.4},{"d":10,"x":0.7},{"d":30,"x":1.1},{"d":60,"x":1.4},{"d":100,"x":2.2}]'::jsonb where codigo in ('CES0021','CES0022','CES0023') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":0.6},{"d":10,"x":1.2},{"d":30,"x":1.8},{"d":60,"x":2.4},{"d":100,"x":3.7}]'::jsonb where codigo in ('CES0017','CES0018','CES0019','CES0020') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":0.5},{"d":10,"x":1.0},{"d":30,"x":1.6},{"d":60,"x":2.1},{"d":100,"x":3.2}]'::jsonb where codigo in ('CES0013','CES0014','CES0015','CES0016') and lista_id in (select id from public.listas_precio where nombre in ('Lista 1','Infantas'));

-- SILLAS (solo Lista 1): el precio vigente pasa a ser el del primer tramo y desde ahí se calcula la escala.
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":1.1},{"d":10,"x":2.2},{"d":20,"x":3.3},{"d":30,"x":4.3},{"d":40,"x":5.5}]'::jsonb, escala_grupo = 'silla-mimbre', precio_unidad = 40.8, precio_empaque = 612.0, vigente_desde = current_date where codigo in ('SIPB006','SIPB007','SIPB008') and lista_id = (select id from public.listas_precio where nombre = 'Lista 1');
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":1.1},{"d":10,"x":2.1},{"d":20,"x":3.2},{"d":30,"x":4.3},{"d":40,"x":5.4}]'::jsonb, escala_grupo = 'silla-bicolor-bambu', precio_unidad = 42.9, precio_empaque = 643.5, vigente_desde = current_date where codigo in ('SIPB009','SIPB010','SIPB011') and lista_id = (select id from public.listas_precio where nombre = 'Lista 1');
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":0.3},{"d":10,"x":0.4},{"d":20,"x":0.7},{"d":30,"x":0.9},{"d":40,"x":1.2}]'::jsonb, escala_grupo = 'silla-bartola-color', precio_unidad = 21.3, precio_empaque = 532.5, vigente_desde = current_date where codigo in ('SIPB005') and lista_id = (select id from public.listas_precio where nombre = 'Lista 1');
update public.precios set escala = '[{"d":1,"x":0.0},{"d":5,"x":0.2},{"d":10,"x":0.6},{"d":20,"x":0.8},{"d":30,"x":1.0},{"d":40,"x":1.4}]'::jsonb, escala_grupo = 'silla-bartola-blanca', precio_unidad = 26.9, precio_empaque = 672.5, vigente_desde = current_date where codigo in ('SIPB002') and lista_id = (select id from public.listas_precio where nombre = 'Lista 1');

-- El acceso del cliente ahora también devuelve la escala (solo de SU lista).
create or replace function public.cliente_acceso(p_doc text, p_clave text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.clientes; l public.listas_precio; pr jsonb;
begin
  p_doc := regexp_replace(coalesce(p_doc,''), '\D', '', 'g');
  p_clave := regexp_replace(coalesce(p_clave,''), '\D', '', 'g');
  select * into c from public.clientes where doc_num = p_doc and activo limit 1;
  if not found or coalesce(c.clave,'') = '' then
    perform pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;
  if c.bloqueo_hasta is not null and c.bloqueo_hasta > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;
  if c.clave <> p_clave then
    update public.clientes set
      bloqueo_hasta = case when intentos + 1 >= 5 then now() + interval '15 minutes' else bloqueo_hasta end,
      intentos = case when intentos + 1 >= 5 then 0 else intentos + 1 end
    where id = c.id;
    perform pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;
  update public.clientes set intentos = 0, bloqueo_hasta = null, ultimo_acceso = now() where id = c.id;
  select * into l from public.listas_precio where id = c.lista_id;
  if found and l.con_precios then
    select coalesce(jsonb_object_agg(codigo, jsonb_build_object('u', precio_unidad, 'e', precio_empaque, 'esc', escala, 'g', escala_grupo)), '{}'::jsonb)
      into pr from public.precios where lista_id = l.id and precio_empaque is not null;
  end if;
  return jsonb_build_object('ok', true, 'nombre', c.nombre, 'tipo', c.doc_tipo, 'lista', coalesce(l.nombre, ''),
    'con_precios', coalesce(l.con_precios, false) and pr is not null, 'precios', coalesce(pr, '{}'::jsonb));
end $$;
revoke all on function public.cliente_acceso(text, text) from public;
grant execute on function public.cliente_acceso(text, text) to anon, authenticated;
