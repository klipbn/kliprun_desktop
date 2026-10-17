import { hasUnsavedFileDrafts } from "./git/useFileTabs";

export const WEB_MENU_COMMANDS = ['cancel-dialog', 'new-project', 'find-session', 'save-file', 'close-file', 'close-diff', 'close-details', 'undo', 'redo', 'find', 'find-next', 'find-previous', 'refresh', 'shortcuts'] as const;
export type WebMenuCommand = typeof WEB_MENU_COMMANDS[number];
export interface WebMenuState { commands: WebMenuCommand[]; editorFocused: boolean; hasUnsavedFiles: boolean }
export function isWebMenuCommand(value: unknown): value is WebMenuCommand { return typeof value === 'string' && (WEB_MENU_COMMANDS as readonly string[]).includes(value); }

const visible = <T extends HTMLElement>(selector: string): T | undefined => [...document.querySelectorAll<T>(selector)].find(e => e.getClientRects().length > 0 && !e.closest('[hidden]'));
const selectors = {
  'save-file': '.repository-editor-save:not(:disabled)',
  'close-file': '.git-document-tab.is-active .git-document-close:not(:disabled)',
  'close-diff': '.git-close-file:not(:disabled)',
  'close-details': 'button[aria-label="Close details"]',
  shortcuts: 'button[aria-label="Keyboard shortcuts"]',
} as const;
const searchField = () => visible<HTMLInputElement | HTMLSelectElement>('.sw-search input, .git-tree-search input, .git-history-search input, input[aria-label="Filter files"], select[aria-label="Find coworker"]');
const editor = () => visible<HTMLElement>('.repository-file-editor');

export function webMenuState(): WebMenuState {
  if (document.querySelector('dialog[open]')) return { commands: ['cancel-dialog'], editorFocused: false, hasUnsavedFiles: hasUnsavedFileDrafts() };
  const commands: WebMenuCommand[] = ['new-project', 'find-session', 'refresh'];
  for (const key of Object.keys(selectors) as Array<keyof typeof selectors>) if (visible(selectors[key])) commands.push(key);
  const code = editor(), focused = !!document.activeElement?.closest('.cm-content') && !!code;
  if (code || searchField()) commands.push('find');
  if (code?.dataset.menuSearch === 'true') commands.push('find-next', 'find-previous');
  if (focused && code?.dataset.menuUndo === 'true') commands.push('undo');
  if (focused && code?.dataset.menuRedo === 'true') commands.push('redo');
  return { commands, editorFocused: focused, hasUnsavedFiles: hasUnsavedFileDrafts() };
}

export function installWebMenuBridge(actions: { newProject(): void; findSession(): void; refresh(): void }): () => void {
  let last = '', queued = false, live = true;
  const publish = (force = false) => {
    const state = webMenuState(), json = JSON.stringify(state);
    if (!force && json === last) return;
    last = json;
    const host = window as unknown as { webkit?: { messageHandlers?: { menuState?: { postMessage(value: WebMenuState): void } } } };
    host.webkit?.messageHandlers?.menuState?.postMessage(state);
  };
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; if (live) publish(); }); } };
  const command = (event: Event) => {
    const action = (event as CustomEvent<unknown>).detail;
    if (!isWebMenuCommand(action) || !webMenuState().commands.includes(action)) return;
    if (action === 'cancel-dialog') { const dialog = document.querySelector<HTMLDialogElement>('dialog[open]'); if (dialog?.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close(); }
    else if (action === 'new-project') actions.newProject();
    else if (action === 'find-session') actions.findSession();
    else if (action === 'refresh') {
      const button = visible<HTMLButtonElement>('button[aria-label="Refresh repository"]:not(:disabled)');
      if (button) button.click(); else actions.refresh();
    } else if (action in selectors) visible<HTMLButtonElement>(selectors[action as keyof typeof selectors])?.click();
    else if (['undo', 'redo', 'find', 'find-next', 'find-previous'].includes(action)) {
      const code = editor();
      if (code) code.dispatchEvent(new CustomEvent('kliprun:editor-command', { detail: action }));
      else if (action === 'find') { const field = searchField(); field?.focus(); if (field instanceof HTMLInputElement) field.select(); }
    }
    schedule();
  };
  const requested = () => publish(true);
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'hidden', 'open', 'data-menu-undo', 'data-menu-redo', 'data-menu-search'] });
  window.addEventListener('kliprun:menu-command', command);
  window.addEventListener('kliprun:menu-state-request', requested);
  document.addEventListener('focusin', schedule); document.addEventListener('focusout', schedule);
  publish(true);
  return () => { live = false; observer.disconnect(); window.removeEventListener('kliprun:menu-command', command); window.removeEventListener('kliprun:menu-state-request', requested); document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule); };
}
