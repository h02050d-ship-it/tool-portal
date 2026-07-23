#!/usr/bin/env node
/**
 * tool-portal 自動登録スクリプト
 * Claudeで新しい業務ツールを作って公開したら、最後にこれを1回実行すれば
 * 「林材木店 社内ツール集」(https://h02050d-ship-it.github.io/tool-portal/) に自動登録される。
 *
 * 使い方（tool-portal フォルダ内で実行）:
 *   node register-tool.mjs --name "ツール名" --url "https://h02050d-ship-it.github.io/xxx/" \
 *        --icon "🔔" --desc "〜できる・〜を防げる（メリット重視の一文）" --cat "管理・タスク"
 *
 * オプション:
 *   --cat       カテゴリ名（既定:「管理・タスク」）。無ければ新規作成。
 *   --catemoji  新規カテゴリ作成時の絵文字（既定: 📦）
 *   --nopush    gitコミット/プッシュをせずindex.html編集だけ
 *
 * 動作: URL重複なら何もしない(冪等) / REMOVED_URLS掲載は拒否 / SEED_VERSION自動+1 /
 *        git add+commit+push / 本番URLが200になり新ツールが載るまでポーリング確認。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DIR = import.meta.dirname;
const FILE = path.join(DIR, 'index.html');
const PORTAL = 'https://h02050d-ship-it.github.io/tool-portal/';

// ---- 引数パース ----
const a = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith('--')) {
    const key = k.slice(2);
    const nxt = process.argv[i + 1];
    if (nxt === undefined || nxt.startsWith('--')) a[key] = true;      // フラグ
    else { a[key] = nxt; i++; }
  }
}
const name = a.name, url = a.url;
const icon = a.icon || '🔗';
const desc = a.desc || '';
const cat  = a.cat  || '管理・タスク';
const catemoji = a.catemoji || '📦';
if (!name || !url) {
  console.error('❌ 必須: --name と --url');
  console.error('   例: node register-tool.mjs --name "社内通知設定" --url "https://h02050d-ship-it.github.io/notify-settings/" --icon "📣" --desc "..." --cat "管理・タスク"');
  process.exit(1);
}

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').trim();
const rxEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = u => String(u).replace(/\/+$/, '');

let html = fs.readFileSync(FILE, 'utf8');

// ---- REMOVED_URLS チェック ----
const rmBlock = (html.match(/REMOVED_URLS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
const removed = [...rmBlock.matchAll(/"([^"]+)"/g)].map(m => norm(m[1]));
if (removed.includes(norm(url))) {
  console.error('⛔ このURLは REMOVED_URLS に登録されています（意図的に外したツール）。登録を中止:', url);
  process.exit(2);
}

// ---- 重複チェック（冪等）----
if (html.includes(`url:"${url}"`) || html.includes(`url:"${norm(url)}"`) || html.includes(`url:"${norm(url)}/"`)) {
  console.log('✓ 既に登録済みのため何もしません:', url);
  process.exit(0);
}

// ---- 挿入する1行 ----
const line = `      {id:uid(), name:"${esc(name)}", url:"${esc(url)}", desc:"${esc(desc)}", icon:"${esc(icon)}"},`;

// ---- カテゴリ探索して挿入 ----
const catOpenRe = new RegExp(`(name:"${rxEsc(cat)}",\\s*tools:\\[[^\\n]*\\n)`);
if (catOpenRe.test(html)) {
  html = html.replace(catOpenRe, `$1${line}\n`);
  console.log(`→ カテゴリ「${cat}」に追加`);
} else {
  // 新規カテゴリを cats:[ ... ] の末尾に作成
  const newCat =
`    {id:uid(), emoji:"${esc(catemoji)}", name:"${esc(cat)}", tools:[\n${line}\n    ]},\n`;
  // cats:[ に対応する閉じ "  ]" の直前へ差し込む（DEFAULT.cats の閉じ）
  const closeRe = /(\n  \]\s*\n};)/;
  if (!closeRe.test(html)) { console.error('❌ cats配列の終端を特定できませんでした。手動で追加してください。'); process.exit(3); }
  html = html.replace(closeRe, `${newCat}$1`);
  console.log(`→ 新規カテゴリ「${cat}」を作成して追加`);
}

// ---- SEED_VERSION +1 ----
html = html.replace(/(const\s+SEED_VERSION\s*=\s*)(\d+)/, (m, p, n) => {
  const nv = Number(n) + 1; console.log(`→ SEED_VERSION ${n} → ${nv}`); return p + nv;
});

fs.writeFileSync(FILE, html, 'utf8');
console.log('✓ index.html 更新:', name);

if (a.nopush) { console.log('（--nopush 指定：git操作はスキップ）'); process.exit(0); }

// ---- git commit + push ----
const git = c => execSync(c, { cwd: DIR, stdio: 'pipe' }).toString();
try {
  git('git add index.html');
  git(`git -c user.email="h02050d@gmail.com" -c user.name="hayazai" commit -m "ツール追加: ${esc(name)}"`);
  git('git push');
  console.log('✓ git push 完了');
} catch (e) {
  console.error('⚠ git操作でエラー:', (e.stdout||e.stderr||e).toString().slice(0, 300));
  process.exit(4);
}

// ---- 本番反映を200＋新ツール掲載で確認 ----
console.log('… GitHub Pages 反映を確認中（最大4分）');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 24; i++) {
  try {
    const r = await fetch(PORTAL, { cache: 'no-store' });
    if (r.status === 200) {
      const t = await r.text();
      if (t.includes(`url:"${url}"`)) { ok = true; break; }
    }
  } catch (e) {}
  await sleep(10000);
}
console.log(ok ? `✅ 反映確認OK → ${PORTAL}` : `⚠ まだ反映未確認（数分後にCtrl+F5で確認を） → ${PORTAL}`);
process.exit(ok ? 0 : 5);
