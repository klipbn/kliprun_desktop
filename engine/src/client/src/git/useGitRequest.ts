import { useEffect, useState } from "react";

export async function gitRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (response.status === 431) throw new Error("Git request was rejected because it is too large (HTTP 431).");
  if (response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new Error("Git is unavailable in the running app. Restart KlipRun and try again.");
  }
  let body;
  try { body = await response.json(); }
  catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error("Git returned an incomplete response. Refresh the repository and try again.");
  }
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Git request failed (${response.status}).`);
  return body as T;
}

export function useGitRequest<T>(url: string | null, refresh: number, interval = 0,
  request: (url: string, init?: RequestInit) => Promise<T> = gitRequest<T>) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null; pending: boolean }>({ url: null, data: null, error: null, pending: false });
  useEffect(() => {
    if (!url) return;
    let live = true, controller: AbortController | null = null;
    async function load() {
      controller?.abort(); const current = new AbortController(); controller = current;
      setState(previous => ({ url, data: previous.url === url ? previous.data : null, error: null, pending: true }));
      try {
        const data = await request(url!, { signal: current.signal });
        if (live && !current.signal.aborted) setState({ url, data, pending: false, error: null });
      } catch (error) {
        if (live && !current.signal.aborted) setState(previous => ({ url, data: previous.url === url ? previous.data : null, pending: false, error: error instanceof Error ? error.message : "Git request failed." }));
      }
    }
    void load();
    const timer = interval ? window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, interval) : null;
    if (interval) window.addEventListener("focus", load);
    return () => { live = false; controller?.abort(); if (timer !== null) window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [url, refresh, interval, request]);
  return state.url === url ? state : { data: null, error: null, pending: !!url };
}
