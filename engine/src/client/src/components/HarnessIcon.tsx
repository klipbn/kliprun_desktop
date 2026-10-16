import type { SessionSource } from "@shared/types";

export function HarnessIcon({ source }: { source: SessionSource }) {
  return <img src={`/harness-icons/${source}.svg`} alt="" aria-hidden="true"
    className="w-3 h-3 shrink-0 object-contain" data-testid={`harness-icon-${source}`} />;
}
