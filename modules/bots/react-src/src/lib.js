/* Общее для модуля: доступ к оболочке и расчёты сетки.

   Модуль рисует интерфейс по манифесту, который присылает сам бот
   (см. ZennoPoster.md): состав контролов заранее неизвестен, поэтому всё
   здесь — про то, как разложить произвольный набор карточек по сетке. */

/* Мост к оболочке — общий на все модули. */
export { S, api, wsSend, toast, buzz, me, meId } from '../../../../core/react-src/src/shared/shell.js';

/* ── Сетка раскладки ───────────────────────────────────────────────────
   Восемь колонок на десктопе, две на телефоне. Высота строки в пикселях
   фиксированная: карточки бывают любой высоты, и без общей единицы секции
   не сходились бы по нижней кромке. */
export const ROW_PX = 90;
export const GAP_PX = 10;
export const gridCols = () => (window.innerWidth <= 768 ? 2 : 8);

const DEF_H = { textarea: 2, table: 3, code: 2, image: 2, section: 3, stat: 1, schedule_time: 1, schedule_datetime: 1 };
const DEF_W = { section: 8, input: 8, textarea: 8, slider: 8, progress: 8, table: 8, code: 8, stat: 4 };
const MIN_W = { section: 2, input: 2, textarea: 2, slider: 2, progress: 2, table: 4, code: 4, stat: 1, image: 2 };
const MIN_H = { textarea: 2, image: 1 };

export const defH = (t) => DEF_H[t] || 1;
export const defW = (t) => DEF_W[t] || 4;
export const minW = (t) => MIN_W[t] || 2;
export const minH = (t) => MIN_H[t] || 1;

/** Плоский список контролов → [{section, children}] для отрисовки. */
export function groupControls(list) {
  const groups = [];
  let cur = null;
  list.forEach((ctrl) => {
    if (ctrl.type === 'section') {
      cur = { section: ctrl, children: [] };
      groups.push(cur);
    } else if (cur) {
      cur.children.push(ctrl);
    } else {
      if (!groups.length || groups[groups.length - 1].section) groups.push({ section: null, children: [] });
      groups[groups.length - 1].children.push(ctrl);
    }
  });
  return groups;
}

/** Высота секции в пикселях: повторяем раскладку внутренней сетки. */
export function calcSectionHeight(children, sw) {
  const HEADER = 26, GAP = 8, PAD_BOT = 5;
  if (!children.length) return HEADER + GAP + PAD_BOT;
  let col = 0, rowH = 1, innerRows = 0;
  children.forEach((ctrl) => {
    const cw = Math.min(ctrl._w || defW(ctrl.type), sw);
    const ch = ctrl._h || defH(ctrl.type);
    if (col + cw > sw) { innerRows += rowH; col = 0; rowH = 1; }
    rowH = Math.max(rowH, ch);
    col += cw;
    if (col >= sw) { innerRows += rowH; col = 0; rowH = 1; }
  });
  if (col > 0) innerRows += rowH;
  innerRows = Math.max(1, innerRows);
  return HEADER + GAP + innerRows * ROW_PX + (innerRows - 1) * GAP_PX + PAD_BOT;
}

/** Раскрывает stats-контрол в отдельные карточки stat и проставляет id. */
export function flattenControls(controls) {
  const withIds = controls.map((c, i) => (c.id ? c : { ...c, id: c.type + '_' + i }));
  const flat = [];
  withIds.forEach((ctrl) => {
    if (ctrl.type === 'stats') {
      (ctrl.items || []).forEach((item, j) => {
        flat.push({ type: 'stat', id: ctrl.id + '__' + (item.id || j), _item: item });
      });
    } else {
      flat.push(ctrl);
    }
  });
  return flat;
}

/** Накладывает сохранённую раскладку на манифест: порядок и размеры. */
export function applyLayout(controls, layout, cols) {
  const size = (c, w, h, manualH) => ({
    ...c,
    _w: Math.min(w || defW(c.type), cols),
    _h: h || defH(c.type),
    ...(manualH !== undefined ? { _manualH: manualH } : {}),
  });
  if (!layout || !layout.length) return controls.map((c) => size(c));
  const byId = {};
  controls.forEach((c) => { byId[c.id] = c; });
  const out = [];
  layout.forEach((l) => {
    const c = byId[l.id];
    if (c) { out.push(size(c, l.w, l.h, l.manualH)); delete byId[l.id]; }
  });
  Object.values(byId).forEach((c) => out.push(size(c)));
  return out;
}

/* ── Мелочи ───────────────────────────────────────────────────────────── */

/** base64 для UTF-8: данные заданий бывают кириллицей. */
export const b64 = (str) => btoa(unescape(encodeURIComponent(str)));

export function relTime(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  return Math.floor(diff / 86400) + ' дн назад';
}

export function plural(n, f1, f2, f5) {
  const mod = n % 100;
  if (mod >= 11 && mod <= 14) return f5;
  const m = n % 10;
  if (m === 1) return f1;
  if (m >= 2 && m <= 4) return f2;
  return f5;
}

/** Аватар бота ужимаем до 96px — он уезжает в JSON бота на диске. */
export function compressImage(dataURL, maxPx = 96) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const webp = canvas.toDataURL('image/webp', 0.7);
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

/* ── Расписание ───────────────────────────────────────────────────────── */
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function parseSchedTime(val) {
  const m = /(\d{1,2}):(\d{2})/.exec(val || '');
  if (m) return { h: +m[1], mi: (Math.round(+m[2] / 5) * 5) % 60 };
  return { h: 0, mi: 0 };
}

export function parseSchedDt(val) {
  const m = /(\d{1,2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/.exec(val || '');
  if (m) return { d: +m[1], mo: +m[2], y: +m[3], h: +m[4], mi: (Math.round(+m[5] / 5) * 5) % 60 };
  const now = new Date();
  return { d: now.getDate(), mo: now.getMonth() + 1, y: now.getFullYear(), h: 0, mi: 0 };
}

const pad2 = (n) => String(n).padStart(2, '0');
export const fmtSchedTime = (h, mi) => pad2(h) + ':' + pad2(mi);
export const fmtSchedDt = (d, mo, y, h, mi) => `${pad2(d)}.${pad2(mo)}.${y} ${h}:${pad2(mi)}:00`;
export const fmtSchedDtDisplay = (d, mo, y, h, mi) => `${d} ${MON_SHORT[mo - 1]} ${y}, ${pad2(h)}:${pad2(mi)}`;
export { pad2 };
