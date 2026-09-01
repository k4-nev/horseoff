/* Мост к оболочке.

   Модули живут внутри каркаса и общаются с ним через глобальный Shell:
   сеть, сокет, уведомления, текущий пользователь. Обёртки ниже были
   скопированы в lib.js «Ботов», «Каналов» и «Сообщений» слово в слово —
   здесь они один раз.

   Обращаться только через них. Shell.api внутри читает this.headers(), и
   оторванная от объекта ссылка (const api = Shell.api) молча падает в свой
   catch и возвращает null — так однажды пропали вложения в панели профиля. */

export const S = () => window.Shell;

export const api = (url, opts) => {
  const s = S();
  return s && s.api ? s.api(url, opts) : Promise.resolve(null);
};

export const wsSend = (m) => { const s = S(); if (s && s.wsSend) s.wsSend(m); };

/* Ответ сервера об отказе — человеку. Сервер присылает и действие, и нужную
   ступень; показывать вместо этого «Ошибка» значит заставлять гадать. */
export const denyMessage = (d, fallback) => {
  if (d && d.need_role) return 'Недостаточно прав: нужна роль ' + String(d.need_role).toUpperCase();
  if (d && d.error) return d.error;
  return fallback || 'Не удалось выполнить';
};
export const toast = (t, type) => { const s = S(); if (s && s.toast) s.toast(t, type); };

/** Текущий пользователь целиком и его id — оболочка держит их у себя. */
export const me = () => { const s = S(); return (s && s.user) || {}; };
export const meId = () => { const s = S(); return s && s.user ? s.user.id : null; };

/** Короткая вибрация на действие. Там, где её нет, тихо ничего не делает. */
export const buzz = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };
