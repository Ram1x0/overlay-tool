// ============================================================
// common.js
// ------------------------------------------------------------
// 【役割】データ管理層（Data Access Layer）
//
// overlay.js（表示）と admin.js（管理画面）は、データの保存先が
// 何であるか（今はFirebase Realtime Database）を一切知らなくてよい
// ように、この1ファイルだけがFirebaseとやり取りする。
//
// 将来「Firebase以外に変えたい」「別のDBにしたい」となっても、
// このファイルの中身を差し替えるだけで overlay.js / admin.js は
// 無修正で動く。これが「表示とデータ管理の分離」。
//
// 【ゲームの切り替え方】
// URLに ?game=xxx を付けると、
//   - 初期データ:  games/xxx.json
//   - ライブ状態:  Firebase の /streams/xxx
// を見るようになる。新しいゲームを追加したい場合は
// games/ に新しいJSONファイルを置くだけでよい（コード変更不要）。
// ============================================================

/**
 * URLの ?game=xxx からゲームIDを取得する。
 * 省略時は "kouya-kill"（荒野行動キル数耐久）。
 * @returns {string} gameId
 */
export function getGameId() {
  return new URLSearchParams(location.search).get('game') || 'kouya-kill';
}

/**
 * ゲームごとの「初期データ（静的JSON）」を読み込む。
 * これはリポジトリに含まれる読み取り専用のデフォルトデータで、
 * ゲームを追加・差し替えるときはこのJSONファイルだけを用意すればよい。
 * @param {string} gameId
 * @returns {Promise<Object>} { meta: {...}, gifts: [...] }
 */
export async function loadGameDefaults(gameId) {
  const res = await fetch(`games/${gameId}.json`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`ゲームデータが見つかりません: games/${gameId}.json`);
  }
  return res.json();
}

// Firebaseの初期化は1回だけ行う（複数回initializeAppするとエラーになるため）
let _dbInitialized = false;
function ensureFirebaseInitialized() {
  if (!_dbInitialized) {
    firebase.initializeApp(window.firebaseConfig);
    _dbInitialized = true;
  }
}

/**
 * 指定ゲームのライブ状態が置かれているFirebaseの参照(ref)を返す。
 * @param {string} gameId
 */
function getStateRef(gameId) {
  ensureFirebaseInitialized();
  return firebase.database().ref(`streams/${gameId}`);
}

/**
 * ライブ状態をリアルタイム購読する。
 * 保存されるたびに callback(state) が呼ばれる。
 * @param {string} gameId
 * @param {(state: Object) => void} onChange
 * @param {(error: Error) => void} [onError]
 * @returns {() => void} 購読解除用の関数
 */
export function subscribeState(gameId, onChange, onError) {
  const ref = getStateRef(gameId);
  const handler = (snapshot) => onChange(snapshot.val());
  const errHandler = (err) => { if (onError) onError(err); };
  ref.on('value', handler, errHandler);
  return () => ref.off('value', handler);
}

/**
 * Cloudflare Worker(tikfinity-kill-bridge)がpushで追記する「演出イベント」を購読する。
 * 上書き型(value)だと、ほぼ同時に複数件届いた時に古い方が消えてしまうため、
 * 追記型のリストに対してchild_added(新しく追加された子要素だけを検知)で購読する。
 * こうすることで、同時に複数件届いても1件も取りこぼさない。
 * @param {string} gameId
 * @param {(event: Object) => void} onEvent
 * @returns {() => void} 購読解除用の関数
 */
export function subscribeGiftEvent(gameId, onEvent) {
  ensureFirebaseInitialized();
  const listRef = firebase.database().ref(`streams/${gameId}/events`);
  const ref = listRef.limitToLast(20);

  // 「起動時点より前からあった分(過去の再生)」を無視するための基準。
  // 端末間の時刻のズレに依存する判定(タイムスタンプ比較)は信頼できないため、
  // Firebaseのpushキーの並び順(常に時系列順になる)で判定する。
  let readyKey = null;
  let isReady = false;

  listRef.limitToLast(1).once('value').then((snap) => {
    snap.forEach((child) => { readyKey = child.key; });
    isReady = true;
  });

  const handler = (snapshot) => {
    if (!isReady) return; // 基準キーが確定するまでは何もしない(起動直後の過去分はここで捨てる)
    if (readyKey !== null && snapshot.key <= readyKey) return; // 起動前からあった分は無視
    const event = snapshot.val();
    if (event) onEvent(event);
  };
  ref.on('child_added', handler);
  return () => ref.off('child_added', handler);
}

/**
 * ライブ状態を1回だけ取得する。
 * @param {string} gameId
 * @returns {Promise<Object|null>}
 */
export async function fetchState(gameId) {
  const ref = getStateRef(gameId);
  const snap = await ref.once('value');
  return snap.val();
}

/**
 * ライブ状態を丸ごと保存（上書き）する。
 * @param {string} gameId
 * @param {Object} state
 */
export async function saveState(gameId, state) {
  const ref = getStateRef(gameId);
  await ref.set({ ...state, updatedAt: Date.now() });
}

/**
 * ライブ状態の一部分だけを更新する（例: killCountだけ）。
 * @param {string} gameId
 * @param {Object} partial
 */
export async function patchState(gameId, partial) {
  const ref = getStateRef(gameId);
  await ref.update({ ...partial, updatedAt: Date.now() });
}

/**
 * 静的JSON（games/xxx.json）の内容で、ライブ状態を初期化・上書きする。
 * 「初めてこのゲームを配信するとき」や「一旦リセットしたいとき」に使う。
 * @param {string} gameId
 * @returns {Promise<Object>} 保存した状態
 */
export async function resetFromDefaults(gameId) {
  const defaults = await loadGameDefaults(gameId);
  const state = {
    title: defaults.meta.title,
    killLabel: defaults.meta.killLabel,
    killUnit: defaults.meta.killUnit,
    killCount: defaults.meta.initialKillCount,
    gifts: defaults.gifts,
  };
  await saveState(gameId, state);
  return state;
}
