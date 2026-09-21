import './style.css';
import { recordAnonymousLaunch } from './analytics';
import {
  firstTrackIndex,
  moveWithinPlaylist,
  type PlaylistMode,
} from './playlist-mode';
import {
  clampSeekTime,
  formatPlaybackTime,
  seekProgress,
  SEEK_THEME_BY_MODE,
} from './seek';
import {
  loadFavoriteTrackIds,
  saveFavoriteTrackIds,
  toggleFavoriteTrackId,
} from './favorites';
import { createTracks } from './tracks';
import {
  createBackgrounds,
  loadBackgroundId,
  saveBackgroundId,
  type BackgroundId,
} from './backgrounds';

const audioBaseUrl = `${import.meta.env.BASE_URL}audio/`;
const tracks = createTracks(audioBaseUrl);
const backgrounds = createBackgrounds(import.meta.env.BASE_URL, window.location.href);
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root was not found.');

app.innerHTML = `
  <section class="player" aria-label="Lofi music player">
    <button id="background-open" class="background-launcher" type="button" aria-haspopup="dialog" aria-label="背景を選択" title="BACKGROUND">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3.5" y="4" width="17" height="16" rx="3"></rect>
        <path d="m6.5 16 4-4 2.75 2.75 2-2L18 16"></path>
        <circle cx="9" cy="8.5" r="1.2"></circle>
      </svg>
      <span>BACKGROUND</span>
    </button>
    <div class="steam-layer" aria-hidden="true">
      <span class="steam-wisp"></span>
    </div>
    <div class="glow glow-one"></div><div class="glow glow-two"></div>
    <div id="player-panel" class="player-panel">
      <div class="track-heading">
        <h1 id="track-title" class="drag-handle" title="ドラッグしてプレイヤーを移動"></h1>
        <button id="current-favorite-toggle" class="current-favorite-toggle" type="button" aria-label="現在の曲をお気に入りに追加" aria-pressed="false" title="お気に入りに追加">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path class="current-favorite-heart" d="M12 20.25 4.7 13.4C1.05 10 3.15 4.25 7.65 4.25c1.75 0 3.35.95 4.35 2.35 1-1.4 2.6-2.35 4.35-2.35 4.5 0 6.6 5.75 2.95 9.15L12 20.25Z"></path>
            <path class="current-favorite-plus" d="M18.25 8.5v5.5M15.5 11.25H21"></path>
          </svg>
        </button>
        <p id="favorite-feedback" class="favorite-feedback" role="status" aria-live="polite" hidden></p>
      </div>
      <div class="playlist-modes" role="group" aria-label="プレイリスト">
        <button class="playlist-mode is-active" type="button" data-playlist-mode="all" aria-pressed="true">ALL</button>
        <button class="playlist-mode" type="button" data-playlist-mode="chill" aria-pressed="false">CHILL</button>
        <button class="playlist-mode" type="button" data-playlist-mode="fantasy" aria-pressed="false">FANTASY</button>
        <button class="playlist-mode" type="button" data-playlist-mode="japanese" aria-pressed="false">JAPANESE</button>
      </div>
      <div class="library-actions">
        <button id="track-list-open" class="playlist-mode library-action" type="button" aria-haspopup="dialog">TRACK LIST</button>
        <button id="favorites-mode" class="playlist-mode library-action" type="button" data-playlist-mode="favorites" aria-pressed="false" disabled>♡ FAVORITES <span id="favorite-count">0</span></button>
      </div>
      <div class="controls">
        <button id="previous-button" class="previous" type="button" aria-label="前の曲"><span aria-hidden="true">⏮</span></button>
        <button id="play-button" class="play" type="button" aria-label="再生">▶</button>
        <button id="next-button" class="next" type="button" aria-label="次の曲"><span aria-hidden="true">⏭</span></button>
        <button id="ambient-effects-toggle" class="ambient-effects-toggle" type="button" aria-label="環境エフェクトをオンにする" aria-pressed="false" title="環境エフェクト: OFF">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="7.25" cy="7.75" r="2" fill="currentColor" stroke="none"></circle>
            <circle cx="10.5" cy="5.25" r="2" fill="currentColor" stroke="none"></circle>
            <circle cx="14.5" cy="5.25" r="2" fill="currentColor" stroke="none"></circle>
            <circle cx="17.75" cy="7.75" r="2" fill="currentColor" stroke="none"></circle>
            <path d="M12.5 9.5c-3.8 0-6.75 3.15-6.75 6.25 0 2.4 1.75 3.75 3.95 3.75 1.1 0 1.9-.55 2.8-.55s1.7.55 2.8.55c2.2 0 3.95-1.35 3.95-3.75 0-3.1-2.95-6.25-6.75-6.25Z" fill="currentColor" stroke="none"></path>
          </svg>
        </button>
      </div>
      <div id="seek-control" class="seek-control" data-theme="all">
        <div class="seek-times" aria-hidden="true">
          <span id="current-time">0:00</span>
          <span id="duration-time">0:00</span>
        </div>
        <input id="seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="再生位置" aria-valuetext="0:00 / 0:00" disabled />
      </div>
      <label class="volume" for="volume">
        <svg class="volume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 9v6h4l5 4V5L8 9H4Z"></path>
          <path d="M16 9.5a4 4 0 0 1 0 5"></path>
          <path d="M18.5 7a7 7 0 0 1 0 10"></path>
        </svg>
        <input id="volume" type="range" min="0" max="100" value="20" aria-label="音量" />
      </label>
      <span id="resize-handle" class="resize-handle" role="slider" tabindex="0" aria-label="プレイヤーのサイズを変更" aria-valuemin="50" aria-valuemax="150" aria-valuenow="70"></span>
    </div>
    <dialog id="track-list-dialog" class="track-list-dialog" aria-labelledby="track-list-heading" aria-live="off">
      <div class="track-list-card">
        <header class="track-list-header">
          <div>
            <h2 id="track-list-heading">45 TRACKS</h2>
            <p>Select a track · ♡ Favorite</p>
          </div>
          <button id="track-list-close" class="track-list-close" type="button" aria-label="曲一覧を閉じる">×</button>
        </header>
        <p id="favorites-empty" class="favorites-empty">No favorite tracks yet</p>
        <div id="track-list" class="track-list" role="list"></div>
      </div>
    </dialog>
    <dialog id="background-dialog" class="background-dialog" aria-labelledby="background-heading">
      <div class="background-card">
        <header class="background-header">
          <h2 id="background-heading">BACKGROUND</h2>
          <button id="background-close" class="track-list-close" type="button" aria-label="背景選択を閉じる">×</button>
        </header>
        <div id="background-list" class="background-list" role="group" aria-label="背景候補"></div>
      </div>
    </dialog>
  </section>
`;

