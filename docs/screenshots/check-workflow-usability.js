// Playwright callback; run only against the fixture preview on port 18799.
async (page, base = 'http://127.0.0.1:18799') => {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  await page.setViewportSize({width:1440,height:1000}); await page.goto(`${base}/workflow`);
  await page.locator('.workflow-project-row').waitFor();
  if(await page.getByRole('button',{name:'Show workflow list'}).count())await page.getByRole('button',{name:'Show workflow list'}).click();
  await page.locator('.workflow-list button').filter({hasText:'Aurora'}).click();
  const left=page.getByRole('separator',{name:'Resize workflow list'}),right=page.getByRole('separator',{name:'Resize task details'});
  await left.focus();await page.keyboard.press('End');await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  await right.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');
  const l=await left.getAttribute('aria-valuenow'),r=await right.getAttribute('aria-valuenow');
  await page.getByRole('button',{name:'Hide workflow list'}).click();await page.reload();
  await page.getByRole('button',{name:'Show workflow list'}).click();
  assert(await left.getAttribute('aria-valuenow')===l,'Sidebar width was not restored');
  assert(await right.getAttribute('aria-valuenow')===r,'Details width was not restored');
  if(await page.getByRole('button',{name:'Accept result',exact:true}).count()){await page.getByRole('button',{name:'Accept result',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).waitFor();}
  await page.getByRole('button',{name:'Start',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Authorize & Start'}).click();
  await page.locator('.workflow-agents button').first().waitFor();
  await page.getByRole('button',{name:'Accept result',exact:true}).waitFor({timeout:15000});
  await page.getByRole('button',{name:'Fit view',exact:true}).click();
  await page.locator('[data-testid=workflow-card-review] .workflow-card-title').click();
  await page.getByRole('button',{name:'Responses',exact:true}).click();
  await page.locator('.workflow-readable-review').waitFor();
  assert((await page.locator('.workflow-readable-review').innerText()).includes('Approved'),'Review verdict is unreadable');
  assert(await page.getByRole('button',{name:'Log',exact:true}).count()===0,'Raw Log remains');
  assert((await page.locator('[data-testid=workflow-card-build] .workflow-card-footer').innerText()).includes('total'),'Total duration missing');
  await page.setViewportSize({width:620,height:800});await page.getByRole('button',{name:'Hide workflow list'}).click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow window overflows');
  await page.getByRole('button',{name:'Accept result',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).waitFor();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('Add preset task',{exact:true}).selectOption('review-text');
  await page.getByRole('button',{name:'Settings',exact:true}).last().click();
  assert((await page.getByLabel('Task',{exact:true}).inputValue()).includes('unsupported claims'),'Text review preset is missing');
  await page.getByRole('button',{name:'Delete card',exact:true}).click();
  await page.getByLabel('Add preset task',{exact:true}).selectOption('git-request');
  await page.getByRole('button',{name:'Settings',exact:true}).last().click();
  assert(await page.getByLabel('Target branch',{exact:true}).inputValue()==='','Git preset guessed a target branch');
  await page.getByRole('button',{name:'Delete card',exact:true}).click();
  await page.getByRole('button',{name:'Save workflow',exact:true}).click();
  const target=await page.evaluate(async()=>{const doc=await(await fetch('/api/workflows/document?id=demo-workflow')).json();return {workflowId:'demo-workflow',runId:doc.runs[0].id,nodeId:'review'};});
  await page.getByRole('button',{name:'Kanban',exact:true}).click();
  await page.evaluate(target=>{window.kliprunPendingWorkflow=target;window.dispatchEvent(new CustomEvent('kliprun:navigate',{detail:'/workflow'}));window.dispatchEvent(new CustomEvent('kliprun:workflow',{detail:target}));},target);
  await page.locator('.workflow-readable-review').waitFor();
  assert(await page.locator('.workflow-add-row label select').inputValue()===target.runId,'Notification did not open its run');
  return {passed:true,listWidth:l,detailsWidth:r,viewports:['1440×1000','620×800']};
}
