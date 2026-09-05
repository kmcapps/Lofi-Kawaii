import type { PlaylistMode } from './playlist-mode';

export const SEEK_THEME_BY_MODE: Record<PlaylistMode, PlaylistMode> = {
  all: 'all',
  chill: 'chill',
  fantasy: 'fantasy',
  japanese: 'japanese',
};

export function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function clampSeekTime(requestedTime: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(requestedTime)) return 0;
  return Math.min(Math.max(requestedTime, 0), duration);
}

export function seekProgress(currentTime: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return 0;
  return Math.min(Math.max((currentTime / duration) * 100, 0), 100);
}