const playerPanel = requiredElement<HTMLDivElement>('#player-panel');
const title = requiredElement<HTMLHeadingElement>('#track-title');
const currentFavoriteToggle = requiredElement<HTMLButtonElement>('#current-favorite-toggle');
const favoriteFeedback = requiredElement<HTMLParagraphElement>('#favorite-feedback');
const resizeHandle = requiredElement<HTMLSpanElement>('#resize-handle');
const playlistModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-playlist-mode]'));
const previousButton = requiredElement<HTMLButtonElement>('#previous-button');
const playButton = requiredElement<HTMLButtonElement>('#play-button');
const nextButton = requiredElement<HTMLButtonElement>('#next-button');
const ambientEffectsToggle = requiredElement<HTMLButtonElement>('#ambient-effects-toggle');
const seekControl = requiredElement<HTMLDivElement>('#seek-control');
const seek = requiredElement<HTMLInputElement>('#seek');
const currentTime = requiredElement<HTMLSpanElement>('#current-time');
const durationTime = requiredElement<HTMLSpanElement>('#duration-time');
const volume = requiredElement<HTMLInputElement>('#volume');
const trackListOpen = requiredElement<HTMLButtonElement>('#track-list-open');
const trackListClose = requiredElement<HTMLButtonElement>('#track-list-close');
const trackListDialog = requiredElement<HTMLDialogElement>('#track-list-dialog');
const trackList = requiredElement<HTMLDivElement>('#track-list');
const favoritesModeButton = requiredElement<HTMLButtonElement>('#favorites-mode');
const favoriteCount = requiredElement<HTMLSpanElement>('#favorite-count');
const favoritesEmpty = requiredElement<HTMLParagraphElement>('#favorites-empty');
const backgroundOpen = requiredElement<HTMLButtonElement>('#background-open');
const backgroundClose = requiredElement<HTMLButtonElement>('#background-close');
const backgroundDialog = requiredElement<HTMLDialogElement>('#background-dialog');
const backgroundList = requiredElement<HTMLDivElement>('#background-list');

