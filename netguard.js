// =====================================================
// 社内ツール 通信ガード netguard.js（2026-09-18）
// 各ツールの <head> に1行（tu.js より前・defer なし）:
//   <script src="https://h02050d-ship-it.github.io/tool-portal/netguard.js"></script>
//
// 目的: 「1回の通信エラーで黙って止まる」構造をなくす
//  1) GAS(script.google.com/macros) への fetch が 404/429/5xx/通信断のとき 2秒・4秒あけて最大3回まで自動再試行
//     - GET は無条件で再試行
//     - POST は「届いたか不明」なので原則再試行しない。ただし 404 は Google の手前で弾かれ＝スクリプト未実行なので再試行する
//  2) それでも失敗したら画面上部に赤い帯で理由を出す（トーストのように消えない・×で閉じる・次に成功したら自動で消える）
//  3) 失敗を計測(tu.php)へ err イベントとして送る（どのツールの・どのactionが・何で失敗したか。入力値は送らない）
// 背景: 2026-09-18 order-desk GAS が断続的に404を返し、送り状デスクの締め一括が無反応→本人が手動で全部やり直した
// =====================================================
(function () {
  'use strict';
  if (!window.fetch || window.__netguard) return;
  window.__netguard = 1;
  var origFetch = window.fetch.bind(window);
  var TARGET = /^https:\/\/script\.google\.com\/macros\//;
  var MAX = 3;
  var EP = 'https://hayazai.com/keisoku/tu.php';

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function actionOf(url) { var m = /[?&]action=([A-Za-z0-9_]+)/.exec(url || ''); return m ? m[1] : ''; }
  function transient(st) { return st === 404 || st === 429 || st >= 500; }

  // ---- 赤帯 ----
  var bar = null;
  function showBar(msg) {
    try {
      if (!document.body) { document.addEventListener('DOMContentLoaded', function () { showBar(msg); }); return; }
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'netguard-bar';
        bar.setAttribute('role', 'alert');
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#c0392b;color:#fff;font:14px/1.5 system-ui,sans-serif;padding:10px 44px 10px 14px;box-shadow:0 2px 8px rgba(0,0,0,.25)';
        var x = document.createElement('button');
        x.textContent = '×';
        x.setAttribute('aria-label', '閉じる');
        x.style.cssText = 'position:absolute;right:8px;top:6px;background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1';
        x.onclick = hideBar;
        var t = document.createElement('div'); t.id = 'netguard-msg';
        bar.appendChild(t); bar.appendChild(x);
        document.body.appendChild(bar);
      }
      bar.querySelector('#netguard-msg').textContent = msg;
      bar.style.display = 'block';
    } catch (e) {}
  }
  function hideBar() { try { if (bar) bar.style.display = 'none'; } catch (e) {} }

  // ---- 計測へ err を1行（入力値なし） ----
  function report(url, why, tries) {
    try {
      var seg = location.pathname.replace(/^\/+/, '').split('/');
      var tool = (location.host.indexOf('github.io') >= 0) ? (seg[0] || 'root') : ('hayazai.com/' + (seg[0] || ''));
      var page = seg.slice(1).join('/') || 'index.html';
      var role = 'staff';
      try { var c = JSON.parse(localStorage.getItem('hayazai_sso_cred') || 'null'); if (/^(h02050d|hayazaimuku)/.test(String((c && (c.email || c.e)) || '').toLowerCase())) role = 'owner'; } catch (e) {}
      var sid = 'na'; try { sid = sessionStorage.getItem('tu_sid') || 'na'; } catch (e) {}
      var body = JSON.stringify({ tool: tool, page: page, role: role, sid: sid, items: [{ e: 'err', l: (why + ' ' + (actionOf(url) || 'gas')).slice(0, 30), n: tries }] });
      origFetch(EP, { method: 'POST', body: body, keepalive: true, mode: 'cors' }).catch(function () {});
    } catch (e) {}
  }

  function fail(url, why, tries) {
    var a = actionOf(url);
    showBar('⚠ サーバーとの通信に' + tries + '回失敗しました（' + why + (a ? '・' + a : '') + '）。少し待ってから、もう一度同じ操作をしてください。直らない時は林まで。');
    report(url, why, tries);
  }

  window.fetch = function (input, init) {
    var isReq = (typeof Request !== 'undefined') && (input instanceof Request);
    var url = isReq ? input.url : String(input || '');
    if (!TARGET.test(url)) return origFetch(input, init);
    var method = String((init && init.method) || (isReq && input.method) || 'GET').toUpperCase();
    var isGet = (method === 'GET' || method === 'HEAD');
    var attempt = 0;
    function make() { return isReq ? input.clone() : input; }   // Request は body を消費するので毎回クローン
    function run() {
      attempt++;
      var p;
      try { p = origFetch(make(), init); } catch (e) { p = Promise.reject(e); }
      return p.then(function (r) {
        var st = r.status;
        if (transient(st) && attempt < MAX && (isGet || st === 404)) return delay(2000 * attempt).then(run);
        if (transient(st)) fail(url, 'HTTP ' + st, attempt);
        else if (st >= 200 && st < 300) hideBar();
        return r;
      }, function (e) {
        if (attempt < MAX && isGet) return delay(2000 * attempt).then(run);
        fail(url, (e && e.name === 'AbortError') ? '中断' : '通信エラー', attempt);
        throw e;
      });
    }
    return run();
  };
})();
