import { readFileSync, writeFileSync } from 'fs';

// Артефакт не может ходить за внешними файлами (CSP), поэтому наклейки
// вшиваем прямо в страницу как data URI.
const PICKED = [1, 9, 17, 4, 5, 6, 7, 8, 2, 10, 11, 12];
const dir = 'D:\\CloudeCodeProject\\Horseoff\\stickers\\';

const uris = PICKED.map((n) => {
  const f = `${dir}sticker-${String(n).padStart(2, '0')}.png`;
  return 'data:image/png;base64,' + readFileSync(f).toString('base64');
});

const tpl = readFileSync('concept-app.template.html', 'utf-8');
const out = tpl.replace('__STICKERS__', JSON.stringify(uris));
writeFileSync('concept-app.html', out);
console.log('written concept-app.html', (out.length / 1024 / 1024).toFixed(2), 'MB');