let currentTrackIndex = 0;
let activePlaylistMode: PlaylistMode = 'all';
const audio = new Audio();
audio.autoplay = false;
audio.volume = Number(volume.value) / 100;
const catalogTrackIds = tracks.map(({ id }) => id);
const favoritesStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
  }
})();
let favoriteTrackIds = loadFavoriteTrackIds(favoritesStorage, catalogTrackIds);
let activeBackgroundId = loadBackgroundId(favoritesStorage);
let favoriteFeedbackTimer: number | undefined;
let favoriteButtonBounceTimer: number | undefined;
let favoriteModePulseTimer: number | undefined;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function favoriteTrackIndices() {
  return favoriteTrackIds.map((trackId) => tracks.findIndex((track) => track.id === trackId));
}

function setActivePlaylistMode(mode: PlaylistMode) {
  activePlaylistMode = mode;
  for (const modeButton of playlistModeButtons) {
    const isActive = modeButton.dataset.playlistMode === mode;
    modeButton.classList.toggle('is-active', isActive);
    modeButton.setAttribute('aria-pressed', String(isActive));
  }
  seekControl.dataset.theme = SEEK_THEME_BY_MODE[mode];
}

function updateTrackListState() {
  favoriteCount.textContent = String(favoriteTrackIds.length);
  favoritesEmpty.hidden = favoriteTrackIds.length !== 0;
  favoritesModeButton.disabled = favoriteTrackIds.length === 0;
  const currentTrack = tracks[currentTrackIndex];
  const isCurrentFavorite = favoriteTrackIds.includes(currentTrack.id);
  currentFavoriteToggle.classList.toggle('is-favorite', isCurrentFavorite);
  currentFavoriteToggle.setAttribute('aria-pressed', String(isCurrentFavorite));
  currentFavoriteToggle.setAttribute('aria-label', `${currentTrack.title}をお気に入り${isCurrentFavorite ? 'から解除' : 'に追加'}`);
  currentFavoriteToggle.title = isCurrentFavorite ? 'お気に入りから解除' : 'お気に入りに追加';

  for (const row of trackList.querySelectorAll<HTMLElement>('[data-track-id]')) {
    const trackId = row.dataset.trackId ?? '';
    const isCurrent = tracks[currentTrackIndex].id === trackId;
    const isFavorite = favoriteTrackIds.includes(trackId);
    row.classList.toggle('is-current', isCurrent);
    const selectButton = row.querySelector<HTMLButtonElement>('.track-select');
    const favoriteButton = row.querySelector<HTMLButtonElement>('.favorite-toggle');
    if (selectButton) {
      if (isCurrent) selectButton.setAttribute('aria-current', 'true');
      else selectButton.removeAttribute('aria-current');
    }
    if (favoriteButton) {
      favoriteButton.textContent = isFavorite ? '♥' : '♡';
      favoriteButton.classList.toggle('is-favorite', isFavorite);
      favoriteButton.setAttribute('aria-pressed', String(isFavorite));
      favoriteButton.setAttribute('aria-label', `${row.dataset.trackTitle}をお気に入り${isFavorite ? 'から解除' : 'に追加'}`);
    }
  }
}

function renderTrackList() {
  const fragment = document.createDocumentFragment();
  tracks.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.trackId = track.id;
    row.dataset.trackTitle = track.title;
    row.setAttribute('role', 'listitem');

    const selectButton = document.createElement('button');
    selectButton.className = 'track-select';
    selectButton.type = 'button';
    selectButton.textContent = `${String(index + 1).padStart(2, '0')}  ${track.title}`;
    selectButton.addEventListener('click', () => {
      const wasPlaying = !audio.paused;
      setActivePlaylistMode('all');
      updateTrack(index);
      if (wasPlaying) void playCurrentTrack();
      trackListDialog.close();
    });

    const favoriteButton = document.createElement('button');
    favoriteButton.className = 'favorite-toggle';
    favoriteButton.type = 'button';
    favoriteButton.addEventListener('click', () => {
      favoriteTrackIds = toggleFavoriteTrackId(favoriteTrackIds, track.id, catalogTrackIds);
      favoriteTrackIds = saveFavoriteTrackIds(favoritesStorage, favoriteTrackIds, catalogTrackIds);
      if (favoriteTrackIds.length === 0 && activePlaylistMode === 'favorites') {
        setActivePlaylistMode('all');
      }
      updateTrackListState();
    });

    row.append(selectButton, favoriteButton);
    fragment.append(row);
  });
  trackList.replaceChildren(fragment);
  updateTrackListState();
}

