import { chromium } from 'playwright';
const URL='http://localhost:8899/modules/valentine/react-src/concept-app.html';
const b=await chromium.launch();
for(const rm of ['no-preference','reduce']){
  const p=await b.newPage({viewport:{width:1280,height:860},reducedMotion:rm});
  await p.goto(URL); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(800);
  const d=await p.evaluate(()=>getComputedStyle(document.querySelector('.person .face')).transitionDuration);
  const pts=await p.evaluate(async()=>{
    const out=[];const t0=performance.now();
    document.getElementById('tabB').click();
    await new Promise(r=>{const tick=()=>{out.push(+getComputedStyle(document.getElementById('paneB')).opacity);
      if(performance.now()-t0<700)requestAnimationFrame(tick);else r();};requestAnimationFrame(tick);});
    return out;
  });
  const uniq=new Set(pts.map(v=>v.toFixed(2))).size;
  console.log(`reducedMotion=${rm.padEnd(14)} длительность ховера: ${d.padEnd(12)} промежуточных кадров фейда: ${uniq}`);
  await p.close();
}
await b.close();
