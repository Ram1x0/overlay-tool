// ============================================================
// overlay.js
// ------------------------------------------------------------
// 【役割】配信オーバーレイ（index.html）の表示ロジックのみ。
// データの取得・保存は一切ここで行わない。すべて common.js の
// 関数を呼び出すだけ。（表示とデータ管理の分離）
// ============================================================
import { getGameId, subscribeState, fetchState, resetFromDefaults, subscribeGiftEvent } from './common.js';

const gameId = getGameId();

// --- DOM参照 ---
const titleEl = document.getElementById('title');
const clockEl = document.getElementById('clock');
const killLabelEl = document.getElementById('killLabel');
const killCountEl = document.getElementById('killCount');
const killUnitEl = document.getElementById('killUnit');
const giftAreaEl = document.getElementById('giftArea');
const statusEl = document.getElementById('status');

// ギフト受信イベント演出用
const eventBannerEl = document.getElementById('eventBanner');
const eventGiftNameEl = document.getElementById('eventGiftName');
const eventKillResultsEl = document.getElementById('eventKillResults');
const eventEffectResultsEl = document.getElementById('eventEffectResults');
const eventAnnounceEl = document.getElementById('eventAnnounce');

// --- 自動ページ送りの設定値 ---
const GIFTS_PER_PAGE = 18;   // 1ページに表示するギフト数
const PAGE_INTERVAL_MS = 5000; // ページ切替の間隔(ミリ秒)

let currentGifts = [];
let paginationTimer = null;
let currentPageIndex = 0;
let pageElements = []; // 事前に作った各ページのDOM要素(切替時に作り直さない)

// ============================================================
// 時計
// ============================================================
function tickClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  clockEl.textContent = `${hh}:${mm}:${ss}`;
}
setInterval(tickClock, 1000);
tickClock();

// ============================================================
// ギフトカードの描画
// ============================================================

/**
 * 1件分のギフトカードのDOM要素を作る
 * @param {{name:string, image:string, effect:string}} gift
 */
function buildGiftCard(gift) {
  const card = document.createElement('div');
  // type: "sabotage"(妨害) / "rescue"(救済) でカードの色分けクラスを切り替える
  // 未指定の場合は既定で「妨害」扱いにする(このゲームの主目的が妨害のため)
  const type = gift.type === 'rescue' ? 'rescue' : 'sabotage';
  // killDelta: キル数の増減(例: +5, -3)。0や未指定なら表示しない
  const killDelta = Number(gift.killDelta) || 0;
  card.className = `gift-card gift-card--${type}${killDelta !== 0 ? ' gift-card--has-delta' : ''}`;

  // 画像はカード全面の背景として敷く(文字と重なってOK)
  const img = document.createElement('img');
  img.className = 'gift-image';
  img.src = gift.image || 'images/placeholder.png';
  img.alt = gift.name || '';
  img.loading = 'lazy';
  // 画像が読み込めない場合はプレースホルダーに差し替える
  img.onerror = () => { img.src = 'images/placeholder.png'; };

  // ギフト名は左上に小さく配置(バッジと対称の位置)
  const nameEl = document.createElement('div');
  nameEl.className = 'gift-name';
  nameEl.textContent = gift.name ?? '';

  // 右上に種別バッジ(「妨害」/「救済」)を表示
  const badge = document.createElement('div');
  badge.className = 'gift-type-badge';
  badge.textContent = type === 'rescue' ? '救済' : '妨害';

  // 効果テキストは下部の帯に大きく表示(画像の上に重ねてOK)
  const info = document.createElement('div');
  info.className = 'gift-info';
  info.innerHTML = `<div class="gift-effect">${escapeHtml(gift.effect)}</div>`;

  card.appendChild(img);
  card.appendChild(nameEl);
  card.appendChild(badge);
  card.appendChild(info);

  // キル数増減があれば、右下に大きく「+5」「-3」のように表示
  // 「残り」キル数は減るほど良い(クリアに近づく)ため、
  // +(残りが増える)=悪化=妨害色(赤)、-(残りが減る)=好転=救済色(緑) とする
  if (killDelta !== 0) {
    const deltaEl = document.createElement('div');
    const colorClass = killDelta > 0 ? 'sabotage' : 'rescue';
    deltaEl.className = `gift-kill-delta gift-kill-delta--${colorClass}`;
    deltaEl.textContent = killDelta > 0 ? `+${killDelta}` : `${killDelta}`;
    card.appendChild(deltaEl);
  }

  return card;
}

/** XSS対策の簡易エスケープ */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * 1ページ分のギフトカードをまとめたページ要素(div.gift-page)を作る。
 * これを切替のたびに作り直すと画像の再デコードなどで負荷が出るため、
 * ページ数分だけ「最初に1回」作って、以降は表示/非表示の切替だけで済ませる。
 */
