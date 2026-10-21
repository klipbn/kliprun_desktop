import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

// The opaque sandbox origin and CSP keep report scripts away from KlipRun and the network.
const POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
/**
 * Pages above this size re-render only on request: each render parses the whole report and runs
 * its scripts again, which for a 40 MB report costs about a gigabyte until WebKit releases it.
 */
export const LIVE_PREVIEW_LIMIT = 2 * 1024 * 1024;

export function HTMLPreview({ content: latest }: { content: string }) {
  const [content, setContent] = useState(latest);
  const stale = latest !== content;
  useEffect(() => {
    // Typing in the source beside a small page re-renders it once the burst ends.
    if (!stale || latest.length > LIVE_PREVIEW_LIMIT) return;
    const timeout = setTimeout(() => setContent(latest), 300);
    return () => clearTimeout(timeout);
  }, [latest, stale]);
  const document = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${content}</body></html>`, [content]);
  return <div className="repository-html-preview-pane">
    {stale && latest.length > LIVE_PREVIEW_LIMIT && <StaleNotice onRefresh={() => setContent(latest)} />}
    <iframe className="repository-html-preview" title="HTML preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} />
  </div>;
}

export function StaleNotice({ onRefresh, label = "The source changed. Large pages refresh on request." }: { onRefresh: () => void; label?: string }) {
  return <div className="repository-preview-stale" role="status">
    <span>{label}</span>
    <button type="button" className="git-button" onClick={onRefresh}><RefreshCw size={12} /> Refresh preview</button>
  </div>;
}
