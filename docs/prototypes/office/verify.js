async (page) => {
  const errors=[],external=[],checks=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message)};
  const onError=e=>errors.push(e.message);
  const onRequest=r=>{if(!/^(http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|file:|data:)/.test(r.url()))external.push(r.url())};
  page.on('pageerror',onError);page.on('request',onRequest);
  const settings=async(callback)=>{await page.locator('#settings-toggle').click();await callback();await page.keyboard.press('Escape')};
  try{
    await page.goto('http://127.0.0.1:8768/');
    await page.evaluate(()=>localStorage.removeItem('kliprun-living-office'));
    await page.reload();await page.emulateMedia({reducedMotion:'no-preference'});
    await settings(async()=>{await page.locator('#motion').selectOption('off')});
    await page.locator('[data-phase="3"]').click();
    await page.locator('#pause').click();
    for(const [width,height]of [[1440,1000],[1200,800],[980,660]]){
      await page.setViewportSize({width,height});
      for(const dock of ['hidden','bottom','left']){
        let current=await page.locator('#app').getAttribute('data-dock');
        if(dock==='hidden'&&current!=='hidden')await page.locator('#close-terminal').click();
        if(dock!=='hidden'){
          if(current==='hidden')await page.locator('#terminal-toggle').click();
          if(await page.locator('#app').getAttribute('data-dock')!==dock)await page.locator('#move-terminal').click();
        }
        for(const plan of ['loft','pods','studio']){
          await page.locator(`[data-plan=${plan}]`).click();
          const state=await page.evaluate(()=>{
            const r=document.querySelector('#world').getBoundingClientRect();
            const actors=[...document.querySelectorAll('[data-agent]')];
            return {count:actors.length,overflow:document.documentElement.scrollWidth>innerWidth,
              outside:actors.filter(e=>{const b=e.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1}).map(e=>e.dataset.agent),
              helpers:actors.filter(e=>e.dataset.parent==='lead').length};
          });
          const label=`${plan}/${dock}/${width}×${height}`;
          assert(state.count===8&&state.helpers===3,label+': team members missing');
          assert(!state.overflow,label+': page overflow');
          assert(!state.outside.length,label+': actors outside floor: '+state.outside);
          checks.push(label);
        }
      }
    }
    await page.setViewportSize({width:1280,height:900});
    await page.locator('#close-terminal').click();await page.locator('[data-plan=loft]').click();
    await page.locator('[data-agent=helper0]').click();
    assert(await page.locator('#app').getAttribute('data-dock')==='hidden','Selecting a coworker opened hidden terminal');
    assert((await page.locator('#selected-meta').innerText()).includes('Helper of Atlas lead'),'Parent relationship missing from inspector');
    await page.locator('#open-terminal').click();
    assert((await page.locator('#terminal-body').innerText()).includes('Run integration checks'),'Terminal failed to show selected helper');
    await page.locator('[data-agent=aurora]').focus();await page.keyboard.press('Enter');
    assert((await page.locator('#terminal-body').innerText()).includes('Refine onboarding UI'),'Keyboard selection did not follow visible terminal');
    const separator=page.locator('#divider');await separator.focus();const before=+await separator.getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowRight');assert(+await separator.getAttribute('aria-valuenow')>before,'Keyboard dock resizing failed');
    await page.locator('#close-terminal').click();
    await page.locator('#zoom-in').click();assert(+await page.locator('#world').getAttribute('data-zoom')>1,'Zoom did not change camera');
    await page.locator('#fit').click();assert(await page.locator('#world').getAttribute('data-zoom')==='1','Fit did not restore whole floor');
    await settings(async()=>{await page.locator('#motion').selectOption('full');await page.locator('#speed').selectOption('2')});
    await page.locator('[data-phase="0"]').click();assert(await page.locator('[data-agent]').count()===6,'Restart did not dismiss extra helpers');
    await page.locator('#helpers').click();assert(await page.locator('[data-agent]').count()===8,'Call helpers did not spawn the two helpers');
    const start=await page.locator('[data-agent=lead]').getAttribute('transform');await page.waitForTimeout(400);
    assert(await page.locator('[data-agent=lead]').getAttribute('transform')!==start,'Lead did not walk to welcome helpers');
    await page.locator('#pause').click();const frozen=await page.locator('[data-agent=lead]').getAttribute('transform');await page.waitForTimeout(250);
    assert(await page.locator('[data-agent=lead]').getAttribute('transform')===frozen,'Pause did not freeze movement');
    await settings(async()=>{await page.locator('#motion').selectOption('off')});
    await page.locator('[data-phase="4"]').click();
    assert(await page.locator('[data-agent=helper1]').getAttribute('data-action')==='reviewing','Helper did not bring results for review');
    await settings(async()=>{await page.locator('#motion').selectOption('full')});
    await page.locator('[data-phase="6"]').click();
    const samples=[];
    for(let i=0;i<45;i++){
      samples.push(await page.evaluate(()=>{
        const a=document.querySelector('[data-agent=lead]');
        const x=+a.dataset.x,y=+a.dataset.y;
        const hit=[...document.querySelectorAll('[data-wall]')].some(w=>x>+w.dataset.x&&x<+w.dataset.x + +w.dataset.width&&y>+w.dataset.y&&y<+w.dataset.y + +w.dataset.height);
        return {x,y,action:a.dataset.action,hit};
      }));await page.waitForTimeout(100);
    }
    assert(!samples.some(s=>s.hit),'Lead walked through the wall between review and lounge');
    assert(samples.some(s=>s.action==='walking')&&samples.some(s=>s.action==='coffee'),'Review-to-coffee journey never completed');
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-phase="3"]').click();
    assert(await page.locator('[data-agent=lead]').getAttribute('data-action')==='watching','Reduced motion did not snap to destination');
    assert(await page.locator('[data-agent=lead] .body').evaluate(e=>getComputedStyle(e).animationName==='none'),'Reduced motion still animates');
    await settings(async()=>{await page.locator('#labels').uncheck();await page.locator('#team-links').uncheck()});
    await page.reload();assert(await page.locator('#app').evaluate(e=>e.classList.contains('no-labels')&&e.classList.contains('no-links')),'Display preferences did not persist');
    assert(errors.length===0,'Browser errors: '+errors.join('; '));assert(external.length===0,'External requests: '+external.join('; '));
    await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>localStorage.removeItem('kliprun-living-office'));await page.reload();
    return {layoutChecks:checks.length,actors:8,helpers:3,interactions:'spawn, walking, hierarchy, keyboard selection, terminal following, resize, zoom, pause, wall avoidance, review, coffee, reduced motion, persistence',browserErrors:errors,externalRequests:external};
  }finally{page.off('pageerror',onError);page.off('request',onRequest)}
}
