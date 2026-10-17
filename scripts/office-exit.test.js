// Fixture-only departure checks. Animation frames advance deterministically; no agent is launched.
async (page, base = 'http://127.0.0.1:19876', skin = 'default') => {
  const context = await page.context().browser().newContext({viewport:{width:1440,height:900}});
  const p = await context.newPage(), errors=[];
  p.on('pageerror', e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message)};
  const original=await (await p.request.get(base+'/api/board')).json();
  const clone=value=>JSON.parse(JSON.stringify(value));
  let board=clone(original);
  const leadId='ses_demo_search', helperId='ses_demo_checks';
  await p.route('**/api/board',route=>route.fulfill({json:board}));
  await context.addInitScript(()=>{
    let id=0,time=performance.now();const frames=new Map();
    window.requestAnimationFrame=cb=>{frames.set(++id,cb);return id};
    window.cancelAnimationFrame=id=>frames.delete(id);
    performance.now=()=>time;
    window.__stepOffice=ms=>{for(let elapsed=0;elapsed<ms;elapsed+=50){time+=50;const callbacks=[...frames.values()];frames.clear();for(const cb of callbacks)cb(time)}};
  });
  const actor=id=>p.locator(`.office-resident[data-session-id="${id}"]`);
  const refresh=()=>p.evaluate(()=>window.dispatchEvent(new Event('kliprun:board-refresh')));
  const step=ms=>p.evaluate(ms=>window.__stepOffice(ms),ms);
  const point=async id=>actor(id).evaluate(e=>({x:+e.dataset.x,y:+e.dataset.y}));
  try {
    await p.goto(base+'/office');await actor(helperId).waitFor();
    await p.evaluate(skin=>{window.kliprunPreferences.reduceMotion=false;window.kliprunPreferences.klopikSkin=skin;window.dispatchEvent(new Event('kliprun:preferences'));window.__exitSelections=[];window.webkit.messageHandlers.sessionSelected.postMessage=id=>window.__exitSelections.push(id)},skin);
    await p.waitForFunction(()=>!document.querySelector('.office-page').classList.contains('office-quiet'),null,{polling:50});
    await p.evaluate(()=>{
      window.__exitRemovals=[];
      new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node.matches?.('.office-resident'))window.__exitRemovals.push({id:node.dataset.sessionId,x:+node.dataset.x,y:+node.dataset.y,action:node.dataset.officeAction})}).observe(document.querySelector('.office-world'),{childList:true,subtree:true});
    });
    const initial=await point(helperId);
    board.columns.running.cards.find(c=>c.session_id===leadId).children=[];
    await refresh();
    await p.waitForFunction(id=>document.querySelector(`[data-session-id="${id}"]`)?.dataset.officeState==='leaving',helperId,{timeout:3000,polling:50});
    check(await actor(helperId).count()===1,'Removed helper retained');
    check(await actor(helperId).getAttribute('tabindex')==='-1','Departing helper is not selectable');
    await actor(helperId).dispatchEvent('click');check((await p.evaluate(()=>window.__exitSelections)).length===0,'Departed helper cannot open stale details');
    await step(500);const moved=await point(helperId);check(Math.hypot(moved.x-initial.x,moved.y-initial.y)>5,'Helper walks toward exit');
    board=clone(original);await refresh();
    await p.waitForFunction(id=>document.querySelector(`[data-session-id="${id}"]`)?.dataset.officeState==='working',helperId,{polling:50});
    check(await actor(helperId).count()===1,'Reappearing helper cancels departure without duplicate');
    for(const layout of ['Shared loft','Team rooms','Long studio']) {
      board=clone(original);await refresh();await actor(helperId).waitFor();await p.getByRole('button',{name:layout,exact:true}).click();
      board.columns.running.cards=board.columns.running.cards.filter(c=>c.session_id!==leadId);
      await refresh();await p.waitForFunction(id=>document.querySelector(`[data-session-id="${id}"]`)?.dataset.officeState==='leaving',leadId,{polling:50});
      check(await actor(helperId).getAttribute('data-office-state')==='leaving','Parent and helper depart together');
      check((await p.getByLabel('Find coworker',{exact:true}).innerText()).includes('4 coworkers'),'Departures excluded from live counts');
      await step(500);check(await actor(leadId).count()===1,'Root remains during travel');
      const exit=await p.locator('.office-exit').evaluate(e=>({x:+e.dataset.exitX,y:+e.dataset.exitY}));
      await p.evaluate(()=>{window.__exitRemovals=[]});
      await step(20000);await actor(leadId).waitFor({state:'detached'});await actor(helperId).waitFor({state:'detached'});
      const removals=await p.evaluate(()=>window.__exitRemovals);
      for(const id of [leadId,helperId]){const removed=removals.find(r=>r.id===id);check(removed?.action==='exited'&&Math.hypot(removed.x-exit.x,removed.y-exit.y)<1,`${layout}: character removed only at exit`)}
    }
    board=clone(original);await refresh();await actor(helperId).waitFor();
    for(const column of Object.values(board.columns)){column.cards=[];column.count=0}
    await refresh();await p.waitForFunction(()=>document.querySelectorAll('[data-office-state="leaving"]').length===6,null,{polling:50});
    check(await p.getByText('The office is quiet',{exact:true}).count()===0,'Empty overlay waits for departures');
    await p.setViewportSize({width:700,height:650});await step(500);
    const visibleDoor=await p.evaluate(()=>{const door=document.querySelector('.office-exit').getBoundingClientRect(),camera=document.querySelector('.office-camera').getBoundingClientRect();return door.right<camera.left||door.bottom<camera.top});
    check(visibleDoor,'Exit must not be hidden by camera controls');
    await p.screenshot({path:'/private/tmp/kliprun-office-exit-small.png'});
    await step(25000);await p.getByText('The office is quiet',{exact:true}).waitFor();
    check(await p.locator('.office-resident').count()===0,'No ghosts after last departure');
    board=clone(original);await refresh();await actor(helperId).waitFor();
    await p.evaluate(()=>{window.kliprunPreferences.reduceMotion=true;window.dispatchEvent(new Event('kliprun:preferences'))});
    board.columns.running.cards.find(c=>c.session_id===leadId).children=[];await refresh();await actor(helperId).waitFor({state:'detached'});
    check(await p.locator('[data-office-state="leaving"]').count()===0,'Reduced motion removes without walking');
    check(errors.length===0,errors.join('\n'));
    return {passed:true,checks:'Helper departure, reappearance cancellation, root + child exit in all layouts, counts, selection, empty office, resize, reduced motion',errors};
  } finally {await context.close()}
}
