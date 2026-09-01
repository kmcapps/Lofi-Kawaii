import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import worker, { getJstDate, handleAnalyticsRequest, purgeExpiredUsers } from '../worker/src/index.ts';

const ORIGIN = 'https://123456789012345678.discordsays.com';
const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const TEST_ADMIN_SECRET = 'test-only-admin-secret'.padEnd(64, 'x');

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../worker/migrations/0001_create_anonymous_users.sql', import.meta.url), 'utf8');
  sqlite.exec(migration);

  const queries: string[] = [];
  let runCount = 0;

  return {
    sqlite,
    queries,
    get runCount() {
      return runCount;
    },
    d1: {
      prepare(sql: string) {
        queries.push(sql);
        const statement = sqlite.prepare(sql);
        return {
          async first() {
            return statement.get() ?? null;
          },
          bind(...values: unknown[]) {
            return {
              async run() {
                runCount += 1;
                statement.run(...values);
                return { success: true };
              },
            };
          },
        };
      },
    },
  };
}

function createEnv(
  database: ReturnType<typeof createDatabase>['d1'],
  rateLimitSuccess = true,
  secret = 'local-test-secret-that-is-never-deployed',
  adminSecret = TEST_ADMIN_SECRET,
  adminRateLimitSuccess = true,
  adminRateLimitKeys: string[] = [],
) {
  return {
    DB: database,
    ANALYTICS_HMAC_SECRET: secret,
    ALLOWED_ORIGIN: ORIGIN,
    ANALYTICS_ADMIN_SECRET: adminSecret,
    ANALYTICS_RATE_LIMITER: {
      async limit() {
        return { success: rateLimitSuccess };
      },
    },
    ANALYTICS_ADMIN_RATE_LIMITER: {
      async limit({ key }: { key: string }) {
        adminRateLimitKeys.push(key);
        return { success: adminRateLimitSuccess };
      },
    },
  };
}

function createAdminRequest(path = '/admin', method = 'GET', authorization?: string, ip = '203.0.113.7') {
  const headers = new Headers({ 'CF-Connecting-IP': ip });
  if (authorization !== undefined) headers.set('Authorization', authorization);
  return new Request(`https://analytics.example${path}`, { method, headers });
}

function createRequest(anonymousId: string, overrides: { method?: string; origin?: string; contentType?: string } = {}) {
  return new Request('https://analytics.example/analytics/visit', {
    method: overrides.method ?? 'POST',
    headers: {
      Origin: overrides.origin ?? ORIGIN,
      'Content-Type': overrides.contentType ?? 'application/json',
    },
    body: overrides.method === 'GET' ? undefined : JSON.stringify({ anonymousId }),
  });
}

test('JST date changes at 15:00 UTC and never trusts a client date', () => {
  assert.equal(getJstDate(new Date('2026-08-31T14:59:59.999Z')), '2026-08-31');
  assert.equal(getJstDate(new Date('2026-08-31T15:00:00.000Z')), '2026-09-01');
});

test('same-day duplicate requests create one non-returning pseudonymous row', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);
  const now = new Date('2026-08-31T02:00:00Z');

  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID), env, now)).status, 204);
  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID), env, now)).status, 204);

  const rows = database.sqlite.prepare('SELECT id_hash, first_seen_date, last_seen_date, is_returning FROM anonymous_users').all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].id_hash, FIRST_ID);
  assert.match(String(rows[0].id_hash), /^[a-f0-9]{64}$/);
  assert.deepEqual(
    { firstSeen: rows[0].first_seen_date, lastSeen: rows[0].last_seen_date, returning: rows[0].is_returning },
    { firstSeen: '2026-08-31', lastSeen: '2026-08-31', returning: 0 },
  );
});

test('a different JST day marks one user returning exactly once', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);

  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2026-09-01T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2026-09-02T02:00:00Z'));

  const row = database.sqlite.prepare('SELECT first_seen_date, last_seen_date, is_returning FROM anonymous_users').get();
  assert.deepEqual(
    { firstSeen: row.first_seen_date, lastSeen: row.last_seen_date, returning: row.is_returning },
    { firstSeen: '2026-08-31', lastSeen: '2026-09-02', returning: 1 },
  );
});

test('retained IDs produce unique-user and returning-rate aggregates', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);

  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(SECOND_ID), env, new Date('2026-08-31T03:00:00Z'));
  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2026-09-01T02:00:00Z'));

  const stats = database.sqlite
    .prepare('SELECT COUNT(*) AS total, SUM(is_returning) AS returning_count FROM anonymous_users')
    .get();
  assert.deepEqual({ total: stats.total, returning: stats.returning_count }, { total: 2, returning: 1 });
});

test('daily retention cleanup removes rows older than one JST calendar year', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);

  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2025-08-29T15:00:00Z'));
  await handleAnalyticsRequest(createRequest(SECOND_ID), env, new Date('2025-08-30T15:00:00Z'));
  await handleAnalyticsRequest(createRequest(THIRD_ID), env, new Date('2026-08-30T15:00:00Z'));

  await purgeExpiredUsers(env, new Date('2026-08-31T02:00:00Z'));

  const rows = database.sqlite.prepare('SELECT first_seen_date FROM anonymous_users ORDER BY first_seen_date').all();
  assert.deepEqual(rows.map((row) => row.first_seen_date), ['2025-08-31', '2026-08-31']);
});

