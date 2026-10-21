// Runs inside the sandboxed preview iframe. It names elements by the ids the editor added to
// the source and reports each change to the parent window, which splices the file itself.
function visualEditor(initialScroll: [number, number], flushDelay: number) {
  const ID = "data-kliprun-id", parentWindow = window.parent;
  const TEXT_BLOCKS = ["p", "h1", "h2", "h3", "h4", "blockquote", "pre", "div"];
  const LIST_HOSTS = ["div", "section", "article", "main", "aside", "header", "footer", "td", "th", "li", "blockquote"];
  let selected: Element | null = null, hovered: Element | null = null, editing: HTMLElement | null = null;
  let editingAttribute: string | null = null, editingIds: string[] = [], editingHtml = "", savedRange: Range | null = null;
  let flushTimer = 0, scrollTimer = 0, counter = 0;
  // Elements the user created while typing; anything else without an id was made by page scripts.
  const typed = new WeakSet<Element>();

  const send = (message: Record<string, unknown>) => parentWindow.postMessage({ kliprunVisual: true, ...message }, "*");
  const layer = (color: string, label: boolean) => {
    const box = document.createElement("div");
    box.style.cssText = `position:absolute;pointer-events:none;z-index:2147483647;box-sizing:border-box;display:none;border:${label ? 2 : 1}px solid ${color};border-radius:2px;background:${label ? "transparent" : `${color}14`}`;
    if (label) {
      const tag = document.createElement("span");
      tag.style.cssText = `position:absolute;left:-2px;bottom:100%;padding:1px 5px;border-radius:3px 3px 0 0;background:${color};color:#fff;font:600 10px/14px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap`;
      box.appendChild(tag);
    }
    document.documentElement.appendChild(box);
    return box;
  };
  const hoverBox = layer("#7aa2ff", false), selectBox = layer("#2f6bff", true);
  const owner = (node: EventTarget | null) => {
    const element = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    const found = element?.closest(`[${ID}]`) ?? null;
    return found && found !== document.body && found !== document.documentElement && found !== document.head ? found : null;
  };
  const inside = (node: EventTarget | null) => !!editing && node instanceof Node && editing.contains(node);
  const place = (box: HTMLElement, element: Element | null) => {
    if (!element || !element.isConnected) { box.style.display = "none"; return; }
    const rect = element.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: `${rect.left + scrollX}px`, top: `${rect.top + scrollY}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    if (box === selectBox) {
      (box.firstChild as HTMLElement).textContent = element.tagName.toLowerCase() + (editing === element ? " · editing" : "");
      box.style.borderStyle = editing === element ? "dashed" : "solid";
    }
  };
  const refresh = () => { place(selectBox, selected); place(hoverBox, hovered && hovered !== selected && !editing ? hovered : null); };
  const idsIn = (root: Element) => [...root.querySelectorAll(`[${ID}]`)].map(element => element.getAttribute(ID)!);
  const report = () => {
    const tag = selected?.tagName.toLowerCase() ?? null;
    send({ type: "selection", id: selected?.getAttribute(ID) ?? null, tag, editing: !!editing,
      hasParent: !!(selected && owner(selected.parentElement)), block: !!tag && TEXT_BLOCKS.includes(tag) && selected?.namespaceURI === "http://www.w3.org/1999/xhtml",
      lists: !!editing && LIST_HOSTS.includes(editing.tagName.toLowerCase()) });
    refresh();
  };
  // contenteditable can split an element into two with the same id; only the first keeps it.
  const dedupe = (root: Element) => {
    const seen = new Set([root.getAttribute(ID)]);
    for (const element of root.querySelectorAll(`[${ID}]`)) {
      const id = element.getAttribute(ID)!;
      if (seen.has(id)) element.removeAttribute(ID); else seen.add(id);
    }
  };
  const flush = () => {
    window.clearTimeout(flushTimer);
    if (!editing) return;
    dedupe(editing);
    for (const element of editing.querySelectorAll("*")) if (!element.hasAttribute(ID)) typed.add(element);
    const html = editing.innerHTML;
    if (html === editingHtml) return;
    send({ type: "op", op: { op: "inner", id: editing.getAttribute(ID), html, expected: editingIds } });
    editingHtml = html; editingIds = idsIn(editing);
  };
  const stopEditing = () => {
    if (!editing) return;
    flush();
    if (editingAttribute === null) editing.removeAttribute("contenteditable"); else editing.setAttribute("contenteditable", editingAttribute);
    editing = null; savedRange = null;
    getSelection()?.removeAllRanges();
  };
  const select = (element: Element | null) => {
    if (editing && editing !== element) stopEditing();
    selected = element; report();
  };
  const startEditing = (x?: number, y?: number) => {
    if (!(selected instanceof HTMLElement) || editing === selected) return;
    if ([...selected.querySelectorAll("*")].some(element => !element.hasAttribute(ID) && !typed.has(element) && element.tagName !== "TBODY")) {
      send({ type: "notice", text: "This block is drawn by the page's scripts, so its text cannot be edited here. Edit the script or data in the source instead." });
      return;
    }
    editing = selected; editingAttribute = selected.getAttribute("contenteditable");
    editingHtml = selected.innerHTML; editingIds = idsIn(selected);
    selected.setAttribute("contenteditable", "true");
    selected.focus({ preventScroll: true });
    const caret = x === undefined ? null : document.caretRangeFromPoint?.(x, y!);
    const selection = getSelection();
    if (selection) {
      selection.removeAllRanges();
      if (caret && selected.contains(caret.startContainer)) selection.addRange(caret);
      else { const range = document.createRange(); range.selectNodeContents(selected); range.collapse(false); selection.addRange(range); }
    }
    report();
  };
  // "name:argument" with the argument kept whole, since URLs contain colons too.
  const pair = (value: string, separator: string) => {
    const index = value.indexOf(separator);
    return index < 0 ? [value, ""] : [value.slice(0, index), value.slice(index + 1)];
  };
  const restoreSelection = () => {
    if (!editing) return false;
    editing.focus({ preventScroll: true });
    const selection = getSelection();
    if (savedRange && selection && editing.contains(savedRange.commonAncestorContainer)) { selection.removeAllRanges(); selection.addRange(savedRange); }
    return true;
  };
  const freshIds = (original: Element, copy: Element) => {
    const originals = [original, ...original.querySelectorAll(`[${ID}]`)], copies = [copy, ...copy.querySelectorAll(`[${ID}]`)];
    return originals.map((element, index) => {
      const id = `d${Date.now().toString(36)}${counter++}`;
      copies[index].setAttribute(ID, id);
      return [element.getAttribute(ID)!, id];
    });
  };
  const act = (command: string, value?: string) => {
    if (command === "format") {
      if (!value || !restoreSelection()) return;
      const [name, argument] = pair(value, ":");
      // Colors need inline styles; everything else uses semantic tags such as <b> and <i>.
      document.execCommand("styleWithCSS", false, String(name === "foreColor" || name === "hiliteColor"));
      document.execCommand(name, false, argument);
      flush(); refresh();
      return;
    }
    if (!selected) return;
    const id = selected.getAttribute(ID);
    if (command === "edit") { startEditing(); return; }
    if (command === "style" && value) {
      const [property, color] = pair(value, "=");
      if (editing && property === "color" && savedRange && !savedRange.collapsed) { act("format", `foreColor:${color}`); return; }
      if (editing && property === "background-color" && savedRange && !savedRange.collapsed) { act("format", `hiliteColor:${color}`); return; }
      stopEditing();
      if (color) (selected as HTMLElement).style.setProperty(property, color); else (selected as HTMLElement).style.removeProperty(property);
      send({ type: "op", op: { op: "style", id, property, value: color } });
      report();
      return;
    }
    stopEditing();
    if (command === "parent") { select(owner(selected.parentElement)); return; }
    if (command === "deselect") { select(null); return; }
    if (command === "delete") {
      const expected = idsIn(selected);
      selected.remove(); hovered = null;
      send({ type: "op", op: { op: "remove", id, expected } });
      select(null);
    } else if (command === "duplicate") {
      const copy = selected.cloneNode(true) as Element, pairs = freshIds(selected, copy);
      selected.after(copy);
      send({ type: "op", op: { op: "duplicate", id, pairs } });
      select(copy);
    } else if (command === "retag" && value && TEXT_BLOCKS.includes(value) && selected.tagName.toLowerCase() !== value) {
      const replacement = document.createElement(value);
      for (const attribute of selected.attributes) replacement.setAttribute(attribute.name, attribute.value);
      replacement.append(...selected.childNodes);
      selected.replaceWith(replacement);
      send({ type: "op", op: { op: "retag", id, tag: value } });
      select(replacement);
    }
  };

  const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  document.addEventListener("mouseover", event => { hovered = owner(event.target); refresh(); }, true);
  document.addEventListener("mouseout", event => { if (!(event as MouseEvent).relatedTarget) { hovered = null; refresh(); } }, true);
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "auxclick", "contextmenu"]) document.addEventListener(type, event => {
    if (inside(event.target)) return;
    event.stopImmediatePropagation();
    // The default mousedown focuses this page, so Delete, Enter and ⌘S reach it; text selection
    // and drags are stopped below, and form fields must not take the caret.
    // Cancelling pointerdown would cancel that focus too, so only menus, middle clicks and fields are cancelled.
    const control = event.target instanceof Element && event.target.closest("input, textarea, select, button, [contenteditable]");
    if (type === "contextmenu" || type === "auxclick" || control) event.preventDefault();
  }, true);
  for (const type of ["selectstart", "dragstart"]) document.addEventListener(type, event => { if (!inside(event.target)) block(event); }, true);
  document.addEventListener("click", event => {
    if (inside(event.target)) return;
    block(event);
    const target = owner(event.target), mouse = event as MouseEvent;
    // Like a text editor: the first click selects, a click on the selection places the caret.
    if (target && target === selected && !editing) startEditing(mouse.clientX, mouse.clientY);
    else select(target);
  }, true);
  document.addEventListener("dblclick", event => {
    if (inside(event.target)) return;
    block(event);
    const mouse = event as MouseEvent;
    select(owner(event.target)); startEditing(mouse.clientX, mouse.clientY);
  }, true);
  document.addEventListener("submit", block, true);
  document.addEventListener("input", () => { window.clearTimeout(flushTimer); flushTimer = window.setTimeout(flush, flushDelay); refresh(); }, true);
  document.addEventListener("focusout", event => { if (event.target === editing) flush(); }, true);
  document.addEventListener("selectionchange", () => {
    const selection = getSelection();
    if (editing && selection?.rangeCount && editing.contains(selection.getRangeAt(0).commonAncestorContainer)) savedRange = selection.getRangeAt(0).cloneRange();
  });
  document.addEventListener("paste", event => {
    if (!editing) return;
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") ?? "");
  }, true);
  document.addEventListener("keydown", event => {
    const mod = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    if (mod && key === "s") { block(event); flush(); send({ type: "save" }); return; }
    if (event.key === "Escape") { block(event); if (editing) { stopEditing(); report(); } else select(null); return; }
    if (editing) {
      if (mod && event.key === "Enter") { block(event); stopEditing(); report(); }
      return;
    }
    if (mod && key === "z") { block(event); send({ type: event.shiftKey ? "redo" : "undo" }); return; }
    if (mod && key === "y") { block(event); send({ type: "redo" }); return; }
    if (!selected) return;
    if (event.key === "Delete" || event.key === "Backspace") { block(event); act("delete"); }
    else if (event.key === "Enter") { block(event); startEditing(); }
    else if (mod && key === "d") { block(event); act("duplicate"); }
  }, true);
  window.addEventListener("resize", refresh);
  window.addEventListener("scroll", () => {
    refresh();
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => send({ type: "scroll", x: scrollX, y: scrollY }), 120);
  }, true);
  window.addEventListener("message", event => {
    if (event.source !== parentWindow || event.data?.kliprunVisual !== true) return;
    if (event.data.type === "command") act(event.data.command, event.data.value);
    else if (event.data.type === "flush") { flush(); send({ type: "flushed", token: event.data.token }); }
  });
  const restore = () => { if (initialScroll[0] || initialScroll[1]) scrollTo(initialScroll[0], initialScroll[1]); };
  if (document.readyState === "complete") restore(); else window.addEventListener("load", restore, { once: true });
  send({ type: "ready" });
}

/** `flushDelay` is how long typing pauses before it is reported; each report copies the whole file. */
export const visualEditScript = (scroll: [number, number] = [0, 0], flushDelay = 150) => `(${visualEditor.toString()})(${JSON.stringify(scroll)}, ${flushDelay});`;
