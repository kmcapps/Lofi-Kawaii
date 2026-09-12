import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import worker, { getJstDate, handleAdminRequest, handleAnalyticsRequest, purgeExpiredUsers } from '../worker/src/index.ts';

const ORIGIN = 'https://123456789012345678.discordsays.com';
const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const FOURTH_ID = '44444444-4444-4444-8444-444444444444';
const FIFTH_ID = '55555555-5555-4555-8555-555555555555';
const TEST_ADMIN_SECRET = 'test-only-admin-secret'.padEnd(64, 'x');

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../worker/migrations/0001_create_anonymous_users.sql', import.meta.url), 'utf8');
  sqlite.exec(migration);
  const dailyMigration = readFileSync(new URL('../worker/migrations/0002_create_anonymous_user_daily.sql', import.meta.url), 'utf8');
  sqlite.exec(dailyMigration);

  const queries: string[] = [];
  let runCount = 0;
  let batchCount = 0;
  let batchSuccess = true;

  return {
    sqlite,
    queries,
    get runCount() {
      return runCount;
    },
    get batchCount() {
      return batchCount;
    },
    get batchSuccess() {
      return batchSuccess;
    },
    set batchSuccess(value: boolean) {
      batchSuccess = value;
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
              async all() {
                return { results: statement.all(...values) };
              },
            };
          },
        };
      },
      async batch(statements: Array<{ run(): Promise<{ success: boolean }> }>) {
        batchCount += 1;
        if (!batchSuccess) return statements.map(() => ({ success: false }));
        return Promise.all(statements.map((statement) => statement.run()));
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

function createRequest(
  anonymousId: string,
  overrides: { method?: string; origin?: string; contentType?: string; country?: string; countryHeader?: string } = {},
) {
  const request = new Request('https://analytics.example/analytics/visit', {
    method: overrides.method ?? 'POST',
    headers: {
      Origin: overrides.origin ?? ORIGIN,
      'Content-Type': overrides.contentType ?? 'application/json',
      ...(overrides.countryHeader ? { 'CF-IPCountry': overrides.countryHeader } : {}),
    },
    body: overrides.method === 'GET' ? undefined : JSON.stringify({ anonymousId }),
  });
  if (overrides.country !== undefined) Object.defineProperty(request, 'cf', { value: { country: overrides.country } });
  return request;
}

test('daily migration creates the privacy-minimal deduplicated table, country index, and aggregate-only usage counter', () => {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../worker/migrations/0002_create_anonymous_user_daily.sql', import.meta.url), 'utf8');
  sqlite.exec(migration);

  const table = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'anonymous_user_daily'").get();
  assert.match(String(table.sql), /PRIMARY KEY\s*\(usage_date,\s*id_hash\)/i);
  assert.match(String(table.sql), /WITHOUT ROWID/i);
  assert.match(String(table.sql), /country_code TEXT NOT NULL DEFAULT 'ZZ'/i);
  const indexes = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'anonymous_user_daily'").all();
  assert.deepEqual(indexes.map((row) => row.name), ['anonymous_user_daily_country_date_idx']);

  const totalTable = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'anonymous_daily_usage'").get();
  assert.match(String(totalTable.sql), /usage_date TEXT NOT NULL PRIMARY KEY/i);
  assert.match(String(totalTable.sql), /total_visits INTEGER NOT NULL DEFAULT 0/i);
  assert.doesNotMatch(String(totalTable.sql), /id_hash|country_code|timestamp|user_agent|ip/i);
});

test('same anonymous user and JST day is one daily user and keeps the first country', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);
  const now = new Date('2026-08-31T02:00:00Z');

  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, now)).status, 204);
  assert.equal((await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'US' }), env, now)).status, 204);

  const rows = database.sqlite.prepare('SELECT usage_date, country_code FROM anonymous_user_daily').all();
  assert.deepEqual(rows.map((row) => ({ usage_date: row.usage_date, country_code: row.country_code })), [{ usage_date: '2026-08-31', country_code: 'JP' }]);
});

