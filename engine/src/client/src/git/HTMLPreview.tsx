import { useMemo } from "react";

// The opaque sandbox origin and CSP keep report scripts away from KlipRun and the network.
const POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export function HTMLPreview({ content }: { content: string }) {
  const document = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${content}</body></html>`, [content]);
  return <iframe className="repository-html-preview" title="HTML preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} />;
}
