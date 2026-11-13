/* =========================================================================
 * car3.js — 第三辆车（用户 Blender 模型 lotus e20.blend，黑金涂装）
 *
 * 三车版：本车有独立的 root / parts / state / 圈速槽，与车0 原厂车、
 *   车1 MP4/4 完全分开。切换只换引用，物理 / 相机 / HUD / 音效自动跟随。
 *   · 数据来自 car3data.js（按材质颜色分组的三角面 soup，×1000 整数存储）。
 *   · 前轴按 x 正负拆成左右两只独立前轮 → 复用 Car.sync 的前轮转向动画；
 *     后轴整组只滚动（与 MP4/4 一致）。
 *   · 不修改 car2.js / car.js 的任何几何与调校。
 * ========================================================================= */
(function () {
  'use strict';
  var CR = window.CR;
  var D = CR.Car3Data;
  var Car3 = CR.Car3 = {};
  Car3.ready = false;
  Car3.name = D ? D.name : '';
  if (!D) return;

  function meshFrom(groups, parent) {
    groups.forEach(function (g) {
      var pos = new Float32Array(g.p.length);
      for (var i = 0; i < g.p.length; i++) pos[i] = g.p[i] / 1000;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      /* 深色（轮胎/碳黑车身）：压低环境反射、拉满粗糙度，避免被黄昏暖光染成棕褐；
         金色/银色保留一点反射，让黑金涂装在游戏光照下仍然亮得出来。 */
      var lum = (g.c[0] + g.c[1] + g.c[2]) / 3;
      var dark = lum < 0.08;
      var mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(g.c[0], g.c[1], g.c[2]),
        roughness: dark ? 0.95 : (lum > 0.35 ? 0.38 : 0.62),
        metalness: 0,
        envMapIntensity: dark ? 0.18 : 0.75,
        side: THREE.DoubleSide,     /* 原模型有单面片，双面保险 */
        flatShading: true
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
    });
  }

  /* 在 CR.Car.create(scene) 之后调用 */
  Car3.attach = function (scene) {
    var Car = CR.Car;
    if (!Car || !Car.parts || !Car.root) return Car3;

    var root3 = new THREE.Group();
    root3.name = 'E20_Root';
    var body3 = new THREE.Group();
    root3.add(body3);
    meshFrom(D.body, body3);

    /* 刹车灯材质：Car.sync 每帧会写 P.tail.emissiveIntensity，所以必须给一个
       真实材质对象。但 E20 是 F1，本身没有传统尾灯，硬塞两个灯块会浮在车体
       外侧穿帮 —— 这里只保留材质、不往场景里加任何几何。 */
    var tailMat = new THREE.MeshStandardMaterial({
      color: 0x8e1008, emissive: 0xff2410, emissiveIntensity: 0.9, roughness: 0.5
    });

    /* 前轴：按顶点 x 正负拆成左 / 右两只独立前轮，各带 steering pivot。
       几何相对轮心重算后，由 Car.sync 的「front 轮绕 Y 转向」分支驱动。 */
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
        var rp = new THREE.Group();
        rp.position.set(w.center[0], w.center[1], w.center[2]);
        var rspin = new THREE.Group(); rp.add(rspin);
        meshFrom(w.groups, rspin);
        root3.add(rp);
        wheels.push({ pivot: rp, spin: rspin, front: false, side: 0 });
        return;
      }
      var s = splitAxleBySide(w.groups);
      [-1, 1].forEach(function (side) {
        var part = side < 0 ? s.L : s.R;
        var fp = new THREE.Group();
        fp.position.set(w.center[0] + part.off, w.center[1], w.center[2]);
        var fspin = new THREE.Group(); fp.add(fspin);
        meshFrom(part.groups, fspin);
        root3.add(fp);
        wheels.push({ pivot: fp, spin: fspin, front: true, side: side });
      });
    });

    scene.add(root3);
    Car.roots[2] = root3;
    Car.partsList[2] = {
      wheels: wheels, body: body3, tail: tailMat,
      paint: null, glass: null
    };

    Car3.ready = true;
    return Car3;
  };
})();
