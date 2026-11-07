import fs from 'fs';
import {launch,mk,openModule,sideCount,measure,tap,sleep,BASE} from './lib.mjs';
const W=+process.argv[2]; const out=[]; const log=(r)=>{out.push(r);console.log(JSON.stringify(r).slice(0,220));};
const MODS=['Requests & Matches','Markets','Stock','WhatsApp','Campaigns','Cash Flow'];
const b=await launch();
for(const theme of ['light','dark']){
  // ---------- task 1: side tabs
  const {c,p}=await mk(b,{w:W,theme});
  for(const m of MODS){
    if(!(await openModule(p,m))){log({task:'side',W,theme,m,err:'module not found'});continue;}
    let n=await sideCount(p); const labels=await p.locator('.mside-nav:visible').allTextContents();
    for(let i=0;i<n;i++){
      try{
        await openModule(p,m); await sideCount(p); const loc=p.locator('.mside-nav:visible');
        if(i>=await loc.count()){log({task:'side',W,theme,m,i,err:'item gone after reopen'});continue;}
        const lab=(await loc.nth(i).textContent()).trim().replace(/\s+/g,' ');
        p.errs=[]; await tap(p,loc.nth(i)); await p.waitForTimeout(450);
        const me=await measure(p); const dlg=await p.locator('[role=dialog]:visible').count();
        if(dlg){ await p.keyboard.press('Escape'); await p.waitForTimeout(200);} 
        log({task:'side',W,theme,m,i,lab,over:me.over,bad:me.bad,narrow:me.narrow,dlg,errs:[...p.errs]});
      }catch(e){log({task:'side',W,theme,m,i,err:String(e).slice(0,120)});}
    }
  }
  // ---------- task 2: settings panels
  const ensureList=async()=>{
    for(let k=0;k<4;k++){ if(await p.locator('.settings-row:visible').count()) return; const bk=p.locator('.settings-detail-back:visible'); if(await bk.count()){await tap(p,bk.first()); await p.waitForTimeout(250);} else break; }
    if(await p.locator('.settings-row:visible').count()) return;
    await p.goto(BASE); await p.waitForTimeout(800); await openModule(p,'Settings'); await p.waitForTimeout(500);
  };
  await openModule(p,'Settings'); await p.waitForTimeout(500);
  await ensureList(); const rows=await p.locator('.settings-row').count();
  for(let i=0;i<rows;i++){
    try{
      await ensureList(); const row=p.locator('.settings-row').nth(i); const lab=(await row.locator('.settings-row-title').textContent()).trim();
      p.errs=[]; await tap(p,row); await p.waitForTimeout(700);
      const me=await measure(p); const subs=await p.locator('.settings-detail-body button.w-full:visible').count();
      log({task:'settings',W,theme,i,lab,over:me.over,bad:me.bad,narrow:me.narrow,errs:[...p.errs]});
      if(/module settings/i.test(lab)&&subs>=3){
        for(let j=0;j<subs;j++){
          await ensureList(); await tap(p,p.locator('.settings-row').nth(i)); await p.waitForTimeout(500);
          const sb=p.locator('.settings-detail-body button.w-full:visible'); if(j>=await sb.count()) break;
          const sl=(await sb.nth(j).textContent()).trim().replace(/\s+/g,' ').slice(0,30);
          p.errs=[]; await tap(p,sb.nth(j)); await p.waitForTimeout(600);
          const m2=await measure(p);
          log({task:'settings-sub',W,theme,lab:lab+' > '+sl,over:m2.over,bad:m2.bad,narrow:m2.narrow,errs:[...p.errs]});
        }
      }
    }catch(e){log({task:'settings',W,theme,i,err:String(e).slice(0,120)});}
  }
  await c.close();
}
await b.close();
fs.writeFileSync(`/home/claude/w/t/res_${W}.json`,JSON.stringify(out,null,1));
console.log('done',W,out.length);
