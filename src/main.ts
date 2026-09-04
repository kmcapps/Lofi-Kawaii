import './style.css';
import { recordAnonymousLaunch } from './analytics';

type Track = {
  title: string;
  source: string;
};

const audioBaseUrl = `${import.meta.env.BASE_URL}audio/`;

const tracks: Track[] = [
  {
    title: 'Quiet Motion',
    source: `${audioBaseUrl}01_Quiet_Motion_v1_96BPM.mp3`,
  },
  {
    title: 'Music Box Stroll',
    source: `${audioBaseUrl}02_Music_Box_Stroll_v4_MusicBox005_84BPM.mp3`,
  },
  {
    title: 'Moonlit Waterside Room',
    source: `${audioBaseUrl}03_Moonlit_Waterside_Room_v6_77BPM.mp3`,
  },
  {
    title: 'Variant A Six Eight Nocturne',
    source: `${audioBaseUrl}04_Variant_A_SixEight_Nocturne_72BPM.mp3`,
  },
  {
    title: 'Variant D Night Waltz',
    source: `${audioBaseUrl}05_Variant_D_Night_Waltz_90BPM.mp3`,
  },
  {
    title: 'Still Lake Morning',
    source: `${audioBaseUrl}06_Still_Lake_Morning.mp3`,
  },
  {
    title: 'Coffee by the Window',
    source: `${audioBaseUrl}07_Coffee_by_the_Window.mp3`,
  },
  {
    title: 'Blanket and Blue Sky',
    source: `${audioBaseUrl}08_Blanket_and_Blue_Sky.mp3`,
  },
  {
    title: 'Quiet Ripples',
    source: `${audioBaseUrl}09_Quiet_Ripples.mp3`,
  },
  {
    title: 'Slow Sunday Light',
    source: `${audioBaseUrl}10_Slow_Sunday_Light.mp3`,
  },
  {
    title: 'Pillow-side Daydream',
    source: `${audioBaseUrl}11_Pillow-side_Daydream.mp3`,
  },
  {
    title: 'Cedar Cabin Coffee',
    source: `${audioBaseUrl}12_Cedar_Cabin_Coffee.mp3`,
  },
  {
    title: 'Clouds Over the Lake',
    source: `${audioBaseUrl}13_Clouds_Over_the_Lake.mp3`,
  },
  {
    title: 'Afternoon Stillness',
    source: `${audioBaseUrl}14_Afternoon_Stillness.mp3`,
  },
  {
    title: 'Dusk in Soft Blue',
    source: `${audioBaseUrl}15_Dusk_in_Soft_Blue.mp3`,
  },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root was not found.');

app.innerHTML = `
  <section class="player" aria-label="Lofi music player">
    <div class="steam-layer" aria-hidden="true">
      <span class="steam-wisp"></span>
    </div>
    <div class="glow glow-one"></div><div class="glow glow-two"></div>
    <div id="player-panel" class="player-panel">
      <h1 id="track-title" class="drag-handle" title="ドラッグしてプレイヤーを移動"></h1>
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
      <label class="volume" for="volume">
        <svg class="volume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 9v6h4l5 4V5L8 9H4Z"></path>
          <path d="M16 9.5a4 4 0 0 1 0 5"></path>
          <path d="M18.5 7a7 7 0 0 1 0 10"></path>
        </svg>
        <input id="volume" type="range" min="0" max="100" value="20" aria-label="音量" />
      </label>
      <p class="hint">このActivityでは、各参加者がそれぞれの端末で再生します。</p>
      <span id="resize-handle" class="resize-handle" role="slider" tabindex="0" aria-label="プレイヤーのサイズを変更" aria-valuemin="50" aria-valuemax="150" aria-valuenow="70"></span>
    </div>
  </section>
`;

const playerPanel = requiredElement<HTMLDivElement>('#player-panel');
const title = requiredElement<HTMLHeadingElement>('#track-title');
const resizeHandle = requiredElement<HTMLSpanElement>('#resize-handle');
const previousButton = requiredElement<HTMLButtonElement>('#previous-button');
const playButton = requiredElement<HTMLButtonElement>('#play-button');
const nextButton = requiredElement<HTMLButtonElement>('#next-button');
const ambientEffectsToggle = requiredElement<HTMLButtonElement>('#ambient-effects-toggle');
const volume = requiredElement<HTMLInputElement>('#volume');

let currentTrackIndex = 0;
const audio = new Audio();
audio.autoplay = false;
audio.volume = Number(volume.value) / 100;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

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
let panelScale = 0.7;
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
  playerPanel.style.left = `${panelCenterX}px`;
  playerPanel.style.top = `${panelCenterY}px`;

  const panelRect = playerPanel.getBoundingClientRect();
  const handleRect = resizeHandle.getBoundingClientRect();
  const visualBottom = Math.max(panelRect.bottom, handleRect.bottom);
  panelCenterY += window.innerHeight - VIEWPORT_MARGIN - visualBottom;
  clampPanelToViewport();
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
  title.textContent = track.title;
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', '再生');
  window.requestAnimationFrame(() => {
    if (hasUserMovedPanel) clampPanelToViewport();
    else positionPanelAtDefault();
  });
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
  updateTrack((currentTrackIndex + offset + tracks.length) % tracks.length);
  if (wasPlaying) void playCurrentTrack();
}

playButton.addEventListener('click', () => {
  if (audio.paused) void playCurrentTrack();
  else pauseCurrentTrack();
});

previousButton.addEventListener('click', () => changeTrack(-1));

nextButton.addEventListener('click', () => changeTrack(1));

volume.addEventListener('input', () => {
  audio.volume = Number(volume.value) / 100;
});

audio.addEventListener('ended', () => {
  updateTrack((currentTrackIndex + 1) % tracks.length);
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

updateTrack(0);
recordAnonymousLaunch();
void connectToDiscord();
