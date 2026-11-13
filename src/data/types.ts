export interface Negocio {
  nombre: string; eslogan: string; whatsapp: string; telefono: string; email: string; direccion: string; horario: string;
  modo: 'campana' | 'normal'; campana_inicio: string | null; campana_fin: string | null;
  campana_titulo: string; campana_texto: string; normal_titulo: string; normal_texto: string;
  musica_url: string; musica_volumen: number; musica_activa: boolean;
  aviso_minimo: string; monto_minimo: number | null; mensaje_whatsapp: string; gracias_texto: string; pago_texto: string;
  pixel_meta: string; pixel_tiktok: string; ga4: string; facebook_url: string; instagram_url: string; tiktok_url: string; legal_razon: string; legal_ruc: string; legal_direccion: string; legal_email: string; prov_razon: string; prov_ruc: string;
}
export interface Categoria { id: number; nombre: string; slug: string; orden: number }
export interface Producto {
  id: number; slug: string; nombre: string; categoria_id: number | null; descripcion: string; colores: string; medidas: string; litros: string;
  unidades_empaque: number; bulto_emp?: number | null; consultar?: boolean; empaque_nombre: string; codigos: string[]; campana: boolean; destacado: boolean; orden: number;
  foto_url: string; galeria: string[]; video_url: string;
}
export interface Medio { slot: string; titulo: string; tipo: 'foto' | 'video' | 'enlace'; vertical_url: string; horizontal_url: string; alt: string; boton_texto: string; boton_url: string }
export interface Cuenta { id: number; banco: string; titular: string; etiqueta: string; numero: string; cci: string; codigo_agente: string }
export interface Segmento { slug: string; titulo: string; texto: string }
