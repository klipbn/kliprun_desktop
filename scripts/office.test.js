// Playwright callback against the fixture-only preview at 127.0.0.1:18796.
async (page, base='http://127.0.0.1:18796') => {
  const errors=[],external=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message)};
  const clone=value=>JSON.parse(JSON.stringify(value));
  let board, original;
  const onError=e=>errors.push(e.message);
  const onRequest=r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url())};
  page.on('pageerror',onError);page.on('request',onRequest);
  await page.route(`${base}/api/board`,async route=>{
    if(!original){original=await (await route.fetch()).json();board=clone(original)}
    await route.fulfill({json:board});
  });
  await page.route(`${base}/api/session/*`,async route=>{
    const detail=await (await route.fetch()).json();
    const id=decodeURIComponent(route.request().url().split('/').at(-1));
    await route.fulfill({json:{...detail,session_id:id,title:`Details: ${id}`}});
  });
  const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('kliprun:board-refresh')));
  const choose=async name=>{
    const button=page.getByRole('button',{name,exact:true});
    if(await button.isVisible())await button.click();else await page.getByRole('combobox',{name:'Office layout',exact:true}).selectOption({label:name});
  };
  const actor=id=>page.locator(`.office-resident[data-session-id="${id}"]`);
  try{
    await page.goto(base+'/office');await page.evaluate(()=>localStorage.removeItem('kliprun.officePreferences'));await page.reload();
    await page.locator('.office-resident').first().waitFor();
    const layouts=[];
    for(const [width,height]of [[1440,1000],[980,660],[980,330],[520,660],[520,330]]){
      await page.setViewportSize({width,height});
      for(const name of ['Shared loft','Team rooms','Long studio']){
        await choose(name);
        // ResizeObserver and React commit before measuring the new world.
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const layout=await page.evaluate(()=>{
          const scene=document.querySelector('.office-world').getBoundingClientRect();
          const actors=[...document.querySelectorAll('.office-resident')];
          return {count:actors.length,overflow:document.documentElement.scrollWidth>innerWidth,
            outside:actors.filter(e=>{const r=e.getBoundingClientRect();return r.left<scene.left-1||r.right>scene.right+1||r.top<scene.top-1||r.bottom>scene.bottom+1}).map(e=>e.dataset.sessionId)};
        });
        assert(layout.count===6,`${name}/${width}×${height}: missing coworkers`);
        assert(!layout.overflow&&!layout.outside.length,`${name}/${width}×${height}: clipped ${layout.outside}`);
        layouts.push(`${name}/${width}×${height}`);
      }
    }
    await page.setViewportSize({width:1440,height:1000});await choose('Team rooms');
    await page.reload();await page.waitForFunction(()=>document.querySelector('.office-page')?.dataset.layout==='pods');
    await page.getByRole('button',{name:'Office settings',exact:true}).click();
    await page.getByRole('checkbox',{name:'Name tags',exact:true}).uncheck();
    await page.getByRole('checkbox',{name:'Team connections',exact:true}).uncheck();
    await page.keyboard.press('Escape');await page.reload();
    await page.waitForFunction(()=>document.querySelector('.office-scene')?.classList.contains('office-hide-labels'));
    assert(await page.locator('.office-scene').evaluate(e=>e.classList.contains('office-hide-links')),'Team connections setting was lost');
    await page.evaluate(()=>{
      window.__officeMessages=[];window.__officeActions=[];window.__officeSelections=[];
      window.webkit.messageHandlers.officePreferences={postMessage:value=>window.__officeMessages.push(value)};
      window.webkit.messageHandlers.desktopAction.postMessage=value=>window.__officeActions.push(value);
      window.webkit.messageHandlers.sessionSelected.postMessage=id=>window.__officeSelections.push(id);
    });
    await choose('Shared loft');
    assert((await page.evaluate(()=>window.__officeMessages.at(-1))).layout==='loft','Layout was not sent to macOS');
    await actor('ses_demo_checks').focus();await page.keyboard.press('Enter');
    await page.getByTestId('details-panel').getByText('Details: ses_demo_checks',{exact:true}).waitFor();
    assert((await page.evaluate(()=>window.__officeActions)).length===0,'Selecting a coworker opened the hidden terminal');
    assert((await page.evaluate(()=>window.__officeSelections)).at(-1)==='ses_demo_checks','Keyboard selection did not select helper');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('kliprun:terminal-selection',{detail:'ses_demo_search'})));
    await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_search"]')?.dataset.activeTerminal==='true');
    assert(await page.locator('.office-resident[data-active-terminal=true]').count()===1,'Active terminal highlight is ambiguous');
    await page.getByTestId('details-panel').getByRole('button',{name:'Close details',exact:true}).click();
    await page.getByRole('button',{name:'Token usage leaderboard',exact:true}).click();
    await page.locator('[data-leaderboard-session="ses_demo_search"]').waitFor();
    await page.locator('.office-leaderboard-list').getByText('265.0k',{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    assert(+await page.locator('.office-world').getAttribute('data-zoom')>1,'Zoom failed');
    await page.getByRole('button',{name:'Fit',exact:true}).click();
    assert(await page.locator('.office-world').getAttribute('data-zoom')==='1','Fit failed');
    await page.evaluate(()=>{window.kliprunPreferences.reduceMotion=false;window.dispatchEvent(new Event('kliprun:preferences'))});
    const lead=board.columns.running.cards.find(c=>c.session_id==='ses_demo_search');
    lead.children.push({...clone(lead.children[0]),session_id:'ses_demo_new_helper',title:'Check edge cases',parent_id:lead.session_id});
    await refresh();await actor('ses_demo_new_helper').waitFor();
    assert(await actor('ses_demo_new_helper').getAttribute('data-office-parent')==='ses_demo_search','New helper lost its real parent');
    await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_new_helper"]')?.dataset.officeAction==='walking');
    const before=await actor('ses_demo_new_helper').getAttribute('transform');await page.waitForTimeout(300);
    assert(await actor('ses_demo_new_helper').getAttribute('transform')!==before,'New helper is not walking');
    // Native reduced motion must stop JS travel as well as CSS poses.
    await page.evaluate(()=>{window.kliprunPreferences.reduceMotion=true;window.dispatchEvent(new Event('kliprun:preferences'))});
    await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_new_helper"]')?.dataset.officeAction==='settled');
    assert(await actor('ses_demo_new_helper').locator('.office-arm-left').evaluate(e=>getComputedStyle(e).animationName==='none'),'Native reduced motion ignored');
    const newcomer=lead.children[1];newcomer.column='attention';newcomer.stage='Waiting for approval';newcomer.running_since=null;
    await refresh();await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_new_helper"]')?.dataset.officeArea==='waiting');
    assert(await actor('ses_demo_new_helper').getAttribute('data-office-state')==='waiting','Walking altered observed state');
    newcomer.source='codex';newcomer.column='idle';newcomer.stage='Status unknown';
    await refresh();await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_new_helper"]')?.dataset.officeState==='unknown');
    assert(await actor('ses_demo_new_helper').getAttribute('data-office-area')==='waiting','Unknown status moved the coworker to an invented state');
    newcomer.stage='Finished';newcomer.source='opencode';newcomer.finished_at=original.generated_at;
    await refresh();await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_new_helper"]')?.dataset.officeState==='resting');
    assert(await actor('ses_demo_new_helper').getAttribute('data-office-area')==='waiting','Idle grace was skipped');
    await page.evaluate(now=>{Date.now=()=>now+6000},original.generated_at);await refresh();
    await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_new_helper"]')?.dataset.officeArea==='lounge');
    lead.children.pop();await refresh();await page.waitForFunction(()=>!document.querySelector('[data-session-id="ses_demo_new_helper"]'));
    board=clone(original);for(const column of Object.values(board.columns)){column.cards=[];column.count=0}
    await refresh();await page.getByText('The office is quiet',{exact:true}).waitFor();assert(await page.locator('.office-resident').count()===0,'Empty office invented coworkers');
    board=clone(original);await refresh();await actor('ses_demo_search').waitFor();
    await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{window.kliprunPreferences.reduceMotion=false;window.dispatchEvent(new Event('kliprun:preferences'))});
    assert(await actor('ses_demo_search').locator('.office-arm-left').evaluate(e=>getComputedStyle(e).animationName==='none'),'OS reduced motion ignored');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_search"]')?.dataset.officeAction==='walking',{},{timeout:18000});
    await page.waitForFunction(()=>document.querySelector('[data-session-id="ses_demo_search"]')?.dataset.officeAction==='supervising',{},{timeout:8000});
    const visit=await page.evaluate(()=>{
      const lead=document.querySelector('[data-session-id="ses_demo_search"]'),child=document.querySelector('[data-session-id="ses_demo_checks"]');
      return {state:lead.dataset.officeState,distance:Math.hypot(+lead.dataset.x-(+child.dataset.x),+lead.dataset.y-(+child.dataset.y))};
    });
    assert(visit.state==='working'&&visit.distance<100,'Lead did not check on its real helper while retaining observed status');
    assert(!errors.length,'Browser errors: '+errors.join('; '));assert(!external.length,'External requests: '+external.join('; '));
    return {layoutChecks:layouts.length,liveUpdates:'helper arrival, lead supervision, waiting, unknown, idle grace, lounge, removal, empty board',controls:'saved layouts/settings, native persistence message, selection, terminal highlight, leaderboard, zoom, reduced motion',browserErrors:errors,externalRequests:external};
  }finally{
    page.off('pageerror',onError);page.off('request',onRequest);
    await page.unroute(`${base}/api/board`);await page.unroute(`${base}/api/session/*`);
  }
}
