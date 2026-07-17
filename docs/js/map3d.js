// Неоновая карта расселения рода — развёрнутая (плоская) 3D-карта:
// береговые линии, светящиеся точки мест, дуги миграций над плоскостью.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SC = 0.22;                       // градус → юниты
const px = (lon) => lon * SC;
const pz = (lat) => -lat * SC;

function glowTexture(color) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function mountMap(container, DB, ui) {
  const [places, coastlines] = await Promise.all([
    fetch("places.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("coastline.json").then(r => r.json()),
  ]);

  // ——— агрегация: место → люди ———
  const spots = new Map();
  function addPerson(placeStr, person, kind) {
    const geo = places[placeStr];
    if (!geo) return null;
    const key = geo.lat.toFixed(1) + "," + geo.lon.toFixed(1);
    if (!spots.has(key)) spots.set(key, { ...geo, people: [], key });
    spots.get(key).people.push({ id: person.id, kind });
    return spots.get(key);
  }
  const personSpot = new Map();
  for (const p of Object.values(DB.persons)) {
    const b = p.birth?.place && addPerson(p.birth.place, p, "род.");
    if (b) personSpot.set(p.id, b);
    if (p.death?.place) addPerson(p.death.place, p, "ум.");
  }

  const arcPairs = new Map();
  for (const f of Object.values(DB.families)) {
    for (const parentId of [f.husband, f.wife]) {
      const ps = parentId && personSpot.get(parentId);
      if (!ps) continue;
      for (const c of f.children || []) {
        const cs = personSpot.get(c);
        if (!cs || cs.key === ps.key) continue;
        arcPairs.set(ps.key + ">" + cs.key, [ps, cs]);
      }
    }
  }

  // ——— сцена ———
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04070f, 0.004);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 500);

  // подложка карты
  {
    const cv = document.createElement("canvas"); cv.width = cv.height = 512;
    const ctx = cv.getContext("2d");
    const gr = ctx.createRadialGradient(256, 256, 30, 256, 256, 300);
    gr.addColorStop(0, "#08131f"); gr.addColorStop(0.7, "#050b16"); gr.addColorStop(1, "#03060d");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 512, 512);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(px(180) * 2.4, -pz(90) * 2.6),
      (() => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t }); })());
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.06;
    scene.add(plane);
  }

  // сетка координат
  {
    const segs = [];
    for (let lon = -180; lon <= 180; lon += 20) {
      segs.push(new THREE.Vector3(px(lon), 0, pz(85)), new THREE.Vector3(px(lon), 0, pz(-85)));
    }
    for (let lat = -80; lat <= 80; lat += 20) {
      segs.push(new THREE.Vector3(px(-180), 0, pz(lat)), new THREE.Vector3(px(180), 0, pz(lat)));
    }
    const g = new THREE.BufferGeometry().setFromPoints(segs);
    scene.add(new THREE.LineSegments(g,
      new THREE.LineBasicMaterial({ color: 0x0d2438, transparent: true, opacity: 0.7 })));
  }

  // береговые линии
  {
    const segs = [];
    for (const line of coastlines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        segs.push(
          new THREE.Vector3(px(line[i]), 0.015, pz(line[i + 1])),
          new THREE.Vector3(px(line[i + 2]), 0.015, pz(line[i + 3])));
      }
    }
    const g = new THREE.BufferGeometry().setFromPoints(segs);
    scene.add(new THREE.LineSegments(g,
      new THREE.LineBasicMaterial({ color: 0x2e9fdf, transparent: true, opacity: 0.8 })));
  }

  // точки мест
  const spotTex = glowTexture("rgba(56,209,255,1)");
  const sprites = [];
  for (const s of spots.values()) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spotTex, color: 0x9fe8ff, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.setScalar(0.9 + Math.sqrt(s.people.length) * 0.5);
    m.position.set(px(s.lon), 0.15, pz(s.lat));
    m.userData.spot = s;
    scene.add(m);
    sprites.push(m);
  }

  // дуги миграций
  const arcCurves = [];
  {
    const mat = new THREE.LineBasicMaterial({ color: 0x2b7fd4, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending });
    for (const [a, b] of arcPairs.values()) {
      const va = new THREE.Vector3(px(a.lon), 0.05, pz(a.lat));
      const vb = new THREE.Vector3(px(b.lon), 0.05, pz(b.lat));
      const dist = va.distanceTo(vb);
      const mid = va.clone().add(vb).multiplyScalar(0.5);
      mid.y = 0.6 + dist * 0.22;
      const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
      const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      scene.add(new THREE.Line(g, mat));
      arcCurves.push(curve);
    }
  }

  // искры вдоль дуг
  const sparkTex = glowTexture("rgba(159,232,255,1)");
  const sparks = [];
  const nSparks = Math.min(28, arcCurves.length * 2);
  for (let i = 0; i < nSparks; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkTex, color: 0xbff0ff, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(0.5);
    scene.add(sp);
    sparks.push({ sp, curve: arcCurves[i % arcCurves.length], t: Math.random(), speed: 0.05 + Math.random() * 0.08 });
  }

  // ——— камера: кадрируем по основному скоплению точек ———
  const lons = [], lats = [];
  for (const s of spots.values()) for (let i = 0; i < s.people.length; i++) { lons.push(s.lon); lats.push(s.lat); }
  lons.sort((a, b) => a - b); lats.sort((a, b) => a - b);
  const q = (arr, t) => arr[Math.floor((arr.length - 1) * t)];
  const lon0 = q(lons, 0.06), lon1 = q(lons, 0.94), lat0 = q(lats, 0.06), lat1 = q(lats, 0.94);
  const cx = px((lon0 + lon1) / 2), cz = pz((lat0 + lat1) / 2);
  const span = Math.max(px(lon1) - px(lon0), 18);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = Math.PI * 0.06;
  controls.maxPolarAngle = Math.PI * 0.38;
  controls.target.set(cx, 0, cz);
  camera.position.set(cx, span * 0.85, cz + span * 0.62);
  controls.update();

  // ——— интерактив ———
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-2, -2);
  const tip = document.getElementById("w3dTip");
  let hover = null;
  function onMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    tip.style.left = Math.min(e.clientX + 16, innerWidth - 240) + "px";
    tip.style.top = (e.clientY - 14) + "px";
  }
  function onClick() {
    if (hover) ui.onOpenSpot?.(hover.userData.spot);
  }
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("click", onClick);

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

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    for (const s of sparks) {
      s.t += dt * s.speed;
      if (s.t > 1) { s.t = 0; s.curve = arcCurves[Math.floor(Math.random() * arcCurves.length)]; }
      s.sp.position.copy(s.curve.getPointAt(s.t));
      s.sp.material.opacity = Math.sin(s.t * Math.PI);
    }
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(sprites, false)[0];
    const h = hit ? hit.object : null;
    if (h !== hover) {
      hover = h;
      if (h) {
        const s = h.userData.spot;
        renderer.domElement.style.cursor = "pointer";
        tip.innerHTML = `<b>${s.label}</b><span>${s.people.length} чел. · показать список</span>`;
        tip.hidden = false;
        tip.classList.add("neon");
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
