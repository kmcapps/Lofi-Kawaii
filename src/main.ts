import './style.css';

type Track = {
  title: string;
  source: string;
};

const audioBaseUrl = `${import.meta.env.BASE_URL}audio/`;

const tracks: Track[] = [
  {
    title: 'Garden Morning',
    source: `${audioBaseUrl}Garden_Morning_v3_No_Nylon_82BPM.mp3`,
  },
  {
    title: 'Moonlit Waterside Room',
    source: `${audioBaseUrl}Moonlit_Waterside_Room_v6_77BPM.mp3`,
  },
  {
    title: 'Music Box Stroll',
    source: `${audioBaseUrl}Music_Box_Stroll_v4_MusicBox005_84BPM.mp3`,
  },
  {
    title: 'Quiet Motion',
    source: `${audioBaseUrl}Quiet_Motion_v1_96BPM.mp3`,
  },
  {
    title: 'Twilight Capital',
    source: `${audioBaseUrl}Twilight_Capital_v1_88BPM.mp3`,
  },
  {
    title: 'Twilight Frontier',
    source: `${audioBaseUrl}Twilight_Frontier_v1_76BPM.mp3`,
  },
  {
    title: 'Variant A Six Eight Nocturne',
    source: `${audioBaseUrl}Variant_A_SixEight_Nocturne_72BPM.mp3`,
  },
  {
    title: 'Variant C Five Four Mystic',
    source: `${audioBaseUrl}Variant_C_FiveFour_Mystic_80BPM.mp3`,
  },
  {
    title: 'Variant D Night Waltz',
    source: `${audioBaseUrl}Variant_D_Night_Waltz_90BPM.mp3`,
  },
];

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root was not found.');

app.innerHTML = `
  <section class="player" aria-label="Lofi music player">
    <div class="glow glow-one"></div><div class="glow glow-two"></div>
    <p class="eyebrow">DISCORD ACTIVITY · V0.1</p>
    <div class="art" aria-hidden="true"><span>☾</span></div>
    <p class="now-playing">NOW PLAYING</p>
    <h1 id="track-title"></h1>
    <p id="status" class="status">音源を読み込み中…</p>
    <div class="controls">
      <button id="play-button" class="play" type="button" aria-label="再生">▶</button>
      <button id="next-button" class="next" type="button">Next <span aria-hidden="true">→</span></button>
    </div>
    <label class="volume" for="volume">音量 <input id="volume" type="range" min="0" max="100" value="20" /></label>
    <p class="hint">このActivityでは、各参加者がそれぞれの端末で再生します。</p>
  </section>
`;

const title = requiredElement<HTMLHeadingElement>('#track-title');
const status = requiredElement<HTMLParagraphElement>('#status');
const playButton = requiredElement<HTMLButtonElement>('#play-button');
const nextButton = requiredElement<HTMLButtonElement>('#next-button');
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

function updateTrack(index: number) {
  currentTrackIndex = index;
  const track = tracks[currentTrackIndex];
  audio.src = track.source;
  audio.load();
  title.textContent = track.title;
  status.textContent = 'Playを押すと再生します';
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', '再生');
}

async function playCurrentTrack() {
  try {
    await audio.play();
    status.textContent = '再生中';
    playButton.textContent = 'Ⅱ';
    playButton.setAttribute('aria-label', '一時停止');
  } catch {
    status.textContent = '音源を再生できません。public/audio のファイル名を確認してください。';
  }
}

function pauseCurrentTrack() {
  audio.pause();
  status.textContent = '一時停止中';
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', '再生');
}

playButton.addEventListener('click', () => {
  if (audio.paused) void playCurrentTrack();
  else pauseCurrentTrack();
});

nextButton.addEventListener('click', () => {
  updateTrack((currentTrackIndex + 1) % tracks.length);
  void playCurrentTrack();
});

volume.addEventListener('input', () => {
  audio.volume = Number(volume.value) / 100;
});

audio.addEventListener('ended', () => {
  updateTrack((currentTrackIndex + 1) % tracks.length);
  void playCurrentTrack();
});

audio.addEventListener('error', () => {
  status.textContent = '音源が見つかりません。public/audio/README.md を確認してください。';
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  });
}

async function connectToDiscord() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) {
    status.textContent = 'ローカル表示モードです。Discord内では .env のClient IDを設定してください。';
    return;
  }

  try {
    const { DiscordSDK } = await import('@discord/embedded-app-sdk');
    const discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();
    status.textContent = 'Discordに接続しました。Playを押すと再生します。';
  } catch {
    status.textContent = 'Discord接続を確認できません。ローカル表示として続行できます。';
  }
}

updateTrack(0);
void connectToDiscord();
