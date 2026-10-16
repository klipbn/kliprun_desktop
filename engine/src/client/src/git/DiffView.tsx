import type { GitDiff } from "@shared/git";

export function parseDiff(patch: string): Array<{ kind: string; oldLine: number | null; newLine: number | null; text: string }> {
  let oldLine = 0, newLine = 0, inHunk = false;
  return patch.replace(/\n$/, "").split("\n").map(text => {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); inHunk = true; return { kind: "hunk", oldLine: null, newLine: null, text }; }
    if (text.startsWith("diff --git")) inHunk = false;
    if (inHunk && text.startsWith("+")) return { kind: "add", oldLine: null, newLine: newLine++, text };
    if (inHunk && text.startsWith("-")) return { kind: "delete", oldLine: oldLine++, newLine: null, text };
    if (inHunk && text.startsWith(" ")) return { kind: "context", oldLine: oldLine++, newLine: newLine++, text };
    return { kind: "meta", oldLine: null, newLine: null, text };
  });
}

export function DiffView({ diff }: { diff: GitDiff }) {
  return <>
    {diff.truncated && <p className="git-notice">Preview truncated. Open the file locally to review the complete contents.</p>}
    {diff.notice && <p className="git-notice">{diff.notice}</p>}
    {diff.binary ? <div className="git-empty"><strong>Binary file</strong><span>A text diff is unavailable for this file.</span></div> : diff.patch ?
      <div className="git-diff-scroll" tabIndex={0} aria-label="File diff"><table className="git-diff"><tbody>
        {parseDiff(diff.patch).slice(0, 10_000).map((row, index) => <tr key={index} className={`git-line-${row.kind}`}>
          <td className="git-line-number" aria-label={row.oldLine ? `Old line ${row.oldLine}` : undefined}>{row.oldLine}</td>
          <td className="git-line-number" aria-label={row.newLine ? `New line ${row.newLine}` : undefined}>{row.newLine}</td>
          <td className="git-line-code"><pre>{row.text || " "}</pre></td>
        </tr>)}
      </tbody></table>{diff.patch.split("\n").length > 10_000 && <p className="git-notice">Showing the first 10,000 diff lines.</p>}</div>
      : !diff.notice && !diff.truncated && <div className="git-empty"><strong>No text changes</strong><span>The file may have been renamed, changed mode, or refreshed.</span></div>}
  </>;
}
