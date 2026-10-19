export const QUOTA_PROVIDERS = ["openai", "codex", "claude", "zai", "kimi"] as const;
export type QuotaProvider = typeof QUOTA_PROVIDERS[number];

export function selectedQuotaProviders(value: unknown): QuotaProvider[] {
  if (!Array.isArray(value)) return [...QUOTA_PROVIDERS];
  return [...new Set(value.filter((id): id is QuotaProvider => (QUOTA_PROVIDERS as readonly unknown[]).includes(id)))];
}

export const QUOTA_LABELS: Record<QuotaProvider, string> = {
  openai: "OpenAI · OpenCode", codex: "OpenAI · Codex", claude: "Claude Code", zai: "Z.ai", kimi: "Kimi",
};

export interface QuotaWindow {
  kind: "fiveHour" | "weekly" | "monthly" | "period";
  label: string;
  remaining_percent: number;
  reset_at: number | null;
  used: number | null;
  total: number | null;
}

export interface ProviderQuota {
  provider: QuotaProvider;
  status: "ready" | "stale" | "not_configured" | "sign_in_required" | "unavailable";
  plan: string | null;
  limits: QuotaWindow[];
  updated_at: number | null;
  message: string | null;
  retry_at?: number | null;
}
