import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import worker, { getJstDate, handleAnalyticsRequest, purgeExpiredUsers } from '../worker/src/index.ts';

const ORIGIN = 'https://123456789012345678.discordsays.com';
const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../worker/migrations/0001_create_anonymous_users.sql', import.meta.url), 'utf8');
  sqlite.exec(migration);

  return {
    sqlite,
    d1: {
      prepare(sql: string) {
        const statement = sqlite.prepare(sql);
        return {
          bind(...values: unknown[]) {
            return {
              async run() {
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
) {
  return {
    DB: database,
    ANALYTICS_HMAC_SECRET: secret,
    ALLOWED_ORIGIN: ORIGIN,
    ANALYTICS_RATE_LIMITER: {
      async limit() {
        return { success: rateLimitSuccess };
      },
    },
  };
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
