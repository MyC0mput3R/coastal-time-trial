/* =========================================================================
 * gearbox.js — MP4/4 专属 6 速变速箱（手动换档为手柄独占）
 *
 *   · 仅对当前驾驶 MP4/4（Garage.active===1）生效，原厂车完全不参与。
 *   · 手柄 A(btn0) 升档 / X(btn2) 降档；键盘与触屏没有换档键。
 *     没接手柄时自动档（保证键盘玩家也能跑满极速），接了手柄即手动档。
 *   · 每档有扭矩倍率 torque 与该档极速阈值 cap：低档起步猛但很快断油，
 *     必须升档才跑得快；高档极速高但起步肉。换档有 0.12s 扭矩中断 + 震动。
 *   · 档位显示在速度表上方，接近断油时提示升档；切回原厂车自动隐藏。
 * ========================================================================= */
(function () {
  'use strict';
  var CR = window.CR;
  var G = CR.Gear = {};

  /* 6 档：torque 越大起步越猛，cap 为该档推力归零速度 (m/s) */
  G.RATIOS = [
    { n: 1, torque: 1.70, cap: 26 },
    { n: 2, torque: 1.42, cap: 40 },
    { n: 3, torque: 1.20, cap: 54 },
    { n: 4, torque: 1.04, cap: 68 },
    { n: 5, torque: 0.92, cap: 82 },
    { n: 6, torque: 0.82, cap: 98 }
  ];

  G.gear = 3;              /* 1-based */
  G.manual = false;        /* 有手柄时为手动档 */
  G.cut = 0;               /* 换档断油剩余秒数 */
  G.ready = false;
  G.visible = false;

  var el = null, elNum = null, elHint = null, flashT = 0;

  function spec() { return G.RATIOS[G.gear - 1]; }

  /* 物理层每个子步调用：返回当前档的扭矩倍率 / 极速阈值 / 断油系数 */
  G.spec = function () {
    var r = spec();
    return { torque: r.torque, cap: r.cap, cut: G.cut > 0 ? 0.18 : 1, n: r.n };
  };

  G.isMP44 = function () {
    return !!(CR.Garage && CR.Garage.active === 1 && CR.Car && CR.Car.active === 1);
  };

  /* 切驾驶权瞬间同步档位 HUD 显隐，不等下一帧 */
  G.sync = function () {
    var on = G.isMP44();
    if (G.visible !== on) {
      G.visible = on;
      if (el) el.style.display = on ? '' : 'none';
    }
    if (on) paint();
  };

  function apply(dir) {
    if (!G.isMP44() || !G.manual) return false;
    var to = G.gear + dir;
    if (to < 1 || to > G.RATIOS.length) return false;
    G.gear = to;
    G.cut = 0.12;
    flashT = 0.55;
    if (CR.Pad && CR.Pad.buzz) CR.Pad.buzz(0.16, 0.28, 90);
    /* 换档音效：只在手动档（手柄）触发；自动档静音，否则频繁跳档会吵 */
    if (CR.Audio && CR.Audio.shift) CR.Audio.shift(dir);
    paint();
    return true;
  }
  G.up = function () { return apply(1); };
  G.down = function () { return apply(-1); };

  /* 自动档：按速度选一个 cap 略高于当前速度的档，带滞回避免频繁跳档 */
  function autoShift(vf) {
    var best = 1;
    for (var i = 0; i < G.RATIOS.length; i++) {
      if (vf > G.RATIOS[i].cap * 0.52 - 3) best = i + 1;
    }
    if (best !== G.gear) {
      /* 降档比升档迟滞一点：升档阈值 0.52cap，降档 0.42cap */
      if (best > G.gear || vf < spec().cap * 0.40) G.gear = best;
    }
  }

  G.step = function (dt) {
    if (G.cut > 0) G.cut = Math.max(0, G.cut - dt);
    if (flashT > 0) flashT = Math.max(0, flashT - dt);
    if (!G.isMP44()) { if (G.visible) { G.visible = false; if (el) el.style.display = 'none'; } return; }
    if (!G.visible) { G.visible = true; if (el) el.style.display = ''; }
    /* 手柄连接状态决定手动/自动（手柄断开后回自动，避免卡在 1 档） */
    var padOn = !!(CR.Pad && CR.Pad.connected);
    if (padOn !== G.manual) {
      G.manual = padOn;
      if (!padOn) { G.gear = 3; G.cut = 0; }
      paint();
    }
    if (!G.manual) autoShift(Math.abs(CR.Car.state.vf));
    paintHint();
  };

  function paint() {
    if (!elNum) return;
    elNum.textContent = G.gear;
    el.className = 'gear-box' + (flashT > 0 ? ' flash' : '') + (G.manual ? ' manual' : ' auto');
    var tag = el.querySelector('.gear-tag');
    if (tag) tag.textContent = G.manual ? '手动' : '自动';
  }
  function paintHint() {
    if (!elHint) return;
    var vf = Math.abs(CR.Car.state.vf), r = spec();
    var txt = '';
    if (G.manual) {
      if (vf > r.cap * 0.86 && G.gear < G.RATIOS.length) txt = '↑ 升档';
      else if (vf < r.cap * 0.22 && G.gear > 1) txt = '↓ 降档';
    }
    if (elHint.textContent !== txt) elHint.textContent = txt;
    if (flashT > 0 && el.className.indexOf('flash') < 0) paint();
    else if (flashT <= 0 && el.className.indexOf('flash') >= 0) paint();
  }

  G.init = function () {
    var style = document.createElement('style');
    style.textContent = [
      '.gear-box{position:absolute;right:200px;bottom:150px;z-index:20;display:flex;',
      'align-items:baseline;gap:7px;pointer-events:none;color:#eef1f5;padding:5px 10px;',
      'border-radius:10px;background:rgba(12,16,24,.42);border:1px solid rgba(255,255,255,.12);',
      '-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);',
      'font:12px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
      'text-shadow:0 2px 8px rgba(0,0,0,.8);transition:opacity .2s ease}',
      '.gear-box .gear-tag{font-size:9px;letter-spacing:.16em;opacity:.6}',
      '.gear-box .gear-num{font-size:30px;font-weight:300;letter-spacing:.02em;',
      'font-variant-numeric:tabular-nums;transition:transform .12s ease,color .12s ease}',
      '.gear-box .gear-lab{font-size:9px;letter-spacing:.12em;opacity:.62}',
      '.gear-box .gear-hint{min-width:52px;font-size:10px;color:#ffcf8b;letter-spacing:.06em}',
      '.gear-box.flash .gear-num{transform:scale(1.22);color:#ffcf8b}',
      '@media (max-width:820px){.gear-box{right:150px;bottom:100px}.gear-box .gear-num{font-size:22px}}'
    ].join('');
    document.head.appendChild(style);

    el = document.createElement('div');
    el.className = 'gear-box';
    el.style.display = 'none';
    el.innerHTML = '<span class="gear-tag">自动</span><span class="gear-num">3</span>' +
                   '<span class="gear-lab">档</span><span class="gear-hint"></span>';
    document.body.appendChild(el);
    elNum = el.querySelector('.gear-num');
    elHint = el.querySelector('.gear-hint');
    G.ready = true;
    paint();
    return G;
  };
})();
