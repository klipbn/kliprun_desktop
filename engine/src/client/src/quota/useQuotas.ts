import { useEffect, useState } from "react";
import { QUOTA_PROVIDERS, type ProviderQuota, type QuotaProvider } from "@shared/quota";

type Quotas = Partial<Record<QuotaProvider, ProviderQuota>>;
type Errors = Partial<Record<QuotaProvider, string>>;

export function useQuotas() {
  const [quotas, setQuotas] = useState<Quotas>({});
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState<QuotaProvider[]>([...QUOTA_PROVIDERS]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true, loading = false;
    const controller = new AbortController();
    async function load(force: boolean) {
      if (loading) return;
      loading = true;
      setPending([...QUOTA_PROVIDERS]);
      await Promise.allSettled(QUOTA_PROVIDERS.map(async provider => {
        try {
          const response = await fetch(`/api/quota/${provider}${force ? "?refresh=1" : ""}`, { signal: controller.signal });
          if (!response.ok) throw new Error("Unable to load limits. Try refreshing shortly.");
          const quota = await response.json() as ProviderQuota;
          if (live) { setQuotas(value => ({ ...value, [provider]: quota })); setErrors(value => ({ ...value, [provider]: undefined })); }
        } catch {
          if (live) setErrors(value => ({ ...value, [provider]: "Unable to load limits. Try refreshing shortly." }));
        } finally { if (live) setPending(value => value.filter(id => id !== provider)); }
      }));
      loading = false;
    }
    void load(refresh > 0);
    const timer = window.setInterval(() => void load(false), 60_000);
    return () => { live = false; controller.abort(); window.clearInterval(timer); };
  }, [refresh]);
  return { quotas, pending, errors, onRefresh: () => setRefresh(value => value + 1) };
}
