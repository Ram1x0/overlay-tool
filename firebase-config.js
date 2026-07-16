// ==========================================================
// Firebase接続設定
// ----------------------------------------------------------
// カウンター企画と同じFirebaseプロジェクト(live-counter-69c4e)を
// 使い回しています。Realtime Database内のパスが streams/ 以下に
// なるので、counters/ 以下のカウンターとは衝突しません。
// ==========================================================
window.firebaseConfig = {
  apiKey: "AIzaSyBxezSwvcXUfAubLe3Y3Jmocq7bEbTo2pU",
  authDomain: "live-counter-69c4e.firebaseapp.com",
  databaseURL: "https://live-counter-69c4e-default-rtdb.firebaseio.com",
  projectId: "live-counter-69c4e",
  storageBucket: "live-counter-69c4e.firebasestorage.app",
  messagingSenderId: "721899438171",
  appId: "1:721899438171:web:0706b6ded97554ffee7f7e",
  measurementId: "G-MWNSJDEF7T"
};
