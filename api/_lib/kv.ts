/** Storage adapter. Upstash/Vercel KV over REST (no package), or memory for tests. */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(k) { return data.has(k) ? data.get(k)! : null; },
    async set(k, v) { data.set(k, v); },
    async del(k) { data.delete(k); },
  };
}

export function upstashKV(url: string, token: string, fetchImpl: typeof fetch = fetch): KV {
  const call = async (cmd: unknown[]) => {
    const r = await fetchImpl(url.replace(/\/$/, ""), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmd),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Storage error ${r.status}`);
    return j.result;
  };
  return {
    async get(k) { const v = await call(["GET", k]); return v == null ? null : String(v); },
    async set(k, v) { await call(["SET", k, v]); },
    async del(k) { await call(["DEL", k]); },
  };
}

export function kvFromEnv(env: Record<string, string | undefined>): KV | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstashKV(url, token) : null;
}
