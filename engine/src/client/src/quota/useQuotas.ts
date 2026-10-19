import { useEffect, useRef, useState } from "react";
import { QUOTA_PROVIDERS, type ProviderQuota, type QuotaProvider } from "@shared/quota";

type Quotas = Partial<Record<QuotaProvider, ProviderQuota>>;
type Errors = Partial<Record<QuotaProvider, string>>;

export function useQuotas(providers: readonly QuotaProvider[] = QUOTA_PROVIDERS) {
  const [quotas, setQuotas] = useState<Quotas>({});
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState<QuotaProvider[]>([...providers]);
  const [refresh, setRefresh] = useState(0);
  const previousRefresh = useRef(refresh);
  // Display order changes must not restart checks or bypass provider cooldowns.
  const membership = [...providers].sort().join(',');
  useEffect(() => {
    const force = refresh !== previousRefresh.current;
    previousRefresh.current = refresh;
    if (!providers.length) { setPending([]); return; }
    let live = true, loading = false;
    const controller = new AbortController();
    async function load(force: boolean) {
      if (loading) return;
      loading = true;
      setPending([...providers]);
      await Promise.allSettled(providers.map(async provider => {
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
    void load(force);
    const timer = window.setInterval(() => void load(false), 60_000);
    return () => { live = false; controller.abort(); window.clearInterval(timer); };
  }, [refresh, membership]);
  return { providers, quotas, pending: pending.filter(id => providers.includes(id)), errors, onRefresh: () => setRefresh(value => value + 1) };
}
