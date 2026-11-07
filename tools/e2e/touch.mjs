import fs from 'fs';
import {launch,mk,openModule,sideCount,measure,tap} from './lib.mjs';
const out=[]; const log=r=>{out.push(r);console.log(JSON.stringify(r).slice(0,300))};
const MODS=['Dashboard','Reports','Contacts','Markets','Products & Pricing','Requests & Matches','Deal Desk','Stock','Email','WhatsApp','Campaigns','KYC & Onboarding','Documents','Residency Tracker','Accounting','Cash Flow'];
const lines=async p=>new Set((await p.evaluate(()=>document.body.innerText)).split('\n').map(s=>s.trim()).filter(Boolean));
const diff=(a,b)=>[...b].filter(x=>!a.has(x)).slice(0,4);
const b=await launch();
for(const [W,H] of [[390,844],[768,1024]]){
 const {c,p}=await mk(b,{w:W,h:H,touch:true});
 for(const m of MODS){
  if(!(await openModule(p,m,true))){log({W,m,err:'nav'});continue;}
  const n=await sideCount(p,true); const N=Math.max(n,1);
  for(let i=0;i<N;i++){
   try{
    if(n){ let loc=p.locator('.mside-nav:visible'); if(!(await loc.count())) await sideCount(p,true); loc=p.locator('.mside-nav:visible'); if(i>=await loc.count())break; await tap(p,loc.nth(i),true); await p.waitForTimeout(400);} 
    const sw=p.locator('.rv-switch-item:visible',{hasText:/pipeline/i}).first();
    if(!(await sw.count())) continue;
    await tap(p,sw,true); await p.waitForTimeout(500);
    const side=n?(await p.locator('.mside-nav').nth(i).textContent().catch(()=>'')):'' ;
    const mores=p.locator('.rv-more:visible'); const nc=await mores.count();
    if(!nc){log({W,m,i,pipeline:true,cards:await p.locator('.rv-card').count(),moveMenu:false});continue;}
    // 1. Move-to menu
    p.errs=[]; const before=await lines(p);
    await tap(p,mores.first(),true); await p.waitForTimeout(300);
    const menu=p.locator('.rv-menu:visible').first(); const vis=await menu.count();
    let box=vis?await menu.boundingBox():null; const inView=box?(box.x>=-1&&box.x+box.width<=W+1&&box.y>=-1&&box.y+box.height<=H+1):null;
    const items=await p.locator('.rv-menu-item:visible').allTextContents();
    log({W,m,i,test:'menu-open',vis,inView,items:items.map(s=>s.trim())});
    // 2. blocked-move attempts: try Delivered, Shipped, then last enabled
    for(const want of [/deliver/i,/ship/i]){
      const mi=p.locator('.rv-menu-item:visible:not([disabled])',{hasText:want}).first();
      if(await p.locator('.rv-menu:visible').count()===0){await tap(p,p.locator('.rv-more:visible').first(),true);await p.waitForTimeout(250);} 
      if(await mi.count()){ const bf=await lines(p); const t=(await mi.textContent()).trim(); await tap(p,mi,true); await p.waitForTimeout(500); log({W,m,i,test:'move->'+t,newText:diff(bf,await lines(p)),errs:[...p.errs]}); }
    }
    await p.keyboard.press('Escape');
    // 3. tap card to open record
    const card=p.locator('.rv-card[data-clickable]:visible').first();
    if(await card.count()){ const bf=await lines(p); const url0=p.url(); await tap(p,card.locator('.rv-card-title'),true); await p.waitForTimeout(600);
      const dlg=await p.locator('[role=dialog]:visible').count(); const me=await measure(p);
      log({W,m,i,test:'tap-card',dialog:dlg,urlChanged:p.url()!==url0,newText:diff(bf,await lines(p)).slice(0,2),over:me.over,bad:me.bad,errs:[...p.errs]});
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      const bk=p.locator('button[aria-label*=Back i]:visible, button:has-text("Back"):visible').first(); if(!dlg&&await bk.count()){await tap(p,bk,true);await p.waitForTimeout(300);} 
    }
   }catch(e){log({W,m,i,err:String(e).slice(0,140)});}
  }
 }
 await c.close();
}
await b.close(); fs.writeFileSync('/home/claude/w/t/res_touch.json',JSON.stringify(out,null,1)); console.log('DONE',out.length);
