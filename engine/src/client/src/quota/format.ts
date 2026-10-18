export function tone(percent: number | null): string {
  return percent === null ? "unknown" : percent <= 10 ? "danger" : percent <= 30 ? "warning" : "healthy";
}
export function percent(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}
export function countdown(at: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((at - now) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (hours < 24) return `${hours}h${rest ? ` ${rest}m` : ""}`;
  return `${Math.floor(hours / 24)}d${hours % 24 ? ` ${hours % 24}h` : ""}`;
}
export function date(at: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}

export function retryHint(at: number | null | undefined, now: number): string | null {
  return at == null ? null : at > now ? `Retry in ${countdown(at, now)}` : "Retry available";
}

