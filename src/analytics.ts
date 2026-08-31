export const ANALYTICS_STORAGE_KEY = 'lofi-kawaii:anonymous-usage-id';
export const ANALYTICS_ENDPOINT = '/analytics/visit';

const ANONYMOUS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type CryptoLike = Pick<Crypto, 'randomUUID'>;
type FetchLike = typeof fetch;

type LaunchRecorderDependencies = {
  storage: StorageLike;
  crypto: CryptoLike;
  fetch: FetchLike;
  endpoint?: string;
};

export function createAnonymousLaunchRecorder({
  storage,
  crypto,
  fetch: fetchRequest,
  endpoint = ANALYTICS_ENDPOINT,
}: LaunchRecorderDependencies) {
  let hasRecordedLaunch = false;

  return function recordAnonymousLaunchOnce() {
    if (hasRecordedLaunch) return;
    hasRecordedLaunch = true;

    let anonymousId: string;
    try {
      const storedId = storage.getItem(ANALYTICS_STORAGE_KEY);
      anonymousId = storedId && ANONYMOUS_ID_PATTERN.test(storedId) ? storedId : crypto.randomUUID();
      if (anonymousId !== storedId) storage.setItem(ANALYTICS_STORAGE_KEY, anonymousId);
    } catch {
      return;
    }

    try {
      void fetchRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonymousId }),
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
      }).catch(() => {});
    } catch {}
  };
}

let defaultRecorder: (() => void) | undefined;

export function recordAnonymousLaunch() {
  try {
    defaultRecorder ??= createAnonymousLaunchRecorder({
      storage: window.localStorage,
      crypto: window.crypto,
      fetch: window.fetch.bind(window),
    });
    defaultRecorder();
  } catch {}
}
