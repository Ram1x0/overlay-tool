// ============================================================
// tikfinity-kill-bridge (Cloudflare Worker)
// ------------------------------------------------------------
// 【役割】TikFinityから届くギフトWebhook(application/x-www-form-urlencoded)
// を受け取り、Firebase上のギフト一覧(admin.htmlで編集した最新の内容)と
// 照合して、以下を行う中継役。
//
//   1. killDeltaが設定されていれば、残りキル数を自動で増減させる
//      (増減の有無・量は常にkillDelta通り。killRouletteは③の演出の
//       有無だけを左右し、増減量そのものには影響しない)
//   2. effectPoolが設定されていれば、その中からランダムに1つ選び、
//      「今回採用された効果」としてイベントに含める
//   3. killRoulette / effectPool / announceText のいずれかがあれば、
//      オーバーレイ側で再生する「イベント」としてFirebaseに書き込む
//
// TikFinity → このWorker → Firebase Realtime Database → オーバーレイ
//
// 必要な設定はこの下の2つのURLだけ。自分の環境に合わせて書き換えてから
// デプロイしてください。
// ============================================================

// Firebase上の「今まさに配信で表示している」状態が置かれている場所
// (admin.htmlで編集するとここが更新される。常にここを見ることで、
//  admin.htmlでの設定変更がそのまま自動反映に反映される)
const FIREBASE_GIFTS_URL =
  'https://live-counter-69c4e-default-rtdb.firebaseio.com/streams/kouya-kill/gifts.json';
const FIREBASE_STATE_URL =
  'https://live-counter-69c4e-default-rtdb.firebaseio.com/streams/kouya-kill.json';
const FIREBASE_EVENT_URL =
  'https://live-counter-69c4e-default-rtdb.firebaseio.com/streams/kouya-kill/latestEvent.json';

export default {
  async fetch(request) {
    // TikFinityからの本番リクエスト以外(ブラウザで直接開いた場合など)は
    // 200を返すだけにしておく
    if (request.method !== 'POST') {
      return new Response('tikfinity-kill-bridge is running', { status: 200 });
    }

    try {
      // TikFinityはJSONではなくform-urlencoded形式で送ってくる
      const formData = await request.formData();
      const giftName = formData.get('giftName');
      const repeatCount = Number(formData.get('repeatCount')) || 1;

      if (!giftName) {
        return new Response('giftName is missing', { status: 200 });
      }

      // Firebase上の最新ギフト一覧を取得して、名前が一致するものを探す
      const giftsRes = await fetch(FIREBASE_GIFTS_URL);
      const gifts = (await giftsRes.json()) || [];
      const gift = gifts.find((g) => g && g.name === giftName);

      if (!gift) {
        return new Response(`skip: ${giftName} not found in gifts list`, { status: 200 });
      }

      // --- ① キル数の増減(従来通り。killRouletteの有無に関係なく実行) ---
      const killDelta = Number(gift.killDelta) || 0;
      const totalDelta = killDelta * repeatCount;

      if (totalDelta !== 0) {
        // Firebaseのサーバー側アトミックインクリメント機能({".sv":{"increment":N}})を使う。
        // 事前に現在値を読んで計算する方式だと、短時間に複数ギフトが来た時に
        // 競合して片方の増減が消えることがあるため、これを使うのが安全。
        await fetch(FIREBASE_STATE_URL, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            killCount: { '.sv': { increment: totalDelta } },
          }),
        });
      }

      // --- ② 妨害ルーレット: 候補があればランダムに1つ採用 ---
      const effectPool = Array.isArray(gift.effectPool) ? gift.effectPool : [];
      const chosenEffect =
        effectPool.length > 0
          ? effectPool[Math.floor(Math.random() * effectPool.length)]
          : null;

      // --- ③ オーバーレイに演出させる必要があるか判定 ---
      const shouldShowEvent =
        (gift.killRoulette && totalDelta !== 0) ||
        chosenEffect !== null ||
        !!gift.announceText;

      if (shouldShowEvent) {
        const event = {
          // idが変わるたびにオーバーレイ側が「新しいイベント」と検知する
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          giftName,
          repeatCount,
          killDelta: gift.killRoulette ? totalDelta : 0, // 演出フラグがない時は数字演出を出さない
          chosenEffect,
          announceText: gift.announceText || null,
          ts: Date.now(),
        };

        await fetch(FIREBASE_EVENT_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
      }

      return new Response(
        `OK: ${giftName} x${repeatCount} => killDelta:${totalDelta} chosenEffect:${chosenEffect}`,
        { status: 200 }
      );
    } catch (err) {
      return new Response(`error: ${err.message}`, { status: 500 });
    }
  },
};
