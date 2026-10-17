// Uses only the screenshot fixture and the actual native-preference event boundary.
async (page, base='http://127.0.0.1:19876') => {
  const context=await page.context().browser().newContext({viewport:{width:1440,height:900}});
  const p=await context.newPage(), errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message)};
  const skins=['default','robot','astronaut','knight','wizard','explorer'];
  const setSkin=async skin=>{
    await p.evaluate(value=>{window.kliprunPreferences.klopikSkin=value;window.dispatchEvent(new Event('kliprun:preferences'))},skin);
    await p.waitForFunction(value=>[...document.querySelectorAll('.office-resident .office-mascot')].every(e=>e.dataset.klopikSkin===value),skin);
  };
  const variants=()=>p.locator('.office-resident').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.sessionId,n.querySelector('.office-mascot').dataset.klopikVariant])));
  const choose=async name=>{const button=p.getByRole('button',{name,exact:true});if(await button.isVisible())await button.click();else await p.getByRole('combobox',{name:'Office layout',exact:true}).selectOption({label:name})};
  try {
    await p.goto(base+'/office');await p.locator('.office-resident').first().waitFor();
    const defaultArt=await p.locator('.office-resident .office-mascot').first().innerHTML();
    const originalPositions=await p.locator('.office-resident').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')));
    for(const skin of skins){
      await setSkin(skin);
      check(await p.locator('.office-resident').count()===6,`${skin}: all characters remain`);
      if(skin!=='default')check(new Set(Object.values(await variants())).size>1,`${skin}: agent variation`);
      check(JSON.stringify(await p.locator('.office-resident').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform'))))===JSON.stringify(originalPositions),`${skin}: skin does not move characters`);
      await p.getByRole('button',{name:'Token usage leaderboard',exact:true}).click();
      await p.locator('.office-leaderboard-avatar').first().waitFor();
      check(await p.locator('.office-leaderboard-avatar .office-mascot').evaluateAll((nodes,skin)=>nodes.every(n=>n.dataset.klopikSkin===skin),skin),`${skin}: leaderboard follows`);
      const roster=await variants();
      check(await p.locator('[data-leaderboard-session]').evaluateAll((nodes,roster)=>nodes.every(n=>n.querySelector('.office-mascot').dataset.klopikVariant===roster[n.dataset.leaderboardSession]),roster),`${skin}: avatar variants match`);
      await p.keyboard.press('Escape');
    }
    for(const size of [{width:1440,height:900},{width:600,height:650}]){
      await p.setViewportSize(size);
      for(const plan of ['Shared loft','Team rooms','Long studio']){
        await choose(plan);
        for(const skin of skins){
          await setSkin(skin);
          await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
          check(await p.evaluate(()=>{const scene=document.querySelector('.office-world').getBoundingClientRect();return [...document.querySelectorAll('.office-resident')].every(e=>{const b=e.getBoundingClientRect();return b.left>=scene.left-1&&b.right<=scene.right+1&&b.top>=scene.top-1&&b.bottom<=scene.bottom+1})}),`${skin}/${plan}/${size.width}: no clipping`);
        }
      }
    }
    await p.setViewportSize({width:1440,height:900});await choose('Shared loft');await setSkin('wizard');
    const originalVariants=await variants();
    const board=await (await p.request.get(base+'/api/board')).json();
    for(const column of Object.values(board.columns))column.cards.reverse();
    await p.route('**/api/board',route=>route.fulfill({json:board}));
    await p.evaluate(()=>window.dispatchEvent(new Event('kliprun:board-refresh')));
    await p.waitForTimeout(100);
    const after=await variants();check(Object.entries(originalVariants).every(([id,v])=>after[id]===v),'Reordering does not change variants');
    await p.screenshot({path:'/private/tmp/kliprun-office-wizard.png'});
    for(const skin of skins.slice(1)){
      await setSkin(skin);
      await p.evaluate(()=>{window.kliprunPreferences.reduceMotion=false;window.dispatchEvent(new Event('kliprun:preferences'))});
      await p.waitForFunction(()=>!document.querySelector('.office-page').classList.contains('office-quiet'));
      check(await p.locator('[data-session-id="ses_demo_search"] .office-arm-left').evaluate(e=>getComputedStyle(e).animationName!=='none'),`${skin}: working animation`);
      await p.evaluate(()=>{window.kliprunPreferences.reduceMotion=true;window.dispatchEvent(new Event('kliprun:preferences'))});
      await p.waitForFunction(()=>document.querySelector('.office-page').classList.contains('office-quiet'));
      check(await p.locator('[data-session-id="ses_demo_search"] .office-arm-left').evaluate(e=>getComputedStyle(e).animationName==='none'),`${skin}: reduced motion`);
    }
    await setSkin('default');
    check(await p.locator('.office-resident .office-mascot').first().innerHTML()===defaultArt,'Default artwork is preserved');
    check(!errors.length,errors.join('\n'));
    return {passed:true,skins:6,variantsPerNewSkin:4,layouts:36,livePreferences:true,leaderboard:true,stableVariants:true,animation:true,errors};
  }finally{await context.close()}
}
