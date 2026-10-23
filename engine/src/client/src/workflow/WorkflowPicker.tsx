import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

type Option = { value: string; label: string };

/** A viewport-bound menu, rendered outside the inspector's scrolling/clipping containers. */
export function WorkflowPicker({ label, value, options, onChange, disabled = false, allowCustom = false, customValueName = 'model ID' }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; allowCustom?: boolean; customValueName?: string;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({ left: -10000, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const id = useId();
  const choices = allowCustom && value && !options.some(option => option.value === value) ? [{ value, label: value }, ...options] : options;
  const selected = choices.find(option => option.value === value)?.label ?? value;
  const searchable = allowCustom || choices.length > 6;
  const search = query.trim();
  const matches = choices.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const items = allowCustom && search && !choices.some(option => option.value === search)
    ? [...matches, { value: search, label: `Use ${customValueName}: ${search}` }] : matches;
  const highlighted = Math.min(active, items.length - 1);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function show() {
    if (disabled) return;
    setQuery(''); setActive(Math.max(0, choices.findIndex(option => option.value === value))); setOpen(true);
  }
  function choose(option: Option) {
    if (disabled) return;
    close(true); onChange(option.value);
  }
  function place() {
    const anchor = trigger.current?.getBoundingClientRect(); if (!anchor) return;
    if (anchor.bottom <= 8 || anchor.top >= window.innerHeight - 8) { close(); return; }
    const inspector = trigger.current?.closest('.workflow-inspector-content')?.getBoundingClientRect();
    if (inspector && (anchor.bottom <= inspector.top || anchor.top >= inspector.bottom)) { close(); return; }
    const margin = 8, gap = 5, width = Math.min(Math.max(anchor.width, 360), window.innerWidth - margin * 2);
    const below = window.innerHeight - anchor.bottom - margin - gap, above = anchor.top - margin - gap;
    const useAbove = below < 220 && above > below;
    setPosition({ width, maxHeight: Math.max(0, Math.min(340, useAbove ? above : below)),
      left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)),
      ...(useAbove ? { bottom: window.innerHeight - anchor.top + gap } : { top: anchor.bottom + gap }) });
  }

  useLayoutEffect(() => {
    if (!open) return;
    if (disabled) { close(); return; }
    place(); (input.current ?? list.current)?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) place(); };
    const resize = () => place();
    const observer = new ResizeObserver(resize);
    if (trigger.current) observer.observe(trigger.current);
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside);
    window.addEventListener('resize', resize); window.addEventListener('scroll', scroll, true);
    return () => {
      observer.disconnect(); document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', resize); window.removeEventListener('scroll', scroll, true);
    };
  }, [open, disabled]);
  useLayoutEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-picker-index="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted, query]);

  return <div className="workflow-picker">
    <button ref={trigger} type="button" className="workflow-picker-trigger" aria-label={label} title={selected}
      disabled={disabled} aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={open ? id : undefined}
      onClick={() => open ? close(true) : show()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) show(); else (input.current ?? list.current)?.focus(); }
      }}><span>{selected}</span><ChevronDown aria-hidden="true" /></button>
    {open && !disabled && createPortal(<div ref={popup} className="workflow-picker-popup" style={position}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        else if (event.key === 'Tab') close(true);
        else if ((event.key === 'Enter' || event.key === ' ' && event.target !== input.current) && highlighted >= 0) { event.preventDefault(); choose(items[highlighted]); }
        else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) {
          event.preventDefault(); setActive((highlighted + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
        } else if (event.target !== input.current && (event.key === 'Home' || event.key === 'End')) {
          event.preventDefault(); setActive(event.key === 'Home' ? 0 : items.length - 1);
        }
      }}>
      {searchable && <div className="workflow-picker-search"><Search aria-hidden="true" /><input ref={input} role="combobox"
        aria-label={`Search ${label.toLocaleLowerCase()}`} aria-expanded={true} aria-controls={id} aria-autocomplete="list"
        aria-activedescendant={highlighted >= 0 ? `${id}-${highlighted}` : undefined} maxLength={allowCustom ? 256 : undefined}
        placeholder={allowCustom ? `Search or enter a ${customValueName}…` : 'Search…'} value={query}
        onChange={event => { setQuery(event.target.value); setActive(0); }} /></div>}
      <div ref={list} id={id} className="workflow-picker-options" role="listbox" aria-label={`${label} choices`}
        tabIndex={searchable ? undefined : -1} aria-activedescendant={highlighted >= 0 ? `${id}-${highlighted}` : undefined}>
        {items.map((option, index) => <button type="button" role="option" key={option.value} id={`${id}-${index}`} tabIndex={-1}
          aria-selected={option.value === value} data-picker-index={index} className={index === highlighted ? 'is-active' : ''}
          onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>
          <span className="workflow-picker-check">{option.value === value && <Check aria-hidden="true" />}</span><span>{option.label}</span>
        </button>)}
        {!items.length && <p role="status">No matching options</p>}
      </div>
    </div>, document.body)}
  </div>;
}
