// ============================================================
// overlay.js
// ------------------------------------------------------------
// 【役割】配信オーバーレイ（index.html）の表示ロジックのみ。
// データの取得・保存は一切ここで行わない。すべて common.js の
// 関数を呼び出すだけ。（表示とデータ管理の分離）
// ============================================================
import { getGameId, subscribeState, fetchState, resetFromDefaults } from './common.js';

const gameId = getGameId();

// --- DOM参照 ---
const titleEl = document.getElementById('title');
const clockEl = document.getElementById('clock');
const killLabelEl = document.getElementById('killLabel');
const killCountEl = document.getElementById('killCount');
const killUnitEl = document.getElementById('killUnit');
const pageAEl = document.getElementById('giftPageA');
const pageBEl = document.getElementById('giftPageB');
const statusEl = document.getElementById('status');

// --- 自動ページ送りの設定値 ---
const GIFTS_PER_PAGE = 18;   // 1ページに表示するギフト数
const PAGE_INTERVAL_MS = 5000; // ページ切替の間隔(ミリ秒)

let currentGifts = [];
let paginationTimer = null;
let currentPageIndex = 0;
let activeLayer = 'A'; // A/Bの2枚のレイヤーを交互に使ってクロスフェードさせる

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
  card.className = 'gift-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'gift-image-wrap';

  const img = document.createElement('img');
  img.className = 'gift-image';
  img.src = gift.image || 'images/placeholder.png';
  img.alt = gift.name || '';
  img.loading = 'lazy';
  // 画像が読み込めない場合はプレースホルダーに差し替える
  img.onerror = () => { img.src = 'images/placeholder.png'; };
  imageWrap.appendChild(img);

  const info = document.createElement('div');
  info.className = 'gift-info';
  info.innerHTML = `
    <div class="gift-name">${escapeHtml(gift.name)}</div>
    <div class="gift-effect">${escapeHtml(gift.effect)}</div>
  `;

  card.appendChild(imageWrap);
  card.appendChild(info);
  return card;
}

/** XSS対策の簡易エスケープ */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * 指定コンテナに、1ページ分のギフトカードをまとめて描画する
 */
function renderGiftPage(container, gifts) {
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  gifts.forEach((gift) => fragment.appendChild(buildGiftCard(gift)));
  container.appendChild(fragment);
}

function getTotalPages() {
  return Math.max(1, Math.ceil(currentGifts.length / GIFTS_PER_PAGE));
}

function getGiftsForPage(pageIndex) {
  const start = pageIndex * GIFTS_PER_PAGE;
  return currentGifts.slice(start, start + GIFTS_PER_PAGE);
}

/**
 * ページを切り替える。表示中でない方のレイヤーに次のページを描画してから
 * is-visibleクラスを入れ替えることで、CSSのtransitionによるクロスフェードになる。
 */
function showPage(pageIndex) {
  const gifts = getGiftsForPage(pageIndex);
  const nextEl = activeLayer === 'A' ? pageBEl : pageAEl;
  const prevEl = activeLayer === 'A' ? pageAEl : pageBEl;

  renderGiftPage(nextEl, gifts);
  // 次のフレームでクラスを切り替えると、確実にtransitionが発火する
  requestAnimationFrame(() => {
    nextEl.classList.add('is-visible');
    prevEl.classList.remove('is-visible');
  });

  activeLayer = activeLayer === 'A' ? 'B' : 'A';
}

/**
 * 自動ページ送りを(再)開始する。ギフトの内容が変わった時に呼び直す。
 */
function startPagination() {
  if (paginationTimer) clearInterval(paginationTimer);
  currentPageIndex = 0;
  showPage(currentPageIndex);

  const totalPages = getTotalPages();
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
  // ギフトの中身が変化した時だけページ送りを再スタートする
  // (キル数だけ更新された時に毎回ページがリセットされないようにするため)
  const giftsChanged = JSON.stringify(gifts) !== JSON.stringify(currentGifts);
  currentGifts = gifts;
  if (giftsChanged) startPagination();
}

function showStatus(show, message) {
  statusEl.classList.toggle('show', !!show);
  if (message) statusEl.textContent = message;
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
}

init();
