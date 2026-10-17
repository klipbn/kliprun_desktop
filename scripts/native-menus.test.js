// Actual menu bridge against fictional files; all saves stay in memory.
async (page, base='http://127.0.0.1:19876') => {
  const context=await page.context().browser().newContext({viewport:{width:1440,height:900}});
  const p=await context.newPage(), errors=[], saves=[];
  p.on('pageerror',e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message)};
  const send=command=>p.evaluate(command=>window.dispatchEvent(new CustomEvent('kliprun:menu-command',{detail:command})),command);
  const capable=command=>p.waitForFunction(command=>window.__menuState?.commands.includes(command),command);
  await p.route(/\/api\/git\/file(?:\?|$)/,async route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON();saves.push(body);
      return route.fulfill({json:{root:body.directory,path:body.path,content:body.content,revision:'menu-save-'+saves.length}});
    }
    await route.continue();
  });
  try{
    await p.goto(base+'/sessions');await p.locator('.sw-row').first().waitFor();
    await p.evaluate(()=>{window.webkit.messageHandlers.menuState={postMessage:value=>window.__menuState=value};window.dispatchEvent(new Event('kliprun:menu-state-request'))});
    await capable('new-project');await send('new-project');await p.getByRole('dialog').waitFor();
    check(await p.getByRole('heading',{name:'New project',exact:true}).isVisible(),'File menu opens project form');
    await capable('cancel-dialog');await send('cancel-dialog');await p.getByRole('dialog').waitFor({state:'hidden'});
    await p.keyboard.press('Control+3');await send('find-session');await p.getByRole('searchbox',{name:'Search sessions',exact:true}).waitFor();
    check(p.url().endsWith('/sessions'),'Find session navigates');
    check(await p.getByRole('searchbox',{name:'Search sessions',exact:true}).evaluate(e=>document.activeElement===e),'Find session focuses search');
    await p.keyboard.press('Control+4');await p.getByRole('tab',{name:'Files',exact:true}).click();
    await p.getByRole('treeitem',{name:'src',exact:true}).focus();await p.keyboard.press('ArrowRight');
    await p.getByRole('treeitem',{name:'Open file src/search.py',exact:true}).click();
    const editor=p.getByRole('textbox',{name:'Edit src/search.py',exact:true});await editor.waitFor();
    await editor.fill('alpha\nbeta\nalpha');await capable('undo');
    check(await p.evaluate(()=>window.__menuState.hasUnsavedFiles),'Unsaved edits reach native menu state');
    await send('undo');await capable('redo');check((await editor.innerText())!=='alpha\nbeta\nalpha','Native Undo uses editor history');
    await send('redo');await capable('save-file');check((await editor.innerText()).includes('beta'),'Native Redo restores edit');
    await p.getByRole('textbox',{name:'Filter files',exact:true}).focus();
    await p.waitForFunction(()=>window.__menuState.editorFocused===false);
    check(!(await p.evaluate(()=>window.__menuState.commands)).includes('undo'),'Filter input does not undo the code document');
    await editor.focus();await send('find');await p.locator('.cm-search input[name=search]').waitFor();
    await p.locator('.cm-search input[name=search]').fill('alpha');await capable('find-next');
    await send('find-next');check(await p.locator('.cm-searchMatch').count()>0,'Find highlights matches');
    await send('find-previous');
    await send('save-file');await p.waitForFunction(()=>window.__menuState.hasUnsavedFiles===false);
    check(saves.length===1&&saves[0].content==='alpha\nbeta\nalpha','Save uses current file content once');
    await editor.fill('unsaved menu edit');await capable('save-file');
    await send('refresh');check((await editor.innerText()).includes('unsaved menu edit'),'Refresh preserves drafts');
    await capable('close-file');await send('close-file');await p.getByRole('heading',{name:'Save unsaved changes?',exact:true}).waitFor();
    await capable('cancel-dialog');await send('cancel-dialog');await p.getByRole('dialog').waitFor({state:'hidden'});
    check(await editor.isVisible(),'Close dialog keeps edited file');
    await send('close-file');await p.getByRole('button',{name:'Discard changes',exact:true}).click();
    await editor.waitFor({state:'hidden'});await p.waitForFunction(()=>window.__menuState.hasUnsavedFiles===false);
    await capable('shortcuts');await send('shortcuts');await p.getByRole('dialog').waitFor();
    check((await p.getByRole('dialog').innerText()).includes('Close active item'),'Help opens updated shortcut guide');
    await send('cancel-dialog');
    check(!errors.length,errors.join('\n'));
    return {passed:true,checks:'New project, contextual find, CodeMirror undo/redo, save, unsaved-state reporting, safe close/cancel, refresh preserves drafts, shortcuts',saves:saves.length,errors};
  }finally{await context.close()}
}
