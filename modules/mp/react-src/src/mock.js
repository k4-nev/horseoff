/* Мок-данные. Бэкенда у модуля пока нет: всё, что видно на экране,
   собирается здесь. Когда появится сервер, этот файл заменяется на api.js
   с теми же формами данных. */

export const PLATFORMS = ['Wildberries'];

const NF = ['Анна Петрова', 'Елена Кузнецова', 'Ольга Морозова', 'Полина Гуля', 'Катя Смирнова', 'Вера Ильина', 'Настя Лебедева'];
const NM = ['Максим Орлов', 'Игнат Волков', 'Никита Соколов', 'Евгений Попов', 'Даниил Козлов', 'Артём Новиков'];
const CITIES = ['Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск', 'Нижний Новгород', 'Краснодар', 'Самара'];
const ST = ['активен', 'активен', 'активен', 'новый', 'не прошел', 'ожидает в пвз', 'получен'];

const PRODUCTS = [
  { id: 'p1', article: '833758227', keyword: 'вода парфюм', available: 12 },
  { id: 'p2', article: '996209813', keyword: 'духи с табаком', available: 7 },
  { id: 'p3', article: '451599302', keyword: 'часы кварцевые', available: 3 },
  { id: 'p4', article: '344985239', keyword: 'часы электронные', available: 21 },
  { id: 'p5', article: '500120276', keyword: 'пароочиститель', available: 9 },
  { id: 'p6', article: '108481477', keyword: 'гейнер масса', available: 15 },
  { id: 'p7', article: '123967154', keyword: 'робот пылесос', available: 5 },
];

export function buildTestServer() {
  const accounts = [];
  for (let i = 0; i < 30; i++) {
    const f = i % 2 === 0;
    const pr = PRODUCTS[i % PRODUCTS.length];
    accounts.push({
      id: 'a' + i,
      name: f ? NF[i % NF.length] : NM[i % NM.length],
      gender: f ? 'f' : 'm',
      phone: '+7 9' + (10 + (i % 89)) + ' ' + String(100 + i).padStart(3, '0')
        + '-' + String(11 + (i % 88)).padStart(2, '0') + '-' + String((i * 7) % 100).padStart(2, '0'),
      lastLogin: ['сейчас', '2ч', 'вчера', '5ч', '3д'][i % 5],
      status: ST[i % ST.length],
      article: pr.article,
      keyword: pr.keyword,
      pvz: 'ул. Ленина, ' + (5 + i) + ', ПВЗ Wildberries',
      city: CITIES[i % CITIES.length],
    });
  }
  return {
    id: '__test__', name: 'Server-RU-01', platform: 'Wildberries',
    status: 'online', test: true, accounts, products: PRODUCTS,
  };
}

export function buildServer(name, platform) {
  const base = buildTestServer();
  return {
    id: 's' + Date.now(), name, platform, status: 'online',
    accounts: base.accounts.slice(0, 8), products: PRODUCTS,
  };
}

/* ── Аккаунты ─────────────────────────────────────────────────────────── */
const ACC_ST = ['Прогретый', 'Проверка', 'Получен', 'Доставка', 'Ожидает на ПВЗ', 'Новый', 'Прошел', 'Не прошел'];
const LOGINS = [{ d: 0, t: '14:55' }, { d: 0, t: '09:12' }, { d: 1 }, { d: 2 }, { d: 3 }, { d: 7 }, { d: 14 }, { d: 0, t: '18:40' }];

export function accountRows(s) {
  return s.accounts.map((a, i) => {
    const hasItems = i % 4 !== 3;
    const hasAddr = i % 5 !== 4;
    return {
      id: a.id, name: a.name, phone: a.phone, gender: a.gender,
      login: LOGINS[i % LOGINS.length],
      status: ACC_ST[i % ACC_ST.length],
      items: hasItems ? s.products.slice(0, (i % 3) + 1).map((p, j) => ({ id: 'ai' + j, art: p.article, kw: p.keyword })) : [],
      address: hasAddr ? { short: a.city + ', ' + a.pvz.split(',').slice(0, 2).join(','), full: a.pvz + ', ' + a.city } : null,
      buys: (i * 3 + 2) % 17,
      reviews: (i * 2 + 1) % 9,
    };
  });
}

/* ── Регистратор ──────────────────────────────────────────────────────── */
export function buildRegState(s) {
  const acc = s.accounts;
  return {
    pool: acc.slice(0, 10).map((a) => ({ id: a.id, phone: a.phone })),
    active: acc.slice(10, 14).map((a, i) => ({
      id: a.id, phone: a.phone,
      time: ['09:20', '11:40', '13:05', '15:30'][i],
      exec: ['running', 'pending', 'error', 'done'][i],
    })),
  };
}

