// 3D-древо рода: главная линия растёт от корня (Георгий Житник),
// остальные родовые линии стоят рощей вокруг. Ветка — человек,
// толщина — вес его потомства, листья — люди: мох — живые, янтарь — ушедшие.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const GOLDEN = 2.399963; // золотой угол
const GROW_YEARS = 16;   // ветка вырастает за столько лет

// ————— данные —————
function birthYearOf(p, fallback) {
  return p.birth?.date?.year ?? fallback;
}

function buildLineage(DB, rootId) {
  const { persons, families } = DB;
  const seen = new Set();
  let minY = 9999, maxY = 1850, count = 0;
  function node(pid, parentYear) {
    if (seen.has(pid)) return null;
    seen.add(pid);
    const p = persons[pid];
    const birth = birthYearOf(p, parentYear + 27);
    minY = Math.min(minY, birth); maxY = Math.max(maxY, birth);
    count++;
    const children = [];
    for (const fid of p.fams || []) {
      for (const c of families[fid]?.children || []) {
        if (persons[c]) {
          const n = node(c, birth);
          if (n) children.push(n);
        }
      }
    }
    const size = 1 + children.reduce((s, c) => s + c.size, 0);
    return { p, birth, children, size };
  }
  const root = node(rootId, 1845);
  return { root, ids: seen, minY, maxY, count };
}

function findGeorgiy(DB) {
  const byName = Object.values(DB.persons).find(
    p => p.given === "Георгий" && (p.surname || "").startsWith("Житник"));
  return byName?.id || "I500582";
}

function otherLineages(DB, excludeIds, limit = 8) {
  const { persons, families } = DB;
  const descIds = (rootId) => {
    const seen = new Set(), stack = [rootId];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const fid of persons[cur].fams || [])
        for (const c of families[fid]?.children || [])
          if (persons[c]) stack.push(c);
    }
    return seen;
  };
  const roots = Object.values(persons)
    .filter(p => !(p.famc || []).length && (p.fams || []).length)
    .map(p => ({ id: p.id, ids: descIds(p.id) }))
    .sort((a, b) => b.ids.size - a.ids.size);
  const taken = new Set(excludeIds);
  const out = [];
  for (const r of roots) {
    if (r.ids.size < 12 || out.length >= limit) continue;
    let overlap = 0;
    for (const id of r.ids) if (taken.has(id)) overlap++;
    if (overlap / r.ids.size > 0.5) continue;
    out.push(r.id);
    for (const id of r.ids) taken.add(id);
  }
  return out;
}

// ————— геометрия —————
// Сужающаяся трубка вдоль кривой; кончик сходится в точку.
function taperedTube(curve, r0, r1, tubular = 7, radial = 5) {
  const pos = [], norm = [], idx = [];
  const frames = curve.computeFrenetFrames(tubular, false);
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const c = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nx = Math.cos(a) * N.x + Math.sin(a) * B.x;
      const ny = Math.cos(a) * N.y + Math.sin(a) * B.y;
      const nz = Math.cos(a) * N.z + Math.sin(a) * B.z;
      pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
      norm.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial;
      const c = a + radial, d = b + radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  g.setIndex(idx);
  return g;
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.5, 0.15, 0.62, 0.7, 0, 1.15);
  s.bezierCurveTo(-0.62, 0.7, -0.5, 0.15, 0, 0);
  const g = new THREE.ShapeGeometry(s, 4);
  g.scale(0.62, 0.62, 0.62);
  return g;
}

