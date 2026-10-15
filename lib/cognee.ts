// Thin client for Cognee Cloud (https://docs.cognee.ai/cognee-cloud/http-api).
// All routes live under /api/v1 and authenticate with X-Api-Key.
// If COGNEE_API_KEY is unset every call becomes a no-op that returns null,
// so the app still runs without memory configured.

const BASE = (process.env.COGNEE_BASE_URL ?? "https://api.aws.cognee.ai").replace(/\/$/, "");
const KEY = process.env.COGNEE_API_KEY;

export const cogneeEnabled = Boolean(KEY);

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = { "X-Api-Key": KEY ?? "" };
  if (process.env.COGNEE_TENANT_ID) h["X-Tenant-Id"] = process.env.COGNEE_TENANT_ID;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function parse(res: Response) {
  const text = await res.text();
  if (!res.ok) throw new Error(`cognee ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Add raw text to a dataset (does not build the graph yet). */
export async function add(dataset: string, texts: string[]) {
  if (!KEY) return null;
  const form = new FormData();
  form.set("datasetName", dataset);
  for (const t of texts) form.append("raw_data", t);
  return parse(await fetch(`${BASE}/api/v1/add`, { method: "POST", headers: headers(false), body: form }));
}

/** Build/refresh the knowledge graph for datasets. Slow (LLM pipeline). */
export async function cognify(datasets: string[]) {
  if (!KEY) return null;
  return parse(
    await fetch(`${BASE}/api/v1/cognify`, { method: "POST", headers: headers(), body: JSON.stringify({ datasets }) }),
  );
}

/** add + cognify in one call. */
export async function remember(dataset: string, texts: string[]) {
  if (!KEY) return null;
  const form = new FormData();
  form.set("datasetName", dataset);
  for (const t of texts) form.append("raw_data", t);
  return parse(await fetch(`${BASE}/api/v1/remember`, { method: "POST", headers: headers(false), body: form }));
}

export type SearchType =
  | "HYBRID_COMPLETION"
  | "GRAPH_COMPLETION"
  | "RAG_COMPLETION"
  | "CHUNKS"
  | "SUMMARIES"
  | "TEMPORAL";

/** Query the graph. Returns the raw list Cognee sends back. */
export async function search(
  query: string,
  opts: { datasets?: string[]; search_type?: SearchType; top_k?: number; only_context?: boolean; system_prompt?: string } = {},
) {
  if (!KEY) return null;
  return parse(
    await fetch(`${BASE}/api/v1/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ query, search_type: "GRAPH_COMPLETION", top_k: 10, ...opts }),
    }),
  );
}

/** Auto-routed recall across graph + session memory. */
export async function recall(query: string, opts: { datasets?: string[]; top_k?: number; only_context?: boolean } = {}) {
  if (!KEY) return null;
  return parse(
    await fetch(`${BASE}/api/v1/recall`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ query, top_k: 10, ...opts }),
    }),
  );
}
