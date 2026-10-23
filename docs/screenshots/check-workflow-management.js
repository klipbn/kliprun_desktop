// Playwright callback against fixture-only preview.ts; no user repository or model is touched.
async (page, base='http://127.0.0.1:18799') => {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  await page.setViewportSize({width:1440,height:1000});await page.goto(`${base}/workflow`);
  await page.locator('.workflow-project-row').waitFor();
  if(await page.getByRole('button',{name:'Show workflow list',exact:true}).count())await page.getByRole('button',{name:'Show workflow list',exact:true}).click();
  const select=id=>page.locator(`[data-workflow-id="${id}"] .workflow-list-item`).click();
  const menu=async id=>{await page.locator(`[data-workflow-id="${id}"]`).hover();await page.locator(`[data-workflow-id="${id}"] .workflow-actions`).click();};
  await select('demo-workflow');
  const other=await page.evaluate(async()=>{
    const doc=await(await fetch('/api/workflows/document?id=demo-workflow')).json();
    const definition={...doc.definition,id:'demo-workflow-notes',name:'Notes review',nodes:[{...doc.definition.nodes[0],id:'draft',title:'Write outline',resultKind:'text'}],edges:[]};
    const response=await fetch('/api/workflows/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({definition})});if(!response.ok)throw Error('Fixture setup failed');return definition.id;
  });
  await page.locator(`[data-workflow-id="${other}"]`).waitFor();
  if(await page.getByRole('button',{name:'Accept result',exact:true}).count()){await page.getByRole('button',{name:'Accept result',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).waitFor();}
  await page.getByRole('button',{name:'Start',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Start workflow'}).click();
  await page.getByRole('button',{name:'Accept result',exact:true}).waitFor({timeout:15000});
  await menu('demo-workflow');assert(await page.getByRole('menuitem',{name:'Delete…',exact:true}).isDisabled(),'Active workflow can be deleted');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Accept result',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).waitFor();
  const runA=await page.evaluate(async()=> (await(await fetch('/api/workflows/document?id=demo-workflow')).json()).runs[0].id);
  await page.getByLabel('Run history',{exact:true}).selectOption(runA);
  await select(other);await page.waitForFunction(()=>document.querySelector('.workflow-project-row input')?.value==='Notes review');
  assert(await page.getByLabel('Run history',{exact:true}).isDisabled(),'Empty workflow inherited another history');
  assert(await page.getByLabel('Run history',{exact:true}).inputValue()==='','Foreign run remained selected');
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await page.waitForFunction(async id=>(await(await fetch(`/api/workflows/document?id=${id}`)).json()).runs[0]?.status==='completed',other);
  const runB=await page.evaluate(async id=>(await(await fetch(`/api/workflows/document?id=${id}`)).json()).runs[0].id,other);
  await page.getByLabel('Run history',{exact:true}).selectOption(runB);
  assert(!(await page.getByLabel('Run history',{exact:true}).locator('option').evaluateAll(es=>es.map(e=>e.value))).includes(runA),'Run history contains a foreign run');
  await select('demo-workflow');await page.getByLabel('Run history',{exact:true}).selectOption(runA);
  assert(!(await page.getByLabel('Run history',{exact:true}).locator('option').evaluateAll(es=>es.map(e=>e.value))).includes(runB),'History leaked in the reverse direction');
  await menu(other);await page.getByRole('menuitem',{name:'Rename',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Workflow name',{exact:true}).fill('Notes · renamed');await dialog.getByRole('button',{name:'Rename',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await menu('demo-workflow');await page.getByRole('menuitem',{name:'Hide workflow',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-workflow-id="demo-workflow"]'));
  assert((await page.locator(`[data-workflow-id="${other}"] time`).innerText()).match(/\d{2}:\d{2}/),'Exact clock time is missing');
  await page.reload();await page.getByRole('button',{name:'Show hidden workflows',exact:true}).click();await page.locator('[data-workflow-id="demo-workflow"]').waitFor();
  await menu('demo-workflow');await page.getByRole('menuitem',{name:'Show workflow',exact:true}).click();
  await page.getByLabel('Search workflows',{exact:true}).fill('renamed');assert(await page.locator('.workflow-list-row').count()===1,'Workflow search does not filter names');await page.getByRole('button',{name:'Clear workflow search',exact:true}).click();
  await select('demo-workflow');await page.getByLabel('Run history',{exact:true}).selectOption('');await page.getByRole('button',{name:'Auto layout',exact:true}).click();
  if(await page.getByRole('button',{name:'Close inspector',exact:true}).count())await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  assert(await page.locator('.workflow-run-order li').count()===5,'Run order does not show all connected tasks');
  assert((await page.locator('[data-testid=workflow-card-build] .workflow-card-footer').innerText()).match(/\d{2}:\d{2}:\d{2}/),'Task duration is not precise');
  await menu(other);await page.getByRole('menuitem',{name:'Delete…',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert(await page.locator(`[data-workflow-id="${other}"]`).count()===1,'Cancel deleted a workflow');
  await menu(other);await page.getByRole('menuitem',{name:'Delete…',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Delete workflow',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator(`[data-workflow-id="${other}"]`).waitFor({state:'detached'});
  await page.setViewportSize({width:620,height:800});await page.locator('.workflow-layout.is-narrow').waitFor();if(await page.getByRole('button',{name:'Hide workflow list',exact:true}).count())await page.getByRole('button',{name:'Hide workflow list',exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow viewport overflows');
  return {passed:true,isolatedWorkflows:2,rename:true,hideRestore:true,deleteCancel:true,exactTime:true,autoLayout:true,runOrder:true};
}