function setBackground(backgroundId: BackgroundId, persist = true) {
  const background = backgrounds.find(({ id }) => id === backgroundId) ?? backgrounds[0];
  activeBackgroundId = persist
    ? saveBackgroundId(favoritesStorage, background.id)
    : background.id;
  document.documentElement.style.setProperty('--background-image', `url("${background.source}")`);
  document.documentElement.dataset.backgroundTone = background.tone;
  document.documentElement.dataset.backgroundEffects = background.allowsAmbientEffects ? 'on' : 'off';

  for (const button of backgroundList.querySelectorAll<HTMLButtonElement>('[data-background-id]')) {
    const isSelected = button.dataset.backgroundId === activeBackgroundId;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  }
}

function renderBackgroundList() {
  const fragment = document.createDocumentFragment();
  for (const background of backgrounds) {
    const button = document.createElement('button');
    button.className = 'background-option';
    button.type = 'button';
    button.dataset.backgroundId = background.id;
    button.setAttribute('aria-label', `${background.label}を背景に設定`);
    button.innerHTML = `<img src="${background.source}" alt="" /><span>${background.label}</span><span class="background-check" aria-hidden="true">✓</span>`;
    button.addEventListener('click', () => setBackground(background.id));
    fragment.append(button);
  }
  backgroundList.replaceChildren(fragment);
  setBackground(activeBackgroundId, false);
}

trackListOpen.addEventListener('click', () => {
  if (!trackListDialog.open) trackListDialog.showModal();
});
trackListClose.addEventListener('click', () => trackListDialog.close());
trackListDialog.addEventListener('click', (event) => {
  if (event.target === trackListDialog) trackListDialog.close();
});
backgroundOpen.addEventListener('click', () => {
  if (!backgroundDialog.open) backgroundDialog.showModal();
});
backgroundClose.addEventListener('click', () => backgroundDialog.close());
backgroundDialog.addEventListener('click', (event) => {
  if (event.target === backgroundDialog) backgroundDialog.close();
});

const reducedMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let ambientEffectsEnabled = !reducedMotionPreference.matches;

function setAmbientEffectsEnabled(enabled: boolean) {
  ambientEffectsEnabled = enabled;
  document.documentElement.dataset.ambientEffects = enabled ? 'on' : 'off';
  ambientEffectsToggle.classList.toggle('is-active', enabled);
  ambientEffectsToggle.setAttribute('aria-pressed', String(enabled));
  ambientEffectsToggle.setAttribute('aria-label', enabled ? '環境エフェクトをオフにする' : '環境エフェクトをオンにする');
  ambientEffectsToggle.title = `環境エフェクト: ${enabled ? 'ON' : 'OFF'}`;
}

ambientEffectsToggle.addEventListener('click', () => setAmbientEffectsEnabled(!ambientEffectsEnabled));
setAmbientEffectsEnabled(ambientEffectsEnabled);

const MIN_PANEL_SCALE = 0.5;
const MAX_PANEL_SCALE = 1.5;
const VIEWPORT_MARGIN = 12;

let panelCenterX = window.innerWidth / 2;
let panelCenterY = window.innerHeight / 2;
let panelScale = 0.8;
let hasUserMovedPanel = false;
let dragState: { pointerId: number; startX: number; startY: number; panelX: number; panelY: number } | null = null;
let resizeState: { pointerId: number; startX: number; startY: number; scale: number; reference: number; left: number; top: number } | null = null;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function setScaledLength(name: string, base: number, unit = 'px') {
  playerPanel.style.setProperty(name, `${(base * panelScale).toFixed(2)}${unit}`);
}

