/**
 * Wrapper that uses Obsidian's `requestUrl` when available, falls back to
 * `fetch` otherwise — and honours an `AbortSignal` in both cases.
 *
 * Why `requestUrl` is preferred in Obsidian: it bypasses Electron's CORS
 * enforcement so the plugin keeps working when an LLM provider tightens
 * cross-origin headers, and it's the pattern Obsidian's plugin guidelines
 * recommend.
 *
 * Why the `fetch` fallback exists: standalone scripts (scripts/test-llm.ts
 * etc.) run under Bun/Node without the Obsidian module, so they need a
 * working network primitive too. Both paths preserve abort semantics —
 * `fetch` natively, `requestUrl` via a Promise.race wrapper since the
 * underlying HTTP request can't actually be cancelled but the caller-facing
 * promise rejects on signal.
 */

export interface RequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export interface RequestResult {
  status: number;
  text: string;
  json: any;
}

type RequestUrlFn = (params: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  throw: boolean;
}) => Promise<{ status: number; text: string; json: any }>;

let cachedRequestUrl: RequestUrlFn | null | undefined;

function getRequestUrl(): RequestUrlFn | null {
  if (cachedRequestUrl !== undefined) return cachedRequestUrl;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("obsidian");
    cachedRequestUrl = typeof mod?.requestUrl === "function" ? mod.requestUrl : null;
  } catch {
    cachedRequestUrl = null;
  }
  return cachedRequestUrl ?? null;
}

export async function requestUrlWithAbort(
  opts: RequestOptions,
  signal?: AbortSignal
): Promise<RequestResult> {
  if (signal?.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }

  const ru = getRequestUrl();
  if (ru) {
    return requestViaObsidian(ru, opts, signal);
  }
  return requestViaFetch(opts, signal);
}

async function requestViaObsidian(
  ru: RequestUrlFn,
  opts: RequestOptions,
  signal?: AbortSignal
): Promise<RequestResult> {
  if (!signal) {
    const r = await ru({ ...opts, throw: false });
    return { status: r.status, text: r.text, json: r.json };
  }

  return new Promise<RequestResult>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Request aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    ru({ ...opts, throw: false })
      .then((r) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) return;
        resolve({ status: r.status, text: r.text, json: r.json });
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) return;
        reject(err);
      });
  });
}

async function requestViaFetch(
  opts: RequestOptions,
  signal?: AbortSignal
): Promise<RequestResult> {
  const response = await fetch(opts.url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
    signal,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Leave json null for non-JSON responses; caller can still inspect text.
  }
  return { status: response.status, text, json };
}
