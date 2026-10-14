type NativeBridgeHost = {
  webkit?: { messageHandlers?: {
    sessionSelected?: { postMessage: (id: string | null) => void };
    desktopAction?: { postMessage: (action: string) => void };
  } };
};

export type DesktopAction = "new-opencode" | "new-codex" | "show-terminal" | "open-iterm" | "notification-settings";

export function hasDesktopBridge(host: NativeBridgeHost = window as unknown as NativeBridgeHost): boolean {
  return !!host.webkit?.messageHandlers?.desktopAction;
}

export function notifyNativeAction(action: DesktopAction, host: NativeBridgeHost = window as unknown as NativeBridgeHost): void {
  host.webkit?.messageHandlers?.desktopAction?.postMessage(action);
}

export function notifyNativeSelection(id: string | null, host: NativeBridgeHost = window as unknown as NativeBridgeHost): void {
  host.webkit?.messageHandlers?.sessionSelected?.postMessage(id);
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
