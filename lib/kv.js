// ============================================================
// SKJOLDR — Minimal client for the Upstash Redis REST API
// The database (neoco-kv) is connected to the Vercel project, which sets
// KV_REST_API_URL and KV_REST_API_TOKEN. Each call is one HTTPS request:
//   POST <url>  body: ["COMMAND", "arg1", ...]  ->  { "result": ... }
// Nothing here logs the URL, the token or any stored value.
// ============================================================

export function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function kvCommand(args) {
  if (!kvConfigured()) throw new Error('database is not connected (KV_REST_API_URL / KV_REST_API_TOKEN missing)');
  let res;
  try {
    res = await fetch(process.env.KV_REST_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
  } catch {
    throw new Error('database could not be reached');
  }
  let data = null;
  try { data = await res.json(); } catch { /* handled below */ }
  if (!res.ok || !data || data.error) {
    throw new Error(`database command ${String(args[0])} failed (HTTP ${res.status})`);
  }
  return data.result;
}
