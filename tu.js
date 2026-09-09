// =====================================================
// 社内ツール 利用計測 tu.js（tool usage）
// 各ツールの <head> に1行: <script src="https://h02050d-ship-it.github.io/tool-portal/tu.js" defer></script>
// 送るもの: ツール名・画面・実滞在秒・押したボタンの表示文字と回数・「開始→確定」までの秒数・やり直し回数
// 送らないもの: キー入力の中身・入力値・マウス座標・個人名（role は owner/staff の2値だけ）
// 送信先: https://hayazai.com/keisoku/tu.php → 週1の「ツール改善ループ」が読む
// 自分を除外したい時: localStorage.setItem('tu_optout','1')
// =====================================================
(function () {
  'use strict';
  if (navigator.webdriver) return;
  try { if (localStorage.getItem('tu_optout') === '1') return; } catch (e) {}
  var EP = 'https://hayazai.com/keisoku/tu.php';
  var seg = location.pathname.replace(/^\/+/, '').split('/');
  var tool = (location.host.indexOf('github.io') >= 0) ? (seg[0] || 'root') : ('hayazai.com/' + (seg[0] || ''));
  var page = seg.slice(1).join('/') || 'index.html';
  if (location.host.indexOf('github.io') < 0) page = seg.slice(1).join('/') || 'index';
  var role = 'staff';
  try {
    var c = JSON.parse(localStorage.getItem('hayazai_sso_cred') || 'null');
    var em = String((c && (c.email || c.e)) || '').toLowerCase();
    if (/^(h02050d|hayazaimuku)/.test(em)) role = 'owner';
  } catch (e) {}
  var sid = 'na';
  try { sid = sessionStorage.getItem('tu_sid'); if (!sid) { sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem('tu_sid', sid); } } catch (e) {}

  var COMMIT = /確定|登録|保存|送信|発行|発注|作成|更新|出荷完了|完了|反映|取込|実行|印刷|ダウンロード/;
  var UNDO = /戻る|取消|取り消|キャンセル|削除|修正|やり直|クリア|リセット/;

  var items = [{ e: 'open', v: (screen && screen.width) || 0 }];
  var clicks = {}, nClick = 0, nCommit = 0;
  var t0 = Date.now(), firstAct = 0, lastCommit = 0;
  var accum = 0, visStart = Date.now();

  function label(el) {
    var t = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || el.value || el.innerText || el.textContent || '';
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 30);
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('button,a,[role=button],input[type=button],input[type=submit],summary,.btn,.tab,.chip') : null;
    var now = Date.now();
    if (!firstAct) firstAct = now;
    if (!el) return;
    var l = label(el); if (!l) return;
    clicks[l] = (clicks[l] || 0) + 1; nClick++;
    if (COMMIT.test(l)) {
      var base = lastCommit || firstAct || t0;
      items.push({ e: 'commit', l: l, v: Math.round((now - base) / 1000) });
      lastCommit = now; nCommit++;
    } else if (UNDO.test(l)) {
      items.push({ e: 'undo', l: l });
    }
  }, true);
  ['keydown', 'input', 'change'].forEach(function (n) { document.addEventListener(n, function () { if (!firstAct) firstAct = Date.now(); }, true); });

  function flush(final) {
    Object.keys(clicks).forEach(function (l) { items.push({ e: 'click', l: l, n: clicks[l] }); });
    clicks = {};
    if (final) items.push({ e: 'leave', v: Math.min(Math.round(accum / 1000), 86400), n: nCommit, c: nClick });
    if (!items.length) return;
    var body = JSON.stringify({ tool: tool, page: page, role: role, sid: sid, items: items });
    items = [];
    try { if (navigator.sendBeacon && navigator.sendBeacon(EP, new Blob([body], { type: 'text/plain' }))) return; } catch (e) {}
    try { fetch(EP, { method: 'POST', body: body, keepalive: true, mode: 'cors' }).catch(function () {}); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { accum += Date.now() - visStart; flush(false); } else { visStart = Date.now(); }
  });
  window.addEventListener('pagehide', function () {
    if (!document.hidden) { accum += Date.now() - visStart; visStart = Date.now(); }
    flush(true);
  });
  setInterval(function () { if (items.length || Object.keys(clicks).length) flush(false); }, 60000);
  setTimeout(function () { flush(false); }, 1500); // open を早めに送る
})();
