import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogSession } from "@shared/usage";
import Sessions from "../sessions/Sessions";

test("Sessions shows complete local update times for both recent and older sessions", () => {
  const session: CatalogSession = {
    id: "session", source: "codex", parent_id: null, title: "Example session", directory: "/work/example",
    created_at: 0, updated_at: 0, running_ms: 60_000, top_model: "example-model", top_model_ms: 60_000,
  };
  const html = renderToStaticMarkup(<Sessions
    sessions={[
      { ...session, id: "older", updated_at: new Date(2026, 9, 16, 18, 30).getTime() },
      { ...session, id: "recent", updated_at: new Date(2026, 9, 18, 0, 5).getTime() },
    ]}
    cards={new Map()} pending={false} error={null} selectedId={null}
    onRetry={() => {}} onSelect={() => {}}
  />);
  expect(html).toMatch(/<time[^>]*>2026-10-16 18:30<\/time>/);
  expect(html).toMatch(/<time[^>]*>2026-10-18 00:05<\/time>/);
  expect(html).toContain("Worked");
  expect(html).not.toContain("Context");
  expect(html).not.toContain("Top model");
  expect(html).not.toContain("example-model");
});
