// Fixture-only preview on port 18856. Opens confirmation, never starts publication.
async (page, base = 'http://127.0.0.1:18856') => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  const preview = await context.newPage(); preview.setDefaultTimeout(5000);
  const check = (value, message) => { if (!value) throw new Error(message); };
  try {
    const listing = await (await preview.request.get(`${base}/api/workflows/status`)).json();
    const previous = listing.workflows.find(flow => flow.id === 'demo-simple-push');
    const revision = previous ? (await (await preview.request.get(`${base}/api/workflows/document?id=${previous.id}`)).json()).revision : undefined;
    const definition = { id:'demo-simple-push', name:'Push demo', directory:'/Users/demo/Projects/atlas', branch:'', createBranch:false,
      nodes:[{id:'publish',kind:'publication',title:'Publish for review',x:80,y:80,mode:'request',remote:'origin',provider:'auto',targetBranch:'',requestTitle:'',description:''}],
      edges:[],viewport:{x:0,y:0,zoom:1} };
    check((await preview.request.post(`${base}/api/workflows/save`, {data:{definition,revision}})).ok(), 'Could not save legacy fixture');
    await preview.request.post(`${base}/api/workflows/selection`, {data:{workflowId:definition.id,nodeId:'publish'}});
    await preview.goto(`${base}/workflow`);
    await preview.getByRole('heading', {name:'Publish for review',exact:true}).waitFor();
    const branch = preview.getByLabel('Branch', { exact:true });
    check(await branch.count() === 1, 'Commit & Push has no editable branch chooser');
    check(await preview.getByRole('button', {name:'Start',exact:true}).isDisabled(), 'An empty branch can be published');
    await branch.click();
    await preview.getByRole('combobox', {name:'Search branch',exact:true}).fill('feature/demo-push');
    await preview.getByRole('combobox', {name:'Search branch',exact:true}).press('Enter');
    check((await branch.innerText()).includes('feature/demo-push'), 'Branch selection was not saved');
    check((await preview.getByLabel('Working / source branch', {exact:true}).innerText()).includes('feature/demo-push'), 'Node and workflow branches differ');
    check(await preview.getByRole('button', {name:'Start',exact:true}).isEnabled(), 'Optional fields still block Start');
    for (const label of ['Publication mode','Hosting provider','Target branch','Description']) {
      check(await preview.getByLabel(label, {exact:true}).count() === 0, `${label} still complicates the push task`);
    }
    await preview.locator('.workflow-publish-options>summary').click();
    const message = preview.getByLabel('Commit message (optional)', {exact:true});
    check(await message.inputValue() === '', 'A commit title is still required');
    check(await message.getAttribute('placeholder') === 'Workflow: Push demo', 'Default commit message is unclear');
    await message.fill('Demo: push workflow changes');
    await preview.locator('.workflow-publish-options>summary').click();
    const layouts=[];
    for (const [width,height] of [[1440,900],[900,650],[500,660]]) {
      await preview.setViewportSize({width,height});
      await branch.scrollIntoViewIfNeeded();
      const inspector=preview.locator('.workflow-inspector');
      check(await inspector.evaluate(e=>e.scrollWidth<=e.clientWidth+1), `Push settings overflow at ${width}`);
      await preview.screenshot({path:`/private/tmp/kliprun-workflow-push-${width}.png`});
      layouts.push({width,height});
    }
    await preview.setViewportSize({width:1440,height:900});
    await preview.getByRole('button', {name:'Start',exact:true}).click();
    const dialog=preview.getByRole('dialog');
    const scope=await dialog.innerText();
    check(scope.includes('origin') && scope.includes('feature/demo-push') && scope.includes('Demo: push workflow changes'), 'Confirmation omits the commit/push destination');
    check(!scope.includes('Target:') && !scope.includes('Create / Update'), 'Confirmation still requests MR/PR parameters');
    check(await dialog.getByRole('button',{name:'Start workflow',exact:true}).isDisabled(), 'Commit/push needs no explicit authorization');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    return {layouts,verified:'Legacy cards, branch selection, automatic commit message, optional settings, manual MR/PR and explicit push consent'};
  } finally { await context.close(); }
}