function buildGiftPage(gifts) {
  const page = document.createElement('div');
  page.className = 'gift-page';
  const fragment = document.createDocumentFragment();
  gifts.forEach((gift) => fragment.appendChild(buildGiftCard(gift)));
  page.appendChild(fragment);
  return page;
}

function getTotalPages(giftsLength) {
  return Math.max(1, Math.ceil(giftsLength / GIFTS_PER_PAGE));
}

/**
 * ギフトの内容が変わった時だけ呼ぶ。全ページ分のDOM要素を1回だけ作り直し、
 * giftAreaに並べて配置する(すべて重ねて置き、CSSのopacityで見せ分ける)。
 */
function rebuildAllPages(gifts) {
  giftAreaEl.innerHTML = '';
  pageElements = [];

  const totalPages = getTotalPages(gifts.length);
  for (let i = 0; i < totalPages; i++) {
    const start = i * GIFTS_PER_PAGE;
    const pageGifts = gifts.slice(start, start + GIFTS_PER_PAGE);
    const pageEl = buildGiftPage(pageGifts);
    giftAreaEl.appendChild(pageEl);
    pageElements.push(pageEl);
  }
}

/**
 * ページを切り替える。DOMは作り直さず、is-visibleクラスの
 * 付け替えだけで行う(CSSのtransitionでクロスフェードする)。
 */
function showPage(pageIndex) {
  pageElements.forEach((pageEl, i) => {
    pageEl.classList.toggle('is-visible', i === pageIndex);
  });
}

/**
 * 自動ページ送りを(再)開始する。ギフトの内容が変わった時に呼び直す。
 */
function startPagination() {
  if (paginationTimer) clearInterval(paginationTimer);
  currentPageIndex = 0;
  showPage(currentPageIndex);

  const totalPages = pageElements.length;
  if (totalPages <= 1) return; // 1ページで収まるなら切替不要

  paginationTimer = setInterval(() => {
    currentPageIndex = (currentPageIndex + 1) % totalPages;
    showPage(currentPageIndex);
  }, PAGE_INTERVAL_MS);
}

// ============================================================
// ライブ状態(Firebaseから受け取った内容)を画面に反映
// ============================================================
function render(state) {
  if (!state) return;

  titleEl.textContent = state.title ?? '';
  killLabelEl.textContent = state.killLabel ?? '残り';
  killUnitEl.textContent = state.killUnit ?? 'Kill';
  killCountEl.textContent = state.killCount ?? 0;

  const gifts = Array.isArray(state.gifts) ? state.gifts : [];
  // ギフトの中身が変化した時だけ全ページを作り直す
  // (キル数だけ更新された時に毎回作り直さないようにするため)
  const giftsChanged = JSON.stringify(gifts) !== JSON.stringify(currentGifts);
  currentGifts = gifts;
  if (giftsChanged) {
    rebuildAllPages(gifts);
    startPagination();
  }
}

function showStatus(show, message) {
  statusEl.classList.toggle('show', !!show);
  if (message) statusEl.textContent = message;
}

// ============================================================
// ギフト受信イベント演出(Cloudflare Worker経由で届く)
// ============================================================
const ROULETTE_SPIN_MS = 900;    // ルーレットが回っている時間(1回あたり)
const ROULETTE_TICK_MS = 60;     // ルーレットの数字/文字が切り替わる間隔
const ROLL_GAP_MS = 350;         // 連続する場合の、1回ごとの間隔
const EVENT_TAIL_MS = 1800;      // 全ロール再生後、バナーを消すまでの余韻

let eventQueue = [];
let isPlayingEvent = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** キル数増減のルーレット演出。結果は上書きせず、チップとして追加して残す */
async function spinKillNumber(pool, finalDelta) {
  const chip = document.createElement('div');
  chip.className = 'kill-result-chip is-spinning';
  eventKillResultsEl.appendChild(chip);

  // 回転中は「本当の候補一覧」からランダムに表示する(候補が無ければ着地値のみ)
  const candidates = pool && pool.length > 0 ? pool : [finalDelta];
  const startedAt = Date.now();
  while (Date.now() - startedAt < ROULETTE_SPIN_MS) {
    const v = candidates[Math.floor(Math.random() * candidates.length)];
    // 表示している値自身の符号で色を決める(+は赤=妨害、-は緑=救済)
    chip.className = `kill-result-chip is-spinning kill-result-chip--${v > 0 ? 'sabotage' : 'rescue'}`;
    chip.textContent = v > 0 ? `+${v}` : `${v}`;
    await delay(ROULETTE_TICK_MS);
  }
  chip.className = `kill-result-chip is-landed kill-result-chip--${finalDelta > 0 ? 'sabotage' : 'rescue'}`;
  chip.textContent = finalDelta > 0 ? `+${finalDelta}` : `${finalDelta}`;
}