function applyPanelScale() {
  setScaledLength('--panel-gap', 9);
  setScaledLength('--panel-compact-gap', 7);
  setScaledLength('--panel-title-min', 1.35, 'rem');
  setScaledLength('--panel-title-fluid', 3.8, 'vw');
  setScaledLength('--panel-title-max', 1.95, 'rem');
  setScaledLength('--panel-title-width', 380);
  setScaledLength('--panel-mode-gap', 5);
  setScaledLength('--panel-mode-font', 0.66, 'rem');
  setScaledLength('--panel-mode-padding-block', 5);
  setScaledLength('--panel-mode-padding-inline', 8);
  setScaledLength('--panel-seek-width', 320);
  setScaledLength('--panel-seek-font', 0.64, 'rem');
  setScaledLength('--panel-seek-track-height', 7);
  setScaledLength('--panel-seek-thumb-size', 18);
  setScaledLength('--panel-controls-gap', 10);
  setScaledLength('--panel-play-size', 48);
  setScaledLength('--panel-play-font', 1, 'rem');
  setScaledLength('--panel-skip-size', 40);
  setScaledLength('--panel-skip-font', 0.95, 'rem');
  setScaledLength('--panel-volume-width', 260);
  setScaledLength('--panel-volume-font', 0.72, 'rem');
  setScaledLength('--panel-volume-gap', 12);
  setScaledLength('--panel-track-height', 4);
  setScaledLength('--panel-thumb-size', 12);
  setScaledLength('--panel-volume-icon-size', 14);
  setScaledLength('--panel-hint-width', 380);
  setScaledLength('--panel-hint-font', 0.68, 'rem');
  resizeHandle.setAttribute('aria-valuenow', String(Math.round(panelScale * 100)));
}

function clampPanelToViewport() {
  playerPanel.style.left = `${panelCenterX}px`;
  playerPanel.style.top = `${panelCenterY}px`;

  const panelRect = playerPanel.getBoundingClientRect();
  const handleRect = resizeHandle.getBoundingClientRect();
  const rect = {
    left: Math.min(panelRect.left, handleRect.left),
    right: Math.max(panelRect.right, handleRect.right),
    top: Math.min(panelRect.top, handleRect.top),
    bottom: Math.max(panelRect.bottom, handleRect.bottom),
  };
  if (rect.left < VIEWPORT_MARGIN) panelCenterX += VIEWPORT_MARGIN - rect.left;
  if (rect.right > window.innerWidth - VIEWPORT_MARGIN) panelCenterX -= rect.right - (window.innerWidth - VIEWPORT_MARGIN);
  if (rect.top < VIEWPORT_MARGIN) panelCenterY += VIEWPORT_MARGIN - rect.top;
  if (rect.bottom > window.innerHeight - VIEWPORT_MARGIN) panelCenterY -= rect.bottom - (window.innerHeight - VIEWPORT_MARGIN);

  playerPanel.style.left = `${panelCenterX}px`;
  playerPanel.style.top = `${panelCenterY}px`;
}

function positionPanelAtDefault() {
  panelCenterX = window.innerWidth / 2;
  panelCenterY = window.innerHeight / 2;
  clampPanelToViewport();
}

function showFavoriteFeedback(message: string, shouldBounce: boolean) {
  window.clearTimeout(favoriteFeedbackTimer);
  window.clearTimeout(favoriteButtonBounceTimer);
  window.clearTimeout(favoriteModePulseTimer);
  favoritesModeButton.style.removeProperty('transform');
  favoritesModeButton.style.removeProperty('transition');

  favoriteFeedback.textContent = message;
  favoriteFeedback.hidden = false;
  favoriteFeedback.classList.remove('is-visible');
  void favoriteFeedback.offsetWidth;
  favoriteFeedback.classList.add('is-visible');

  currentFavoriteToggle.classList.remove('is-bouncing');
  favoritesModeButton.classList.remove('is-bouncing');
  if (shouldBounce) {
    void currentFavoriteToggle.offsetWidth;
    currentFavoriteToggle.classList.add('is-bouncing');
    favoritesModeButton.classList.add('is-bouncing');
    favoritesModeButton.style.transition = 'none';
    favoritesModeButton.style.transform = 'scale(.96)';
    void favoritesModeButton.offsetWidth;
    window.requestAnimationFrame(() => {
      favoritesModeButton.style.transition = 'transform .18s cubic-bezier(.34, 1.56, .64, 1)';
      favoritesModeButton.style.transform = 'translateY(-1px) scale(1.08)';
    });
    favoriteModePulseTimer = window.setTimeout(() => {
      favoritesModeButton.style.transition = 'transform .28s ease-out';
      favoritesModeButton.style.transform = 'none';
    }, 180);
    favoriteButtonBounceTimer = window.setTimeout(() => {
      currentFavoriteToggle.classList.remove('is-bouncing');
      favoritesModeButton.classList.remove('is-bouncing');
      favoritesModeButton.style.removeProperty('transform');
      favoritesModeButton.style.removeProperty('transition');
    }, 560);
  }

  favoriteFeedbackTimer = window.setTimeout(() => {
    favoriteFeedback.classList.remove('is-visible');
    favoriteFeedback.hidden = true;
  }, 1250);
}

