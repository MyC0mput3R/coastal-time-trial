/* =========================================================================
 * garage.js — 双车车库：两辆车的独立槽位 + 切换驾驶权
 *
 * 设计要点：
 *   · 两辆车各有自己的 state / root / parts / 圈速计时 / 物理调校，
 *     沿赛道错开摆放 → 真正「分开」，不是同一位置换外观。
 *   · 只显示当前驾驶的那辆（showOnly 改 visible，不删物体）；
 *     选车层用它做高亮预览，局内 V 切换也自动跟着换。
 *   · 切换只换「当前驾驶哪一辆」：CR.Car.state 指向该车的 state，
 *     camera / hud / effects / audio 全都每帧重读 CR.Car.state，自动跟随。
 *   · 非当前车原地静止，不跑物理；切换回来时位置/速度/圈速都还在。
 * ========================================================================= */
(function () {
  'use strict';
  var CR = window.CR;
  var G = CR.Garage = {};
  G.ready = false;
  G.active = 0;

  /* 两车沿赛道错开：车0 发车线，车1 后退 30m 且偏左 2.2m（lat>0 为左侧/环内） */
  var GAP_S = 30, GAP_LAT = 2.2;

  function place(st, s, lat) {
    var p = CR.Track.pointAt(s, lat, {});
    st.x = p.x; st.y = p.y; st.z = p.z;
    st.psi = Math.atan2(p.tx, p.tz);
    st.s = p.s; st.lat = lat; st.slope = p.slope;
    st.vx = st.vz = st.vf = st.vl = st.speed = 0;
    st.yawRate = 0; st.steer = 0; st.delta = 0;
    st.acc = 0; st.latAcc = 0;
    st.drifting = false; st.slip = 0;
    st.offroad = false; st.braking = false;
    st.nitro = 1; st.nitroActive = false; st.nitroArmed = true;
    st.hitAcc = 0;
  }

  /* 只显示第 i 辆车。纯渲染层开关：所有车的 root / state / 圈速调校全部保留，
     切回来立刻恢复，不删除、不重建任何物体。按 roots.length 遍历 → 车辆数无关。 */
  G.showOnly = function (i) {
    var Car = CR.Car;
    if (!Car || !Car.roots) return i;
    var n = (Car.TUNES && Car.TUNES.length) || Car.roots.length || 2;
    i = ((i % n) + n) % n;
    for (var k = 0; k < Car.roots.length; k++) {
      if (Car.roots[k]) Car.roots[k].visible = (k === i);
    }
    return i;
  };

  /* 在 Car.create + Car2.attach + Car3.attach 之后调用 */
  G.setup = function (scene) {
    var Car = CR.Car, T = CR.Track;
    if (!Car || !Car.states || !Car.roots[1]) return G;

    var s0 = T.L - 14;
    var n = (Car.TUNES && Car.TUNES.length) || 2;
    /* 沿赛道错开摆放：车0 发车线 / 车1 后退 30m 偏左 / 车2 再退 30m 偏右 */
    var latOf = [0, GAP_LAT, -GAP_LAT];
    for (var i = 0; i < n; i++) {
      if (!Car.roots[i]) continue;              /* 未挂载的车型跳过，游戏照常 */
      place(Car.states[i], s0 - GAP_S * i, latOf[i] || 0);
      Car.states[i].grip = Car.TUNES[i].gripNormal;
    }

    if (CR.Hud && CR.Hud.resetSessions) CR.Hud.resetSessions();
    Car.setActive(0);
    /* 所有车的 root 常驻场景（分开摆），但同一时刻只显示正在开的那一辆 */
    G.showOnly(0);
    G.ready = true;
    return G;
  };

  /* 切换驾驶权：换 state 引用 + 换 root/parts 引用 + 换圈速槽 + 相机 snap */
  G.setActive = function (i) {
    var n = (CR.Car.TUNES && CR.Car.TUNES.length) || 2;
    i = ((i % n) + n) % n;
    G.active = i;
    CR.Car.setActive(i);
    G.showOnly(i);                 /* 换驾驶权 = 换可见的那一辆 */
    /* 车型名徽标：Car2.showName 只认识「MP4/4 / 原厂车」两态，
       三车版统一用 TUNES[i].name，避免第三辆显示错名字。 */
    if (CR.Car2 && CR.Car2.showName) CR.Car2.showName(i === 1, CR.Car.TUNES[i].name);
    if (CR.Gear && CR.Gear.sync) CR.Gear.sync();
    return i;
  };
  /* V / L3 换车：0 → 1 → 2 → 0 循环 */
  G.toggle = function () {
    var n = (CR.Car.TUNES && CR.Car.TUNES.length) || 2;
    return G.setActive((G.active + 1) % n);
  };
  G.name = function (i) { return CR.Car.TUNES[i === undefined ? G.active : i].name; };
})();
