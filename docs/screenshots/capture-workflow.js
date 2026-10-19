// Capture only against preview.ts and its mock-api.json workflow; publication is simulated in memory.
async (page, directory='docs/screenshots', base='http://127.0.0.1:18796') => {
  const external=[];const watch=request=>{if(!request.url().startsWith(base+'/'))external.push(request.url());};page.on('request',watch);
  try {
    await page.setViewportSize({width:1600,height:1000});await page.goto(base+'/workflow');
    await page.locator('.workflow-project-row').waitFor();
    if(await page.getByRole('button',{name:'Show workflow list',exact:true}).count())await page.getByRole('button',{name:'Show workflow list',exact:true}).click();
    await page.locator('[data-workflow-id=demo-workflow] .workflow-list-item').click();
    await page.getByRole('button',{name:'Fit view',exact:true}).click();
    await page.locator('[data-testid=workflow-card-review] .workflow-card-title').click();
    await page.getByRole('button',{name:'Settings',exact:true}).last().click();
    await page.screenshot({path:`${directory}/workflow.png`,animations:'disabled'});
    await page.getByRole('button',{name:'Start',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Authorize & Start'}).click();
    await page.getByRole('button',{name:'Accept result',exact:true}).waitFor({timeout:15000});
    await page.setViewportSize({width:1600,height:1100});
    await page.getByRole('button',{name:'Fit view',exact:true}).click();
    await page.locator('[data-testid=workflow-card-review] .workflow-card-title').click();
    await page.getByRole('button',{name:'Responses',exact:true}).click();await page.locator('.workflow-readable-review').waitFor();
    await page.screenshot({path:`${directory}/workflow-review.png`,animations:'disabled'});
    await page.getByRole('button',{name:'Accept result',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).waitFor();
    if(external.length)throw Error(`External requests: ${external.join(',')}`);
    return {captures:['workflow.png','workflow-review.png'],externalRequests:external.length};
  }finally{page.off('request',watch);}
}
