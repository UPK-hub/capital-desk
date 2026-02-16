type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  resetAt: number;
};

type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

const GLOBAL_BUCKETS_KEY = "__capitaldesk_rate_limit_buckets__";

function getStore(): Map<string, Bucket> {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_BUCKETS_KEY]?: Map<string, Bucket>;
  };

  if (!g[GLOBAL_BUCKETS_KEY]) {
    g[GLOBAL_BUCKETS_KEY] = new Map<string, Bucket>();
  }

  return g[GLOBAL_BUCKETS_KEY]!;
}

export function consumeRateLimit(config: RateLimitConfig): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const current = store.get(config.key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(config.key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: Math.max(config.limit - 1, 0),
      retryAfterMs: 0,
      resetAt,
    };
  }

  if (current.count >= config.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(current.resetAt - now, 0),
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  return {
    ok: true,
    remaining: Math.max(config.limit - current.count, 0),
    retryAfterMs: 0,
    resetAt: current.resetAt,
  };
}