function setPanelScale(nextScale: number, anchor?: { left: number; top: number }) {
  panelScale = clamp(nextScale, MIN_PANEL_SCALE, MAX_PANEL_SCALE);
  applyPanelScale();

  if (!hasUserMovedPanel) {
    positionPanelAtDefault();
    return;
  }

  if (anchor) {
    const resizedRect = playerPanel.getBoundingClientRect();
    panelCenterX = anchor.left + resizedRect.width / 2;
    panelCenterY = anchor.top + resizedRect.height / 2;
  }

  clampPanelToViewport();
}

function finishDrag(pointerId: number) {
  if (!dragState || dragState.pointerId !== pointerId) return;
  if (title.hasPointerCapture(pointerId)) title.releasePointerCapture(pointerId);
  dragState = null;
  playerPanel.classList.remove('is-dragging');
}

title.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  hasUserMovedPanel = true;
  title.setPointerCapture(event.pointerId);
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    panelX: panelCenterX,
    panelY: panelCenterY,
  };
  playerPanel.classList.add('is-dragging');
});

title.addEventListener('pointermove', (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  panelCenterX = dragState.panelX + event.clientX - dragState.startX;
  panelCenterY = dragState.panelY + event.clientY - dragState.startY;
  clampPanelToViewport();
});

title.addEventListener('pointerup', (event) => finishDrag(event.pointerId));
title.addEventListener('pointercancel', (event) => finishDrag(event.pointerId));

function finishResize(pointerId: number) {
  if (!resizeState || resizeState.pointerId !== pointerId) return;
  if (resizeHandle.hasPointerCapture(pointerId)) resizeHandle.releasePointerCapture(pointerId);
  resizeState = null;
  playerPanel.classList.remove('is-resizing');
}

resizeHandle.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = playerPanel.getBoundingClientRect();
  resizeHandle.setPointerCapture(event.pointerId);
  resizeState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scale: panelScale,
    reference: Math.max(rect.width, rect.height),
    left: rect.left,
    top: rect.top,
  };
  playerPanel.classList.add('is-resizing');
});

resizeHandle.addEventListener('pointermove', (event) => {
  if (!resizeState || resizeState.pointerId !== event.pointerId) return;
  const delta = ((event.clientX - resizeState.startX) + (event.clientY - resizeState.startY)) / 2;
  setPanelScale(resizeState.scale + delta / resizeState.reference, resizeState);
});

resizeHandle.addEventListener('pointerup', (event) => finishResize(event.pointerId));
resizeHandle.addEventListener('pointercancel', (event) => finishResize(event.pointerId));

resizeHandle.addEventListener('keydown', (event) => {
  let nextScale = panelScale;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nextScale += 0.05;
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nextScale -= 0.05;
  else if (event.key === 'Home') nextScale = MIN_PANEL_SCALE;
  else if (event.key === 'End') nextScale = MAX_PANEL_SCALE;
  else return;

  event.preventDefault();
  setPanelScale(nextScale);
});

function handleViewportResize() {
  window.requestAnimationFrame(() => {
    if (hasUserMovedPanel) clampPanelToViewport();
    else positionPanelAtDefault();
  });
}

window.addEventListener('resize', handleViewportResize);
applyPanelScale();

function updateTrack(index: number) {
  currentTrackIndex = index;
  const track = tracks[currentTrackIndex];
  audio.src = track.source;
  audio.load();
  resetSeekDisplay();
  title.textContent = track.title;
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', '再生');
  updateTrackListState();
  window.requestAnimationFrame(() => {
    if (hasUserMovedPanel) clampPanelToViewport();
    else positionPanelAtDefault();
  });
}

