export const FAVORITES_STORAGE_KEY = 'lofi-kawaii.favorite-track-ids.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function normalizeFavoriteTrackIds(
  favoriteTrackIds: readonly unknown[],
  catalogTrackIds: readonly string[],
): string[] {
  const favorites = new Set(
    favoriteTrackIds.filter((trackId): trackId is string => typeof trackId === 'string'),
  );

  return catalogTrackIds.filter((trackId) => favorites.has(trackId));
}

export function loadFavoriteTrackIds(
  storage: StorageLike,
  catalogTrackIds: readonly string[],
): string[] {
  try {
    const storedValue = storage.getItem(FAVORITES_STORAGE_KEY);
    if (storedValue === null) return [];

    const parsed: unknown = JSON.parse(storedValue);
    return Array.isArray(parsed) ? normalizeFavoriteTrackIds(parsed, catalogTrackIds) : [];
  } catch {
    return [];
  }
}

export function saveFavoriteTrackIds(
  storage: StorageLike,
  favoriteTrackIds: readonly unknown[],
  catalogTrackIds: readonly string[],
): string[] {
  const normalized = normalizeFavoriteTrackIds(favoriteTrackIds, catalogTrackIds);

  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Favorites remain usable in memory when persistent storage is unavailable.
  }

  return normalized;
}

export function toggleFavoriteTrackId(
  favoriteTrackIds: readonly string[],
  trackId: string,
  catalogTrackIds: readonly string[],
): string[] {
  const normalized = normalizeFavoriteTrackIds(favoriteTrackIds, catalogTrackIds);
  if (!catalogTrackIds.includes(trackId)) return normalized;

  const nextFavorites = normalized.includes(trackId)
    ? normalized.filter((favoriteTrackId) => favoriteTrackId !== trackId)
    : [...normalized, trackId];

  return normalizeFavoriteTrackIds(nextFavorites, catalogTrackIds);
}
