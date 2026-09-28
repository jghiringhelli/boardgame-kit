// Generic "trigger a browser file download" DOM utility, extracted from
// meq's bug-report exporter — the Blob/ObjectURL/anchor-click dance (with a
// new-tab fallback if downloads are blocked) has nothing game-specific about
// it, so any game wanting to export its state/log/report as a file can reuse
// it instead of re-copying the same DOM plumbing.

/** Triggers a download of `content` as `filename`. Falls back to opening the
 *  content in a new tab if the download itself is blocked (e.g. some
 *  restrictive browser/extension setups). */
export function downloadText(filename: string, content: string, mimeType = 'text/plain'): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    try {
      const w = window.open('', '_blank');
      if (w) { w.document.write(`<pre>${content.replace(/</g, '&lt;')}</pre>`); }
    } catch { /* ignore — nothing more we can do */ }
  }
}

/** Convenience wrapper for the common case of exporting a JSON bundle. */
export function downloadJson(filename: string, data: unknown, pretty = true): void {
  downloadText(filename, JSON.stringify(data, null, pretty ? 2 : 0), 'application/json');
}
