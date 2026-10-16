import type { SessionSource } from "@shared/types";

export function HarnessIcon({ source, className = "w-3 h-3" }: { source: SessionSource; className?: string }) {
  return <img src={`/harness-icons/${source}.svg`} alt="" aria-hidden="true"
    className={`${className} shrink-0 object-contain`} data-testid={`harness-icon-${source}`} />;
}
