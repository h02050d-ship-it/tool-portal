// =====================================================
// 社内ツール 要望・不具合ボタン yobo.js（2026-09-18）
// 各ツールの <head> に1行: <script src="https://h02050d-ship-it.github.io/tool-portal/yobo.js" defer></script>
// 右下に「💬 要望・不具合」ボタンを出し、送信するとFAXデスクGAS(yb_submit)のシートに積まれる。
// 大樹さんPCの1分監視(yobo-fixer)がClaudeを起動して直し、結果・問題は info@hayazai.com へメール。
// 送るもの: ツール名・URL・種別・内容・名前(各PCの🖥使用者設定)・画面サイズ・直近のJSエラー
// 送らないもの: 入力値・画面の中身
// =====================================================
(function () {
  'use strict';
  if (navigator.webdriver) return;
  if (window.__yoboLoaded) return; window.__yoboLoaded = true;
  var EP = 'https://script.google.com/macros/s/AKfycbxQCf2HVfLjUAzOYXJHzzhquN3zkNrUAgcusg3mH5uhlm-UySsDYXBChhLjZGI2DyecIg/exec';
  var seg = location.pathname.replace(/^\/+/, '').split('/');
  var tool = (location.host.indexOf('github.io') >= 0) ? (seg[0] || 'root') : (location.host + '/' + (seg[0] || ''));
  var title = (document.title || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  // 直近のJSエラーを最大5件だけ覚えておく（原因調査用）
  var errs = [];
  window.addEventListener('error', function (e) {
    try { errs.push((e.message || '') + ' @' + (e.filename || '').split('/').pop() + ':' + (e.lineno || 0)); if (errs.length > 5) errs.shift(); } catch (x) {}
  });
  window.addEventListener('unhandledrejection', function (e) {
    try { errs.push('promise: ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 120)); if (errs.length > 5) errs.shift(); } catch (x) {}
  });

  function cred() {
    var keys = ['hayazai_sso_cred', 'hayazai_board_cred', 'hayazai_kakou_cred', 'hayazai_orderdesk_cred', 'hayazai_faxdesk_cred'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var c = JSON.parse(localStorage.getItem(keys[i]) || 'null');
        if (c && (c.email || c.e) && (c.pass || c.p)) return { email: c.email || c.e, pass: c.pass || c.p };
      } catch (e) {}
    }
    return null;
  }
  function operator() {
    try { return (localStorage.getItem('hayazai_operator') || '').trim(); } catch (e) { return ''; }
  }

  var css = '' +
    '#yobo-btn{position:fixed;right:14px;bottom:14px;z-index:99990;background:#fff;color:#1a56db;border:1px solid #c7d2fe;border-radius:999px;padding:7px 12px;font:13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.12);cursor:pointer;opacity:.9}' +
    '#yobo-btn:hover{opacity:1;background:#eef2ff}' +
    '@media print{#yobo-btn,#yobo-bg{display:none!important}}' +
    '#yobo-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:99991;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#yobo-box{background:#fff;color:#222;border-radius:12px;width:100%;max-width:460px;padding:18px 18px 14px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25)}' +
    '#yobo-box h3{margin:0 0 6px;font-size:16px}' +
    '#yobo-box .sub{color:#666;font-size:12px;margin-bottom:10px}' +
    '#yobo-box label.k{display:inline-flex;align-items:center;gap:4px;margin-right:14px;cursor:pointer}' +
    '#yobo-box textarea{width:100%;box-sizing:border-box;min-height:110px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:14px/1.5 inherit;resize:vertical}' +
    '#yobo-box input[type=text]{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font:14px inherit}' +
    '#yobo-box .row{margin:8px 0}' +
    '#yobo-box .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}' +
    '#yobo-box button{border:0;border-radius:8px;padding:8px 14px;font:14px inherit;cursor:pointer}' +
    '#yobo-box .go{background:#1a56db;color:#fff}#yobo-box .go:disabled{opacity:.5;cursor:default}' +
    '#yobo-box .no{background:#eee;color:#333}' +
    '#yobo-box .done{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;margin-top:6px}' +
    '#yobo-box .err{color:#b91c1c;font-size:12px;margin-top:6px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button');
  btn.id = 'yobo-btn'; btn.type = 'button'; btn.textContent = '💬 要望・不具合'; btn.title = 'このツールの不具合や変更したいことをClaudeに送る';
  btn.addEventListener('click', open);
  function mount() { if (document.body) document.body.appendChild(btn); else setTimeout(mount, 200); }
  mount();

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function open() {
    if (document.getElementById('yobo-bg')) return;
    var bg = document.createElement('div'); bg.id = 'yobo-bg';
    var name = operator();
    bg.innerHTML =
      '<div id="yobo-box" role="dialog" aria-label="要望・不具合">' +
      '<h3>💬 要望・不具合を送る</h3>' +
      '<div class="sub">' + esc(title || tool) + '　この画面のことをそのまま書いてください</div>' +
      '<div class="row"><label class="k"><input type="radio" name="yobo-kind" value="不具合" checked>不具合(動かない・おかしい)</label><label class="k"><input type="radio" name="yobo-kind" value="変更したい">変更したい(こうしてほしい)</label></div>' +
      '<div class="row"><textarea id="yobo-text" placeholder="例: 保存ボタンを押しても保存されない／数量の欄を大きくしてほしい"></textarea></div>' +
      '<div class="row"><input type="text" id="yobo-name" placeholder="名前(任意)" value="' + esc(name) + '"></div>' +
      '<div class="err" id="yobo-err"></div>' +
      '<div class="btns"><button type="button" class="no" id="yobo-no">閉じる</button><button type="button" class="go" id="yobo-go">送信</button></div>' +
      '</div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.getElementById('yobo-no').addEventListener('click', close);
    document.getElementById('yobo-go').addEventListener('click', send);
    setTimeout(function () { var t = document.getElementById('yobo-text'); if (t) t.focus(); }, 50);
    function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); }

    function send() {
      var text = (document.getElementById('yobo-text').value || '').trim();
      var errEl = document.getElementById('yobo-err');
      if (!text) { errEl.textContent = '内容を書いてください'; return; }
      var c = cred();
      if (!c) { errEl.textContent = 'ログイン情報が見つかりません。ツールにログインしてからもう一度お願いします'; return; }
      var kind = (document.querySelector('input[name=yobo-kind]:checked') || {}).value || '不具合';
      var nm = (document.getElementById('yobo-name').value || '').trim();
      try { if (nm) localStorage.setItem('hayazai_operator', nm); } catch (e) {}
      var go = document.getElementById('yobo-go'); go.disabled = true; go.textContent = '送信中…'; errEl.textContent = '';
      var body = {
        action: 'yb_submit', email: c.email, pass: c.pass,
        tool: tool, url: location.href.slice(0, 300), kind: kind, text: text, name: nm,
        env: { title: title, ua: navigator.userAgent.slice(0, 160), screen: (window.innerWidth + 'x' + window.innerHeight), errors: errs.slice(-5), at: new Date().toISOString() }
      };
      fetch(EP, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || '送信できませんでした');
          var box = document.getElementById('yobo-box');
          var msg = (kind === '不具合')
            ? '受け付けました。今から直します。<br>終わったら、または問題があれば <b>info@hayazai.com</b> にメールします。'
            : '受け付けました。内容を確認して対応します。<br>結果は <b>info@hayazai.com</b> にメールします。';
          box.innerHTML = '<h3>💬 送信しました（#' + esc(j.id) + '）</h3><div class="done">' + msg + '</div>' +
            '<div class="btns"><button type="button" class="no" id="yobo-ok">閉じる</button></div>';
          document.getElementById('yobo-ok').addEventListener('click', close);
        })
        .catch(function (e) {
          go.disabled = false; go.textContent = '送信';
          errEl.textContent = '送信できませんでした(' + (e && e.message ? e.message : e) + ')。少し待ってもう一度お願いします';
        });
    }
  }
})();
