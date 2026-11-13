/* =========================================================================
 * carselect.js — 开局选车
 *
 * 设计要点：
 *   · 只在「开局」这一刻决定驾驶权，不删任何车：两辆车仍各自留在场景里，
 *     未选中的那辆只是隐藏（visible=false），局内 V 换回来立刻出现。
 *     V / L3 / 触屏「换车」在局内照常可用。
 *   · 选车期间 main.js 会把游戏输入冻结成 idle（渲染和物理循环照跑），
 *     所以车不会自己动、计时不会起，同时不影响任何已有的验收探针。
 *   · 三种通道：键盘（←→/AD/1·2/Enter·Space）、手柄（十字键或左摇杆 /
 *     A 或 START）、鼠标·触屏（点卡片 / 再点一次 / 出发按钮）。
 *   · 确认在真实用户手势里执行 → 顺手解锁 Web Audio 并打火；
 *     手柄按键不算浏览器手势，仍可用 M 开启音效（界面有提示）。
 *   · 选过的车存 localStorage，下次开局默认高亮它。
 * ========================================================================= */
(function () {
  'use strict';
  var CR = window.CR;
  var CS = CR.CarSelect = {};

  CS.open = false;          /* main.js 的输入门禁读这个标志 */
  CS.ready = false;
  CS.active = 0;            /* 当前高亮的车型索引 */
  CS.picked = null;         /* 最终选中的车型，未选时为 null */

  var STORE = 'coastal.carSelect.v1';
  var AUTO_MS = 15000;      /* 未操作兜底：自动用高亮车出发，避免嵌入页永远卡住 */
  var root = null, cards = [], goBtn = null, tipEl = null;
  var pollTimer = 0, autoTimer = 0, lastTap = -1, lastTapAt = 0;
  var prev = { left: false, right: false, ok: false };

  var CSS = [
    '.cs-root{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;',
    'align-items:center;justify-content:center;gap:20px;padding:24px;box-sizing:border-box;',
    'color:#eef1f5;background:radial-gradient(ellipse at 50% 38%,rgba(14,17,26,.60),rgba(7,9,15,.91));',
    'backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);',
    'font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
    'opacity:1;transition:opacity .55s ease}',
    '.cs-root.cs-hide{opacity:0;pointer-events:none}',
    '.cs-head{text-align:center}',
    '.cs-kicker{margin:0;font-size:11px;letter-spacing:.44em;opacity:.52}',
    '.cs-title{margin:9px 0 0;font-size:27px;font-weight:300;letter-spacing:.18em}',
    '.cs-note{margin:8px 0 0;font-size:11px;opacity:.55;letter-spacing:.06em}',
    '.cs-cards{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}',
    '.cs-card{width:298px;box-sizing:border-box;padding:18px 20px 16px;border-radius:16px;',
    'background:rgba(25,28,38,.74);border:1px solid rgba(255,255,255,.11);cursor:pointer;',
    'user-select:none;-webkit-tap-highlight-color:transparent;',
    'transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}',
    '.cs-card.sel{border-color:rgba(255,152,92,.9);background:rgba(38,31,30,.82);',
    'box-shadow:0 0 0 1px rgba(255,152,92,.32),0 18px 48px rgba(0,0,0,.46);transform:translateY(-5px)}',
    '.cs-no{font-size:10px;letter-spacing:.24em;opacity:.42}',
    '.cs-name{margin-top:7px;font-size:19px;font-weight:500;letter-spacing:.06em}',
    '.cs-tag{margin-top:3px;font-size:11px;color:#ffc79c;opacity:.9}',
    '.cs-desc{margin:10px 0 14px;font-size:11px;opacity:.58;min-height:32px}',
    '.cs-row{display:flex;align-items:center;gap:9px;margin-bottom:9px}',
    '.cs-lab{width:56px;flex:none;font-size:10px;opacity:.62;letter-spacing:.06em}',
    '.cs-bar{flex:1;height:4px;border-radius:3px;background:rgba(255,255,255,.11);overflow:hidden}',
    '.cs-bar i{display:block;height:100%;border-radius:3px;',
    'background:linear-gradient(90deg,#ffc07a,#ff6a3d)}',
    '.cs-val{width:42px;flex:none;text-align:right;font-size:10px;opacity:.72;font-variant-numeric:tabular-nums}',
    '.cs-gear{margin-top:13px;padding-top:11px;border-top:1px solid rgba(255,255,255,.09);',
    'font-size:11px;opacity:.76}',
    '.cs-key{margin-top:7px;font-size:10px;opacity:.44;letter-spacing:.08em}',
    '.cs-foot{display:flex;flex-direction:column;align-items:center;gap:12px}',
    '.cs-go{padding:11px 30px;border-radius:999px;border:1px solid rgba(255,152,92,.66);',
    'background:rgba(255,120,60,.17);color:#ffdcc2;font:13px/1 inherit;letter-spacing:.2em;cursor:pointer;',
    'transition:background .18s ease,transform .18s ease}',
    '.cs-go:hover{background:rgba(255,120,60,.32);transform:translateY(-1px)}',
    '.cs-keys{font-size:11px;opacity:.56;text-align:center;letter-spacing:.04em}',
    '.cs-keys b{font-weight:600;opacity:.92;color:#ffd3b3}',
    '.cs-pad{font-size:10px;opacity:.36;text-align:center}',
    '@media (max-width:760px){',
    ' .cs-title{font-size:21px}.cs-cards{flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto}',
    ' .cs-card{width:min(86vw,340px);padding:13px 16px}.cs-desc{min-height:0;margin:7px 0 10px}',
    ' .cs-row{margin-bottom:6px}.cs-keys{font-size:10px;line-height:1.7}',
    ' .cs-root{gap:14px}}'
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 参数条：所有车共用同一个归一化基准（取全部车型最大值），横向可比 */
  var CAR_META = [
    { tag: '程序化生成 · 均衡设定',
      desc: '轻快好上手，松油门滑行更久，漂移更灵活' },
    { tag: 'Blender 模型 · F1 高抓地',
      desc: '红白涂装、6 速手动、强引擎制动，刷圈速取向' },
    { tag: 'Blender 模型 · 黑金涂装',
      desc: 'Lotus E20，后驱走线取向，转向比 MP4/4 更灵活' }
  ];

  function specs() {
    var T = (CR.Car && CR.Car.TUNES) || [];
    function mx(k) {
      var m = 1e-6;
      for (var i = 0; i < T.length; i++) m = Math.max(m, Number(T[i][k]) || 0);
      return m;
    }
    var rows = [
      { k: 'engineVmax',    lab: '极速',   unit: '' },
      { k: 'engineThrust',  lab: '加速',   unit: '' },
      { k: 'gripNormal',    lab: '抓地',   unit: '' },
      { k: 'engineBrake',   lab: '倒拖',   unit: '' }
    ];
    return T.map(function (t, i) {
      var html = rows.map(function (r) {
        var v = Number(t[r.k]) || 0, pct = Math.max(7, Math.min(100, v / mx(r.k) * 100));
        return '<div class="cs-row"><span class="cs-lab">' + r.lab + '</span>' +
               '<span class="cs-bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
               '<span class="cs-val">' + (Math.round(v * 10) / 10) + r.unit + '</span></div>';
      }).join('');
      var meta = CAR_META[i] || { tag: 'Blender 模型', desc: '' };
      return {
        name: t.name || ('车型 ' + (i + 1)),
        tag: meta.tag,
        desc: meta.desc,
        gear: t.geared ? '6 速手动 · 手柄 A 升档 / X 降档' : '自动档 · 无需换档',
        bars: html,
        key: '按 <b>' + (i + 1) + '</b> 选择'
      };
    });
  }

  function render() {
    var S = specs();
    return [
      '<div class="cs-head">',
      '  <p class="cs-kicker">COASTAL TIME TRIAL</p>',
      '  <h2 class="cs-title">选择你的座驾</h2>',
      '  <p class="cs-note">选一辆开始驾驶 · 未选中的车会隐藏，局内按 V 随时换乘</p>',
      '</div>',
      '<div class="cs-cards">',
      S.map(function (c, i) {
        return '<div class="cs-card" data-i="' + i + '">' +
          '<div class="cs-no">0' + (i + 1) + ' / GARAGE</div>' +
          '<div class="cs-name">' + esc(c.name) + '</div>' +
          '<div class="cs-tag">' + esc(c.tag) + '</div>' +
          '<div class="cs-desc">' + esc(c.desc) + '</div>' +
          c.bars +
          '<div class="cs-gear">' + esc(c.gear) + '</div>' +
          '<div class="cs-key">' + c.key + '　·　点击卡片选中，再点一次直接出发</div>' +
        '</div>';
      }).join(''),
      '</div>',
      '<div class="cs-foot">',
      '  <button type="button" class="cs-go" id="cs-go">开始驾驶　▶</button>',
      '  <div class="cs-keys"><b>← →</b> / <b>A D</b> 选择　<b>1</b> <b>2</b> <b>3</b> 直选　' +
      '<b>ENTER</b> / <b>SPACE</b> 出发<br>' +
      '手柄：十字键或左摇杆选择，<b>A</b> / <b>START</b> 出发　·　音效按 <b>M</b> 开关</div>',
      '  <div class="cs-pad" id="cs-pad">未检测到手柄（键盘 / 点击同样可选）</div>',
      '</div>'
    ].join('');
  }

  function select(i) {
    var n = (CR.Car && CR.Car.TUNES && CR.Car.TUNES.length) || 2;
    CS.active = ((i % n) + n) % n;
    for (var k = 0; k < cards.length; k++) {
      cards[k].className = 'cs-card' + (k === CS.active ? ' sel' : '');
    }
    /* 高亮即预览：只切渲染可见性，不动 active / 状态 / 圈速。
       未选中的那辆从一开始就隐藏，确认后 setActive 会再收口一次。 */
    if (CR.Garage && CR.Garage.showOnly) CR.Garage.showOnly(CS.active);
    if (goBtn) goBtn.textContent = '驾驶「' + specs()[CS.active].name + '」　▶';
  }

  function move(d) { select(CS.active + d); resetAuto(); }

  function resetAuto() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
    if (!CS.open) return;
    autoTimer = setTimeout(function () {
      if (CS.open) confirm(true);
    }, AUTO_MS);
  }

  function confirm(fromAuto) {
    if (!CS.open) return CS.picked;
    CS.open = false;
    var i = CS.active;
    CS.picked = i;

    try { localStorage.setItem(STORE, String(i)); } catch (e) { /* file:// 下可能禁用 */ }

    /* 只切驾驶权（setActive 内部会 showOnly）：两辆车的位置 / 圈速槽由 Garage.setup 摆好，不调 Car.reset
       （reset(false) 会把当前车挪回车0 的发车线，破坏「两车分开」） */
    if (CR.Garage && CR.Garage.setActive) CR.Garage.setActive(i);
    if (CR.Hud && CR.Hud.restart) CR.Hud.restart();
    if (CR.Cam && CR.Cam.snap) CR.Cam.snap();
    if (CR.Input && CR.Input.clearAll) CR.Input.clearAll();

    /* 键盘 / 点击是有效用户手势，这里解锁音频并打火；手柄按键不算手势，
       resume 可能被浏览器忽略，但不会抛错，之后按 M 仍可开启 */
    try { if (CR.Audio && CR.Audio.setEnabled) CR.Audio.setEnabled(true); } catch (e) {}

    /* embed 的透明点击层会挡住局内点击，选完一并撤掉 */
    var tap = document.getElementById('embed-tap');
    if (tap && tap.parentNode) tap.parentNode.removeChild(tap);
    var boot = document.getElementById('hud-boot');
    if (boot && boot.className !== 'error') boot.className = 'gone';
    try { window.focus(); } catch (e) {}

    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }

    if (root) {
      root.className = 'cs-root cs-hide';
      setTimeout(function () {
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
      }, 600);
    }
    return i;
  }

  /* 只收菜单向按键；W / S 是油门与刹车，选车时不赋予「切换」语义，
     放行即可（门禁会把物理输入冻结成 idle，确认时 clearAll 一并清掉）。 */
  var KEY_LEFT  = { ArrowLeft: 1, KeyA: 1, ArrowUp: 1 };
  var KEY_RIGHT = { ArrowRight: 1, KeyD: 1, ArrowDown: 1 };
  var KEY_OK    = { Enter: 1, NumpadEnter: 1, Space: 1 };
  var KEY_ALL   = { ArrowLeft: 1, KeyA: 1, ArrowUp: 1,
                    ArrowRight: 1, KeyD: 1, ArrowDown: 1,
                    Enter: 1, NumpadEnter: 1, Space: 1,
                    Digit1: 1, Digit2: 1, Digit3: 1 };

  function onKeyDown(e) {
    if (!CS.open) return;
    var c = e.code;
    if (!KEY_ALL[c]) return;                    /* 其它键（F5/Tab…）照常放行 */
    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    else e.stopPropagation();
    if (e.repeat) return;
    if (KEY_LEFT[c]) move(-1);
    else if (KEY_RIGHT[c]) move(1);
    else if (c === 'Digit1') { select(0); resetAuto(); }
    else if (c === 'Digit2') { select(1); resetAuto(); }
    else if (c === 'Digit3') { select(2); resetAuto(); }
    else if (KEY_OK[c]) confirm(false);
  }
  function onKeyUp(e) {
    if (!CS.open || !KEY_ALL[e.code]) return;
    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    else e.stopPropagation();
  }

  function pad() {
    if (!navigator.getGamepads) return null;
    var ps = navigator.getGamepads();
    if (!ps) return null;
    for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].connected) return ps[i];
    return null;
  }

  function pollPad() {
    if (!CS.open) return;
    var p = pad(), b = p && p.buttons || [], ax = p && p.axes || [];
    var left  = !!((b[14] && b[14].pressed) || ax[0] < -0.6);
    var right = !!((b[15] && b[15].pressed) || ax[0] > 0.6);
    var ok    = !!((b[0] && b[0].pressed) || (b[9] && b[9].pressed));
    if (tipEl) tipEl.textContent = p
      ? '手柄已连接：十字键 / 左摇杆选择，A 或 START 出发'
      : '未检测到手柄（键盘 / 点击同样可选）';
    if (left && !prev.left) move(-1);
    if (right && !prev.right) move(1);
    if (ok && !prev.ok) confirm(false);
    prev.left = left; prev.right = right; prev.ok = ok;
  }

  CS.init = function () {
    if (CS.ready) return CS;
    var style = document.createElement('style');
    style.id = 'cs-style'; style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.id = 'cs-select'; root.className = 'cs-root';
    root.innerHTML = render();
    document.body.appendChild(root);

    cards = [].slice.call(root.querySelectorAll('.cs-card'));
    goBtn = root.querySelector('#cs-go');
    tipEl = root.querySelector('#cs-pad');

    cards.forEach(function (el, i) {
      el.addEventListener('pointerdown', function (e) {
        if (!CS.open) return;
        if (e && e.preventDefault) e.preventDefault();
        var now = Date.now();
        if (i === CS.active && i === lastTap && now - lastTapAt < 900) { confirm(false); return; }
        lastTap = i; lastTapAt = now;
        select(i); resetAuto();
      });
    });
    if (goBtn) goBtn.addEventListener('pointerdown', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      confirm(false);
    });

    var last = 0;
    try {
      var v = localStorage.getItem(STORE);
      if (v !== null) last = parseInt(v, 10) || 0;
    } catch (e) { /* 忽略 */ }
    select(last);

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    pollTimer = setInterval(pollPad, 60);
    pollPad();

    /* 原启动遮罩交给选车层，避免两层文字重叠 */
    var boot = document.getElementById('hud-boot');
    if (boot && boot.className !== 'error') boot.className = 'gone';

    CS.open = true;
    CS.ready = true;
    resetAuto();
    return CS;
  };

  /* 控制台 / 无头验收直接选车：CR.CarSelect.pick(1) */
  CS.pick = function (i) {
    if (!CS.ready) return (CR.Garage && CR.Garage.setActive) ? CR.Garage.setActive(i) : i;
    select(i);
    return confirm(false);
  };
})();
