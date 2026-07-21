# 荒野行動 キル数耐久 妨害配信オーバーレイ

PRISM LIVEのブラウザソースで使う配信オーバーレイと、その管理画面。
PC不要、GitHub Pages + Firebase Realtime Databaseのみで動作します。

## ファイル構成と役割

```
index.html          配信オーバーレイ本体（PRISM LIVEに設定するURL）
admin.html           管理画面（スマホ等から編集する用）
style.css            共通デザイン（両ページで共有）
firebase-config.js   Firebase接続情報
common.js            データ管理層（Firebaseとのやり取りをここに集約）
overlay.js           オーバーレイの表示ロジックのみ
admin.js             管理画面の操作ロジックのみ
games/kouya-kill.json  荒野行動キル数耐久の初期データ
images/placeholder.png 画像が読み込めない時の代替表示
```

**設計方針**: `common.js` だけがFirebaseを知っている。`overlay.js` と
`admin.js` は「表示」と「フォーム操作」に専念し、データの保存先が
変わっても（例: 将来別のDBに移行しても）この2つは無修正で動きます。

## セットアップ

### 1. Firebase（カウンター企画と同じプロジェクトで可）

以前作成したFirebaseプロジェクトを流用する場合は、Realtime Databaseの
「ルール」タブに以下を追記してください（`streams` パスを追加）。

```json
{
  "rules": {
    "counters": {
      "$counterId": { ".read": true, ".write": true }
    },
    "streams": {
      "$gameId": { ".read": true, ".write": true }
    }
  }
}
```

新規にFirebaseプロジェクトを作る場合は、以前案内した手順（プロジェクト作成
→ Realtime Database作成 → ルール設定 → ウェブアプリ登録）と同じです。

### 2. `firebase-config.js` を編集

Firebaseコンソールで取得した値に書き換えます。

### 3. GitHub Pagesにアップロード

このフォルダ一式（`images/` や `games/` を含む）をリポジトリにpushします。

例: `https://ram1x7.github.io/kouya-overlay/index.html`

### 4. PRISM LIVEに設定

- ブラウザソースのURLに `index.html` のアドレスを指定
- 幅: 941 / 高さ: 600 程度に設定（オーバーレイ側は自動でこのサイズ基準にレイアウトされます）
- 背景は透明なので、そのままゲーム映像の上に重ねて表示されます

### 5. 管理画面を開く

`admin.html` のアドレスをスマホのSafariで開きます。ホーム画面に追加しておくと
アプリのように使えて便利です。ここで編集した内容は「保存」ボタンを押すと
数秒でオーバーレイ側に反映されます。

## ギフト画像について

`images/` フォルダに画像を追加し、`images/rose.png` のような相対パスで
指定するのが基本です（GitHubにpushすれば永続的に使えます）。
急ぎで試したい場合は、外部の画像URL（`https://...`）をそのまま指定してもOKです。
存在しない画像パスを指定した場合は自動的に `images/placeholder.png` が表示されます。

## 別のゲームに流用する方法（Heartopia版・Minecraft版など）

コードは一切変更せず、JSONファイルを追加するだけで新しいゲーム用の
オーバーレイが作れます。

1. `games/` フォルダに新しいJSONファイルを作る（例: `games/heartopia.json`）
   構造は `games/kouya-kill.json` と同じ形式にします。
   ```json
   {
     "meta": {
       "gameId": "heartopia",
       "title": "🕊️ Heartopia 特別企画",
       "killLabel": "残り",
       "killUnit": "回",
       "initialKillCount": 50
     },
     "gifts": [
       { "name": "花", "image": "images/heartopia/flower.png", "effect": "○○禁止10秒", "type": "sabotage" }
     ]
   }
   ```

   `type` は `"sabotage"`（妨害・赤色）または `"rescue"`（救済・緑色）を指定します。
   省略した場合は自動的に `"sabotage"` 扱いになります。オーバーレイ側では
   カードの縁の色と右上のバッジ表示（「妨害」/「救済」）で見分けられます。

   `killDelta` は省略可能で、指定するとカード右下に大きく「+5」「-3」のように
   表示されます。「残り」キル数は減るほど良い(クリアに近づく)ため、
   **+(残りキル数が増える)は妨害色(赤)、-(残りキル数が減る)は救済色(緑)**
   になります。残りキル数を直接増減させるギフトにだけ設定し、それ以外の
   ギフトは省略してください。
2. オーバーレイと管理画面を、URLの末尾に `?game=heartopia` を付けて開く

   ```
   index.html?game=heartopia
   admin.html?game=heartopia
   ```

3. これだけで、Firebase上の別の場所（`/streams/heartopia`）にデータが
   保存されるようになり、荒野行動版とは完全に独立したオーバーレイとして動きます。

「①タイトル・キルラベル・単位・初期値」「②ギフト一覧」という構造さえ
JSONに落とし込めれば、キル数以外のカウント企画（撃破数・生存時間企画など）
にもそのまま流用できます。

## TikTokギフト連動(TikFinity + Cloudflare Worker)

