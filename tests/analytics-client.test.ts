import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYTICS_ENDPOINT,
  ANALYTICS_STORAGE_KEY,
  createAnonymousLaunchRecorder,
  recordAnonymousLaunch,
} from '../src/analytics.ts';

const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';

function createStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem(key: string) {
      assert.equal(key, ANALYTICS_STORAGE_KEY);
      return value;
    },
    setItem(key: string, nextValue: string) {
      assert.equal(key, ANALYTICS_STORAGE_KEY);
      value = nextValue;
    },
    value() {
      return value;
    },
  };
}

test('first launch creates and stores an app-specific anonymous UUID before one POST', () => {
  const storage = createStorage();
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const record = createAnonymousLaunchRecorder({
    storage,
    crypto: { randomUUID: () => FIRST_ID },
    fetch: (input, init) => {
      calls.push({ input: String(input), init });
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  record();

  assert.equal(storage.value(), FIRST_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, ANALYTICS_ENDPOINT);
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.credentials, 'omit');
  assert.equal(calls[0].init?.keepalive, true);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { anonymousId: FIRST_ID });
});

test('later launch reuses an existing valid anonymous UUID', () => {
  const storage = createStorage(FIRST_ID);
  let generated = false;
  let sentId = '';
  const record = createAnonymousLaunchRecorder({
    storage,
    crypto: {
      randomUUID: () => {
        generated = true;
        return SECOND_ID;
      },
    },
    fetch: (_input, init) => {
      sentId = JSON.parse(String(init?.body)).anonymousId;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  record();

  assert.equal(generated, false);
  assert.equal(sentId, FIRST_ID);
  assert.equal(storage.value(), FIRST_ID);
});

test('malformed stored values are replaced with a Web Crypto UUID', () => {
  const storage = createStorage('not-an-anonymous-id');
  let sentId = '';
  const record = createAnonymousLaunchRecorder({
    storage,
    crypto: { randomUUID: () => SECOND_ID },
    fetch: (_input, init) => {
      sentId = JSON.parse(String(init?.body)).anonymousId;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  record();

  assert.equal(storage.value(), SECOND_ID);
  assert.equal(sentId, SECOND_ID);
});

test('one recorder sends at most once even when invoked repeatedly', () => {
  const storage = createStorage(FIRST_ID);
  let requests = 0;
  const record = createAnonymousLaunchRecorder({
    storage,
    crypto: { randomUUID: () => SECOND_ID },
    fetch: () => {
      requests += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  record();
  record();
  record();

  assert.equal(requests, 1);
});

test('storage denial fails open without sending a volatile identifier', () => {
  let requests = 0;
  const record = createAnonymousLaunchRecorder({
    storage: {
      getItem() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
      setItem() {
        throw new Error('unreachable');
      },
    },
    crypto: { randomUUID: () => FIRST_ID },
    fetch: () => {
      requests += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });

  assert.doesNotThrow(record);
  assert.equal(requests, 0);
});

test('4xx, 5xx, network rejection, and a pending request never block or reject the Activity startup', async () => {
  const clientError = createAnonymousLaunchRecorder({
    storage: createStorage(FIRST_ID),
    crypto: { randomUUID: () => SECOND_ID },
    fetch: () => Promise.resolve(new Response(null, { status: 400 })),
  });
  const serverError = createAnonymousLaunchRecorder({
    storage: createStorage(SECOND_ID),
    crypto: { randomUUID: () => FIRST_ID },
    fetch: () => Promise.resolve(new Response(null, { status: 503 })),
  });
  const rejected = createAnonymousLaunchRecorder({
    storage: createStorage(FIRST_ID),
    crypto: { randomUUID: () => SECOND_ID },
    fetch: () => Promise.reject(new TypeError('network unavailable')),
  });
  const pending = createAnonymousLaunchRecorder({
    storage: createStorage(SECOND_ID),
    crypto: { randomUUID: () => FIRST_ID },
    fetch: () => new Promise<Response>(() => {}),
  });

  assert.doesNotThrow(clientError);
  assert.doesNotThrow(serverError);
  assert.doesNotThrow(rejected);
  assert.doesNotThrow(pending);
  await new Promise((resolve) => setImmediate(resolve));
});

test('the default recorder fails open when access to window.localStorage itself is denied', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get localStorage() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
      crypto: { randomUUID: () => FIRST_ID },
      fetch: () => Promise.resolve(new Response(null, { status: 204 })),
    },
  });

  try {
    assert.doesNotThrow(recordAnonymousLaunch);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});
