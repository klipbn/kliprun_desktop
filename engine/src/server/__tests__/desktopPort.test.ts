import { expect, test } from "bun:test";
import { availableLoopbackPort } from "../desktopPort";

test("chooses a usable loopback port for Bun", async () => {
  const port = await availableLoopbackPort();
  expect(port).toBeGreaterThan(0);
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("ok") });
  try { expect(server.port).toBe(port); } finally { server.stop(true); }
});
