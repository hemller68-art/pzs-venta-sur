// Adaptador de medios: acepta archivo propio (mp4/webm/imagen) o enlace de YouTube / Facebook y devuelve cómo mostrarlo.
export type Medio = { tipo: 'video' | 'iframe' | 'img' | 'enlace'; src: string };
export function adaptarMedio(url: string): Medio {
  const u = (url || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,15})/i);
  if (m) return { tipo: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1` };
  if (/^https?:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.watch)\//i.test(u)) return { tipo: 'iframe', src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false` };
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)) return { tipo: 'video', src: u.replace(/#.*$/, '') + '#t=0.1' };
  if (/\.(jpe?g|png|webp|gif|avif|svg)(\?|#|$)/i.test(u)) return { tipo: 'img', src: u };
  return { tipo: 'enlace', src: u };
}
