import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as details from "../components/DetailsPanel";
import type { DetailMessage } from "@shared/types";

const message = (role: string, text: string): DetailMessage => ({
  role, text, agent: null, created: null, started: null, completed: null,
  duration_ms: null, model: "technical-model", cost: null, usage: null,
  tools: [{ tool: "technical-tool", status: "completed", started: null, ended: null,
    duration_ms: null, skill_name: null }], error: null,
});

test("session details keep Agents T as default with User first and no All or iTerm2", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { webkit: { messageHandlers: { desktopAction: { postMessage() {} } } } } });
  let html: string;
  try {
    html = renderToStaticMarkup(<details.DetailsPanel sessionId="demo" onClose={() => {}} />);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
  expect(html).toContain("Agents T");
  expect(html.indexOf('data-testid="tab-user"')).toBeLessThan(html.indexOf('data-testid="tab-agent-text"'));
  expect(html).not.toContain('data-testid="tab-all"');
  expect(html).not.toContain("iTerm2");
  expect(html).toContain('aria-pressed="true" data-testid="tab-agent-text"');
});

test("Agents T renders only readable assistant text with Markdown and tables", () => {
  expect(typeof details.AgentTextView).toBe("function");
  const html = renderToStaticMarkup(<details.AgentTextView messages={[
    message("user", "private prompt"), message("tool", "raw tool output"),
    message("assistant", "  "),
    message("assistant", "# Result\n\n**Done** with [docs](https://example.com).\n\n- First\n- Second\n\n```ts\nconst ready = true;\n```\n\n| Item | State |\n| --- | --- |\n| Build | OK |"),
  ]} />);
  for (const text of ["private prompt", "raw tool output", "technical-tool", "technical-model"]) {
    expect(html).not.toContain(text);
  }
  for (const tag of ["<h1>", "<strong>", "<ul>", "<pre>", "<table>"]) expect(html).toContain(tag);
  expect(html).toContain('href="https://example.com"');
  expect(html.match(/data-testid="agent-text-message"/g)).toHaveLength(1);
});

test("agent Markdown cannot insert HTML, unsafe links or remote images", () => {
  expect(typeof details.AgentTextView).toBe("function");
  const html = renderToStaticMarkup(<details.AgentTextView messages={[
    message("assistant", '<script>alert(1)</script>\n\n[click](javascript:alert%281%29)\n\n![tracking](https://example.com/pixel.png)'),
  ]} />);
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<img");
});

test("Agents T timestamps each reply and switches to exact local time at 12 hours", () => {
  const now = Date.now();
  const html = renderToStaticMarkup(<details.AgentTextView messages={[
    { ...message("assistant", "Recent reply"), created: now - 3_600_000, completed: now - 60_000 },
    { ...message("assistant", "Ten hours ago"), created: now - 10 * 3_600_000 },
    { ...message("assistant", "Older reply"), created: now - 12 * 3_600_000 },
    message("assistant", "No recorded time"),
  ]} />);
  expect(html).toContain("1m ago");
  expect(html).toContain("10h ago");
  expect(html).not.toContain("12h ago");
  expect(html.match(/<time /g)).toHaveLength(3);
  expect(html).toContain(`dateTime="${new Date(now - 12 * 3_600_000).toISOString()}"`);
  // Even relative labels expose the exact timestamp on hover.
  expect(html).toMatch(/<time [^>]*title="[^"]+"[^>]*>1m ago<\/time>/);
});
