export const BACKGROUND_STORAGE_KEY = 'lofi-kawaii.background-id.v1';
export const DEFAULT_BACKGROUND_ID = 'background-0';

export const BACKGROUND_DEFINITIONS = [
  {
    id: DEFAULT_BACKGROUND_ID,
    label: 'Moonlit Room',
    fileName: 'images/03_lofi-background.png',
    tone: 'night',
    allowsAmbientEffects: true,
  },
  {
    id: 'background-1',
    label: 'Sunset Room',
    fileName: 'images/backgrounds/01_lofi-background-01.png',
    tone: 'night',
    allowsAmbientEffects: true,
  },
  {
    id: 'background-2',
    label: 'Starry Lake',
    fileName: 'images/backgrounds/02_lofi-background-10.png',
    tone: 'night',
    allowsAmbientEffects: true,
  },
  {
    id: 'background-3',
    label: 'Sunny Lake',
    fileName: 'images/backgrounds/lofi-background-02.png',
    tone: 'day',
    allowsAmbientEffects: false,
  },
  {
    id: 'background-4',
    label: 'Lighthouse Coast',
    fileName: 'images/backgrounds/lofi-background-07.png',
    tone: 'day',
    allowsAmbientEffects: false,
  },
  {
    id: 'background-5',
    label: 'Cherry Blossom Lake',
    fileName: 'images/backgrounds/lofi-background-09.png',
    tone: 'day',
    allowsAmbientEffects: false,
  },
] as const;

export type BackgroundId = (typeof BACKGROUND_DEFINITIONS)[number]['id'];
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function createBackgrounds(baseUrl: string, documentUrl: string) {
  const resolvedBaseUrl = new URL(baseUrl, documentUrl).href;
  return BACKGROUND_DEFINITIONS.map((background) => ({
    ...background,
    source: `${resolvedBaseUrl}${background.fileName}`,
  }));
}

function normalizeBackgroundId(backgroundId: string | null): BackgroundId {
  return BACKGROUND_DEFINITIONS.some(({ id }) => id === backgroundId)
    ? backgroundId as BackgroundId
    : DEFAULT_BACKGROUND_ID;
}

export function loadBackgroundId(storage: StorageLike): BackgroundId {
  try {
    return normalizeBackgroundId(storage.getItem(BACKGROUND_STORAGE_KEY));
  } catch {
    return DEFAULT_BACKGROUND_ID;
  }
}

export function saveBackgroundId(storage: StorageLike, backgroundId: string): BackgroundId {
  const normalized = normalizeBackgroundId(backgroundId);
  try {
    storage.setItem(BACKGROUND_STORAGE_KEY, normalized);
  } catch {
    // The current session remains usable when persistent storage is unavailable.
  }
  return normalized;
}
