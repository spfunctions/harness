export class CloudflareStorage {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  // KV operations
  async kvGet(key: string): Promise<unknown | null> {
    const res = await fetch(`${this.baseUrl}/kv/${encodeURIComponent(key)}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
    const data = (await res.json()) as { value: unknown };
    return data.value;
  }

  async kvSet(key: string, value: unknown, ttl?: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ value, ttl }),
    });
    if (!res.ok) throw new Error(`KV set failed: ${res.status}`);
  }

  async kvDelete(key: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/kv/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`KV delete failed: ${res.status}`);
  }

  async kvList(prefix?: string): Promise<string[]> {
    const url = prefix
      ? `${this.baseUrl}/kv?prefix=${encodeURIComponent(prefix)}`
      : `${this.baseUrl}/kv`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return [];
    const data = (await res.json()) as { keys?: string[] };
    return data.keys ?? [];
  }

  // R2 operations (large files)
  async r2Get(key: string): Promise<ReadableStream | null> {
    const res = await fetch(`${this.baseUrl}/r2/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 get failed: ${res.status}`);
    return res.body;
  }

  async r2Put(key: string, data: string | Buffer): Promise<void> {
    const res = await fetch(`${this.baseUrl}/r2/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}` },
      body: data,
    });
    if (!res.ok) throw new Error(`R2 put failed: ${res.status}`);
  }

  async r2Delete(key: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/r2/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`R2 delete failed: ${res.status}`);
  }
}
