import type { RecentSessionsQuery } from "@shared/usage";

export function parseRecentSessionsQuery(url: URL): RecentSessionsQuery {
  const params = url.searchParams;
  const search = params.get("search") ?? "", source = params.get("source") ?? "", project = params.get("project") ?? "";
  if (search.length > 200 || search.includes("\0") || (source && source !== "codex" && source !== "opencode" && source !== "claude")
    || project.length > 4096 || project.includes("\0") || (project && !project.startsWith("/"))) throw new Error("Invalid session filters");
  function integer(key: string, fallback: number, min: number, max: number) {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error("Invalid session range");
    return Number(value);
  }
  return { search: search.trim(), source: source ? source as "codex" | "opencode" | "claude" : undefined, project: project || undefined,
    after: integer("after", 0, 0, 8_640_000_000_000_000), page: integer("page", 0, 0, 1_000_000), limit: integer("limit", 50, 1, 100) };
}
