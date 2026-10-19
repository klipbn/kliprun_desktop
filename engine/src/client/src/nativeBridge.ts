import { validateKlopikSkin, type KlopikSkin } from './office/skins';
import { selectedQuotaProviders, type QuotaProvider } from '@shared/quota';

type NativeBridgeHost = {
  webkit?: { messageHandlers?: {
    sessionSelected?: { postMessage: (id: string | null) => void };
    sessionResume?: { postMessage: (id: string) => void };
    desktopAction?: { postMessage: (action: string) => void };
    exportStatistics?: { postMessage: (request: { filename: string; content: string }) => void };
    gitRepository?: { postMessage: (directory: string) => void };
    repositoryFile?: { postMessage: (request: { action: "reveal" | "open" | "copy"; path: string }) => void };
    workflowAction?: { postMessage: (request: Record<string, string>) => void };
  } };
};

export function notifyWorkflowAction(request: Record<string, string>, host: NativeBridgeHost = window as unknown as NativeBridgeHost): void {
  host.webkit?.messageHandlers?.workflowAction?.postMessage(request);
}

export type DesktopAction = "new-opencode" | "new-codex" | "new-claude" | "show-terminal" | "open-iterm" | "settings" | "check-updates" | "open-repository" | "toggle-toolbar-labels";

type GitRepositoryHost = NativeBridgeHost & { kliprunGitRepository?: unknown; localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } };
function validRepositoryDirectory(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && value.length <= 4096 && !value.includes("\0");
}
export function gitRepository(host: GitRepositoryHost = window): string | null {
  if (validRepositoryDirectory(host.kliprunGitRepository)) return host.kliprunGitRepository;
  try { const value = host.localStorage?.getItem("kliprun.git.repository"); return validRepositoryDirectory(value) ? value : null; } catch { return null; }
}
export function saveGitRepository(directory: string, host: GitRepositoryHost = window): void {
  if (!validRepositoryDirectory(directory)) return;
  host.kliprunGitRepository = directory;
  try { host.localStorage?.setItem("kliprun.git.repository", directory); } catch { /* storage unavailable */ }
  host.webkit?.messageHandlers?.gitRepository?.postMessage(directory);
}

export function observeNativeRepository(onSelect: (directory: string) => void,
  host: EventTarget & { kliprunPendingRepository?: unknown } = window): () => void {
  const select = (value: unknown) => {
    if (validRepositoryDirectory(value)) onSelect(value);
  };
  const listener = (event: Event) => { delete host.kliprunPendingRepository; select((event as CustomEvent<unknown>).detail); };
  host.addEventListener("kliprun:repository", listener);
  if (host.kliprunPendingRepository !== undefined) { const pending = host.kliprunPendingRepository; delete host.kliprunPendingRepository; select(pending); }
  return () => host.removeEventListener("kliprun:repository", listener);
}

export interface DesktopPreferences {
  detailTab: "user" | "agent-text" | "agent" | "models" | "kanban";
  theme: "default" | "ember" | "dusk" | "graphite" | "daybreak" | "paper";
  reduceMotion: boolean;
  klopikSkin: KlopikSkin;
  toolbarExpanded: boolean;
  usageProviders: QuotaProvider[];
}

type PreferencesHost = { kliprunPreferences?: { detailTab?: unknown; theme?: unknown; reduceMotion?: unknown; klopikSkin?: unknown; toolbarExpanded?: unknown; usageProviders?: unknown } };

export function desktopPreferences(host: PreferencesHost = typeof window === "undefined" ? {} : window as PreferencesHost): DesktopPreferences {
  const value = host.kliprunPreferences;
  const tab = value?.detailTab;
  return {
    detailTab: tab === "user" || tab === "agent" || tab === "models" || tab === "kanban" ? tab : "agent-text",
    theme: value?.theme === "default" || value?.theme === "ember" || value?.theme === "dusk" || value?.theme === "graphite" || value?.theme === "daybreak" || value?.theme === "paper" ? value.theme : "graphite",
    reduceMotion: value?.reduceMotion === true,
    klopikSkin: validateKlopikSkin(value?.klopikSkin),
    toolbarExpanded: value?.toolbarExpanded === true,
    usageProviders: selectedQuotaProviders(value?.usageProviders),
  };
}

