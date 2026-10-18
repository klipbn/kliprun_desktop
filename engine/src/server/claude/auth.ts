import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/** Match Claude's isolated secure-storage profile, including custom config directories. */
export function claudeCredentialLocation(environment = process.env, home = homedir()): { path: string; service: string } {
  const configured = environment.CLAUDE_SECURESTORAGE_CONFIG_DIR ?? environment.CLAUDE_CONFIG_DIR;
  const directory = configured?.normalize("NFC") || join(home, ".claude");
  const suffix = configured ? `-${createHash("sha256").update(directory).digest("hex").slice(0, 8)}` : "";
  return { path: join(directory, ".credentials.json"), service: `Claude Code-credentials${suffix}` };
}

/** Read only: Claude owns sign-in, refresh tokens, and writes to its credential store. */
export async function readClaudeKeychain(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  const child = Bun.spawn(["/usr/bin/security", "find-generic-password", "-s", claudeCredentialLocation().service, "-w"], { stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => child.kill(), 5000);
  try {
    const value = await new Response(child.stdout).text();
    return await child.exited === 0 && value.trim() ? value : null;
  } finally { clearTimeout(timer); }
}
