import { chromium } from 'playwright';
export const BASE='http://127.0.0.1:4777/';
export const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const STATE='/home/claude/w/t/state.json';
export async function launch(){return chromium.launch({executablePath:EXE});}
export async function mk(b,{w,h=900,theme='light',touch=false}){
  const c=await b.newContext({viewport:{width:w,height:h},storageState:STATE,hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  await c.addInitScript(t=>{try{localStorage.setItem('tfl.web.theme',t)}catch(e){}},theme);
  const p=await c.newPage(); p.setDefaultTimeout(5000); p.errs=[];
  p.on('console',m=>{if(m.type()==='error')p.errs.push('console:'+m.text().slice(0,160))});
  p.on('pageerror',e=>p.errs.push('pageerror:'+String(e).slice(0,160)));
  await p.goto(BASE); await p.waitForTimeout(900);
  return {c,p};
}
export async function tap(p,loc,touch){ if(touch) {try{await loc.tap({timeout:4000});return}catch(e){}} try{await loc.click({timeout:4000})}catch(e){await loc.evaluate(el=>el.click())} }
export async function openModule(p,label,touch){
  let it=p.locator('.mnav-item:visible',{hasText:label}).first();
  if(!(await it.count())){ await tap(p,p.locator("button[aria-label='Open menu']").first(),touch); await p.waitForTimeout(350); it=p.locator('.mnav-item:visible',{hasText:label}).first(); }
  if(!(await it.count())) return false;
  await tap(p,it,touch); await p.waitForTimeout(500); return true;
}
export async function sideCount(p,touch){
  let n=await p.locator('.mside-nav:visible').count();
  if(n===0){ const b=p.locator("button[aria-label$=' sections']:visible").first(); if(await b.count()){ await tap(p,b,touch); await p.waitForTimeout(350); n=await p.locator('.mside-nav:visible').count(); } }
  // expand collapsed groups
  for(let k=0;k<6;k++){ const g=p.locator('.mside-label[aria-expanded=false]:visible').first(); if(!(await g.count()))break; await tap(p,g,touch); await p.waitForTimeout(150);} 
  return p.locator('.mside-nav:visible').count();
}
export async function closeOverlays(p){ await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
export async function measure(p){
  return p.evaluate(()=>{
    const de=document.documentElement; const W=innerWidth; const over=de.scrollWidth-de.clientWidth; const bad=[];
    for(const e of document.querySelectorAll('body *')){
      const r=e.getBoundingClientRect(); if(!r.width||!r.height)continue;
      if(r.right>W+1){ let a=e.parentElement,clip=false;
        while(a&&a!==document.body){const s=getComputedStyle(a); if(/(auto|scroll|hidden|clip)/.test(s.overflowX)){const ar=a.getBoundingClientRect(); if(ar.right<=W+1){clip=true;break}} if(s.position==='fixed'&&0){} a=a.parentElement}
        const st=getComputedStyle(e); if(st.position==='fixed'||st.visibility==='hidden')continue;
        if(!clip) bad.push((e.className&&e.className.toString().slice(0,50)||e.tagName)+'@'+Math.round(r.right));
      }
    }
    const narrow=[]; for(const g of document.querySelectorAll('main *, [class*=grid]')){const s=getComputedStyle(g); if(s.display!=='grid')continue; const t=s.gridTemplateColumns.split(' ').map(parseFloat).filter(x=>!isNaN(x)); if(t.length>=2&&g.clientWidth>420&&t.some(x=>x<140)) narrow.push((g.className.toString().slice(0,60))+':'+t.map(Math.round).join('/'));}
    return {over,bad:bad.slice(0,3),narrow:narrow.slice(0,3)};
  });
}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
