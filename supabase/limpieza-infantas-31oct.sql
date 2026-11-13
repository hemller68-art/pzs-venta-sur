-- PROLIMSO Zona Sur · 31 oct 2026
-- 1) Precios nuevos de limpieza (nuevo precio redondeado a 1 decimal; empaque = unidad x unidades del empaque)
update precios p set precio_unidad = v.u, precio_empaque = v.e, nuevo_unidad = null, nuevo_empaque = null
from (values
    ('HIPB002',5.2,124.8),
    ('REPP003',6.1,146.4),
    ('REPP008',6.1,366.0),
    ('REPP002',4.2,252.0),
    ('REPE004',4.1,246.0),
    ('REPE001',2.0,120.0),
    ('REPE002',1.6,96.0),
    ('STW001',35.7,35.7),
    ('STW002',39.1,39.1),
    ('HIPB005',2.2,132.0),
    ('HIPB006',2.2,132.0)
) v(c,u,e)
where p.lista_id = (select id from listas_precio where nombre = 'Infantas') and p.codigo = v.c;

update precios p set precio_unidad = v.u, precio_empaque = v.e, nuevo_unidad = null, nuevo_empaque = null
from (values
    ('HIPB002',5.1,122.4),
    ('HIPB004',4.2,100.8),
    ('REPP003',6.6,158.4),
    ('REPP008',6.6,396.0),
    ('REPP002',4.7,282.0),
    ('REPE004',4.5,270.0),
    ('REPE001',2.0,120.0),
    ('REPE002',1.8,108.0),
    ('STW001',36.1,36.1),
    ('STW002',39.6,39.6),
    ('SET001',19.8,237.6),
    ('SET005',18.8,225.6),
    ('SET002',18.6,223.2),
    ('SET006',17.5,210.0),
    ('HIPB005',2.7,162.0),
    ('HIPB006',2.7,162.0)
) v(c,u,e)
where p.lista_id = (select id from listas_precio where nombre = 'Lista 1') and p.codigo = v.c;

-- 2) Cesto Navideño a 28.90 (empaque de 12) en ambas listas
update precios set precio_unidad = 28.9, precio_empaque = 346.8, nuevo_unidad = null, nuevo_empaque = null where codigo = 'CES0007';

-- 3) Casillero "Consultar disponibilidad"
alter table productos add column if not exists consultar boolean default false;
update productos set consultar = true where codigos && array['CES0007','COL0001','COL0002'];

-- 4) Producto nuevo EBPP014 (copia datos de EBPP006) y su precio 9.90 en ambas listas
insert into productos (slug, nombre, categoria_id, descripcion, colores, medidas, litros, unidades_empaque, empaque_nombre, bulto_emp, codigos, campana, destacado, activo, orden, foto_url, galeria, video_url)
select 'escobilla-baldeador-multiuso-mango-forrado-chino', 'Escobilla Baldeador Multiuso, Mango Forrado Chino', categoria_id, '', colores, medidas, litros, unidades_empaque, empaque_nombre, bulto_emp, array['EBPP014'], false, false, true, orden + 1, '', '{}', ''
from productos where codigos && array['EBPP006']
  and not exists (select 1 from productos where slug = 'escobilla-baldeador-multiuso-mango-forrado-chino')
limit 1;

insert into precios (lista_id, codigo, descripcion, unidades_empaque, precio_unidad, precio_empaque)
select l.id, 'EBPP014', 'ESCOBILLA BALDEADOR MULTIUSO, MANGO FORRADO CHINO', 12, 9.9, 118.8
from listas_precio l where l.nombre in ('Lista 1','Infantas')
on conflict (lista_id, codigo) do update set precio_unidad = 9.9, precio_empaque = 118.8;

-- 5) Productos que Infantas debe tener, con el precio en blanco (lo llenas en Panel > Precios)
insert into precios (lista_id, codigo, descripcion, unidades_empaque)
select (select id from listas_precio where nombre = 'Infantas'), codigo, descripcion, unidades_empaque
from precios
where lista_id = (select id from listas_precio where nombre = 'Lista 1')
  and codigo in ('ESMP004','ESMP005','ESMP002','ESPD002','ESPD001','ESPT001','ESPT004','ESPC011','ESPC014','ESPG001','ESPG002','ESPC005','ESPC006','ESLP016','ESLP017','ESPB005','ESPB006','ESPC008','ESPC009','ESPS001','ESPC013','ESLP011','ESLP013','ESLP007','ESLP008','ESLP022','TMPT033','TMPT032','TMPT007','TMPT020','TMPT006','TMPT019','LIML001','LIML002','EBPP009','TMPT027','TMPT028','TMPT026','TMPT025','TMPT015','TMPT014','TMPT034','TMPT035','TMPT036','TMPT037','CBPT019')
on conflict (lista_id, codigo) do nothing;

-- Revisión
select
  (select count(*) from precios where lista_id = (select id from listas_precio where nombre='Infantas') and precio_empaque is null) as infantas_en_blanco,
  (select count(*) from productos where consultar) as con_consultar,
  (select count(*) from productos where 'EBPP014' = any(codigos)) as ebpp014_producto,
  (select count(*) from precios where codigo='EBPP014') as ebpp014_precios;