/** 妨害ルーレット演出。結果は上書きせず、チップとして追加して残す */
async function spinEffectText(pool, finalEffect) {
  const chip = document.createElement('div');
  chip.className = 'effect-result-chip is-spinning';
  eventEffectResultsEl.appendChild(chip);

  // 回転中は「本当の候補一覧」からランダムに表示する(候補が無ければ着地値のみ)
  const candidates = pool && pool.length > 0 ? pool : [finalEffect];
  const startedAt = Date.now();
  while (Date.now() - startedAt < ROULETTE_SPIN_MS) {
    chip.textContent = candidates[Math.floor(Math.random() * candidates.length)];
    await delay(ROULETTE_TICK_MS);
  }
  chip.className = 'effect-result-chip is-landed';
  chip.textContent = finalEffect;
}

/**
 * 1件分のギフトイベントを最後まで再生する(このPromiseが解決するまで、
 * 呼び出し側は次のイベントを再生しない=順番に必ず全部再生される)。
 */
async function playOneEvent(event) {
  eventKillResultsEl.innerHTML = '';
  eventEffectResultsEl.innerHTML = '';
  eventAnnounceEl.style.display = 'none';
  eventBannerEl.classList.add('show');

  const killRolls = Array.isArray(event.killRolls) ? event.killRolls : [];
  const effectRolls = Array.isArray(event.effectRolls) ? event.effectRolls : [];
  const killPool = Array.isArray(event.killPool) ? event.killPool : [];
  const effectPool = Array.isArray(event.effectPool) ? event.effectPool : [];
  const totalRolls = Math.max(killRolls.length, effectRolls.length);

  // 個数ぶん(コンボ分)を1件ずつ順番に再生する。着地した結果は消さずに
  // チップとして並べて残していくので、最後には全部の結果がまとめて見える。
  for (let i = 0; i < totalRolls; i++) {
    eventGiftNameEl.textContent = totalRolls > 1
      ? `${event.giftName} (${i + 1}/${totalRolls})`
      : event.giftName;

    const tasks = [];
    if (killRolls[i] !== undefined) tasks.push(spinKillNumber(killPool, killRolls[i]));
    if (effectRolls[i] !== undefined) tasks.push(spinEffectText(effectPool, effectRolls[i]));

    await Promise.all(tasks);
    if (i < totalRolls - 1) await delay(ROLL_GAP_MS);
  }

  // 全部の抽選が終わったので、カウンター表示を消してギフト名だけに戻す
  eventGiftNameEl.textContent = event.giftName;
  if (event.announceText) {
    eventAnnounceEl.style.display = '';
    eventAnnounceEl.textContent = event.announceText;
  }

  // 結果が多いほど読むのに時間がかかるので、件数に応じて表示時間を延ばす
  const tailMs = EVENT_TAIL_MS + Math.max(0, totalRolls - 1) * 700;
  await delay(tailMs);
}

/**
 * キューに溜まっているイベントを、先頭から順番に1件ずつ最後まで再生する。
 * 再生中に新しいイベントがキューに追加されても、今のイベントを打ち切らず、
 * 終わってから次に進む(取りこぼし防止)。
 */
async function processEventQueue() {
  if (isPlayingEvent) return; // 既に別のループが処理中
  isPlayingEvent = true;

  while (eventQueue.length > 0) {
    const event = eventQueue.shift();
    await playOneEvent(event);
  }

  eventBannerEl.classList.remove('show');
  isPlayingEvent = false;
}

/**
 * ギフト受信イベント(Firebaseのeventsリストへのchild_added)をキューに追加する。
 * 過去分の除外はcommon.js側でFirebaseキーの順序を見て行っているので、
 * ここに届く時点で「起動後に新しく来たイベント」であることが保証されている。
 */
function enqueueGiftEvent(event) {
  if (!event) return;
  eventQueue.push(event);
  processEventQueue();
}

// ============================================================
// 初期化
// ============================================================
async function init() {
  try {
    let state = await fetchState(gameId);
    if (!state) {
      // Firebase側にまだ何もない場合(初回)は、静的JSONの内容で初期化する
      state = await resetFromDefaults(gameId);
    }
    render(state);
    showStatus(false);
  } catch (err) {
    console.error(err);
    showStatus(true, '初期データの読み込みに失敗しました');
  }

  // 以降はリアルタイムに反映し続ける
  subscribeState(
    gameId,
    (state) => { showStatus(false); render(state); },
    () => showStatus(true, 'サーバーとの接続が切れました')
  );

  // ギフト受信イベント(Cloudflare Worker経由)の購読
  subscribeGiftEvent(gameId, enqueueGiftEvent);
}

init();
