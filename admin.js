// ============================================================
// admin.js
// ------------------------------------------------------------
// 【役割】管理画面(admin.html)の操作ロジックのみ。
// データの取得・保存はすべて common.js の関数経由で行う。
// ============================================================
import { getGameId, fetchState, saveState, resetFromDefaults } from './common.js';

const gameId = getGameId();
document.getElementById('gameIdLabel').textContent = gameId;

// --- DOM参照 ---
const titleInput = document.getElementById('titleInput');
const killLabelInput = document.getElementById('killLabelInput');
const killUnitInput = document.getElementById('killUnitInput');
const killCountInput = document.getElementById('killCountInput');
const giftListEl = document.getElementById('giftList');
const statusEl = document.getElementById('status');

// 画面上で編集中の状態(保存ボタンを押すまではローカルのみ)
let state = {
  title: '', killLabel: '残り', killUnit: 'Kill', killCount: 0, gifts: [],
};

// ============================================================
// 状態 → フォームへの反映
// ============================================================
function renderForm() {
  titleInput.value = state.title ?? '';
  killLabelInput.value = state.killLabel ?? '残り';
  killUnitInput.value = state.killUnit ?? 'Kill';
  killCountInput.value = state.killCount ?? 0;
  renderGiftList();
}

/**
 * ギフト編集リストを描画する。
 * 1行ごとに 名前/画像/効果 の入力欄と、上へ/下へ/削除ボタンを持つ。
 */
function renderGiftList() {
  giftListEl.innerHTML = '';

  state.gifts.forEach((gift, index) => {
    const row = document.createElement('div');
    row.className = 'gift-row';
    row.innerHTML = `
      <input type="text" class="f-name" placeholder="ギフト名" value="${escapeAttr(gift.name)}">
      <input type="text" class="f-image" placeholder="images/xxx.png または https://..." value="${escapeAttr(gift.image)}">
      <input type="text" class="f-effect" placeholder="妨害内容" value="${escapeAttr(gift.effect)}">
      <button type="button" class="btn btn-secondary btn-icon f-up" title="上へ">↑</button>
      <button type="button" class="btn btn-secondary btn-icon f-down" title="下へ">↓</button>
      <button type="button" class="btn btn-danger btn-icon f-remove" title="削除">✕</button>
    `;

    // 入力内容をそのまま state.gifts[index] に反映(保存ボタンで確定)
    row.querySelector('.f-name').oninput = (e) => { gift.name = e.target.value; };
    row.querySelector('.f-image').oninput = (e) => { gift.image = e.target.value; };
    row.querySelector('.f-effect').oninput = (e) => { gift.effect = e.target.value; };

    row.querySelector('.f-up').onclick = () => moveGift(index, -1);
    row.querySelector('.f-down').onclick = () => moveGift(index, 1);
    row.querySelector('.f-remove').onclick = () => {
      state.gifts.splice(index, 1);
      renderGiftList();
    };

    giftListEl.appendChild(row);
  });
}

/** ギフトの並び順を入れ替える */
function moveGift(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.gifts.length) return;
  const [item] = state.gifts.splice(index, 1);
  state.gifts.splice(target, 0, item);
  renderGiftList();
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

// ============================================================
// ボタン操作
// ============================================================

document.getElementById('addGiftBtn').onclick = () => {
  state.gifts.push({ name: '', image: 'images/placeholder.png', effect: '' });
  renderGiftList();
  // 追加した行が見えるようにスクロール
  giftListEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

document.getElementById('killIncBtn').onclick = () => {
  killCountInput.value = Number(killCountInput.value || 0) + 1;
};
document.getElementById('killDecBtn').onclick = () => {
  killCountInput.value = Number(killCountInput.value || 0) - 1;
};

document.getElementById('saveBtn').onclick = async () => {
  // フォームの最新値をstateへ反映してから保存
  state.title = titleInput.value;
  state.killLabel = killLabelInput.value;
  state.killUnit = killUnitInput.value;
  state.killCount = Number(killCountInput.value) || 0;

  try {
    await saveState(gameId, state);
    showStatus('保存しました。配信画面に反映されます。');
  } catch (err) {
    console.error(err);
    showStatus('保存に失敗しました', true);
  }
};

document.getElementById('resetBtn').onclick = async () => {
  const ok = confirm(`現在の編集内容を破棄し、games/${gameId}.json の内容で初期化します。よろしいですか？`);
  if (!ok) return;

  try {
    state = await resetFromDefaults(gameId);
    renderForm();
    showStatus('初期データを読み込みました');
  } catch (err) {
    console.error(err);
    showStatus('初期化に失敗しました', true);
  }
};

// ============================================================
// トースト通知
// ============================================================
let statusTimer = null;
function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-error', isError);
  statusEl.classList.add('show');
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2500);
}

// ============================================================
// 初期化: 既存のライブ状態があればそれを、無ければ静的JSONを読み込む
// ============================================================
async function init() {
  try {
    const existing = await fetchState(gameId);
    state = existing || await resetFromDefaults(gameId);
  } catch (err) {
    console.error(err);
    showStatus('データの読み込みに失敗しました', true);
  }
  renderForm();
}
init();