function resetSeekDisplay() {
  seek.value = '0';
  seek.max = '0';
  seek.disabled = true;
  seek.style.setProperty('--seek-progress', '0%');
  currentTime.textContent = '0:00';
  durationTime.textContent = '0:00';
  seek.setAttribute('aria-valuetext', '0:00 / 0:00');
}

function updateSeekDisplay() {
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  const position = clampSeekTime(audio.currentTime, duration);
  const positionLabel = formatPlaybackTime(position);
  const durationLabel = formatPlaybackTime(duration);

  seek.max = String(duration);
  seek.value = String(position);
  seek.disabled = duration === 0;
  seek.style.setProperty('--seek-progress', `${seekProgress(position, duration)}%`);
  currentTime.textContent = positionLabel;
  durationTime.textContent = durationLabel;
  seek.setAttribute('aria-valuetext', `${positionLabel} / ${durationLabel}`);
}

async function playCurrentTrack() {
  try {
    await audio.play();
    playButton.textContent = 'Ⅱ';
    playButton.setAttribute('aria-label', '一時停止');
  } catch {
    playButton.textContent = '▶';
    playButton.setAttribute('aria-label', '再生');
  }
}

function pauseCurrentTrack() {
  audio.pause();
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', '再生');
}

function changeTrack(offset: number) {
  const wasPlaying = !audio.paused;
  const nextTrackIndex = moveWithinPlaylist(
    currentTrackIndex,
    offset,
    activePlaylistMode,
    favoriteTrackIndices(),
  );
  if (nextTrackIndex === null) return;
  updateTrack(nextTrackIndex);
  if (wasPlaying) void playCurrentTrack();
}

playButton.addEventListener('click', () => {
  if (audio.paused) void playCurrentTrack();
  else pauseCurrentTrack();
});

previousButton.addEventListener('click', () => changeTrack(-1));

nextButton.addEventListener('click', () => changeTrack(1));

currentFavoriteToggle.addEventListener('click', () => {
  const wasFavorite = favoriteTrackIds.includes(tracks[currentTrackIndex].id);
  favoriteTrackIds = toggleFavoriteTrackId(favoriteTrackIds, tracks[currentTrackIndex].id, catalogTrackIds);
  favoriteTrackIds = saveFavoriteTrackIds(favoritesStorage, favoriteTrackIds, catalogTrackIds);
  if (favoriteTrackIds.length === 0 && activePlaylistMode === 'favorites') {
    setActivePlaylistMode('all');
  }
  updateTrackListState();
  showFavoriteFeedback(
    wasFavorite ? 'Removed from Favorites' : 'Added to Favorites ♥',
    !wasFavorite,
  );
});

for (const button of playlistModeButtons) {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.playlistMode as PlaylistMode;
    const nextTrackIndex = firstTrackIndex(nextMode, favoriteTrackIndices());
    if (nextTrackIndex === null) return;
    setActivePlaylistMode(nextMode);
    updateTrack(nextTrackIndex);
    void playCurrentTrack();
  });
}

seek.addEventListener('input', () => {
  audio.currentTime = clampSeekTime(Number(seek.value), audio.duration);
  updateSeekDisplay();
});

volume.addEventListener('input', () => {
  audio.volume = Number(volume.value) / 100;
});

audio.addEventListener('loadedmetadata', updateSeekDisplay);
audio.addEventListener('durationchange', updateSeekDisplay);
audio.addEventListener('timeupdate', updateSeekDisplay);

audio.addEventListener('ended', () => {
  const nextTrackIndex = moveWithinPlaylist(
    currentTrackIndex,
    1,
    activePlaylistMode,
    favoriteTrackIndices(),
  );
  if (nextTrackIndex === null) {
    pauseCurrentTrack();
    return;
  }
  updateTrack(nextTrackIndex);
  void playCurrentTrack();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('resize', handleViewportResize);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  });
}

async function connectToDiscord() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) return;

  try {
    const { DiscordSDK } = await import('@discord/embedded-app-sdk');
    const discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();
  } catch {}
}

renderTrackList();
renderBackgroundList();
updateTrack(0);
recordAnonymousLaunch();
void connectToDiscord();
