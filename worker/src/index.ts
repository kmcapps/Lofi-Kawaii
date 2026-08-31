const ANALYTICS_PATH = '/analytics/visit';
const MAX_BODY_BYTES = 128;
const RETENTION_YEARS = 1;
const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UPSERT_VISIT_SQL = `
  INSERT INTO anonymous_users (id_hash, first_seen_date, last_seen_date, is_returning)
  VALUES (?, ?, ?, 0)
  ON CONFLICT(id_hash) DO UPDATE SET
    last_seen_date = MAX(anonymous_users.last_seen_date, excluded.last_seen_date),
    is_returning = CASE
      WHEN excluded.last_seen_date > anonymous_users.first_seen_date THEN 1
      ELSE anonymous_users.is_returning
    END
`;

const PURGE_EXPIRED_USERS_SQL = 'DELETE FROM anonymous_users WHERE last_seen_date < ?';

type D1RunResult = { success?: boolean };

type D1DatabaseLike = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<D1RunResult>;
    };
  };
};

type RateLimiterLike = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type AnalyticsEnv = {
  DB: D1DatabaseLike;
  ANALYTICS_HMAC_SECRET: string;
  ALLOWED_ORIGIN: string;
  ANALYTICS_RATE_LIMITER: RateLimiterLike;
};

function emptyResponse(status: number, extraHeaders: HeadersInit = {}) {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function getJstDate(now: Date) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getRetentionCutoffDate(now: Date) {
  const [year, month, day] = getJstDate(now).split('-').map(Number);
  const cutoffYear = year - RETENTION_YEARS;
  const lastDayOfMonth = new Date(Date.UTC(cutoffYear, month, 0)).getUTCDate();
  return [cutoffYear, month, Math.min(day, lastDayOfMonth)]
    .map((part, index) => String(part).padStart(index ? 2 : 4, '0'))
    .join('-');
}

export async function purgeExpiredUsers(env: AnalyticsEnv, now = new Date()) {
  const cutoffDate = getRetentionCutoffDate(now);
  const result = await env.DB.prepare(PURGE_EXPIRED_USERS_SQL).bind(cutoffDate).run();
  if (result.success === false) throw new Error('Retention cleanup failed');
}

async function createServerIdentifier(anonymousId: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(anonymousId));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function parseAnonymousId(request: Request) {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) return { error: 415 } as const;

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return { error: 413 } as const;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { error: 400 } as const;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 400 } as const;
  const entries = Object.entries(body);
  if (entries.length !== 1 || entries[0][0] !== 'anonymousId') return { error: 400 } as const;
  const anonymousId = entries[0][1];
  if (typeof anonymousId !== 'string' || !ANONYMOUS_ID_PATTERN.test(anonymousId)) return { error: 400 } as const;

  return { anonymousId } as const;
}

export async function handleAnalyticsRequest(request: Request, env: AnalyticsEnv, now = new Date()) {
  const url = new URL(request.url);
  if (url.pathname !== ANALYTICS_PATH) return emptyResponse(404);
  if (request.method !== 'POST') return emptyResponse(405, { Allow: 'POST' });
  if (!env.ALLOWED_ORIGIN || request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return emptyResponse(403);
  if (!env.ANALYTICS_HMAC_SECRET || env.ANALYTICS_HMAC_SECRET.length < 32 || !env.DB || !env.ANALYTICS_RATE_LIMITER) {
    return emptyResponse(503);
  }

  const parsed = await parseAnonymousId(request);
  if ('error' in parsed) return emptyResponse(parsed.error);

  const idHash = await createServerIdentifier(parsed.anonymousId, env.ANALYTICS_HMAC_SECRET);
  const rateLimit = await env.ANALYTICS_RATE_LIMITER.limit({ key: idHash });
  if (!rateLimit.success) return emptyResponse(429, { 'Retry-After': '60' });

  const visitDate = getJstDate(now);
  const result = await env.DB.prepare(UPSERT_VISIT_SQL).bind(idHash, visitDate, visitDate).run();
  if (result.success === false) return emptyResponse(503);

  return emptyResponse(204);
}

export default {
  async fetch(request: Request, env: AnalyticsEnv) {
    try {
      return await handleAnalyticsRequest(request, env);
    } catch {
      return emptyResponse(503);
    }
  },
  scheduled(
    controller: { scheduledTime: number },
    env: AnalyticsEnv,
    context: { waitUntil(promise: Promise<unknown>): void },
  ) {
    context.waitUntil(purgeExpiredUsers(env, new Date(controller.scheduledTime)));
  },
};
