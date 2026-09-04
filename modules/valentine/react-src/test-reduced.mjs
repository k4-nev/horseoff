import { chromium } from 'playwright';
const URL='http://localhost:8899/modules/valentine/react-src/concept-app.html';
const b=await chromium.launch();

// Ровно тот режим, в котором смотрит пользователь
const p=await b.newPage({viewport:{width:1280,height:860},reducedMotion:'reduce',deviceScaleFactor:2});
p.on('pageerror',e=>console.log('[PAGEERROR]',e.message));
await p.goto(URL); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(700);

const noteVisible=await p.evaluate(()=>getComputedStyle(document.querySelector('.motion-note')).display);
console.log('1 плашка про анимации показана:',noteVisible!=='none',`(display: ${noteVisible})`);
await p.screenshot({path:'red-1-note.png'});

const fade=async()=>p.evaluate(async()=>{
  const out=[];const t0=performance.now();
  document.getElementById(document.getElementById('paneA').dataset.state==='shown'?'tabB':'tabA').click();
  await new Promise(r=>{const tick=()=>{out.push(+getComputedStyle(document.getElementById('paneB')).opacity);
    if(performance.now()-t0<900)requestAnimationFrame(tick);else r();};requestAnimationFrame(tick);});
  return new Set(out.map(v=>v.toFixed(2))).size;
});
console.log('2 до нажатия — промежуточных кадров фейда:',await fade(),'(мягкая деградация: >2, не мгновенно)');

await p.click('.motion-note button');
await p.waitForTimeout(200);
const cls=await p.evaluate(()=>document.documentElement.className);
const dur=await p.evaluate(()=>getComputedStyle(document.querySelector('.person .face')).transitionDuration);
console.log('3 после «Показать движение» — класс:',JSON.stringify(cls),'| длительность ховера:',dur);
console.log('4 после нажатия — промежуточных кадров фейда:',await fade(),'(ждём ~30+)');

// Полёт карточки в полноценном режиме
await p.waitForTimeout(400);
const flight=await p.evaluate(async()=>{
  const out=[];const t0=performance.now();
  document.querySelector('.mini .face').click();
  await new Promise(r=>{const tick=()=>{const s=document.querySelector('.slide[data-off="0"]');
    if(s)out.push(getComputedStyle(s).transform);
    if(performance.now()-t0<1400)requestAnimationFrame(tick);else r();};requestAnimationFrame(tick);});
  return new Set(out).size;
});
console.log('5 полёт карточки — различных transform:',flight,'(ждём >10)');
await p.waitForTimeout(500);
await p.screenshot({path:'red-2-viewer.png'});

// Перезагрузка: выбор должен запомниться
await p.reload(); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(600);
const after=await p.evaluate(()=>({cls:document.documentElement.className,
  note:getComputedStyle(document.querySelector('.motion-note')).display}));
console.log('6 после перезагрузки — класс:',JSON.stringify(after.cls),'| плашка скрыта:',after.note==='none');
await b.close();