test('daily unique counts include one row per anonymous user on each JST day', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);

  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, new Date('2026-09-01T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(SECOND_ID, { country: 'SG' }), env, new Date('2026-08-31T03:00:00Z'));

  const rows = database.sqlite
    .prepare('SELECT usage_date, COUNT(*) AS unique_users FROM anonymous_user_daily GROUP BY usage_date ORDER BY usage_date')
    .all();
  assert.deepEqual(rows.map((row) => ({ usage_date: row.usage_date, unique_users: row.unique_users })), [
    { usage_date: '2026-08-31', unique_users: 2 },
    { usage_date: '2026-09-01', unique_users: 1 },
  ]);
});

test('daily total counts every accepted visit without adding individual visit history', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);
  const dayOne = new Date('2026-08-31T02:00:00Z');
  const dayTwo = new Date('2026-09-01T02:00:00Z');

  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, dayOne);
  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, dayOne);
  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, dayOne);
  await handleAnalyticsRequest(createRequest(SECOND_ID, { country: 'US' }), env, dayOne);
  await handleAnalyticsRequest(createRequest(SECOND_ID, { country: 'US' }), env, dayOne);
  await handleAnalyticsRequest(createRequest(THIRD_ID, { country: 'SG' }), env, dayOne);
  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, dayTwo);

  const totals = database.sqlite.prepare('SELECT usage_date, total_visits FROM anonymous_daily_usage ORDER BY usage_date').all();
  assert.deepEqual(totals.map((row) => ({ usage_date: row.usage_date, total_visits: row.total_visits })), [
    { usage_date: '2026-08-31', total_visits: 6 },
    { usage_date: '2026-09-01', total_visits: 1 },
  ]);
  const unique = database.sqlite.prepare('SELECT usage_date, COUNT(*) AS unique_users FROM anonymous_user_daily GROUP BY usage_date ORDER BY usage_date').all();
  assert.deepEqual(unique.map((row) => ({ usage_date: row.usage_date, unique_users: row.unique_users })), [
    { usage_date: '2026-08-31', unique_users: 3 },
    { usage_date: '2026-09-01', unique_users: 1 },
  ]);
});

test('country header is ignored and missing or invalid Cloudflare country becomes Unknown', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);

  await handleAnalyticsRequest(createRequest(FIRST_ID, { countryHeader: 'US' }), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(SECOND_ID, { country: 'usa' }), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(THIRD_ID, { country: 'XX' }), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(FOURTH_ID, { country: 'T1' }), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(FIFTH_ID, { country: 'jp' }), env, new Date('2026-08-31T02:00:00Z'));

  const rows = database.sqlite.prepare('SELECT country_code FROM anonymous_user_daily ORDER BY id_hash').all();
  assert.deepEqual(rows.map((row) => row.country_code), ['ZZ', 'ZZ', 'ZZ', 'ZZ', 'ZZ']);
});

