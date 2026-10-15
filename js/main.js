/* ============================================================
 * 长三角区域协同演示 · 3D 场景与交互
 * 技术栈：Three.js r128（本地化）+ UnrealBloom 泛光后处理
 * ============================================================ */
(function () {
  "use strict";

  const DATA = window.YRD_DATA;

  /* ---------- 常量 ---------- */
  const CX = 119.0, CY = 31.0, SCALE = 7.0;              // 经纬度 → 场景坐标
  const HOME_POS = new THREE.Vector3(2, 40, 55);
  const HOME_TGT = new THREE.Vector3(0, 0, -1);

  function toXZ(lon, lat) { return { x: (lon - CX) * SCALE, z: -(lat - CY) * SCALE }; }

  /* ---------- 基础三件套 ---------- */
  const canvas = document.getElementById("scene");
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x030a14, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x030a14, 70, 170);

  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 62, 86);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;        // 阻尼更高，更跟手
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 1.25;
  controls.panSpeed = 0.9;
  controls.screenSpacePanning = true;   // 平移跟随屏幕方向，移动更直观
  controls.minDistance = 8;             // 可贴近城市观察
  controls.maxDistance = 130;
  controls.maxPolarAngle = Math.PI * 0.49; // 允许更低的观察视角
  /* 高德地图式操作：左键拖动=平移，右键拖动=旋转，滚轮=缩放 */
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
  };
  controls.touches = {
    ONE: THREE.TOUCH.PAN,
    TWO: THREE.TOUCH.DOLLY_ROTATE
  };
  controls.autoRotateSpeed = 0.55;
  controls.target.copy(HOME_TGT);

  scene.add(new THREE.AmbientLight(0x8fb8ff, 0.55));
  const dir = new THREE.DirectionalLight(0x9fd4ff, 0.5);
  dir.position.set(20, 40, 18);
  scene.add(dir);

  /* ---------- 后处理：UnrealBloom 泛光 ---------- */
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.6, 0.12);
  composer.addPass(bloom);

  /* ---------- 工具纹理（柔和光点） ---------- */
  function makeDotTexture(size) {
    const c = document.createElement("canvas"); c.width = c.height = size || 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  const dotTex = makeDotTexture(64);

  /* 暗角遮罩 + HUD 四角装饰，提升画面质感 */
  (function addVignette() {
    const v = document.createElement("div");
    v.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:5;" +
      "background:radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(1,4,9,.55) 100%);";
    document.getElementById("app").appendChild(v);
    [["tl", "top:76px;left:12px;border-top:2px solid #4dd8ff;border-left:2px solid #4dd8ff"],
     ["tr", "top:76px;right:12px;border-top:2px solid #4dd8ff;border-right:2px solid #4dd8ff"],
     ["bl", "bottom:12px;left:12px;border-bottom:2px solid #4dd8ff;border-left:2px solid #4dd8ff"],
     ["br", "bottom:12px;right:12px;border-bottom:2px solid #4dd8ff;border-right:2px solid #4dd8ff"]
    ].forEach(function (cfg) {
      const d = document.createElement("div");
      d.style.cssText = "position:absolute;width:30px;height:30px;pointer-events:none;z-index:6;opacity:.5;" + cfg[1];
      document.getElementById("app").appendChild(d);
    });
  })();

  /* ---------- 地表环境 ---------- */
  const env = new THREE.Group(); scene.add(env);
  const provinceLabels = []; // { el, x, z } 省份/地名标签
  const railLabels = [];     // { el, x, z } 高铁线路名标签
  /* 开场"点亮"动画控制：0=灰暗 1=点亮 */
  const litMats = { fills: [], lines: [], trunks: [], stations: [], river: [] };
  let lit = false, litP = 0;

  // 底板
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshBasicMaterial({ color: 0x050d1a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06;
  env.add(ground);

  // 矩形细网格（青色，弱）
  const grid = new THREE.GridHelper(160, 80, 0x14456e, 0x0d2c4a);
  grid.material.transparent = true; grid.material.opacity = 0.28;
  grid.position.y = -0.04;
  env.add(grid);

  // 极坐标能量网格（品红/紫，参考图风格）
  const polar = new THREE.PolarGridHelper(38, 24, 10, 72, 0xff4dd8, 0x8a3cff);
  polar.material.transparent = true; polar.material.opacity = 0.16;
  polar.material.blending = THREE.AdditiveBlending; polar.material.depthWrite = false;
  polar.position.set(1.5, -0.02, 0.5);
  env.add(polar);

  // 长三角三省一市真实轮廓（依据公开 GeoJSON 简化，见 js/geo.js）
  (function buildProvinces() {
    const FILLS = { "上海市": 0x14395f, "江苏省": 0x0d2f52, "浙江省": 0x0c2b4d, "安徽省": 0x0b2745 };
    const provLabels = [];
    (window.YRD_GEO.provinces || []).forEach(function (prov) {
      const rings = [prov.ring].concat(prov.extra || []);
      rings.forEach(function (ring, ri) {
        // 填充（点亮动画：灰暗 → 目标色）
        const shape = new THREE.Shape();
        ring.forEach(function (p, i) {
          const x = (p[0] - CX) * SCALE, y = (p[1] - CY) * SCALE;
          if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        });
        const fillColor = FILLS[prov.name] || 0x0d2b4d;
        const fillMat = new THREE.MeshBasicMaterial({
          color: fillColor, transparent: true,
          opacity: 0.18, side: THREE.DoubleSide, depthWrite: false
        });
        litMats.fills.push({ mat: fillMat, color: new THREE.Color(fillColor), on: ri === 0 ? 0.55 : 0.42, off: 0.16 });
        const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), fillMat);
        fill.rotation.x = -Math.PI / 2; fill.position.y = 0.02;
        fill.renderOrder = 3;
        env.add(fill);
        // 发光描边
        const pts = ring.map(function (p) {
          return new THREE.Vector3((p[0] - CX) * SCALE, 0.09, -(p[1] - CY) * SCALE);
        });
        pts.push(pts[0].clone());
        const lineMat = new THREE.LineBasicMaterial({ color: 0x3fb0e8, transparent: true, opacity: 0.12 });
        litMats.lines.push({ mat: lineMat, on: 0.85, off: 0.12 });
        env.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
        const glowMat = new THREE.LineBasicMaterial({ color: 0x3fb0e8, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false });
        litMats.lines.push({ mat: glowMat, on: 0.22, off: 0.04 });
        const glow = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), glowMat);
        glow.position.y = 0.03; glow.scale.set(1.006, 1, 1.006);
        env.add(glow);
      });
      // 省份名称标注（环点平均近似质心）
      let sx = 0, sz = 0;
      prov.ring.forEach(function (p) { sx += (p[0] - CX) * SCALE; sz += -(p[1] - CY) * SCALE; });
      provLabels.push({ name: prov.name, x: sx / prov.ring.length, z: sz / prov.ring.length });
    });
    // 省名 HTML 标签
    provLabels.forEach(function (pl) {
      const el = document.createElement("div");
      el.className = "prov-label";
      el.textContent = pl.name;
      document.getElementById("labels").appendChild(el);
      provinceLabels.push({ el: el, x: pl.x, z: pl.z });
    });
  })();

  // 长江示意（发光管道）
  (function buildRiver() {
    const RIVER = [
      [116.6, 30.45], [117.05, 30.52], [117.5, 30.72], [117.82, 30.95], [118.2, 31.08],
      [118.38, 31.33], [118.52, 31.7], [118.78, 32.05], [119.42, 32.2], [120.3, 32.1],
      [120.9, 31.95], [121.6, 31.6], [122.0, 31.45]
    ];
    const curve = new THREE.CatmullRomCurve3(RIVER.map(function (p) {
      return new THREE.Vector3((p[0] - CX) * SCALE, 0.1, -(p[1] - CY) * SCALE);
    }));
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 72, 0.09, 6, false),
      new THREE.MeshBasicMaterial({ color: 0x2f9fdf, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    litMats.river.push({ mat: tube.material, on: 0.55, off: 0.12 });
    env.add(tube);
  })();

  // 交通干线网：铁路（标准图例样式：实线+白色横短线）+ 高速公路（主干粗/一般细，琥珀色）
  (function buildTrunkNetwork() {
    const RAILS = [
      { name: "京沪高铁", pts: [[118.78, 32.06], [119.10, 32.19], [119.42, 32.19], [119.97, 31.78], [120.31, 31.49], [120.58, 31.30], [121.05, 31.28], [121.47, 31.23]] },
      { name: "京沪高铁", pts: [[118.78, 32.06], [118.32, 32.30], [117.39, 32.92], [117.18, 34.26]] },
      { name: "宁杭高铁", pts: [[118.78, 32.06], [119.05, 31.92], [119.48, 31.42], [119.90, 31.05], [120.09, 30.87], [120.16, 30.28]] },
      { name: "沪杭高铁", pts: [[121.47, 31.23], [121.10, 31.00], [120.76, 30.75], [120.40, 30.45], [120.16, 30.28]] },
      { name: "杭甬高铁", pts: [[120.16, 30.28], [120.58, 30.03], [121.10, 29.95], [121.55, 29.87]] },
      { name: "合宁高铁", pts: [[117.28, 31.86], [117.75, 31.92], [118.20, 32.00], [118.78, 32.06]] },
      { name: "商合杭高铁", pts: [[117.28, 31.86], [117.75, 31.60], [118.38, 31.33], [118.95, 31.08], [119.65, 30.95], [120.09, 30.87], [120.16, 30.28]] },
      { name: "宁安高铁", pts: [[118.78, 32.06], [118.60, 31.75], [118.38, 31.33]] },
      { name: "沪苏通铁路", pts: [[121.47, 31.23], [121.10, 31.45], [120.95, 31.75], [120.86, 32.01]] },
      { name: "连镇高铁", pts: [[119.42, 32.19], [119.42, 32.39], [119.05, 33.30], [119.02, 33.61], [119.22, 34.60]] },
      { name: "盐通高铁", pts: [[120.86, 32.01], [120.80, 32.55], [120.14, 33.35]] },
      { name: "宁启铁路", pts: [[118.78, 32.06], [119.42, 32.39], [119.92, 32.45], [120.86, 32.01]] },
      { name: "徐盐高铁", pts: [[117.18, 34.26], [118.28, 33.96], [119.02, 33.61], [120.14, 33.35]] }
    ];
    const HWYS = [
      { name: "G2京沪高速", major: true, pts: [[121.42, 31.18], [120.55, 31.22], [120.28, 31.42], [119.94, 31.72], [119.62, 31.95], [118.85, 31.98]] },
      { name: "G42沪蓉高速", major: true, pts: [[121.30, 31.30], [120.50, 31.35], [119.90, 31.68], [119.40, 31.88], [118.85, 31.98], [118.10, 31.90], [117.35, 31.83]] },
      { name: "G50沪渝高速", major: true, pts: [[121.30, 31.10], [120.65, 30.90], [120.09, 30.80], [119.55, 30.82], [118.95, 30.90], [118.40, 30.98], [117.81, 30.95]] },
      { name: "G60沪昆高速", major: true, pts: [[121.40, 31.15], [120.75, 30.72], [120.42, 30.48], [120.16, 30.24]] },
      { name: "G15沈海高速", major: true, pts: [[120.90, 32.10], [120.95, 31.60], [121.30, 31.10], [120.85, 30.60], [120.30, 30.10], [121.30, 29.95], [121.55, 29.80]] },
      { name: "G25宁杭高速", major: false, pts: [[118.85, 32.00], [119.30, 31.60], [119.75, 31.10], [120.05, 30.60], [120.10, 30.35]] },
      { name: "G5011芜合高速", major: false, pts: [[117.35, 31.80], [117.80, 31.55], [118.30, 31.38]] }
    ];

    function toV3(pts, y) {
      return pts.map(function (p) { return new THREE.Vector3((p[0] - CX) * SCALE, y, -(p[1] - CY) * SCALE); });
    }

    const stationGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const stationMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    litMats.stations.push({ mat: stationMat, on: 0.9, off: 0.08 });

    const tiePos = []; // 所有铁路横短线合并为一个 LineSegments

    /* 铁路：浅色实线 + 白色横短线（地图图例式），沿线站点光点 */
    RAILS.forEach(function (r) {
      const curve = new THREE.CatmullRomCurve3(toV3(r.pts, 0.15));
      const baseMat = new THREE.MeshBasicMaterial({ color: 0xa8c8e8, transparent: true, opacity: 0.9 });
      litMats.trunks.push({ mat: baseMat, on: 0.9, off: 0.05 });
      env.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.03, 5, false), baseMat));
      // 横短线（垂直于线路方向）
      const len = curve.getLength();
      const n = Math.max(8, Math.round(len / 0.22));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = curve.getPoint(t), tg = curve.getTangent(t);
        const px = -tg.z, pz = tg.x; // XZ 平面法向
        const half = 0.085;
        tiePos.push(p.x + px * half, p.y, p.z + pz * half, p.x - px * half, p.y, p.z - pz * half);
      }
      toV3(r.pts, 0.15).forEach(function (pt) {
        const s = new THREE.Mesh(stationGeo, stationMat);
        s.position.copy(pt); s.position.y = 0.17;
        env.add(s);
      });
      const mid = curve.getPoint(0.5);
      const el = document.createElement("div");
      el.className = "rail-label";
      el.textContent = r.name;
      document.getElementById("labels").appendChild(el);
      railLabels.push({ el: el, x: mid.x, z: mid.z });
    });

    /* 高速公路：主干粗亮、一般细暗（琥珀色） */
    HWYS.forEach(function (h) {
      const curve = new THREE.CatmullRomCurve3(toV3(h.pts, 0.12));
      const mat = new THREE.MeshBasicMaterial({
        color: h.major ? 0xffb84d : 0xd8a960, transparent: true,
        opacity: h.major ? 0.8 : 0.5
      });
      litMats.trunks.push({ mat: mat, on: h.major ? 0.8 : 0.5, off: 0.04 });
      env.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, h.major ? 0.06 : 0.032, 5, false), mat));
      const mid = curve.getPoint(0.5);
      const el = document.createElement("div");
      el.className = "rail-label hwy";
      el.textContent = h.name;
      document.getElementById("labels").appendChild(el);
      railLabels.push({ el: el, x: mid.x, z: mid.z });
    });

    // 铁路横短线合并渲染
    const tieGeo = new THREE.BufferGeometry();
    tieGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tiePos), 3));
    const tieMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    litMats.trunks.push({ mat: tieMat, on: 0.9, off: 0.05 });
    env.add(new THREE.LineSegments(tieGeo, tieMat));
  })();

  // 周边灰色底板 + 研究区辉光 + 西湖（研究区外均为示意衬托）
  (function buildContext() {
    // 大范围周边底板（示意）
    const CTX = [
      [110.0, 37.5], [114.0, 38.8], [119.0, 39.0], [124.0, 38.2], [127.5, 36.0],
      [127.0, 32.0], [126.0, 28.5], [124.0, 25.5], [120.5, 23.5], [116.0, 22.8],
      [112.5, 24.5], [109.5, 27.5], [108.0, 31.5], [108.5, 35.0]
    ];
    const shape = new THREE.Shape();
    CTX.forEach(function (p, i) {
      const x = (p[0] - CX) * SCALE, y = (p[1] - CY) * SCALE;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0x0a141f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    plate.rotation.x = -Math.PI / 2; plate.position.y = 0.008;
    plate.renderOrder = 1;
    env.add(plate);
    const bpts = CTX.map(function (p) {
      return new THREE.Vector3((p[0] - CX) * SCALE, 0.05, -(p[1] - CY) * SCALE);
    });
    bpts.push(bpts[0].clone());
    env.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bpts),
      new THREE.LineBasicMaterial({ color: 0x1c3350, transparent: true, opacity: 0.8 })));
    const ctxLabel = document.createElement("div");
    ctxLabel.className = "geo-label";
    ctxLabel.textContent = "周边地区（本次不研究）";
    document.getElementById("labels").appendChild(ctxLabel);
    provinceLabels.push({ el: ctxLabel, x: (110.8 - CX) * SCALE, z: -(36.8 - CY) * SCALE });

    // 研究区底部辉光（"点亮长三角"后显形；近景自动减弱防刺眼）
    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(38, 48),
      new THREE.MeshBasicMaterial({ map: dotTex, color: 0x1e6fa8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowDisc.rotation.x = -Math.PI / 2; glowDisc.position.set(-1, 0.012, -1);
    glowDisc.scale.set(1.15, 0.95, 1);
    glowDisc.renderOrder = 2;
    env.add(glowDisc);
    litMats.fills.push({ mat: glowDisc.material, color: new THREE.Color(0x1e6fa8), on: 0.16, off: 0, noColorLerp: true, nearFactor: 0.45 });

    // 真实湖泊轮廓（太湖/巢湖/洪泽湖/西湖，数据见 geo.js；样条平滑，绘制于建成区之上形成自然水岸线）
    (window.YRD_GEO.lakes || []).forEach(function (lk) {
      const raw2 = lk.ring.map(function (p) {
        return new THREE.Vector2((p[0] - CX) * SCALE, (p[1] - CY) * SCALE);
      });
      // 湖面填充（样条平滑闭合）
      const shape = new THREE.Shape();
      shape.moveTo(raw2[0].x, raw2[0].y);
      shape.splineThru(raw2.slice(1).concat([raw2[0]]));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24),
        new THREE.MeshBasicMaterial({ color: 0x2fa0d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.11; m.renderOrder = 6;
      env.add(m);
      litMats.fills.push({ mat: m.material, color: new THREE.Color(0x2fa0d8), on: 0.42, off: 0, noColorLerp: true });
      // 湖岸描边（闭合样条）
      const pts3 = raw2.map(function (v) { return new THREE.Vector3(v.x, 0.125, -v.y); });
      const curve = new THREE.CatmullRomCurve3(pts3, true);
      const edgePts = curve.getPoints(140);
      const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts),
        new THREE.LineBasicMaterial({ color: 0x6fc8ef, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      edge.renderOrder = 7;
      env.add(edge);
      litMats.lines.push({ mat: edge.material, on: 0.65, off: 0 });
      // 湖名标注（取环点平均位置）
      if (lk.name) {
        let sx = 0, sz = 0;
        lk.ring.forEach(function (p) { sx += (p[0] - CX) * SCALE; sz += -(p[1] - CY) * SCALE; });
        const el = document.createElement("div");
        el.className = "geo-label";
        el.textContent = lk.name;
        document.getElementById("labels").appendChild(el);
        provinceLabels.push({ el: el, x: sx / lk.ring.length, z: sz / lk.ring.length });
      }
    });
  })();

  // 星空
  (function buildStars() {
    const N = 550, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 110;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 6 + Math.random() * 85;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.8, map: dotTex, color: 0x9fd0ff, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    env.add(stars);
  })();

  /* ---------- 城市节点 ---------- */
  const citiesGroup = new THREE.Group(); scene.add(citiesGroup);
  const labelsWrap = document.getElementById("labels");
  const cityNodes = [];   // { data, group, orb, ring, orbBaseY, topY, phase, labelEl, selected }
  const hitMeshes = [];

  // 确定性随机（建筑群布局稳定）
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function strHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  /* 射线法：点是否在多边形内 */
  function pointInPoly(px, pz, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* 城市建成区：仿真实空间形态（沿江带状/跨江组团/走廊带状），多边形内散布建筑 */
  function buildUrban(c, cx, cz) {
    const shapes = (window.YRD_GEO.urban && window.YRD_GEO.urban[c.id]) || [];
    if (!shapes.length) return;
    const rng = mulberry32(strHash(c.name));
    const maxH = c.tier === 1 ? 2.6 : c.tier === 2 ? 1.5 : 0.9;
    const total = c.tier === 1 ? 165 : c.tier === 2 ? 90 : 50;

    // 建成区底面 + 轮廓描边
    const urbanGroup = new THREE.Group();
    urbanGroup.position.set(cx, 0, cz);
    let areaSum = 0;
    const areas = shapes.map(function (poly) {
      let a = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      a = Math.abs(a) / 2; areaSum += a; return a;
    });
    shapes.forEach(function (poly) {
      const shape = new THREE.Shape();
      poly.forEach(function (p, i) {
        if (i === 0) shape.moveTo(p[0], -p[1]); else shape.lineTo(p[0], -p[1]);
      });
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: 0x11284a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      fill.rotation.x = -Math.PI / 2; fill.position.y = 0.035;
      fill.renderOrder = 5;
      urbanGroup.add(fill);
      const pts = poly.map(function (p) { return new THREE.Vector3(p[0], 0.09, p[1]); });
      pts.push(pts[0].clone());
      urbanGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x2e7ec2, transparent: true, opacity: 0.5 })));
    });
    citiesGroup.add(urbanGroup);

    // 建筑散点：按多边形面积分配数量，形内 rejection sampling，向心高度衰减
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sV = new THREE.Vector3(), pV = new THREE.Vector3();
    const col = new THREE.Color();
    const cBase = new THREE.Color(0x0a2340), cGlow = new THREE.Color(0x3fb9ff), cAccent = new THREE.Color(0x7fdcff);
    let placed = 0;
    shapes.forEach(function (poly, si) {
      const n = si === shapes.length - 1 ? total - placed : Math.round(total * areas[si] / areaSum);
      const xs = poly.map(function (p) { return p[0]; }), zs = poly.map(function (p) { return p[1]; });
      const minX = Math.min.apply(null, xs) - 0.05, maxX = Math.max.apply(null, xs) + 0.05;
      const minZ = Math.min.apply(null, zs) - 0.05, maxZ = Math.max.apply(null, zs) + 0.05;
      let made = 0, guard = 0;
      while (made < n && guard < n * 80 && placed < total) {
        guard++;
        const px = minX + rng() * (maxX - minX), pz = minZ + rng() * (maxZ - minZ);
        if (!pointInPoly(px, pz, poly)) continue;
        const d = Math.hypot(px, pz);
        const h = maxH * (0.22 + 0.78 * Math.exp(-(d * d) / 1.62)) * (0.5 + rng() * 0.8) + 0.05;
        sV.set(0.08 + rng() * 0.14, Math.max(0.05, h), 0.08 + rng() * 0.14);
        pV.set(cx + px, 0, cz + pz);
        m4.compose(pV, q, sV);
        inst.setMatrixAt(placed, m4);
        const t = Math.min(1, h / maxH) * (0.3 + 0.7 * rng());
        col.copy(cBase).lerp(rng() > 0.85 ? cAccent : cGlow, t);
        inst.setColorAt(placed, col);
        placed++; made++;
      }
    });
    inst.count = placed;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    citiesGroup.add(inst);
  }

  /* ---------- 城市地标建筑（简化几何造型，写意示意） ---------- */
  function buildLandmark(c) {
    const g = new THREE.Group();
    const body = new THREE.MeshBasicMaterial({ color: 0x10294d });
    const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color), transparent: true, opacity: 0.95 });
    const litSoft = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    const glass = new THREE.MeshBasicMaterial({ color: 0x1a4d7d, transparent: true, opacity: 0.85 });

    function box(w, h, d, x, y, z, m) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || body);
      mesh.position.set(x, y, z); g.add(mesh); return mesh;
    }
    function cyl(rt, rb, h, x, y, z, seg, m) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10), m || body);
      mesh.position.set(x, y, z); g.add(mesh); return mesh;
    }
    function sph(r, x, y, z, m) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m || litSoft);
      mesh.position.set(x, y, z); g.add(mesh); return mesh;
    }
    function band(r, x, y, z, m) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 36), m || lit);
      t.rotation.x = Math.PI / 2; t.position.set(x, y, z); g.add(t); return t;
    }
    function line(pts, m) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m || lit);
      g.add(l); return l;
    }

    let H = 2.2;
    switch (c.id) {
      case "shanghai": { // 陆家嘴天际线：东方明珠 + 上海中心 + 金茂大厦 + 环球金融中心
        box(0.55, 0.1, 0.55, 0, 0.05, 0.05);            // 座
        cyl(0.10, 0.17, 2.0, 0, 1.0, 0);
        cyl(0.05, 0.09, 0.5, 0, 0.3, 0, 8, lit);
        sph(0.32, 0, 1.35, 0, lit); sph(0.20, 0, 2.02, 0, lit); sph(0.10, 0, 2.5, 0, lit);
        cyl(0.015, 0.03, 0.8, 0, 2.95, 0, 6, lit);
        box(0.5, 0.12, 0.5, 1.0, 0.06, -0.25);          // 上海中心座
        cyl(0.10, 0.27, 3.0, 1.0, 1.56, -0.25, 12, glass);
        band(0.24, 1.0, 0.9, -0.25); band(0.17, 1.0, 1.9, -0.25); band(0.11, 1.0, 2.7, -0.25);
        sph(0.13, 1.0, 3.1, -0.25, lit);
        // 金茂大厦（密檐塔式收分）
        box(0.36, 0.1, 0.36, -0.55, 0.05, 0.55);
        cyl(0.085, 0.115, 1.0, -0.55, 0.6, 0.55, 8, glass);
        cyl(0.06, 0.085, 0.8, -0.55, 1.5, 0.55, 8, body);
        cyl(0.04, 0.06, 0.5, -0.55, 2.15, 0.55, 8, glass);
        cyl(0.008, 0.02, 0.45, -0.55, 2.62, 0.55, 6, lit);
        band(0.088, -0.55, 1.1, 0.55); band(0.062, -0.55, 1.9, 0.55);
        // 环球金融中心（棱柱 + 斜切顶）
        box(0.34, 0.1, 0.34, 0.55, 0.05, 0.6);
        const swfc = cyl(0.095, 0.135, 2.2, 0.55, 1.2, 0.6, 4, glass);
        swfc.rotation.y = Math.PI / 4;
        const swfcTop = cyl(0.03, 0.095, 0.4, 0.55, 2.5, 0.6, 4, body);
        swfcTop.rotation.y = Math.PI / 4;
        band(0.1, 0.55, 2.22, 0.6);
        H = 3.3; break;
      }
      case "nanjing": { // 紫峰大厦（八棱收分 + 龙脊尖顶）
        box(0.7, 0.15, 0.7, 0, 0.075, 0);
        cyl(0.08, 0.26, 2.2, 0, 1.25, 0, 8, glass);
        band(0.22, 0, 0.75, 0); band(0.16, 0, 1.45, 0); band(0.11, 0, 2.05, 0);
        sph(0.09, 0, 2.28, 0, lit);
        cyl(0.012, 0.05, 0.75, 0, 2.6, 0, 6, lit);
        sph(0.04, 0, 2.9, 0, lit);
        H = 3.0; break;
      }
      case "hangzhou": { // 保俶塔（写意古塔：塔身 + 出檐）
        box(0.72, 0.1, 0.72, 0, 0.05, 0);
        let w = 0.42, y = 0.1;
        for (let i = 0; i < 5; i++) {
          box(w, 0.28, w, 0, y + 0.14, 0, i % 2 ? body : glass);
          box(w * 1.5, 0.045, w * 1.5, 0, y + 0.295, 0, litSoft); // 出檐
          w *= 0.84; y += 0.34;
        }
        cyl(0.01, 0.03, 0.5, 0, y + 0.22, 0, 6, lit);
        sph(0.035, 0, y + 0.5, 0, lit);
        H = 2.5; break;
      }
      case "hefei": { // 安徽广播电视中心（三段收分 + 双天线）
        box(0.85, 0.14, 0.6, 0, 0.07, 0);
        box(0.46, 1.0, 0.46, 0, 0.64, 0, glass);
        box(0.5, 0.05, 0.5, 0, 1.12, 0, lit);
        box(0.36, 0.85, 0.36, 0, 1.55, 0, body);
        box(0.4, 0.045, 0.4, 0, 1.95, 0, lit);
        box(0.26, 0.7, 0.26, 0, 2.32, 0, glass);
        box(0.3, 0.04, 0.3, 0, 2.64, 0, lit);
        cyl(0.012, 0.025, 0.42, -0.05, 2.86, 0, 6, lit);
        cyl(0.008, 0.018, 0.3, 0.06, 2.8, 0, 6, lit);
        H = 2.9; break;
      }
      case "ningbo": { // 宁波财富中心"玉米楼"（圆润收分 + 环带 + 冠顶）
        cyl(0.36, 0.42, 0.12, 0, 0.06, 0, 16, body);
        cyl(0.13, 0.30, 2.1, 0, 1.17, 0, 16, glass);
        [0.35, 0.75, 1.15, 1.55, 1.9].forEach(function (yy) {
          const rr = 0.29 - (yy / 2.2) * 0.145; band(rr, 0, yy, 0);
        });
        sph(0.12, 0, 2.3, 0, lit);
        cyl(0.008, 0.02, 0.3, 0, 2.55, 0, 6, lit);
        H = 2.6; break;
      }
      case "wuxi": { // 无锡国金中心（六棱塔 + 锥形冠 + 尖针）
        box(0.6, 0.12, 0.6, 0, 0.06, 0);
        cyl(0.07, 0.24, 2.3, 0, 1.27, 0, 6, glass);
        band(0.2, 0, 0.7, 0); band(0.14, 0, 1.4, 0); band(0.09, 0, 2.1, 0);
        cyl(0.005, 0.07, 0.28, 0, 2.56, 0, 6, lit);
        cyl(0.006, 0.016, 0.35, 0, 2.85, 0, 6, lit);
        H = 2.8; break;
      }
      case "changzhou": { // 现代传媒中心（双子塔 + 双连廊）
        box(1.1, 0.1, 0.5, 0, 0.05, 0);
        cyl(0.065, 0.12, 1.7, -0.32, 0.95, 0, 8, glass);
        band(0.1, -0.32, 0.7, 0); band(0.08, -0.32, 1.35, 0);
        cyl(0.065, 0.12, 2.2, 0.32, 1.2, 0, 8, body);
        band(0.1, 0.32, 0.9, 0); band(0.08, 0.32, 1.7, 0);
        box(0.78, 0.1, 0.13, 0, 1.3, 0);
        box(0.78, 0.07, 0.12, 0, 1.78, 0);
        cyl(0.008, 0.02, 0.4, 0.32, 2.5, 0, 6, lit);
        sph(0.04, -0.32, 1.86, 0, lit);
        H = 2.6; break;
      }
      case "nantong": { // 南通电视塔（塔座 + 观景舱 + 天线）
        cyl(0.3, 0.36, 0.12, 0, 0.06, 0, 12, body);
        cyl(0.055, 0.12, 1.5, 0, 0.87, 0, 10, body);
        band(0.1, 0, 1.2, 0);
        cyl(0.2, 0.16, 0.15, 0, 1.7, 0, 14, glass);
        band(0.19, 0, 1.78, 0);
        cyl(0.03, 0.05, 0.4, 0, 1.98, 0, 8, body);
        cyl(0.008, 0.02, 0.45, 0, 2.4, 0, 6, lit);
        H = 2.3; break;
      }
      case "suzhou": { // 东方之门（拱门 + 横桁架 + 顶部光带）
        box(1.2, 0.1, 0.42, 0, 0.05, 0);
        box(0.13, 1.7, 0.13, -0.42, 0.9, 0, glass);
        box(0.13, 1.7, 0.13, 0.42, 0.9, 0, glass);
        box(0.71, 0.04, 0.13, 0, 0.55, 0);
        box(0.71, 0.045, 0.13, 0, 0.95, 0, lit);
        box(0.71, 0.04, 0.13, 0, 1.35, 0);
        box(1.14, 0.36, 0.19, 0, 1.9, 0, glass);
        box(1.14, 0.03, 0.21, 0, 1.74, 0, lit);
        box(1.14, 0.03, 0.21, 0, 2.06, 0, lit);
        sph(0.05, 0, 2.13, 0, lit);
        H = 2.2; break;
      }
      case "wuhu": { // 芜湖长江大桥（写意斜拉桥）
        box(1.5, 0.08, 0.18, 0, 0.85, 0, glass);
        box(0.09, 1.4, 0.09, -0.5, 0.7, 0, body);
        box(0.09, 1.4, 0.09, 0.5, 0.7, 0, body);
        box(0.14, 0.1, 0.24, -0.5, 0.05, 0); box(0.14, 0.1, 0.24, 0.5, 0.05, 0);
        [-0.5, 0.5].forEach(function (px) {
          [0.35, 0.65].forEach(function (t) {
            const top = new THREE.Vector3(px, 1.38, 0);
            const end = new THREE.Vector3(px + (px > 0 ? -t : t) * 0.8, 0.89, 0);
            line([top, end]);
          });
        });
        band(0.06, -0.5, 1.4, 0, lit); band(0.06, 0.5, 1.4, 0, lit);
        H = 1.6; break;
      }
      default: { // 通用写意塔
        cyl(0.08, 0.22, 1.8, 0, 0.9, 0, 8, glass);
        sph(0.1, 0, 1.9, 0, lit);
        H = 2.0;
      }
    }
    return { group: g, topY: H };
  }

  DATA.cities.forEach(function (c) {
    const p = toXZ(c.lon, c.lat);
    const orbR = c.tier === 1 ? 0.22 : c.tier === 2 ? 0.15 : 0.11;
    const col3 = new THREE.Color(c.color);

    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);

    // 城市光晕地盘
    const discR = c.tier === 1 ? 4.6 : c.tier === 2 ? 3.1 : 2.2;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(discR, 40),
      new THREE.MeshBasicMaterial({ map: dotTex, color: col3, transparent: true, opacity: c.tier === 1 ? 0.3 : 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06;
    group.add(disc);

    // 地标建筑
    const lm = buildLandmark(c);
    group.add(lm.group);

    // 悬浮光球（城市灵魂）
    const orbBaseY = lm.topY + 0.55;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(orbR, 20, 16),
      new THREE.MeshBasicMaterial({ color: col3 }));
    orb.position.y = orbBaseY;
    group.add(orb);
    const orbGlow = new THREE.Mesh(new THREE.SphereGeometry(orbR * 2.4, 16, 12),
      new THREE.MeshBasicMaterial({ map: dotTex, color: col3, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    orb.add(orbGlow);

    // 底部光环
    const ring = new THREE.Mesh(new THREE.TorusGeometry(discR * 0.42, 0.04, 8, 48),
      new THREE.MeshBasicMaterial({ color: col3, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
    group.add(ring);

    // 点击热区
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.25, lm.topY * 0.62), 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = lm.topY * 0.45;
    hit.userData.city = c;
    group.add(hit);
    hitMeshes.push(hit);

    citiesGroup.add(group);
    buildUrban(c, p.x, p.z);

    // HTML 标签
    const label = document.createElement("div");
    label.className = "city-label";
    if (c.tier === 1) label.style.fontSize = "17px";
    else if (c.tier === 3) label.style.fontSize = "12px";
    label.style.setProperty("--c", c.color);
    label.textContent = c.name;
    labelsWrap.appendChild(label);

    cityNodes.push({
      data: c, group: group, orb: orb, ring: ring, disc: disc, orbGlow: orbGlow,
      discBase: disc.material.opacity, topY: lm.topY, orbBaseY: orbBaseY,
      phase: Math.random() * Math.PI * 2, labelEl: label, selected: false
    });
  });

  function nodeTop(node) {
    return new THREE.Vector3(node.group.position.x, node.orbBaseY + 0.15, node.group.position.z);
  }
  function nodeByCity(city) {
    return cityNodes.find(function (n) { return n.data === city; });
  }

  /* ---------- 动画元素：协同流 / 受阻 ---------- */
  const flowsGroup = new THREE.Group(); scene.add(flowsGroup);
  let activeFlows = [];

  function clearFlows() {
    activeFlows.forEach(function (f) {
      flowsGroup.remove(f.group);
      f.group.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map && o.material.map !== dotTex) o.material.map.dispose(); o.material.dispose(); }
      });
    });
    activeFlows = [];
  }

  function makeHalo(color, pos, maxScale, speed) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 48),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = 0.14;
    m.renderOrder = 22;
    flowsGroup.add(m);
    return { mesh: m, mat: m.material, t: Math.random(), maxScale: maxScale || 3.4, speed: speed || 0.55 };
  }

  /* 协同流：发光弧线管道 + 按要素类型分色的粒子流 + 双城光环 */
  function addFlow(nodeA, nodeB, types, full) {
    const pa = nodeTop(nodeA), pb = nodeTop(nodeB);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    const dist = pa.distanceTo(pb);
    mid.y = Math.max(pa.y, pb.y) + 1.1 + dist * 0.13;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);

    const group = new THREE.Group();
    const record = { group: group, streams: [], halos: [] };

    // 主光带（绿色=可协同）：实心内芯保证立体感与任意角度可见 + 外层泛光
    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 56, full ? 0.07 : 0.045, 8, false),
      new THREE.MeshBasicMaterial({ color: 0x9dffc0 }));
    core.renderOrder = 20;
    group.add(core);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 56, full ? 0.14 : 0.09, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0x46ff8a, transparent: true, opacity: full ? 0.42 : 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    tube.renderOrder = 21;
    group.add(tube);

    // 每类要素一条粒子流
    (types || []).slice(0, 4).forEach(function (t, i) {
      const colorHex = DATA.flowTypes[t] || "#4dd8ff";
      const N = 46;
      const pos = new Float32Array(N * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: full ? 0.42 : 0.26, map: dotTex, color: new THREE.Color(colorHex),
        transparent: true, opacity: full ? 0.95 : 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const points = new THREE.Points(geo, mat);
      points.renderOrder = 22;
      group.add(points);
      const tArr = new Float32Array(N);
      for (let k = 0; k < N; k++) tArr[k] = Math.random();
      record.streams.push({
        curve: curve, points: points, attr: geo.attributes.position,
        tArr: tArr, speed: 0.16 + 0.035 * i + (full ? 0.02 : 0), lane: i * 0.02
      });
    });

    // 双城扩张光环
    if (full) {
      record.halos.push(makeHalo(nodeA.data.color, pa, 4.2, 0.6));
      record.halos.push(makeHalo(nodeB.data.color, pb, 4.2, 0.6));
    } else {
      record.halos.push(makeHalo(0x4dd8ff, pa, 2.4, 0.4));
      record.halos.push(makeHalo(0x4dd8ff, pb, 2.4, 0.4));
    }

    flowsGroup.add(group);
    activeFlows.push(record);
  }

  /* 受阻：虚线衰减连线 + 红色障碍标记 + 地面警示环 */
  function addBlocked(nodeA, nodeB, rel) {
    const pa = nodeTop(nodeA), pb = nodeTop(nodeB);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    const dist = pa.distanceTo(pb);
    mid.y = Math.max(pa.y, pb.y) + 0.9 + dist * 0.1;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);

    const group = new THREE.Group();
    const record = { group: group, streams: [], halos: [] };

    // 红色粗虚线（受阻）：实心红芯 + 泛光双层，分段圆管远距离可见
    const len = curve.getLength();
    const redCoreMat = new THREE.MeshBasicMaterial({ color: 0xff8a96 });
    const redGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff4d5f, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const segOn = 0.5, segOff = 0.34;
    let tCur = 0;
    while (tCur < 1 - 0.02) {
      const tEnd = Math.min(1, tCur + segOn / len);
      const sub = new THREE.CatmullRomCurve3([
        curve.getPoint(tCur),
        curve.getPoint((tCur + tEnd) / 2),
        curve.getPoint(tEnd)
      ]);
      const core = new THREE.Mesh(new THREE.TubeGeometry(sub, 10, 0.075, 6, false), redCoreMat);
      core.renderOrder = 20;
      group.add(core);
      const glow = new THREE.Mesh(new THREE.TubeGeometry(sub, 10, 0.13, 6, false), redGlowMat);
      glow.renderOrder = 21;
      group.add(glow);
      tCur = tEnd + segOff / len;
    }

    // 障碍标记（旋转脉动的红色多面体）
    const barrier = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.95 }));
    barrier.position.copy(mid);
    barrier.renderOrder = 22;
    group.add(barrier);
    const barrierGlow = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12),
      new THREE.MeshBasicMaterial({ map: dotTex, color: 0xff4d6d, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    barrierGlow.renderOrder = 23;
    barrier.add(barrierGlow);
    record.barrier = barrier;

    // 地面警示环（红色脉冲）
    const midGround = mid.clone(); midGround.y = 0.14;
    record.halos.push(makeHalo(0xff4d6d, midGround, 2.6, 0.8));

    // 两端节点暗化提示
    record.halos.push(makeHalo(0x5a6b7d, pa, 1.8, 0.4));
    record.halos.push(makeHalo(0x5a6b7d, pb, 1.8, 0.4));

    flowsGroup.add(group);
    activeFlows.push(record);
  }

  /* ---------- 状态与 DOM ---------- */
  let mode = 1;
  let selection = [];           // 已选城市（最多 2）
  const panel = document.getElementById("panel");
  const panelBody = document.getElementById("panelBody");
  const hintEl = document.getElementById("hint");

  const HINTS = {
    1: "点击城市节点，查看城市画像（优势 · 短板 · 区位 · 产业）",
    2: "依次点击 <b>两个城市</b>，演示区域协同与要素流动",
    3: "依次点击 <b>两个城市</b>，分析协同受阻的原因与改善路径"
  };

  function updateHint() {
    if (!lit) {
      hintEl.innerHTML = '点击右上角 <b>✦ 点亮研究区域</b>，聚焦今天研究的长三角地区';
      return;
    }
    if (mode > 1 && selection.length === 1) {
      hintEl.innerHTML = "已选择：<b>" + selection[0].name + "</b> → 请点击第二个城市";
    } else {
      hintEl.innerHTML = HINTS[mode];
    }
  }

  function clearSelectionVisual() {
    cityNodes.forEach(function (n) { n.selected = false; });
  }

  function hidePanel() { panel.classList.remove("show"); }
  function showPanel(html) {
    panelBody.innerHTML = html;
    panelBody.scrollTop = 0;
    panel.classList.add("show");
  }
  document.getElementById("panelClose").addEventListener("click", hidePanel);

  function esc(s) { return String(s); } // 数据源为内部整理文本
  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  /* ---------- 面板模板 ---------- */
  function cityPanelHTML(c) {
    const tierName = c.tier === 1 ? "长三角中心城市" : c.tier === 2 ? "区域重要节点城市" : "区域次级节点城市";
    return (
      '<span class="panel-eyebrow">城市画像 CITY PROFILE</span>' +
      '<div class="panel-title">' + c.name + '</div>' +
      '<div class="panel-sub">' + tierName + ' · 主导功能：' + c.dominant + '</div>' +
      '<span class="badge profile">点击标签查看说明</span>' +
      chipSecHTML("主要优势", "#5cff9d", c.advantages) +
      chipSecHTML("主要短板", "#ffd84d", c.constraints) +
      '<div class="sec" style="--sc:#ffa63d"><h3>代表产业</h3><div class="chips">' +
        c.industries.map(function (x) { return chipHTML(x, "#ffa63d"); }).join('') + '</div></div>' +
      foldHTML("区位与对外联系", "#4dd8ff", '<p>' + c.transport + '</p>') +
      foldHTML("合作潜力", "#b06bff", '<p>' + c.coop + '</p>') +
      '<div class="hint-next">' + (mode === 1 ? "切换到「建立协同」模式，点击两个城市查看要素流动" : "再点击一个城市，演示协同关系") + '</div>' +
      '<div class="panel-foot">' + DATA.sourceNote + '</div>'
    );
  }

  /* 短标签分组：点击标签展开具体说明 */
  function chipSecHTML(title, color, items) {
    return '<div class="sec" style="--sc:' + color + '"><h3>' + title + '</h3>' +
      '<div class="chip-group">' +
      items.map(function (it) {
        return '<span class="chip exp-chip" style="--cc:' + color + '" data-d="' + escAttr(it.d) + '">' + it.t + '</span>';
      }).join('') +
      '<div class="exp-detail"></div></div></div>';
  }

  /* 折叠区：点击标题展开 */
  function foldHTML(title, color, inner) {
    return '<div class="fold"><div class="fold-head" style="--sc:' + color + '">' +
      '<span class="arrow">▶</span><h3>' + title + '</h3></div>' +
      '<div class="fold-body">' + inner + '</div></div>';
  }

  /* 面板交互（事件委托，绑定一次） */
  panelBody.addEventListener("click", function (e) {
    const chip = e.target.closest(".exp-chip");
    if (chip) {
      const group = chip.closest(".chip-group");
      const detail = group.querySelector(".exp-detail");
      const wasActive = chip.classList.contains("active");
      group.querySelectorAll(".exp-chip.active").forEach(function (x) { x.classList.remove("active"); });
      if (wasActive || !chip.dataset.d) { detail.classList.remove("show"); return; }
      chip.classList.add("active");
      detail.textContent = chip.dataset.d;
      detail.classList.add("show");
      return;
    }
    const head = e.target.closest(".fold-head");
    if (head) head.parentElement.classList.toggle("open");
  });

  function secHTML(title, color, inner) {
    return '<div class="sec" style="--sc:' + color + '"><h3>' + title + '</h3>' + inner + '</div>';
  }
  function chipHTML(text, color) {
    return '<span class="chip" style="--cc:' + color + '">' + text + '</span>';
  }
  function barrierTagsHTML(barriers) {
    return '<div class="sec">' + barriers.map(function (b) {
      const bt = DATA.barrierTypes[b] || { icon: "⚠️", color: "#ff7a45", desc: "" };
      return '<div class="tagline" style="--tc:' + bt.color + '">' +
        '<div class="tag-ico">' + bt.icon + '</div>' +
        '<div class="tag-body"><b>' + b + '</b><span>' + bt.desc + '</span></div></div>';
    }).join('') + '</div>';
  }

  function coopPanelHTML(a, b, rel) {
    const lvBadge = rel.level === "strong"
      ? '<span class="badge strong">✔ 强协同潜力</span>'
      : '<span class="badge medium">◔ 中等协同潜力</span>';
    return (
      '<span class="panel-eyebrow">区域协同 SYNERGY</span>' +
      '<div class="panel-title">' + a.name + '<span class="x">⇌</span>' + b.name + '</div>' +
      '<div class="panel-sub">' + rel.title + '</div>' + lvBadge +
      '<div class="chips">' + (rel.types || []).map(function (t) { return chipHTML(t + " 流动", DATA.flowTypes[t] || "#4dd8ff"); }).join('') + '</div>' +
      secHTML("合作优势（互补性）", "#5cff9d", '<p>' + rel.advantage + '</p>') +
      secHTML("可能获得的发展机会", "#4dd8ff", '<p>' + rel.opportunity + '</p>') +
      secHTML("对区域整体的意义", "#b06bff", '<p>' + rel.regional + '</p>') +
      '<div class="hint-next">动画表示<b>合作潜力与要素流动情景</b>，光环不代表真实 GDP 增长。</div>' +
      '<div class="panel-foot">' + DATA.sourceNote + '</div>'
    );
  }

  function barrierPanelHTML(a, b, rel, title) {
    return (
      '<span class="panel-eyebrow">协同受阻 BARRIERS</span>' +
      '<div class="panel-title">' + a.name + '<span class="x">⇌</span>' + b.name + '</div>' +
      '<div class="panel-sub">' + title + '</div>' +
      '<span class="badge weak">✖ 协同基础较弱 / 受阻情景</span>' +
      '<div class="sec"><h3>主要制约因素</h3>' + barrierTagsHTML(rel.barriers) + '</div>' +
      secHTML("现状说明", "#ff7a8a", '<p>' + rel.detail + '</p>') +
      secHTML("可能的改善路径", "#5cff9d", '<ul>' + rel.improvements.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>') +
      '<div class="hint-next">受阻情景用于解释<b>区域协调发展的必要性</b>：协同不是自动实现的，需要机制建设。</div>' +
      '<div class="panel-foot">' + DATA.sourceNote + '</div>'
    );
  }

  function strongPanelHTML(a, b, rel) {
    return (
      '<span class="panel-eyebrow">协同对照 ANALYSIS</span>' +
      '<div class="panel-title">' + a.name + '<span class="x">⇌</span>' + b.name + '</div>' +
      '<div class="panel-sub">' + rel.title + '</div>' +
      '<span class="badge strong">✔ 该组合协同基础较好</span>' +
      '<div class="chips">' + (rel.types || []).map(function (t) { return chipHTML(t, DATA.flowTypes[t] || "#4dd8ff"); }).join('') + '</div>' +
      secHTML("协同基础", "#5cff9d", '<p>' + rel.advantage + '</p>') +
      secHTML("巩固与深化路径", "#4dd8ff", '<ul>' + DATA.strongConsolidate(a.name, b.name).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>') +
      '<div class="hint-next">可对照选择<b>薄弱组合</b>（如 苏州—宁波、合肥—宁波、芜湖—宁波），分析协同为何受阻。</div>' +
      '<div class="panel-foot">' + DATA.sourceNote + '</div>'
    );
  }

  /* ---------- 关系判定与交互 ---------- */
  function getRelation(nameA, nameB) {
    const key = [nameA, nameB].sort().join("|");
    return DATA.relations[key] || DATA.mediumRelation(nameA, nameB);
  }
  function cityByName(nm) {
    return DATA.cities.find(function (c) { return c.name === nm; });
  }
  /* 镜头辅助：屏幕右向量 / 仅平移目标（面板让位）/ 全飞行 */
  function cameraRight() {
    return new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  }
  function flyTargetTo(point) {
    tweenPosActive = false; tweenTarget.copy(point);
    tweening = true; tweenT = 0; tweenDur = 1.4;
  }
  function flyTo(pos, tgt, dur) {
    tweenPosActive = true;
    tweenFrom.copy(camera.position); tweenTo.copy(pos); tweenTarget.copy(tgt);
    tweening = true; tweenT = 0; tweenDur = dur || 1.8;
  }

  function onCityClick(city) {
    if (mode === 1) {
      clearFlows(); clearSelectionVisual();
      selection = [city];
      const n = nodeByCity(city); n.selected = true;
      showPanel(cityPanelHTML(city));
      // 镜头轻推聚焦，并沿屏幕右向偏移给面板让位
      flyTargetTo(new THREE.Vector3(n.group.position.x, 0, n.group.position.z)
        .addScaledVector(cameraRight(), 5.5));
      updateHint();
      return;
    }
    // 模式 2 / 3
    if (selection.length >= 2) { clearFlows(); clearSelectionVisual(); selection = []; }
    if (selection.length === 1 && selection[0].name === city.name) return; // 忽略重复点击
    selection.push(city);
    const n = nodeByCity(city); n.selected = true;
    if (selection.length === 2) {
      evaluatePair();
    } else {
      hidePanel(); clearFlows();
    }
    updateHint();
  }

  function evaluatePair() {
    const a = selection[0], b = selection[1];
    const rel = getRelation(a.name, b.name);
    const nA = nodeByCity(a), nB = nodeByCity(b);
    // 镜头缓慢聚焦两点中点，并向屏幕右偏移给信息面板让位
    const mid3 = nodeTop(nA).clone().add(nodeTop(nB)).multiplyScalar(0.5);
    mid3.y = 0;
    mid3.addScaledVector(cameraRight(), 6.5);
    flyTargetTo(mid3);

    if (mode === 2) {
      if (rel.level === "strong") {
        addFlow(nA, nB, rel.types, true);
        showPanel(coopPanelHTML(a, b, rel));
      } else if (rel.level === "medium") {
        addFlow(nA, nB, rel.types, false);
        showPanel(coopPanelHTML(a, b, rel));
      } else {
        addBlocked(nA, nB, rel);
        showPanel(barrierPanelHTML(a, b, rel, "协同受阻分析"));
      }
    } else { // 模式 3
      if (rel.level === "strong") {
        addFlow(nA, nB, rel.types, false);
        showPanel(strongPanelHTML(a, b, rel));
      } else {
        const rel2 = rel.level === "weak" ? rel : DATA.genericBarriers(a.name, b.name);
        addBlocked(nA, nB, rel2);
        showPanel(barrierPanelHTML(a, b, rel2, "受阻原因与改善路径"));
      }
    }
  }

  /* ---------- 模式切换 / 重置 / 旋转 ---------- */
  function setMode(m) {
    mode = m;
    selection = [];
    clearFlows(); clearSelectionVisual(); hidePanel(); updateHint();
    document.querySelectorAll("#modeTabs .tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.mode === String(m));
    });
  }
  document.getElementById("modeTabs").addEventListener("click", function (e) {
    const btn = e.target.closest(".tab");
    if (btn) setMode(parseInt(btn.dataset.mode, 10));
  });

  function resetDemo() {
    autoCancel = true; // 重置会终止自动演示
    setMode(mode);
    flyTo(HOME_POS.clone(), HOME_TGT.clone(), 1.8);
    if (controls.autoRotate) { controls.autoRotate = false; document.getElementById("btnRotate").classList.remove("on"); }
  }
  document.getElementById("btnReset").addEventListener("click", resetDemo);

  const btnRotate = document.getElementById("btnRotate");
  btnRotate.addEventListener("click", function () {
    controls.autoRotate = !controls.autoRotate;
    btnRotate.classList.toggle("on", controls.autoRotate);
  });

  /* 开场：点亮研究区域（周边保持灰暗，聚焦教学范围） */
  const btnLit = document.createElement("button");
  btnLit.id = "btnLit";
  btnLit.className = "primary-btn lit-btn";
  btnLit.innerHTML = "✦ 点亮研究区域";
  document.querySelector(".topbar-actions").insertBefore(btnLit, btnRotate);
  btnLit.addEventListener("click", function () {
    if (lit) return;
    lit = true;
    btnLit.disabled = true;
    btnLit.classList.add("done");
    btnLit.innerHTML = "✦ 已聚焦长三角";
    updateHint();
  });

  /* ---------- 拾取 ---------- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0, downY = 0;

  canvas.addEventListener("pointerdown", function (e) { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener("pointerup", function (e) {
    if (!lit) return; // 未点亮时不响应城市点击
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // 拖动不触发
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    if (hits.length) onCityClick(hits[0].object.userData.city);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!lit) { canvas.style.cursor = "default"; return; }
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    canvas.style.cursor = hits.length ? "pointer" : "default";
  });

  /* 双击城市：镜头飞至该城上空并展示画像 */
  canvas.addEventListener("dblclick", function (e) {
    if (!lit) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    if (!hits.length) return;
    const city = hits[0].object.userData.city;
    const n = nodeByCity(city);
    const cPos = new THREE.Vector3(n.group.position.x, 1.2, n.group.position.z);
    const dirv = new THREE.Vector3().subVectors(camera.position, controls.target);
    dirv.y = Math.max(7, dirv.y * 0.55);
    if (dirv.lengthSq() < 0.01) dirv.set(0, 0.7, 0.7);
    dirv.normalize();
    flyTo(cPos.clone().addScaledVector(dirv, 17), cPos, 1.6);
    clearFlows(); clearSelectionVisual();
    selection = [city]; n.selected = true;
    showPanel(cityPanelHTML(city));
    updateHint();
  });

  /* ---------- 相机补间 ---------- */
  let tweening = true, tweenT = 0, tweenPosActive = true, tweenDur = 1.8;
  const tweenFrom = camera.position.clone();
  const tweenTo = HOME_POS.clone();
  const tweenTarget = HOME_TGT.clone();
  controls.addEventListener("start", function () {
    tweening = false;
    if (autoRunning) autoCancel = true; // 用户接管即停止自动演示
  });

  /* ---------- 一键自动演示 ---------- */
  let autoRunning = false, autoCancel = false;
  const btnAuto = document.createElement("button");
  btnAuto.id = "btnAuto";
  btnAuto.className = "primary-btn";
  btnAuto.innerHTML = "▶ 自动演示";
  document.querySelector(".topbar-actions").insertBefore(btnAuto, btnLit);
  btnAuto.addEventListener("click", function () { autoDemo(); });

  function autoSleep(ms) {
    return new Promise(function (resolve) {
      const t0 = performance.now();
      (function chk() {
        if (autoCancel || performance.now() - t0 >= ms) return resolve();
        requestAnimationFrame(chk);
      })();
    });
  }

  async function autoPair(na, nb) {
    clearFlows(); clearSelectionVisual(); selection = [];
    const a = cityByName(na), b = cityByName(nb);
    selection = [a, b];
    nodeByCity(a).selected = true; nodeByCity(b).selected = true;
    hintEl.innerHTML = "【自动演示】<b>" + na + " ⇌ " + nb + "</b>";
    evaluatePair();
  }

  async function autoDemo() {
    if (autoRunning) { autoCancel = true; return; }
    autoRunning = true; autoCancel = false;
    btnAuto.textContent = "⏹ 停止演示";
    btnAuto.classList.add("on");
    try {
      if (!lit) { btnLit.click(); await autoSleep(2200); if (autoCancel) return; }
      /* 第一步：认识城市 */
      setMode(1);
      flyTo(HOME_POS.clone(), HOME_TGT.clone(), 1.5);
      hintEl.innerHTML = "【自动演示】第一步 · 认识城市：不同的区位与家底";
      await autoSleep(2000); if (autoCancel) return;
      const tour = ["上海", "苏州", "杭州", "合肥"];
      for (const nm of tour) {
        const c = cityByName(nm), n = nodeByCity(c);
        clearFlows(); clearSelectionVisual();
        selection = [c]; n.selected = true;
        showPanel(cityPanelHTML(c));
        flyTargetTo(new THREE.Vector3(n.group.position.x, 0, n.group.position.z)
          .addScaledVector(cameraRight(), 5.5));
        hintEl.innerHTML = "【自动演示】认识城市 · <b>" + nm + "</b>";
        await autoSleep(4200); if (autoCancel) return;
      }
      /* 第二步：建立协同 */
      setMode(2);
      hintEl.innerHTML = "【自动演示】第二步 · 建立协同：优势互补、要素流动";
      await autoSleep(1200); if (autoCancel) return;
      const pairs = [["上海", "苏州"], ["上海", "合肥"], ["合肥", "芜湖"]];
      for (const pr of pairs) {
        await autoPair(pr[0], pr[1]); if (autoCancel) return;
        await autoSleep(6500); if (autoCancel) return;
      }
      /* 第三步：分析阻碍 */
      setMode(3);
      hintEl.innerHTML = "【自动演示】第三步 · 分析阻碍：协同并非自动实现";
      await autoSleep(1200); if (autoCancel) return;
      await autoPair("苏州", "宁波"); if (autoCancel) return;
      await autoSleep(7500); if (autoCancel) return;
      /* 收尾 */
      flyTo(HOME_POS.clone(), HOME_TGT.clone(), 1.8);
      hidePanel(); clearFlows(); clearSelectionVisual(); selection = [];
      hintEl.innerHTML = "【自动演示】结束 —— 可自由操作，点击任意两个城市继续探究";
    } finally {
      autoRunning = false; autoCancel = false;
      btnAuto.textContent = "▶ 自动演示";
      btnAuto.classList.remove("on");
      updateHint();
    }
  }

  /* ---------- 图例 ---------- */
  (function buildLegend() {
    document.getElementById("legendRow").innerHTML =
      Object.keys(DATA.flowTypes).map(function (t) {
        return '<span class="lg-item"><span class="lg-dot" style="color:' + DATA.flowTypes[t] + '"></span>' + t + '</span>';
      }).join('') +
      '<span class="lg-item"><span class="lg-dot" style="color:#a8c8e8"></span>铁路（高铁）</span>' +
      '<span class="lg-item"><span class="lg-dot" style="color:#ffb84d"></span>高速主干</span>' +
      '<span class="lg-item"><span class="lg-dot" style="color:#d8a960"></span>高速一般</span>' +
      '<span class="lg-item"><span class="lg-dot" style="color:#ff4d6d"></span>受阻标记</span>';
    document.getElementById("legendNote").textContent = "操作：左键拖动平移 · 右键拖动旋转 · 滚轮缩放 | 区域轮廓与长江为教学示意绘制 · " + DATA.sourceNote;
    // 图例折叠
    document.getElementById("legendToggle").addEventListener("click", function () {
      document.getElementById("legend").classList.toggle("collapsed");
    });
  })();

  /* ---------- 主循环 ---------- */
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const GRAY = new THREE.Color(0x1c2733);
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  const clock = new THREE.Clock();

  function applyLitState(dt) {
    if (lit && litP < 1) litP = Math.min(1, litP + dt / 1.6);
    // 近景自动减弱蓝光与泛光：俯瞰时发光氛围足，拉近分析时不刺眼
    const camDist = camera.position.distanceTo(controls.target);
    const glowK = Math.max(0.35, Math.min(1, (camDist - 10) / 32));
    bloom.strength = 0.5 + 0.35 * glowK;
    const e = litP < 1 ? 1 - Math.pow(1 - litP, 3) : 1; // easeOutCubic
    litMats.fills.forEach(function (r) {
      const nearMul = r.nearFactor !== undefined ? (0.35 + 0.65 * glowK) : 1;
      r.mat.opacity = (r.off + (r.on - r.off) * e) * nearMul;
      if (!r.noColorLerp) r.mat.color.copy(GRAY).lerp(r.color, e);
    });
    litMats.lines.forEach(function (r) { r.mat.opacity = r.off + (r.on - r.off) * e; });
    litMats.trunks.forEach(function (r) { r.mat.opacity = r.off + (r.on - r.off) * e; });
    litMats.stations.forEach(function (r) { r.mat.opacity = r.off + (r.on - r.off) * e; });
    litMats.river.forEach(function (r) { r.mat.opacity = r.off + (r.on - r.off) * e; });
    provinceLabels.forEach(function (pl) { pl.el.style.opacity = (0.35 + 0.65 * e).toFixed(2); });
    railLabels.forEach(function (rl) { rl.el.style.opacity = (0.9 * e).toFixed(2); });
    // 城市依次弹出
    cityNodes.forEach(function (n, i) {
      const a = Math.max(0, Math.min(1, e * 1.7 - i * 0.07));
      n.group.visible = a > 0.001;
      const s = Math.max(0.001, easeOutBack(a));
      n.group.scale.setScalar(s);
      n.disc.material.opacity = n.discBase * glowK;   // 近景减弱城市光晕
      n.orbGlow.material.opacity = 0.55 * (0.5 + 0.5 * glowK);
      n.labelEl.style.opacity = a.toFixed(2);
      n.labelEl.style.display = a > 0.01 ? "block" : "none";
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    applyLitState(dt);

    // 悬浮光球呼吸 & 光环
    cityNodes.forEach(function (n) {
      n.orb.position.y = n.orbBaseY + Math.sin(t * 1.3 + n.phase) * 0.12;
      const s = 1 + Math.sin(t * 2.2 + n.phase) * 0.07 + (n.selected ? 0.25 : 0);
      n.orb.scale.set(s, s, s);
      n.ring.material.opacity = n.selected ? 0.7 + Math.sin(t * 4) * 0.3 : 0.4 + Math.sin(t * 2 + n.phase) * 0.12;
    });

    // 粒子流
    activeFlows.forEach(function (f) {
      f.streams.forEach(function (st) {
        const arr = st.attr.array;
        for (let i = 0; i < st.tArr.length; i++) {
          const tt = (st.tArr[i] + t * st.speed) % 1;
          st.curve.getPoint(tt, tmpV);
          tmpV.y += st.lane;
          arr[i * 3] = tmpV.x; arr[i * 3 + 1] = tmpV.y; arr[i * 3 + 2] = tmpV.z;
        }
        st.attr.needsUpdate = true;
      });
      f.halos.forEach(function (h) {
        h.t = (h.t + dt * h.speed) % 1;
        const s = 1 + h.t * (h.maxScale - 1);
        h.mesh.scale.set(s, s, s);
        h.mat.opacity = (1 - h.t) * 0.75;
      });
      if (f.barrier) {
        f.barrier.rotation.y += dt * 1.6;
        f.barrier.rotation.x += dt * 0.7;
        const bs = 1 + Math.sin(t * 4.5) * 0.18;
        f.barrier.scale.set(bs, bs, bs);
      }
    });

    // 相机补间（tweenPosActive=false 时仅平移观察目标，不移动机位）
    if (tweening) {
      tweenT += dt / tweenDur;
      const k = tweenT >= 1 ? 1 : 1 - Math.pow(1 - tweenT, 3);
      if (tweenPosActive) camera.position.lerpVectors(tweenFrom, tweenTo, k);
      controls.target.lerp(tweenTarget, 0.12);
      if (tweenT >= 1 && controls.target.distanceTo(tweenTarget) < 0.05) tweening = false;
    }

    controls.update();
    // 软性边界：防止视角跑丢，但范围足够宽松不影响操作
    controls.target.x = Math.max(-52, Math.min(52, controls.target.x));
    controls.target.z = Math.max(-58, Math.min(58, controls.target.z));
    controls.target.y = Math.max(0, Math.min(26, controls.target.y));
    composer.render();

    // HTML 标签跟随
    const w = window.innerWidth, h = window.innerHeight;
    cityNodes.forEach(function (n) {
      tmpV.set(n.group.position.x, n.orb.position.y + 0.55, n.group.position.z).project(camera);
      const vis = tmpV.z < 1;
      n.labelEl.style.display = vis ? "block" : "none";
      if (vis) {
        const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
        n.labelEl.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
      }
    });
    provinceLabels.forEach(function (pl) {
      tmpV.set(pl.x, 0.4, pl.z).project(camera);
      const vis = tmpV.z < 1;
      pl.el.style.display = vis ? "block" : "none";
      if (vis) {
        const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
        pl.el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) translate(-50%,-50%)";
      }
    });
    railLabels.forEach(function (rl) {
      tmpV.set(rl.x, 0.35, rl.z).project(camera);
      const vis = tmpV.z < 1;
      rl.el.style.display = vis ? "block" : "none";
      if (vis) {
        const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
        rl.el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) translate(-50%,-50%)";
      }
    });
  }

  /* ---------- 自适应 ---------- */
  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------- 启动 ---------- */
  updateHint();
  animate();
  setTimeout(function () {
    const l = document.getElementById("loader");
    if (l) { l.classList.add("done"); setTimeout(function () { l.remove(); }, 900); }
  }, 400);
})();