export function observeNativePreferences(onChange: (value: DesktopPreferences) => void,
  host: EventTarget & PreferencesHost = window): () => void {
  const listener = () => onChange(desktopPreferences(host));
  host.addEventListener("kliprun:preferences", listener);
  listener();
  return () => host.removeEventListener("kliprun:preferences", listener);
}

type UpdateHost = { kliprunUpdateVersion?: unknown };

export function availableUpdateVersion(host: UpdateHost = typeof window === "undefined" ? {} : window as UpdateHost): string | null {
  const value = host.kliprunUpdateVersion;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function observeNativeUpdate(onChange: (version: string | null) => void,
  host: EventTarget & UpdateHost = window): () => void {
  const listener = () => onChange(availableUpdateVersion(host));
  host.addEventListener("kliprun:update", listener);
  listener();
  return () => host.removeEventListener("kliprun:update", listener);
}

export function hasDesktopBridge(host: NativeBridgeHost = window as unknown as NativeBridgeHost): boolean {
  return !!host.webkit?.messageHandlers?.desktopAction;
}

export function notifyNativeAction(action: DesktopAction, host: NativeBridgeHost = window as unknown as NativeBridgeHost): void {
  host.webkit?.messageHandlers?.desktopAction?.postMessage(action);
}

export function notifyNativeFileAction(action: "reveal" | "open" | "copy", path: string, host: NativeBridgeHost = window as unknown as NativeBridgeHost): boolean {
  const handler = host.webkit?.messageHandlers?.repositoryFile;
  if (!handler || !path || path.length > 4096 || path.includes("\0") || action !== "copy" && !validRepositoryDirectory(path)) return false;
  handler.postMessage({ action, path });
  return true;
}

export function exportStatisticsCSV(filename: string, content: string, host: NativeBridgeHost = window as unknown as NativeBridgeHost): boolean {
  const handler = host.webkit?.messageHandlers?.exportStatistics;
  if (!handler) return false;
  handler.postMessage({ filename, content });
  return true;
}

export function notifyNativeSelection(id: string | null, host: NativeBridgeHost = window as unknown as NativeBridgeHost): void {
  host.webkit?.messageHandlers?.sessionSelected?.postMessage(id);
}

export function notifyNativeResume(id: string, host: NativeBridgeHost = window as unknown as NativeBridgeHost): void {
  host.webkit?.messageHandlers?.sessionResume?.postMessage(id);
}

export function observeNativeTerminalSelection(onSelect: (id: string | null) => void, host: EventTarget = window): () => void {
  const listener = (event: Event) => onSelect((event as CustomEvent<string | null>).detail);
  host.addEventListener("kliprun:terminal-selection", listener);
  if ("kliprunTerminalSessionId" in host) onSelect((host as EventTarget & { kliprunTerminalSessionId: string | null }).kliprunTerminalSessionId);
  return () => host.removeEventListener("kliprun:terminal-selection", listener);
}

export function observeNativeNavigation(onNavigate: (path: string) => void,
  host: EventTarget & { kliprunPendingNavigation?: string } = window): () => void {
  const listener = (event: Event) => {
    delete host.kliprunPendingNavigation;
    onNavigate((event as CustomEvent<string>).detail);
  };
  host.addEventListener("kliprun:navigate", listener);
  if (host.kliprunPendingNavigation) {
    const path = host.kliprunPendingNavigation;
    delete host.kliprunPendingNavigation;
    onNavigate(path);
  }
  return () => host.removeEventListener("kliprun:navigate", listener);
}
