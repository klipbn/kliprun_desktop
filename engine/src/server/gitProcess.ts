const OUTPUT_LIMIT = 4 * 1024 * 1024;

export class GitError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 413 | 504 = 409) { super(message); }
}

function redact(message: string) {
  return message.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/(authorization|token|password|secret)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]").slice(0, 4000);
}

// No shell, interactive prompts, optional index locks, external diff or textconv.
export async function runGit(directory: string, args: string[], options: { allowFailure?: boolean; timeout?: number; input?: string; indexFile?: string; readStdout?: (stream: ReadableStream<Uint8Array>) => Promise<string> } = {}) {
  const env: Record<string, string | undefined> = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_PAGER: "cat", LC_ALL: "C.UTF-8" };
  for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/.test(key)) delete env[key];
  if (options.indexFile) env.GIT_INDEX_FILE = options.indexFile;
  let child: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    child = Bun.spawn(["git", "--no-optional-locks", "--literal-pathspecs", "-c", "color.ui=false", "-C", directory, ...args], {
      env, detached: true, stdin: options.input === undefined ? "ignore" : new TextEncoder().encode(options.input), stdout: "pipe", stderr: "pipe",
    });
  } catch { throw new GitError("Git could not start. Install the macOS command line tools.", 404); }
  let timedOut = false, overflow = false;
  function stop() {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  }
  const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeout ?? 15_000);
  async function read(stream: ReadableStream<Uint8Array>) {
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > OUTPUT_LIMIT) { overflow = true; stop(); break; }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  try {
    const [out, err, code] = await Promise.all([options.readStdout ? options.readStdout(child.stdout) : read(child.stdout), read(child.stderr), child.exited]);
    if (timedOut) throw new GitError("Git timed out. Check authentication or repository hooks and try again.", 504);
    if (overflow) throw new GitError("Git output is too large to display. Narrow the selection.", 413);
    if (code && !options.allowFailure) throw new GitError(redact(err.trim() || out.trim() || "Git operation failed."));
    return { out, code };
  } finally { clearTimeout(timer); }
}
