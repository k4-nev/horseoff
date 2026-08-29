/* Вложения: адреса, размеры, раскладка пачки, разбор текста.

   Общее для «Сообщений» и «Каналов»: файлы там одни и те же, отдаются одним
   и тем же эндпоинтом, и раскладывать их дважды по-разному незачем. */

const S = () => window.Shell;

/** Токен в query: файлы отдаются по нему, заголовок к <img> не приложить. */
export function attUrl(id, suffix) {
  const s = S();
  const tk = s && s.token ? '?token=' + encodeURIComponent(s.token) : '';
  return '/api/msg/file/' + id + (suffix || '') + tk;
}

export function fmtSize(b) {
  if (!b && b !== 0) return '';
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' МБ';
  if (b > 1024) return Math.round(b / 1024) + ' КБ';
  return b + ' Б';
}

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Голосовое отличается от музыки только именем файла — так его пишет запись. */
export const isVoiceFile = (a) => !!(a && a.name && a.name.startsWith('voice_'));

/* Высоты столбиков волны: один и тот же рисунок у всех записей — честнее,
   чем случайный, и не создаёт впечатления, будто мы разобрали звук. */
export const WAVE_H = [
  8, 14, 10, 18, 12, 22, 16, 9, 20, 13, 17, 11, 24, 15, 8, 19, 12, 21, 10, 16,
  14, 23, 9, 18, 11, 20, 13, 17, 22, 10, 15, 8, 19, 12, 21, 14, 9, 16, 11, 18,
  13, 20, 10, 15,
];

/* ── Раскладка пачки фото и видео ─────────────────────────────────────────
   Плитки не квадратные: у вложения приходят w и h, и кадр 9:16 не должен
   обрезаться наравне с 16:9. Считаем «оправданными рядами»: набираем в ряд,
   пока сумма соотношений не дойдёт до целевой, затем высота ряда = ширина,
   делённая на эту сумму. Соседи в ряду всегда одной высоты, ряд заполняет
   ширину при любых пропорциях. */
export const MEDIA_W = 292;
const GAP = 4;

export function layoutMedia(items, width = MEDIA_W, gap = GAP) {
  const ar = (a) => {
    const r = a.w && a.h ? a.w / a.h : 1;
    return Math.max(0.55, Math.min(2.4, r));
  };
  if (items.length === 1) {
    const a = ar(items[0]);
    let w = width;
    let h = w / a;
    const MAXH = 340;
    if (h > MAXH) { h = MAXH; w = h * a; }
    return [[{ item: items[0], w: Math.round(w), h: Math.round(h) }]];
  }

  const target = items.length <= 4 ? 2.1 : 2.6;
  const rows = [];
  let row = [];
  let sum = 0;
  items.forEach((it, i) => {
    row.push(it);
    sum += ar(it);
    const last = i === items.length - 1;
    if (sum >= target || row.length === 3 || last) { rows.push({ row, sum }); row = []; sum = 0; }
  });

  return rows.map(({ row: r, sum: s }) => {
    const avail = width - gap * (r.length - 1);
    const h = Math.max(78, Math.min(260, avail / s));
    return r.map((it, k) => ({
      item: it,
      w: k === r.length - 1
        ? Math.round(avail - r.slice(0, k).reduce((acc, x) => acc + Math.round(h * ar(x)), 0))
        : Math.round(h * ar(it)),
      h: Math.round(h),
    }));
  });
}

/* ── Текст сообщения ──────────────────────────────────────────────────────
   Возвращаем куски, а не HTML: подстановка ссылок строкой — это тот самый
   путь, на котором чужой текст попадает в разметку. */
export function linkify(text) {
  const out = [];
  const re = /(https?:\/\/[^\s<]+)|(@\w+)/g;
  let last = 0;
  let m = re.exec(text || '');
  while (m) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    if (m[1]) out.push({ t: m[1], url: m[1] });
    else out.push({ t: m[2], mention: m[2].slice(1) });
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (text && last < text.length) out.push({ t: text.slice(last) });
  return out.length ? out : [{ t: text || '' }];
}

export const mediaType = (name) => {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  return 'file';
};
