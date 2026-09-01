import { createHash, timingSafeEqual } from 'node:crypto';

const ANALYTICS_PATH = '/analytics/visit';
const ADMIN_PATH = '/admin';
const ADMIN_STATS_PATH = '/admin/stats';
const MAX_BODY_BYTES = 128;
const RETENTION_YEARS = 1;
const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_SECRET_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;

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
const READ_AGGREGATE_STATS_SQL = `
  SELECT
    COUNT(*) AS total_unique,
    COALESCE(SUM(is_returning), 0) AS returning_users,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(100.0 * SUM(is_returning) / COUNT(*), 2)
    END AS returning_rate_percent
  FROM anonymous_users
`;

type D1RunResult = { success?: boolean };

type D1DatabaseLike = {
  prepare(sql: string): {
    first<T>(): Promise<T | null>;
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
  ANALYTICS_ADMIN_SECRET?: string;
  ANALYTICS_ADMIN_RATE_LIMITER?: RateLimiterLike;
};

type AggregateStatsRow = {
  total_unique: number;
  returning_users: number;
  returning_rate_percent: number;
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

function adminHeaders(contentType: string, extraHeaders: HeadersInit = {}) {
  return {
    'Cache-Control': 'private, no-store',
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  };
}

function adminEmptyResponse(status: number, extraHeaders: HeadersInit = {}) {
  return new Response(null, {
    status,
    headers: adminHeaders('text/plain; charset=utf-8', extraHeaders),
  });
}

function createAdminHtml(nonce: string) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lofi-Kawaii Analytics</title>
    <style nonce="${nonce}">
      :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #f6f1ff; background: #0c1024; }
      main { width: min(720px, 100%); }
      h1 { margin: 0 0 8px; font-size: clamp(1.6rem, 5vw, 2.4rem); }
      .description, .updated { color: #c5c8db; }
      .credentials { display: flex; align-items: end; gap: 10px; margin: 24px 0; }
      .field { display: grid; flex: 1; gap: 7px; color: #c5c8db; font-size: .9rem; }
      input { width: 100%; border: 1px solid #4c557f; border-radius: 10px; padding: 10px 12px; color: inherit; background: #151a35; font: inherit; }
      input:focus-visible { outline: 3px solid #b9c4ff; outline-offset: 3px; }
      .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
      .card { padding: 18px; border: 1px solid #343b62; border-radius: 14px; background: #151a35; }
      .label { margin: 0 0 8px; color: #c5c8db; font-size: .9rem; }
      .value { margin: 0; font-size: clamp(1.7rem, 7vw, 2.5rem); font-variant-numeric: tabular-nums; }
      button { border: 1px solid #7178a8; border-radius: 10px; padding: 10px 16px; color: inherit; background: #252b50; font: inherit; cursor: pointer; }
      button:hover { background: #303760; }
      button:focus-visible { outline: 3px solid #b9c4ff; outline-offset: 3px; }
      button:disabled { cursor: wait; opacity: .65; }
      .status { min-height: 1.5em; margin-top: 14px; color: #c5c8db; }
      @media (max-width: 540px) { .credentials { align-items: stretch; flex-direction: column; } .cards { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Lofi-Kawaii Analytics</h1>
      <p class="description">保持中の匿名インストールを集計したローリング1年の概況です。</p>
      <div class="credentials">
        <label class="field" for="admin-secret">管理用Secret
          <input type="password" id="admin-secret" autocomplete="off" spellcheck="false" />
        </label>
        <button type="button" id="refresh">表示</button>
      </div>
      <section class="cards" aria-label="利用状況">
        <article class="card"><p class="label">ユニーク利用</p><p class="value" id="total-unique">—</p></article>
        <article class="card"><p class="label">別日再訪</p><p class="value" id="returning-users">—</p></article>
        <article class="card"><p class="label">再訪率</p><p class="value" id="returning-rate">—</p></article>
      </section>
      <p class="updated">最終更新: <time id="updated-at">未取得</time></p>
      <p class="status" id="status" role="status" aria-live="polite"></p>
    </main>
    <script nonce="${nonce}">
      const totalUnique = document.querySelector('#total-unique');
      const returningUsers = document.querySelector('#returning-users');
      const returningRate = document.querySelector('#returning-rate');
      const updatedAt = document.querySelector('#updated-at');
      const status = document.querySelector('#status');
      const refresh = document.querySelector('#refresh');
      const secretInput = document.querySelector('#admin-secret');
      let adminSecret = '';

      async function loadStats() {
        const enteredSecret = secretInput.value;
        if (enteredSecret) {
          adminSecret = enteredSecret;
          secretInput.value = '';
        }
        if (!adminSecret) {
          status.textContent = '管理用Secretを入力してください。';
          secretInput.focus();
          return;
        }

        refresh.disabled = true;
        status.textContent = '集計を取得しています…';
        try {
          const response = await fetch('/admin/stats', {
            credentials: 'omit',
            headers: {
              Accept: 'application/json',
              Authorization: 'Bearer ' + adminSecret,
            },
          });
          if (response.status === 401) {
            adminSecret = '';
            status.textContent = '認証できませんでした。Secretを確認してください。';
            secretInput.focus();
            return;
          }
          if (response.status === 429) {
            status.textContent = '試行回数が多すぎます。1分ほど待ってから再度お試しください。';
            return;
          }
          if (!response.ok) throw new Error('stats request failed');
          const stats = await response.json();
          totalUnique.textContent = String(stats.total_unique);
          returningUsers.textContent = String(stats.returning_users);
          returningRate.textContent = String(stats.returning_rate_percent) + '%';
          updatedAt.textContent = new Intl.DateTimeFormat('ja-JP', {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(new Date());
          refresh.textContent = '更新';
          status.textContent = '';
        } catch {
          status.textContent = '集計を取得できませんでした。時間をおいて再度お試しください。';
        } finally {
          refresh.disabled = false;
        }
      }

      refresh.addEventListener('click', loadStats);
    </script>
  </body>
</html>`;
}

function parseBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  return authorization.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/i)?.[1] ?? null;
}

function adminSecretsMatch(presentedSecret: string, configuredSecret: string) {
  const presentedDigest = createHash('sha256').update(presentedSecret, 'utf8').digest();
  const configuredDigest = createHash('sha256').update(configuredSecret, 'utf8').digest();
  return timingSafeEqual(presentedDigest, configuredDigest);
}

export async function handleAdminRequest(request: Request, env: AnalyticsEnv) {
  const url = new URL(request.url);
  if (url.pathname !== ADMIN_PATH && url.pathname !== ADMIN_STATS_PATH) return adminEmptyResponse(404);
  if (request.method !== 'GET') return adminEmptyResponse(405, { Allow: 'GET' });

  if (url.pathname === ADMIN_PATH) {
    const nonce = crypto.randomUUID().replaceAll('-', '');
    const contentSecurityPolicy = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ');

    return new Response(createAdminHtml(nonce), {
      status: 200,
      headers: adminHeaders('text/html; charset=utf-8', { 'Content-Security-Policy': contentSecurityPolicy }),
    });
  }

  const configuredSecret = env.ANALYTICS_ADMIN_SECRET;
  if (
    !configuredSecret ||
    configuredSecret.length < 32 ||
    !ADMIN_SECRET_PATTERN.test(configuredSecret) ||
    !env.DB ||
    !env.ANALYTICS_ADMIN_RATE_LIMITER
  ) {
    return adminEmptyResponse(503);
  }

  const connectingIp = request.headers.get('CF-Connecting-IP');
  if (!connectingIp) return adminEmptyResponse(503);
  const rateLimit = await env.ANALYTICS_ADMIN_RATE_LIMITER.limit({ key: `admin:${connectingIp}` });
  if (!rateLimit.success) return adminEmptyResponse(429, { 'Retry-After': '60' });

  const presentedSecret = parseBearerToken(request);
  if (!presentedSecret || !adminSecretsMatch(presentedSecret, configuredSecret)) {
    return adminEmptyResponse(401, { 'WWW-Authenticate': 'Bearer realm="admin"' });
  }

  const row = await env.DB.prepare(READ_AGGREGATE_STATS_SQL).first<AggregateStatsRow>();
  const totalUnique = Number(row?.total_unique ?? 0);
  const returningUsers = Number(row?.returning_users ?? 0);
  const returningRatePercent = Number(row?.returning_rate_percent ?? 0);

  return Response.json(
    {
      total_unique: totalUnique,
      returning_users: returningUsers,
      returning_rate_percent: returningRatePercent,
    },
    { headers: adminHeaders('application/json; charset=utf-8') },
  );
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
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === ADMIN_PATH || pathname === ADMIN_STATS_PATH) {
        return await handleAdminRequest(request, env);
      }
      return await handleAnalyticsRequest(request, env);
    } catch {
      return pathname === ADMIN_PATH || pathname === ADMIN_STATS_PATH ? adminEmptyResponse(503) : emptyResponse(503);
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