test('scheduled handler runs the one-year retention cleanup', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);
  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2025-08-29T15:00:00Z'));

  let cleanup: Promise<unknown> | undefined;
  worker.scheduled(
    { scheduledTime: new Date('2026-08-31T02:00:00Z').getTime() },
    env,
    { waitUntil(promise) { cleanup = promise; } },
  );
  await cleanup;

  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS total FROM anonymous_users').get().total, 0);
});

test('method, origin, content type, body shape, and rate limit are enforced before D1', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);
  const now = new Date('2026-08-31T02:00:00Z');

  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID, { method: 'GET' }), env, now)).status, 405);
  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID, { origin: 'https://example.com' }), env, now)).status, 403);
  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID, { contentType: 'text/plain' }), env, now)).status, 415);
  assert.equal((await handleAnalyticsRequest(createRequest('malformed-id'), env, now)).status, 400);
  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID), createEnv(database.d1, false), now)).status, 429);
  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID), createEnv(database.d1, true, 'too-short'), now)).status, 503);
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS total FROM anonymous_users').get().total, 0);
});

test('admin stats reject missing, malformed, and mismatched Bearer credentials before D1', async () => {
  const invalidAuthorizationValues = [
    undefined,
    '',
    'Basic dGVzdDp0ZXN0',
    'Bearer',
    'Bearer ',
    `Bearer ${TEST_ADMIN_SECRET}, Bearer ${TEST_ADMIN_SECRET}`,
    `Bearer\t${TEST_ADMIN_SECRET}`,
    'Bearer wrong-secret-that-is-long-enough-to-look-plausible',
    `Bearer ${TEST_ADMIN_SECRET} trailing`,
  ];

  for (const authorization of invalidAuthorizationValues) {
    const database = createDatabase();
    const response = await worker.fetch(
      createAdminRequest('/admin/stats', 'GET', authorization),
      createEnv(database.d1),
    );

    assert.equal(response.status, 401, String(authorization));
    assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer realm="admin"');
    assert.equal(await response.text(), '');
    assert.equal(database.queries.length, 0);
    assert.equal(database.runCount, 0);
  }
});

test('admin stats reject query, cookie, and Access-header credentials', async () => {
  const database = createDatabase();
  const request = new Request(`https://analytics.example/admin/stats?secret=${TEST_ADMIN_SECRET}`, {
    headers: {
      Cookie: `admin_secret=${TEST_ADMIN_SECRET}`,
      'Cf-Access-Authenticated-User-Email': 'owner@example.com',
      'Cf-Access-Jwt-Assertion': TEST_ADMIN_SECRET,
      'CF-Connecting-IP': '203.0.113.7',
    },
  });

  const response = await worker.fetch(request, createEnv(database.d1));
  assert.equal(response.status, 401);
  assert.equal(database.queries.length, 0);
  assert.equal(database.runCount, 0);
});

test('admin stats fail closed when the required secret or limiter is unavailable', async () => {
  for (const adminSecret of ['', 'too-short']) {
    const database = createDatabase();
    const response = await worker.fetch(
      createAdminRequest('/admin/stats', 'GET', `Bearer ${TEST_ADMIN_SECRET}`),
      createEnv(database.d1, true, undefined, adminSecret),
    );
    assert.equal(response.status, 503);
    assert.equal(database.queries.length, 0);
  }

  const database = createDatabase();
  const env = createEnv(database.d1);
  Object.defineProperty(env, 'ANALYTICS_ADMIN_RATE_LIMITER', { value: undefined });
  assert.equal(
    (await worker.fetch(createAdminRequest('/admin/stats', 'GET', `Bearer ${TEST_ADMIN_SECRET}`), env)).status,
    503,
  );
  assert.equal(database.queries.length, 0);
});

test('admin stats require a header-safe configured secret and a Cloudflare connecting IP', async () => {
  const invalidConfiguredSecret = `"${'x'.repeat(62)}"`;
  const invalidSecretDatabase = createDatabase();
  const invalidSecretResponse = await worker.fetch(
    createAdminRequest('/admin/stats', 'GET', `Bearer ${invalidConfiguredSecret}`),
    createEnv(invalidSecretDatabase.d1, true, undefined, invalidConfiguredSecret),
  );
  assert.equal(invalidSecretResponse.status, 503);
  assert.equal(invalidSecretDatabase.queries.length, 0);

  const missingIpDatabase = createDatabase();
  const missingIpRequest = new Request('https://analytics.example/admin/stats', {
    headers: { Authorization: `Bearer ${TEST_ADMIN_SECRET}` },
  });
  const missingIpResponse = await worker.fetch(missingIpRequest, createEnv(missingIpDatabase.d1));
  assert.equal(missingIpResponse.status, 503);
  assert.equal(missingIpDatabase.queries.length, 0);
});

