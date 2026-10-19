import { homedir } from 'node:os';
import { join } from 'node:path';

export function agentEnvironment(): Record<string, string | undefined> {
  const env = { ...process.env, PATH: [join(homedir(), '.local/bin'), join(homedir(), '.opencode/bin'), join(homedir(), '.bun/bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH ?? '/usr/bin:/bin'].join(':') };
  for (const key of ['KLIPRUN_DESKTOP_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']) delete (env as Record<string, unknown>)[key];
  return env;
}
export async function command(args: string[], options: { cwd?: string; input?: string; timeout?: number } = {}) {
  const child = Bun.spawn(args, { cwd: options.cwd, env: agentEnvironment(), stdin: options.input === undefined ? 'ignore' : new TextEncoder().encode(options.input), stdout: 'pipe', stderr: 'pipe', detached: true });
  let expired = false;
  const stop = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill(); } };
  const timer = setTimeout(() => { expired = true; stop(); }, options.timeout ?? 20_000);
  async function read(stream: ReadableStream<Uint8Array>) {
    const chunks: Uint8Array[] = []; let length = 0;
    for await (const chunk of stream) { length += chunk.length; if (length > 8 * 1024 * 1024) { stop(); throw Error('Command output exceeds 8 MiB.'); } chunks.push(chunk); }
    return Buffer.concat(chunks).toString('utf8');
  }
  try {
    const [out, err, code] = await Promise.all([read(child.stdout), read(child.stderr), child.exited]);
    if (expired) throw Error('Command timed out. Check access and retry.');
    if (code) throw Error((err.trim() || out.trim() || `${args[0]} exited with code ${code}`).replace(/([a-z]+:\/\/)[^\s/@]+@/gi, '$1[redacted]@').slice(-3000));
    return out;
  } finally { clearTimeout(timer); }
}
