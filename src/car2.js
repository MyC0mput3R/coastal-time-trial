/* =========================================================================
 * car2.js — 第二辆车（用户 Blender 模型 mp44.blend 导出）
 *
 * 双车版：第二辆车有**自己的 root / parts / state 槽**，与车0 分开摆在同一条赛道上。
 *   · 切驾驶权由 garage.js 负责，切换后 Car.state / Car.parts 指向本车；
 *     本车的 root.position/rotation.y 由 Car.sync 按自己的 state 更新。
 *   · 车身挂在自己的 body 组下 → 坡度俯仰 / 侧倾照常生效；
 *     前后轮组各建 pivot/spin → 滚动照常复用 Car.sync。
 *   · 数据来自 car2data.js（三角面 soup + 材质颜色，×1000 整数存储）。
 * ========================================================================= */
(function () {
  'use strict';
  var CR = window.CR;
  var D = CR.Car2Data;
  var Car2 = CR.Car2 = {};
  Car2.ready = false;
  Car2.active = false;
  Car2.name = D ? D.name : '';
  if (!D) return;

  var badge = null, badgeT = 0;

  function meshFrom(groups, parent) {
    groups.forEach(function (g) {
      var pos = new Float32Array(g.p.length);
      for (var i = 0; i < g.p.length; i++) pos[i] = g.p[i] / 1000;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      var lum = (g.c[0] + g.c[1] + g.c[2]) / 3;
      var dark = lum < 0.08;
      /* 深色（轮胎/底盘）：压低环境反射、拉满粗糙度，避免被黄昏暖光染成棕褐 */
      var mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(g.c[0], g.c[1], g.c[2]),
        roughness: dark ? 0.95 : 0.62, metalness: 0,
        envMapIntensity: dark ? 0.18 : 0.75,
        side: THREE.DoubleSide,     /* 原模型有单面片，双面保险 */
        flatShading: true
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
    });
  }

  function badgeEl() {
    if (badge === null) badge = document.getElementById('car-badge') || false;
    return badge;
  }
  /* 切换车型时闪一下车型名。
     on  = 是否正在驾驶第二辆车（MP4/4），用于维护 Car2.active；
     name = 可选，由 garage.js 传入当前车型的调校名（三车版统一显示正确名字）。 */
  Car2.showName = function (on, name) {
    Car2.active = !!on;
    var el = badgeEl();
    if (!el) return;
    el.textContent = '当前车辆  ' + (name || (on ? D.name : CR.Car.TUNES[0].name));
    el.classList.add('on');
    clearTimeout(badgeT);
    badgeT = setTimeout(function () { el.classList.remove('on'); }, 2200);
  };

  /* 在 CR.Car.create(scene) 之后调用 */
  Car2.attach = function (scene) {
    var Car = CR.Car;
    if (!Car || !Car.parts || !Car.root) return Car2;

    /* 独立的 root 与 body 组：不再挂到车0 的 body 下 */
    var root2 = new THREE.Group();
    root2.name = 'MP44_Root';
    var body2 = new THREE.Group();
    root2.add(body2);
    meshFrom(D.body, body2);

    /* 尾灯：给一个真实材质，让 Car.sync 的刹车灯亮度变化也能作用到本车 */
    var tailMat = new THREE.MeshStandardMaterial({
      color: 0x8e1008, emissive: 0xff2410, emissiveIntensity: 0.9, roughness: 0.5
    });
    ['-1', '1'].forEach(function (sg) {
      var g = new THREE.BoxGeometry(0.30, 0.09, 0.05);
      var m = new THREE.Mesh(g, tailMat);
      m.position.set(0.62 * Number(sg), 0.66, -1.55);
      body2.add(m);
    });

    /* 轮组 —— 前轮独立转向动画：
       后轴仍是一整根横轴（一个 pivot，只滚动、不转向）；
       前轴按 x 正负拆成左 / 右两只独立前轮，各带自己的 steering pivot，
       几何相对轮心重算后，由 Car.sync 的「front 轮绕 Y 转向」分支驱动，
       即可看到前轮随方向打角（与 car0 原厂车前轮一致）。 */
    function splitAxleBySide(groups) {
      var lsum = 0, lc = 0, rsum = 0, rc = 0, i, x;
      var idx = groups.map(function (g) {
        var L = [], R = [];
        for (i = 0; i < g.p.length; i += 3) {
          x = g.p[i];
          if (x < 0) { L.push(i); lsum += x; lc++; }
          else { R.push(i); rsum += x; rc++; }
        }
        return { L: L, R: R };
      });
      var lo = lc ? lsum / lc / 1000 : -1, ro = rc ? rsum / rc / 1000 : 1;
      var L = { groups: [], off: lo }, R = { groups: [], off: ro };
      groups.forEach(function (g, gi) {
        var I = idx[gi];
        if (I.L.length) {
          var lp = [];
          I.L.forEach(function (j) { lp.push(g.p[j] - lo * 1000, g.p[j + 1], g.p[j + 2]); });
          L.groups.push({ c: g.c, p: lp });
        }
        if (I.R.length) {
          var rp = [];
          I.R.forEach(function (j) { rp.push(g.p[j] - ro * 1000, g.p[j + 1], g.p[j + 2]); });
          R.groups.push({ c: g.c, p: rp });
        }
      });
      return { L: L, R: R };
    }
    var wheels = [];
    ['front', 'rear'].forEach(function (key) {
      var w = D.wheels[key];
      if (!w) return;
      if (key === 'rear') {
        /* 后轴：整根横轴，只滚动 */
        var rp = new THREE.Group();
        rp.position.set(w.center[0], w.center[1], w.center[2]);
        var rspin = new THREE.Group(); rp.add(rspin);
        meshFrom(w.groups, rspin);
        root2.add(rp);
        wheels.push({ pivot: rp, spin: rspin, front: false, side: 0 });
        return;
      }
      /* 前轴：拆左 / 右，各建 steering pivot */
      var s = splitAxleBySide(w.groups);
      [-1, 1].forEach(function (side) {
        var part = side < 0 ? s.L : s.R;
        var fp = new THREE.Group();
        fp.position.set(w.center[0] + part.off, w.center[1], w.center[2]);
        var fspin = new THREE.Group(); fp.add(fspin);
        meshFrom(part.groups, fspin);
        root2.add(fp);
        wheels.push({ pivot: fp, spin: fspin, front: true, side: side });
      });
    });

    scene.add(root2);
    Car.roots[1] = root2;
    Car.partsList[1] = {
      wheels: wheels, body: body2, tail: tailMat,
      paint: null, glass: null
    };

    Car2.ready = true;
    return Car2;
  };
})();