// ————— главный вход —————
export function mountDrevo(container, DB, ui) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a140b, 0.010);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0, 8, 30);

  // небо: сумеречный градиент лес/закат
  {
    const cv = document.createElement("canvas"); cv.width = 4; cv.height = 256;
    const ctx = cv.getContext("2d");
    const gr = ctx.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#0c1712");
    gr.addColorStop(0.45, "#16211a");
    gr.addColorStop(0.75, "#2c2212");
    gr.addColorStop(1, "#3a2a10");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
    scene.add(sky);
  }

  scene.add(new THREE.HemisphereLight(0xffe0a8, 0x1c2a14, 0.85));
  const sun = new THREE.DirectionalLight(0xffb45e, 2.6);
  sun.position.set(18, 26, 10);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7fb1ff, 0.6);
  rim.position.set(-16, 12, -18);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x3a3020, 0.6));

  // тёплое свечение за древом
  {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const ctx = cv.getContext("2d");
    const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(255,190,110,.55)");
    gr.addColorStop(0.5, "rgba(190,120,50,.18)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
    const gtex = new THREE.CanvasTexture(cv);
    gtex.colorSpace = THREE.SRGBColorSpace;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: gtex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.setScalar(66);
    glow.position.set(0, 14, -12);
    scene.add(glow);
  }

  // почва: мшистая поляна
  const groundTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const ctx = cv.getContext("2d");
    const gr = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    gr.addColorStop(0, "#2d3617"); gr.addColorStop(0.4, "#222b12"); gr.addColorStop(1, "#151a0c");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(170, 48),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // светлячки
  const fireflies = [];
  {
    const cv = document.createElement("canvas"); cv.width = cv.height = 32;
    const ctx = cv.getContext("2d");
    const gr = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    gr.addColorStop(0, "#ffe9b0"); gr.addColorStop(0.4, "rgba(255,200,90,.5)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 44; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
      sp.scale.setScalar(0.1 + Math.random() * 0.16);
      sp.userData.o = {
        r: 3 + Math.random() * 13, a: Math.random() * Math.PI * 2,
        h: 0.6 + Math.random() * 7, sp: 0.05 + Math.random() * 0.2,
        ph: Math.random() * Math.PI * 2,
      };
      scene.add(sp);
      fireflies.push(sp);
    }
  }

  // материалы коры по глубине — тёплое старое дерево
  const barkColors = [0x5a4028, 0x64482c, 0x6e5030, 0x785834, 0x826036, 0x8c6838];
  const barkMats = barkColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const leafGeo = leafGeometry();
  const aliveMats = [0x6f9c3c, 0x82ab4a, 0x5c8a33].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, side: THREE.DoubleSide, emissive: 0x1a260a }));
  const deadMats = [0xc9913f, 0xb87f33].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, side: THREE.DoubleSide, emissive: 0x2b1c07 }));
  const matAlive = aliveMats[0];
  const matDead = deadMats[0];
  const matDeco = aliveMats[1];

  const growable = [];        // {group, birth}
  const personLeaves = [];    // интерактивные листья
  const lineageGroups = [];   // фоновые деревья

  const UP = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();

  function rand(seedObj) { // детерминированный псевдослучай на id
    seedObj.s = (seedObj.s * 9301 + 49297) % 233280;
    return seedObj.s / 233280;
  }

  function buildBranch(node, parentGroup, origin, dir, len, radius, depth, opts) {
    const rnd = { s: [...node.p.id].reduce((a, ch) => a + ch.charCodeAt(0), depth * 7) };
    const group = new THREE.Group();
    group.position.copy(origin);
    parentGroup.add(group);
    growable.push({ group, birth: node.birth });
    group.scale.setScalar(0.0001);

    const end = dir.clone().multiplyScalar(len);
    const bowK = depth === 0 ? 0.02 : depth === 1 ? 0.07 : 0.10 + rand(rnd) * 0.10;
    const bow = new THREE.Vector3(rand(rnd) - 0.5, (rand(rnd) - 0.5) * 0.4, rand(rnd) - 0.5)
      .cross(dir).normalize().multiplyScalar(len * bowK);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0), end.clone().multiplyScalar(0.5).add(bow), end);
    const rTip = node.children.length ? radius * 0.72 : radius * 0.28;
    const tube = new THREE.Mesh(
      taperedTube(curve, radius, Math.max(rTip, 0.015), opts.compact ? 5 : 7, opts.compact ? 4 : 5),
      barkMats[Math.min(depth, barkMats.length - 1)]);
    group.add(tube);

    // листва: человек = заметный лист + пышная гроздь вокруг
    if (opts.interactive) {
      const dead = !!(node.p.death);
      const mats = dead ? deadMats : aliveMats;
      const leaf = new THREE.Mesh(leafGeo, dead ? matDead : matAlive);
      leaf.position.copy(end);
      leaf.rotation.set(rand(rnd) * 0.8 - 0.4, rand(rnd) * Math.PI * 2, rand(rnd) * 0.9 - 0.45);
      leaf.scale.setScalar(1.5);
      leaf.userData.person = node.p;
      leaf.userData.birth = node.birth;
      group.add(leaf);
      personLeaves.push(leaf);
      const extra = node.children.length ? 12 : 16;
      for (let i = 0; i < extra; i++) {
        const d = new THREE.Mesh(leafGeo, mats[Math.floor(rand(rnd) * mats.length)]);
        d.position.copy(end).add(new THREE.Vector3(rand(rnd) - .5, rand(rnd) * .8 - .15, rand(rnd) - .5).multiplyScalar(2.0));
        d.rotation.set(rand(rnd) * 2.4, rand(rnd) * Math.PI * 2, rand(rnd) * 2.4);
        d.scale.setScalar(1.0 + rand(rnd) * 0.9);
        group.add(d);
      }
    } else if (!node.children.length || depth >= opts.maxDepth) {
      for (let i = 0; i < 10; i++) {
        const d = new THREE.Mesh(leafGeo, aliveMats[Math.floor(rand(rnd) * aliveMats.length)]);
        d.position.copy(end).add(new THREE.Vector3(rand(rnd) - .5, rand(rnd) * .7 - .1, rand(rnd) - .5).multiplyScalar(1.8));
        d.rotation.set(rand(rnd) * 2.4, rand(rnd) * Math.PI * 2, rand(rnd) * 2.4);
        d.scale.setScalar(1.1 + rand(rnd) * 0.9);
        group.add(d);
      }
    }

    if (opts.interactive && depth >= 2) {
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Mesh(leafGeo, aliveMats[Math.floor(rand(rnd) * aliveMats.length)]);
        d.position.copy(end).multiplyScalar(0.4 + rand(rnd) * 0.4)
          .add(new THREE.Vector3(rand(rnd) - .5, rand(rnd) * .5, rand(rnd) - .5).multiplyScalar(0.7));
        d.rotation.set(rand(rnd) * 2.4, rand(rnd) * Math.PI * 2, rand(rnd) * 2.4);
        d.scale.setScalar(0.7 + rand(rnd) * 0.5);
        group.add(d);
      }
    }
    if (depth >= opts.maxDepth) return group;
    const kids = node.children;
    kids.forEach((child, i) => {
      const solo = kids.length === 1;
      const azim = i * GOLDEN + rand(rnd) * 0.9;
      const tilt = solo
        ? 0.10 + rand(rnd) * 0.14
        : (0.42 + rand(rnd) * 0.3) * (depth === 0 ? 0.55 : depth === 1 ? 0.7 : 0.8);
      // перпендикуляр к dir, повёрнутый на azim вокруг dir
      const perp = new THREE.Vector3(1, 0, 0).cross(dir);
      if (perp.lengthSq() < 0.01) perp.set(0, 0, 1);
      perp.normalize().applyQuaternion(tmpQ.setFromAxisAngle(dir, azim));
      const childDir = dir.clone().applyQuaternion(tmpQ.setFromAxisAngle(perp, tilt));
      childDir.lerp(UP, 0.18 + depth * 0.02).normalize();
      let childLen = Math.max(len * 0.56, opts.unit * (0.55 + Math.pow(child.size, 0.28)));
      if (solo) childLen *= 0.55;
      const childR = Math.max(radius * Math.pow(child.size / node.size, 0.42) * 0.95, 0.035);
      buildBranch(child, group, end, childDir, childLen, childR, depth + 1, opts);
    });
    return group;
  }

  // ——— главное дерево ———
  const georgiy = findGeorgiy(DB);
  const main = buildLineage(DB, georgiy);
  const mainRootGroup = new THREE.Group();
  scene.add(mainRootGroup);
  // ствол до первой развилки
  const trunkNode = { p: main.root.p, birth: main.minY - 12, children: [main.root], size: main.root.size + 1 };
  buildBranch(trunkNode, mainRootGroup, new THREE.Vector3(0, 0, 0), UP.clone(), 5.4,
    0.72, 0, { interactive: true, maxDepth: 12, unit: 2.4, compact: false });

  // корни у основания
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const dir = new THREE.Vector3(Math.cos(a), -0.12, Math.sin(a)).normalize();
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.4, 0),
      dir.clone().multiplyScalar(1.1).setY(0.12),
      dir.clone().multiplyScalar(2.4).setY(-0.05));
    const root = new THREE.Mesh(taperedTube(curve, 0.34, 0.05, 5, 4), barkMats[0]);
    mainRootGroup.add(root);
  }

  // ——— роща других линий ———
  const others = otherLineages(DB, main.ids);
  others.forEach((rootId, i) => {
    const lin = buildLineage(DB, rootId);
    const g = new THREE.Group();
    const a = (i / others.length) * Math.PI * 2 + 0.55;
    const dist = 21 + (i % 3) * 6;
    g.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
    const s = 0.5 + Math.min(0.45, lin.count / 130);
    g.scale.setScalar(s);
    scene.add(g);
    const tn = { p: lin.root.p, birth: lin.minY - 12, children: [lin.root], size: lin.root.size + 1 };
    buildBranch(tn, g, new THREE.Vector3(0, 0, 0), UP.clone(), 4.4, 0.58, 0,
      { interactive: false, maxDepth: 3, unit: 1.7, compact: true });
    const rp = DB.persons[rootId];
    g.userData.lineage = {
      rootId,
      label: `Род: ${[rp.given, rp.surname].filter(Boolean).join(" ")}`,
      n: lin.count,
    };
    lineageGroups.push(g);
  });

  // ——— камера/управление ———
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.52;

  function frameCamera() {
    const box = new THREE.Box3().setFromObject(mainRootGroup);
    const h = Math.max(box.max.y, 12);
    const c = box.getCenter(new THREE.Vector3());
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    controls.target.set(c.x, h * 0.5, c.z);
    const dist = Math.max(h, w) * 1.45;
    camera.position.set(c.x + dist * 0.22, h * 0.55, c.z + dist);
    controls.update();
  }

  // ——— рост ———
  let year = 0; // выставится ниже
  const YEAR_END = Math.max(main.maxY + GROW_YEARS, 2026);
  const YEAR_START = main.minY - 12;
  let playing = true;
  function setYear(y, fromSlider) {
    year = Math.max(YEAR_START, Math.min(YEAR_END, y));
    if (fromSlider) playing = false;
    for (const g of growable) {
      const t = (year - g.birth) / GROW_YEARS;
      const s = t <= 0 ? 0.0001 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      g.group.scale.setScalar(Math.max(s, 0.0001));
      g.group.visible = t > 0;
    }
    if (ui.yearEl) ui.yearEl.textContent = Math.round(Math.min(year, Math.max(main.maxY, 2026)));
    if (ui.sliderEl && !fromSlider) ui.sliderEl.value = Math.round(year);
  }
  if (ui.sliderEl) {
    ui.sliderEl.min = YEAR_START; ui.sliderEl.max = YEAR_END; ui.sliderEl.value = YEAR_END;
    ui.sliderEl.addEventListener("input", () => setYear(+ui.sliderEl.value, true));
  }
  playing = false;
  setYear(YEAR_END);

  // ——— интерактив ———
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-2, -2);
  let hover = null;
  const tip = document.getElementById("w3dTip");
  function onMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    tip.style.left = Math.min(e.clientX + 16, innerWidth - 240) + "px";
    tip.style.top = (e.clientY - 14) + "px";
  }
  function pick() {
    ray.setFromCamera(mouse, camera);
    const hitLeaf = ray.intersectObjects(personLeaves, false)[0];
    if (hitLeaf) return { type: "person", obj: hitLeaf.object };
    const hitTree = ray.intersectObjects(lineageGroups, true)[0];
    if (hitTree) {
      let o = hitTree.object;
      while (o && !o.userData.lineage) o = o.parent;
      if (o) return { type: "lineage", obj: o };
    }
    return null;
  }
  function onClick() {
    if (!hover) return;
    if (hover.type === "person") ui.onOpenPerson?.(hover.obj.userData.person.id);
    else ui.onFocusLineage?.(hover.obj.userData.lineage.rootId);
  }
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("click", onClick);

  // ——— цикл ———
  const clock = new THREE.Clock();
  let raf = 0, disposed = false;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  frameCamera(); // дерево уже в полном росте

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    for (const f of fireflies) {
      const o = f.userData.o;
      o.a += dt * o.sp * 0.35;
      f.position.set(
        Math.cos(o.a) * o.r,
        o.h + Math.sin(t * 0.7 + o.ph) * 0.8,
        Math.sin(o.a) * o.r);
      f.material.opacity = 0.3 + 0.3 * Math.sin(t * 1.6 + o.ph);
    }
    if (playing) {
      setYear(year + dt * 26);
      if (year >= YEAR_END) playing = false;
    }
    const h = pick();
    const prevKey = hover && (hover.type + (hover.obj.uuid));
    const newKey = h && (h.type + (h.obj.uuid));
    if (newKey !== prevKey) {
      hover = h;
      if (h) {
        renderer.domElement.style.cursor = "pointer";
        if (h.type === "person") {
          const p = h.obj.userData.person;
          const yrs = [p.birth?.date?.year, p.death?.date?.year].filter(Boolean).join(" — ");
          tip.innerHTML = `<b>${[p.given, p.surname].filter(Boolean).join(" ")}</b><span>${yrs || "годы неизвестны"} · открыть страницу</span>`;
        } else {
          const l = h.obj.userData.lineage;
          tip.innerHTML = `<b>${l.label}</b><span>${l.n} чел. · открыть в древе</span>`;
        }
        tip.hidden = false;
        tip.classList.remove("neon");
      } else {
        renderer.domElement.style.cursor = "";
        tip.hidden = true;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }
  loop();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      tip.hidden = true;
      scene.traverse(o => { o.geometry?.dispose?.(); });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