`tikfinity-kill-bridge.js` は、TikFinityが受け取ったギフトを自動でキル数増減・
画面演出に反映させるためのCloudflare Worker用コードです（GitHub Pagesには
含めず、Cloudflare側に個別にデプロイします）。

構成:

```
TikTok視聴者がギフト送信
  → TikFinity(常時起動している端末)が検知
  → Cloudflare Worker(tikfinity-kill-bridge.js)が受信・判定
  → Firebase(streams/{gameId})を自動更新
  → オーバーレイがリアルタイムに反映・演出を再生
```

ギフトごとに、admin.htmlの「演出設定」から以下を設定できます。

- **キル増減**: 数値を入れると、そのギフトを受け取るたびに残りキル数が自動で増減する
- **キル増減の候補(複数可)**: 1行に1つ数値を書いておくと、そのギフトを受け取る
  たびにこの中からランダムに1つ抽選され、**抽選された値がそのまま実際の
  残りキル数に反映される**（「キル増減」欄より優先。空なら「キル増減」欄の固定値を使用）
- **キル数増減の演出**: チェックを入れると、上記の抽選結果を画面中央に
  ルーレット風の数字演出で表示する（数値は常に実際に反映された値と一致します）
- **妨害ルーレットの候補**: 1行に1つ効果を書いておくと、そのギフトを受け取る
  たびにこの中からランダムに1つ選ばれ、「採用された効果」として画面に表示される
- **画面に表示する文字**: 受信時に画面中央に大きく表示される任意のメッセージ

同じギフトが**まとめて複数個**送られてきた場合（TikTokのコンボ送信）、
キル増減・妨害ルーレットはどちらも「個数ぶん」だけ1回ずつ独立して抽選され、
画面には(1/3) (2/3) (3/3)のように、その回数ぶん連続してルーレットが再生されます。

セットアップ手順は前のやり取りの通りですが、要点だけまとめると:

1. Cloudflareで無料アカウント作成 → Workers & Pages → 作成 → 「Workers」タブ →
   「Hello World」テンプレートで新規Worker作成
2. 中身を`tikfinity-kill-bridge.js`の内容に置き換えてデプロイ
3. コード内の`FIREBASE_GIFTS_URL` / `FIREBASE_STATE_URL` / `FIREBASE_EVENT_URL`を
   自分のFirebaseプロジェクトのものに書き換える
4. TikFinityの「Actions & Events」でWebhookを作成し、送信先URLを
   デプロイしたWorkerのURL(`https://xxx.yyy.workers.dev`)に設定

**注意**: TikFinityはJSON形式ではなく`application/x-www-form-urlencoded`形式で
送ってくるため、Firebaseに直接送っても書き込まれません。必ずこのWorkerを
経由させてください。

## カスタマイズ

- 色・角丸・フォントなどは `style.css` の `:root` にある変数（`--color-accent` など）を
  変更すれば、オーバーレイと管理画面の両方に一括反映されます。
- 1ページあたりの表示枚数やページ切替の間隔を変えたい場合は、`overlay.js` の
  `GIFTS_PER_PAGE` と `PAGE_INTERVAL_MS` を書き換えてください。
- ギフト受信イベント演出の速さ・間隔を変えたい場合は、`overlay.js` の
  `ROULETTE_SPIN_MS`（1回転にかかる時間）/ `ROULETTE_TICK_MS`（切替の細かさ）/
  `ROLL_GAP_MS`（連続時の間隔）/ `EVENT_TAIL_MS`（再生後バナーを消すまでの時間）
  を書き換えてください。
- パフォーマンス優先のため、ガラスパネルの`backdrop-filter`(ぼかし)とギフトカードの
  常時浮遊アニメーションは廃止しています。見た目の華やかさより負荷軽減を優先したい場合は
  他のアニメーション(カード種別の発光、光る演出など)も同様に削れます。

## トラブルシューティング

- オーバーレイ右下に赤字で「接続できません」と出る
  → `firebase-config.js` の値、Realtime Databaseのルール（`streams`が追加されているか）を確認
- 管理画面で保存したのに反映されない
  → `index.html` と `admin.html` で `?game=` の値が一致しているか確認（両方省略なら自動的に一致します）
- ギフト画像が表示されない
  → パスが正しいか、`images/` フォルダにファイルが実際に存在するか確認
- TikFinity連携でギフトを送っても何も起きない
  → まずTikFinityのWebhook送信先を一時的にwebhook.siteに向けて、実際に届いているか・
    `giftName`の値が管理画面のギフト名と完全に一致しているかを確認
- 同時に複数人からギフトが来た時、演出が1件しか再生されない
  → イベントは`streams/{gameId}/events`に追記され続ける仕組みなので、基本的には
    取りこぼされません。それでも起きる場合はCloudflare Worker側のログ
    (ダッシュボードの「Logs」)でエラーが出ていないか確認してください。
  → なお`events`は追記され続けるので、配信を重ねるとFirebase上のデータは
    少しずつ増えていきます。定期的にFirebaseコンソールから`events`ノードを
    手動で削除しても、既存の機能には影響ありません。
