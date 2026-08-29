import './style.css';

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
      <span id="resize-handle" class="resize-handle" role="slider" tabindex="0" aria-label="プレイヤーのサイズを変更" aria-valuemin="50" aria-valuemax="150" aria-valuenow="60"></span>
    </div>
  </section>
  <aside id="steam-diagnostics" class="steam-diagnostics" aria-label="Steam diagnostics">
    <strong>Steam diagnostics</strong>
    <pre id="steam-diagnostics-output"></pre>
  </aside>
`;

const playerPanel = requiredElement<HTMLDivElement>('#player-panel');
const title = requiredElement<HTMLHeadingElement>('#track-title');
const resizeHandle = requiredElement<HTMLSpanElement>('#resize-handle');
const previousButton = requiredElement<HTMLButtonElement>('#previous-button');
const playButton = requiredElement<HTMLButtonElement>('#play-button');
const nextButton = requiredElement<HTMLButtonElement>('#next-button');
const volume = requiredElement<HTMLInputElement>('#volume');
const steamDiagnosticsOutput = requiredElement<HTMLPreElement>('#steam-diagnostics-output');

let currentTrackIndex = 0;
const audio = new Audio();
audio.autoplay = false;
audio.volume = Number(volume.value) / 100;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function formatDiagnosticRect(rect: DOMRect) {
  return `${rect.x.toFixed(1)}, ${rect.y.toFixed(1)} / ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`;
}

function shortenDiagnosticValue(value: string, maximumLength = 92) {
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength - 1)}…`;
}

function updateSteamDiagnostics() {
  const steamElements = document.querySelectorAll<HTMLElement>('.steam-wisp');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = [
    `Motion: ${reducedMotion ? 'reduce' : 'no-preference'}`,
    `Steam elements: ${steamElements.length}`,
  ];
  const steam = steamElements[0];

  if (!steam) {
    lines.push('Animation: unavailable', 'Steam element not found');
    steamDiagnosticsOutput.textContent = lines.join('\n');
    return;
  }

  const steamStyle = window.getComputedStyle(steam);
  const steamRect = steam.getBoundingClientRect();
  const layer = steam.closest<HTMLElement>('.steam-layer');

  lines.push(
    `Animation: ${steamStyle.animationName}`,
    `Duration: ${steamStyle.animationDuration}`,
    `Play state: ${steamStyle.animationPlayState}`,
    `Opacity: ${Number.parseFloat(steamStyle.opacity).toFixed(3)}`,
    `Transform: ${shortenDiagnosticValue(steamStyle.transform)}`,
    `Rect: ${formatDiagnosticRect(steamRect)}`,
    `Display: ${steamStyle.display}`,
    `Visibility: ${steamStyle.visibility}`,
    `z-index: ${steamStyle.zIndex}`,
  );

  if (layer) {
    const layerStyle = window.getComputedStyle(layer);
    lines.push(
      `Layer overflow: ${layerStyle.overflow}`,
      `Layer z-index: ${layerStyle.zIndex}`,
      `Layer rect: ${formatDiagnosticRect(layer.getBoundingClientRect())}`,
    );
  } else {
    lines.push('Steam layer: not found');
  }

  steamDiagnosticsOutput.textContent = lines.join('\n');
}

const MIN_PANEL_SCALE = 0.5;
const MAX_PANEL_SCALE = 1.5;
const VIEWPORT_MARGIN = 12;
const STEAM_DIAGNOSTICS_INTERVAL_MS = 400;

let panelCenterX = window.innerWidth / 2;
let panelCenterY = window.innerHeight / 2;
let panelScale = 0.6;
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
updateSteamDiagnostics();
const steamDiagnosticsTimer = window.setInterval(updateSteamDiagnostics, STEAM_DIAGNOSTICS_INTERVAL_MS);

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
    window.clearInterval(steamDiagnosticsTimer);
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
void connectToDiscord();