/* ── Прогрев ──────────────────────────────────────────────────────────── */
const WU_STAGES = ['Доставка', 'Прогретый', 'Ожидает на ПВЗ', 'Новый', 'Проверка'];
const WU_EXECS = ['done', 'running', 'pending', 'error', 'running', 'pending', 'done', 'running'];
const WU_TIMES = ['09:15', '10:40', null, '13:05', '14:30', '16:10', '18:00', null];

export function warmupRows(s) {
  return s.accounts.slice(0, 8).map((a, i) => ({
    accountId: a.id, name: a.name, phone: a.phone, gender: a.gender,
    scheduledAt: WU_TIMES[i], stage: WU_STAGES[i % WU_STAGES.length], exec: WU_EXECS[i % WU_EXECS.length],
  }));
}

/* ── Покупки ──────────────────────────────────────────────────────────── */
export const BANKS = ['Выбрать банк', 'Т-Банк', 'Альфа-Банк', 'Райффайзен', 'OZON', 'Яндекс Пей', 'ПСБ'];

export const BUY_DATES = [
  '2026-08-01', '2026-08-03', '2026-08-05', '2026-08-08', '2026-08-10', '2026-08-11',
  '2026-08-12', '2026-08-14', '2026-08-16', '2026-08-19', '2026-08-23', '2026-08-26',
  '2026-08-29', '2026-09-02', '2026-09-05', '2026-09-07', '2026-09-11', '2026-09-15',
  '2026-09-19', '2026-09-23', '2026-09-28', '2026-10-02', '2026-10-06', '2026-10-11',
];

export function buyRows(s) {
  const p = s.products;
  const mk = (n) => p.concat(p).slice(0, n).map((x, i) => ({ id: 'i' + i, art: x.article, kw: x.keyword }));
  const addr = {
    short: 'Москва, ул. Ленина, 12',
    full: 'г. Москва, ул. Ленина, д. 12, корп. 3, кв. 45, подъезд 2, домофон 45К, ПВЗ Wildberries (вход со двора)',
  };
  return [
    { id: 'o1', name: 'Анна Петрова', phone: '+7 921 400-11-84', gender: 'f', items: mk(5), address: addr, status: { kind: 'in_progress', step: 5, total: 7, label: 'Ожидаю подтверждения оплаты', timer: '02:41' } },
    { id: 'o2', name: 'Максим Орлов', phone: '+7 921 400-11-85', gender: 'm', items: mk(4), address: { short: 'Санкт-Петербург, Невский пр., 28', full: 'г. Санкт-Петербург, Невский проспект, д. 28, лит. А, кв. 112, ПВЗ Wildberries' }, status: { kind: 'error', step: 3, total: 7, message: 'Не удалось добавить товар в корзину', code: 'ERR_ADD_ITEM_500' } },
    { id: 'o3', name: 'Елена Кузнецова', phone: '+7 921 400-11-86', gender: 'f', items: mk(2), address: addr, status: { kind: 'paid', paidAt: '12 мая, 14:22', bank: 'OZON' } },
    { id: 'o4', name: 'Даниил Козлов', phone: '+7 921 400-11-87', gender: 'm', items: mk(3), address: addr, status: { kind: 'scheduled', date: '14.05.2026', time: '09:00' } },
    { id: 'o5', name: 'Ольга Морозова', phone: '+7 921 400-11-88', gender: 'f', items: mk(1), address: addr, status: { kind: 'in_progress', step: 2, total: 7, label: 'Смотрю товары', timer: '30:30' } },
  ];
}

/* ── Получение / доставка ─────────────────────────────────────────────── */
const DMAP = [
  { t: 'Будет в ПВЗ 26 авг', c: 'blue' },
  { t: 'Задерживается', c: 'amber' },
  { t: 'Отменён', c: 'red' },
];

export function pickupRows(s) {
  return s.accounts.map((a, i) => ({
    id: a.id, name: a.name, phone: a.phone, gender: a.gender, city: a.city,
    items: s.products.slice(0, (i % 3) + 1).map((p, j) => ({ id: 'pi' + j, art: p.article, kw: p.keyword })),
    address: { short: a.city + ', ' + a.pvz.split(',').slice(0, 2).join(','), full: a.pvz + ', ' + a.city },
    code: String(100000 + ((i * 73137 + 40193) % 900000)),
    tab: i % 3 === 2 ? 'delivery' : 'receive',
    dstatus: DMAP[i % DMAP.length],
  }));
}

/* ── Отзывы ───────────────────────────────────────────────────────────── */
export const REVIEW_TEXTS = [
  'Товар супер, пришло быстро, качество на высоте, рекомендую',
  'Всё понравилось, размер подошёл идеально, цвет как на фото',
  'Хорошая вещь за свои деньги, упаковка целая, доставили вовремя',
  'Отличный продавец, отвечает быстро, буду заказывать ещё',
  'Ожидал большего по описанию, но в целом норм за эту цену',
  'Пришло раньше срока, всё аккуратно упаковано, спасибо',
];
