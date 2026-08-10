// GitHub Actions から実行され、data.json の動画IDをもとに
// YouTube Data API v3 で再生回数・いいね数を取得し、
// stats.json(最新値)と history.json(推移の記録)を更新するスクリプト。
// APIキーは環境変数 YOUTUBE_API_KEY (GitHub Secrets) から受け取る。

import { existsSync, readFileSync, writeFileSync } from "fs";

const apiKey = process.env.YOUTUBE_API_KEY;

if (!apiKey) {
  console.error("環境変数 YOUTUBE_API_KEY が設定されていません。GitHubのSecretsを確認してください。");
  process.exit(1);
}

const data = JSON.parse(readFileSync("data.json", "utf-8"));

// normalId / shortsId をすべて集めて重複を除く
const idSet = new Set();
data.forEach((p) => {
  if (p.normalId) idSet.add(p.normalId);
  if (p.shortsId) idSet.add(p.shortsId);
});
const ids = [...idSet];

if (ids.length === 0) {
  console.log("動画IDが1件も設定されていないため、取得をスキップします。");
  writeFileSync(
    "stats.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), byId: {} }, null, 2)
  );
  process.exit(0);
}

const byId = {};
const chunkSize = 50; // YouTube API の id パラメータは最大50件まで

for (let i = 0; i < ids.length; i += chunkSize) {
  const chunk = ids.slice(i, i + chunkSize);
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(",")}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API エラー (HTTP ${res.status}): ${body}`);
  }

  const json = await res.json();
  (json.items || []).forEach((item) => {
    byId[item.id] = {
      viewCount: item.statistics.viewCount,
      likeCount: item.statistics.likeCount,
    };
  });
}

const now = new Date().toISOString();

const output = {
  updatedAt: now,
  byId,
};

writeFileSync("stats.json", JSON.stringify(output, null, 2));
console.log(`stats.json を更新しました(${Object.keys(byId).length}件)`);

// ---- history.json(推移データ)に今回分を追記 ----
// 形式: { "動画ID": [ [取得時刻, 再生数, いいね数], ... ] }
let history = {};
if (existsSync("history.json")) {
  try {
    history = JSON.parse(readFileSync("history.json", "utf-8"));
  } catch (e) {
    console.error("history.json の読み込みに失敗したため、新規作成します。", e.message);
    history = {};
  }
}

Object.entries(byId).forEach(([vid, stat]) => {
  if (!history[vid]) history[vid] = [];
  history[vid].push([now, Number(stat.viewCount), Number(stat.likeCount)]);
});

writeFileSync("history.json", JSON.stringify(history));
console.log(`history.json に追記しました(${Object.keys(byId).length}件分)`);
