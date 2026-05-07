/** One-line import error text: expands Yup `inner`, Zod `issues`, or `details.errors` when `message` is only a count summary. */
function formatInnerLikeEntry(entry: unknown): string | null {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    const t = entry.trim();
    return t || null;
  }
  if (typeof entry !== 'object') return null;
  const o = entry as Record<string, unknown>;
  const msg =
    o.message != null && String(o.message).trim()
      ? String(o.message).trim()
      : null;
  if (!msg) return null;
  const path = o.path;
  if (path === undefined || path === null || path === '') return msg;
  const pathStr = Array.isArray(path)
    ? path.filter(p => p !== undefined && p !== null && p !== '').join('.')
    : String(path);
  return pathStr ? `${pathStr}: ${msg}` : msg;
}

function collectImportErrorMessages(err: unknown, out: string[], seen: Set<string>): void {
  if (err == null) return;

  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;

    const inner = e.inner;
    if (Array.isArray(inner) && inner.length) {
      for (const item of inner) {
        const line = formatInnerLikeEntry(item);
        if (line && !seen.has(line)) {
          seen.add(line);
          out.push(line);
        }
      }
    }

    const issues = e.issues;
    if (Array.isArray(issues) && issues.length) {
      for (const issue of issues) {
        const line = formatInnerLikeEntry(issue);
        if (line && !seen.has(line)) {
          seen.add(line);
          out.push(line);
        }
      }
    }

    const details = e.details;
    if (details && typeof details === 'object') {
      const nestedErrors = (details as Record<string, unknown>).errors;
      if (Array.isArray(nestedErrors) && nestedErrors.length) {
        for (const item of nestedErrors) {
          const line = formatInnerLikeEntry(item);
          if (line && !seen.has(line)) {
            seen.add(line);
            out.push(line);
          }
        }
      }
    }

    if (e.cause) {
      collectImportErrorMessages(e.cause, out, seen);
    }
  }

  if (!out.length && typeof err === 'object' && err !== null) {
    const msg = (err as Error).message;
    if (msg && String(msg).trim()) {
      const line = String(msg).trim();
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
    }
  } else if (!out.length && typeof err === 'string' && err.trim()) {
    const line = err.trim();
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
}

export function formatImportCaughtError(err: unknown): string {
  const out: string[] = [];
  const seen = new Set<string>();
  collectImportErrorMessages(err, out, seen);
  if (!out.length) return 'Unknown error';
  return out.join(', ');
}