test('admin authentication has its own IP-scoped rate-limit path before D1', async () => {
  const database = createDatabase();
  const adminRateLimitKeys: string[] = [];
  const env = createEnv(database.d1, true, undefined, TEST_ADMIN_SECRET, false, adminRateLimitKeys);
  const response = await worker.fetch(
    createAdminRequest('/admin/stats', 'GET', `Bearer ${TEST_ADMIN_SECRET}`, '198.51.100.24'),
    env,
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.deepEqual(adminRateLimitKeys, ['admin:198.51.100.24']);
  assert.equal(adminRateLimitKeys.some((key) => key.includes(TEST_ADMIN_SECRET)), false);
  assert.equal(database.queries.length, 0);
  assert.equal(database.runCount, 0);
});

test('admin page is a public fixed shell that requests the secret without querying D1', async () => {
  const database = createDatabase();
  const response = await worker.fetch(createAdminRequest('/admin'), createEnv(database.d1));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /^text\/html/);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  const contentSecurityPolicy = response.headers.get('Content-Security-Policy') ?? '';
  const nonce = contentSecurityPolicy.match(/script-src 'nonce-([^']+)'/)?.[1];
  assert.ok(nonce);
  assert.match(contentSecurityPolicy, /default-src 'none'/);
  assert.match(contentSecurityPolicy, /connect-src 'self'/);
  assert.match(html, new RegExp(`<script nonce="${nonce}">`));
  assert.match(html, new RegExp(`<style nonce="${nonce}">`));
  assert.match(html, /Lofi-Kawaii Analytics/);
  assert.match(html, /type="password"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /管理用Secret/);
  assert.match(html, /表示/);
  assert.match(html, /最終更新/);
  assert.match(html, /Authorization/);
  assert.match(html, /credentials:\s*'omit'/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie|id_hash|ADMIN_EMAIL|ANALYTICS_HMAC_SECRET|owner@example\.com/);
  assert.equal(database.queries.length, 0);
  assert.equal(database.runCount, 0);
});

test('matching Bearer secret returns aggregate-only zero state without D1 writes', async () => {
  const database = createDatabase();
  const adminRateLimitKeys: string[] = [];
  const response = await worker.fetch(
    createAdminRequest('/admin/stats', 'GET', `bearer ${TEST_ADMIN_SECRET}`),
    createEnv(database.d1, true, undefined, TEST_ADMIN_SECRET, true, adminRateLimitKeys),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.deepEqual(await response.json(), {
    total_unique: 0,
    returning_users: 0,
    returning_rate_percent: 0,
  });
  assert.deepEqual(adminRateLimitKeys, ['admin:203.0.113.7']);
  assert.equal(database.runCount, 0);
  assert.equal(database.queries.length, 1);
  assert.doesNotMatch(database.queries[0], /id_hash|INSERT|UPDATE|DELETE/i);
});

test('matching Bearer secret returns the SQL-calculated rate from one aggregate row only', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);

  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(SECOND_ID), env, new Date('2026-08-31T03:00:00Z'));
  await handleAnalyticsRequest(createRequest(FIRST_ID), env, new Date('2026-09-01T02:00:00Z'));
  const writesBeforeStats = database.runCount;
  database.queries.length = 0;

  const response = await worker.fetch(
    createAdminRequest('/admin/stats', 'GET', `Bearer ${TEST_ADMIN_SECRET}`),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    total_unique: 2,
    returning_users: 1,
    returning_rate_percent: 50,
  });
  assert.equal(database.runCount, writesBeforeStats);
  assert.equal(database.queries.length, 1);
  assert.doesNotMatch(database.queries[0], /id_hash|INSERT|UPDATE|DELETE/i);
});

test('admin routes accept GET only and do not alter the public analytics route contract', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);

  const adminPost = await worker.fetch(createAdminRequest('/admin', 'POST'), env);
  assert.equal(adminPost.status, 405);
  assert.equal(adminPost.headers.get('Allow'), 'GET');
  assert.equal((await worker.fetch(createAdminRequest('/admin-not-a-route'), env)).status, 404);
  assert.equal((await worker.fetch(createAdminRequest('/visit'), env)).status, 404);
  assert.equal((await worker.fetch(createRequest(FIRST_ID, { method: 'GET' }), env)).status, 405);
  assert.equal((await worker.fetch(createRequest(FIRST_ID), env)).status, 204);
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS total FROM anonymous_users').get().total, 1);
});

test('admin D1 failures remain private and reveal no internal error details', async () => {
  const database = createDatabase();
  const env = createEnv({
    prepare() {
      return {
        async first() {
          throw new Error('private database detail');
        },
        bind() {
          return { async run() { return { success: true }; } };
        },
      };
    },
  });

  const response = await worker.fetch(
    createAdminRequest('/admin/stats', 'GET', `Bearer ${TEST_ADMIN_SECRET}`),
    env,
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(await response.text(), '');
  assert.equal(database.runCount, 0);
});
