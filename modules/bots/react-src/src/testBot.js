/* Тест-бот: набор всех типов контролов разом.

   Нужен, чтобы проверить отрисовку манифеста, не поднимая ZennoPoster —
   и чтобы было на чём смотреть новые типы. Живёт только в браузере: id
   `__test__` нигде на сервере не существует, команды от него никуда не
   уходят. */

export const TEST_BOT_ID = '__test__';

export const TEST_BOT = {
  id: TEST_BOT_ID,
  name: 'Demo Bot',
  group: 'Demo',
  status: 'online',
  version: '1.0',
  sub: 'Все элементы управления',
  badge: 0,
  last_seen: null,
  api_key: 'hb_demo_not_real',
  access: [],
  tabs: ['stats', 'log', 'params'],
  controls: [
    { type: 'section', label: 'Управление потоком' },
    { type: 'buttons', id: 'flow', buttons: [
      { label: 'Запустить', action: 'start', style: 'primary' },
      { label: 'Стоп', action: 'stop', style: 'danger' },
      { label: 'Сброс', action: 'reset', style: 'secondary' },
    ] },
    { type: 'section', label: 'Параметры' },
    { type: 'input', id: 'target', label: 'Целевой аккаунт', placeholder: '@username', apply_label: 'Применить' },
    { type: 'textarea', id: 'notes', label: 'Заметки', placeholder: 'Произвольный текст...' },
    { type: 'stepper', id: 'threads', label: 'Потоки', value: 3, min: 1, max: 20 },
    { type: 'slider', id: 'delay', label: 'Задержка (сек)', value: 5, min: 1, max: 60 },
    { type: 'select', id: 'mode', label: 'Режим работы', value: 'soft', options: [
      { value: 'soft', label: 'Мягкий' },
      { value: 'normal', label: 'Стандартный' },
      { value: 'aggressive', label: 'Агрессивный' },
    ] },
    { type: 'toggle', id: 'auto_restart', label: 'Авто-рестарт при ошибке', value: true },
    { type: 'section', label: 'Данные' },
    { type: 'filelist', id: 'accounts', label: 'Список аккаунтов', list_count: 120 },
    { type: 'section', label: 'Состояние' },
    { type: 'progress', id: 'prog', label: 'Прогресс задачи', value: 62, total: 'Обработано 620 из 1000' },
    { type: 'stats', items: [
      { id: 's1', label: 'Обработано', value: '1 248', delta: '+84', trend: 'up' },
      { id: 's2', label: 'Успешно', value: '1 102', delta: '+78', trend: 'up' },
      { id: 's3', label: 'Ошибки', value: '146', delta: '-6', trend: 'down' },
    ] },
    { type: 'badges', label: 'Статус', items: [
      { label: 'Running', style: 'running' },
      { label: 'Online', style: 'online' },
    ] },
    { type: 'section', label: 'Расписание и вывод' },
    { type: 'schedule_time', id: 'regular_report', label: 'Регулярный отчёт', value: '09:30' },
    { type: 'schedule_datetime', id: 'final_report', label: 'Финальный отчёт', value: '' },
    { type: 'label', id: 'status_txt', label: 'Текущий статус', text: 'Ожидание задачи...', style: 'accent' },
    { type: 'image', id: 'screenshot', label: 'Последний скриншот', value: '' },
    { type: 'code', id: 'last_result', label: 'Последний результат', value: '{\n  "status": "ok",\n  "processed": 620,\n  "errors": 12\n}' },
    { type: 'table', id: 'accounts_tbl', label: 'Аккаунты', edit_cols: ['login'], columns: [
      { key: 'login', label: 'Логин' },
      { key: 'status', label: 'Статус' },
      { key: 'done', label: 'Выполнено' },
    ], rows: [
      { login: '@alice_ig', status: 'OK', done: '84', _style: { status: 'ok' } },
      { login: '@bob_ig', status: 'WARN', done: '31', _style: { status: 'warn' } },
      { login: '@carol_zp', status: 'ERR', done: '0', _style: { status: 'err' } },
    ] },
  ],
  stats: {
    blocks: [
      { type: 'kpi', items: [
        { label: 'Скликов за неделю', value: '1 248', delta: '+84', trend: 'up' },
        { label: 'Товаров сегодня', value: '12', delta: '+3', trend: 'up' },
        { label: 'Товаров за неделю', value: '57' },
      ] },
      { type: 'linechart', title: 'Склики по дням (неделя)', data: [
        { label: 'пт 20.06', v: 96 }, { label: 'сб 21.06', v: 143 }, { label: 'вс 22.06', v: 78 },
        { label: 'пн 23.06', v: 187 }, { label: 'вт 24.06', v: 154 }, { label: 'ср 25.06', v: 212 },
        { label: 'чт 26.06', v: 168 },
      ] },
      { type: 'ranklist', title: 'Топ-10 товаров за неделю', items: [
        { title: 'Экдистерон', sub: '29189428', value: 1239 },
        { title: 'Экдистерон', sub: '89275878', value: 988 },
        { title: 'Экдистерон', sub: '89289875', value: 932 },
      ] },
    ],
  },
};

export const DEMO_LOG = [
  ['INFO', 'Бот запущен, подключение к API...'],
  ['INFO', 'Авторизация прошла успешно'],
  ['WARN', 'Задержка API > 500ms, переключаюсь на резервный'],
  ['INFO', 'Обработано 100 аккаунтов'],
  ['SUCCESS', 'Успешно: 94 / Ошибки: 6'],
  ['ERROR', 'Connection timeout — retry 1/3'],
  ['INFO', 'Задача завершена, ожидаю следующую итерацию'],
];

/** Контролы по умолчанию — пока бот не прислал свой манифест. */
export const DEFAULT_CONTROLS = [
  { type: 'section', label: 'Управление потоком' },
  { type: 'buttons', id: 'flow', buttons: [
    { label: 'Запустить', action: 'start', style: 'primary' },
    { label: 'Стоп', action: 'stop', style: 'danger' },
    { label: 'Сброс', action: 'reset', style: 'secondary' },
  ] },
  { type: 'section', label: 'Состояние' },
  { type: 'progress', id: 'prog', label: 'Прогресс задачи', value: 0, total: '' },
];