test('admin stats return the last 30 JST days with zeros and distinct country users', async () => {
  const database = createDatabase();
  const env = createEnv(database.d1);
  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, new Date('2026-08-31T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(SECOND_ID, { country: 'SG' }), env, new Date('2026-08-31T03:00:00Z'));
  await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'US' }), env, new Date('2026-09-01T02:00:00Z'));
  await handleAnalyticsRequest(createRequest(SECOND_ID, { country: 'SG' }), env, new Date('2026-09-01T03:00:00Z'));

  const response = await handleAdminRequest(
    createAdminRequest('/admin/stats', 'GET', `Bearer ${TEST_ADMIN_SECRET}`),
    env,
    new Date('2026-09-12T02:00:00Z'),
  );
  assert.equal(response.status, 200);
  const stats = await response.json();
  assert.equal(stats.daily_unique.length, 30);
  assert.deepEqual(stats.daily_unique[0], { date: '2026-08-14', unique_users: 0 });
  assert.deepEqual(stats.daily_unique.at(-1), { date: '2026-09-12', unique_users: 0 });
  assert.deepEqual(stats.daily_unique.find((item) => item.date === '2026-08-31'), { date: '2026-08-31', unique_users: 2 });
  assert.deepEqual(stats.daily_unique.find((item) => item.date === '2026-09-01'), { date: '2026-09-01', unique_users: 2 });
  assert.equal(stats.daily_total.length, 30);
  assert.deepEqual(stats.daily_total[0], { date: '2026-08-14', total_visits: 0 });
  assert.deepEqual(stats.daily_total.find((item) => item.date === '2026-08-31'), { date: '2026-08-31', total_visits: 2 });
  assert.deepEqual(stats.daily_total.find((item) => item.date === '2026-09-01'), { date: '2026-09-01', total_visits: 2 });
  assert.equal(stats.measurement_started_on, '2026-09-01');
  assert.deepEqual(stats.country_unique, [
    { country_code: 'JP', unique_users: 1 },
    { country_code: 'SG', unique_users: 1 },
    { country_code: 'US', unique_users: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(stats), /id_hash|anonymousId/i);
});

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
  const dailyRows = database.sqlite.prepare('SELECT usage_date FROM anonymous_user_daily ORDER BY usage_date').all();
  assert.deepEqual(dailyRows.map((row) => row.usage_date), ['2025-08-31', '2026-08-31']);
  const totalRows = database.sqlite.prepare('SELECT usage_date FROM anonymous_daily_usage ORDER BY usage_date').all();
  assert.deepEqual(totalRows.map((row) => row.usage_date), ['2025-08-31', '2026-08-31']);
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
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS total FROM anonymous_user_daily').get().total, 0);
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS total FROM anonymous_daily_usage').get().total, 0);
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
  assert.match(html, /id="daily-chart"/);
  assert.match(html, /今日のユニーク利用/);
  assert.match(html, /今日の総利用回数/);
  assert.match(html, /daily_total/);
  assert.match(html, /計測開始日/);
  assert.match(html, /measurement_started_on/);
  assert.match(html, /id="country-chart"/);
  assert.match(html, /Unknown/);
  assert.match(html, /svg \{[^}]*height: auto;/);
  assert.match(html, /const chartHeight = Math\.max\(220, 36 \+ countries\.length \* 30\)/);
  assert.match(html, /countryChart\.setAttribute\('viewBox', '0 0 600 ' \+ chartHeight\)/);
  assert.match(html, /countryChart\.setAttribute\('height', String\(chartHeight\)\)/);
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
  const zeroStats = await response.json();
  assert.deepEqual(
    { total_unique: zeroStats.total_unique, returning_users: zeroStats.returning_users, returning_rate_percent: zeroStats.returning_rate_percent },
    { total_unique: 0, returning_users: 0, returning_rate_percent: 0 },
  );
  assert.equal(zeroStats.daily_unique.length, 30);
  assert.equal(zeroStats.daily_total.length, 30);
  assert.equal(zeroStats.daily_total.at(-1).total_visits, 0);
  assert.equal(zeroStats.measurement_started_on, '2026-09-01');
  assert.deepEqual(zeroStats.country_unique, []);
  assert.deepEqual(adminRateLimitKeys, ['admin:203.0.113.7']);
  assert.equal(database.runCount, 0);
  assert.equal(database.queries.length, 4);
  assert.equal(database.queries.some((query) => /INSERT|UPDATE|DELETE/i.test(query)), false);
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
  const stats = await response.json();
  assert.deepEqual(
    { total_unique: stats.total_unique, returning_users: stats.returning_users, returning_rate_percent: stats.returning_rate_percent },
    { total_unique: 2, returning_users: 1, returning_rate_percent: 50 },
  );
  assert.equal(stats.daily_unique.length, 30);
  assert.equal(stats.daily_total.length, 30);
  assert.equal(stats.measurement_started_on, '2026-09-01');
  assert.deepEqual(stats.country_unique, [{ country_code: 'ZZ', unique_users: 2 }]);
  assert.equal(database.runCount, writesBeforeStats);
  assert.equal(database.queries.length, 4);
  assert.equal(database.queries.some((query) => /INSERT|UPDATE|DELETE/i.test(query)), false);
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

test('analytics visit returns a safe failure and writes nothing when D1 batch fails', async () => {
  const database = createDatabase();
  database.batchSuccess = false;
  const env = createEnv(database.d1);

  const response = await handleAnalyticsRequest(createRequest(FIRST_ID, { country: 'JP' }), env, new Date('2026-08-31T02:00:00Z'));

  assert.equal(response.status, 503);
  assert.equal(database.batchCount, 1);
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS total FROM anonymous_users').get().total, 0);
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS total FROM anonymous_user_daily').get().total, 0);
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
