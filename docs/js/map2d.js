// Карта расселения рода — в бренд-буке древа: коричневый и золотой.
// Рисуются только страны, где жил род; кадр обрезан по ним.
// Мелкие страны подписаны выносками, чтобы ничего не накладывалось.

const NS = "http://www.w3.org/2000/svg";
const GOLD = "#d8a54e";
const GOLD_DIM = "#a97f3f";
const BROWN = "#8c6838";
const INK = "#ede3cd";

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > lat) !== (yj > lat) &&
        lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export async function mountMap(container, DB, ui) {
  const [places, countries] = await Promise.all([
    fetch("places.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("countries.json").then(r => r.json()),
  ]);

  // ——— агрегация мест ———
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

  // ——— наши страны ———
  const ours = []; // {country, n}
  for (const c of countries) {
    let n = 0;
    for (const s of spots.values()) {
      for (const ring of c.p) {
        if (pointInRing(s.lon, s.lat, ring)) { n += s.people.length; break; }
      }
    }
    if (n) ours.push({ c, n });
  }

  // ——— кадр: по нашим странам и точкам ———
  let lo0 = 999, lo1 = -999, la0 = 999, la1 = -999;
  for (const s of spots.values()) {
    lo0 = Math.min(lo0, s.lon); lo1 = Math.max(lo1, s.lon);
    la0 = Math.min(la0, s.lat); la1 = Math.max(la1, s.lat);
  }
  lo0 -= 6; lo1 += 6; la0 -= 5; la1 += 7;
  const W = 1600;
  const kx = W / (lo1 - lo0);
  const ky = kx * 1.28;                       // приблизить широты к пропорции середины кадра
  const H = (la1 - la0) * ky;
  const px = (lon) => (lon - lo0) * kx;
  const py = (lat) => (la1 - lat) * ky;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H.toFixed(0)}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("map2d");
  container.appendChild(svg);

  // страны рода — золотые силуэты
  const gC = document.createElementNS(NS, "g");
  svg.appendChild(gC);
  const labelInfo = [];
  for (const { c, n } of ours) {
    let d = "";
    let best = null;
    for (const ring of c.p) {
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, inFrame = false;
      let seg = "M ";
      for (let i = 0; i < ring.length; i += 2) {
        const x = px(ring[i]), y = py(ring[i + 1]);
        seg += `${x.toFixed(1)} ${y.toFixed(1)} `;
        if (i === 0) seg += "L ";
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
        if (x > -40 && x < W + 40 && y > -40 && y < H + 40) inFrame = true;
      }
      if (!inFrame) continue;
      d += seg + "Z ";
      const area = (maxx - minx) * (maxy - miny);
      if (!best || area > best.area) {
        best = { area, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny };
      }
    }
    if (!d) continue;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "rgba(216,165,78,0.10)");
    path.setAttribute("stroke", GOLD_DIM);
    path.setAttribute("stroke-width", "1.4");
    path.setAttribute("stroke-linejoin", "round");
    gC.appendChild(path);
    labelInfo.push({ c, n, best });
  }

  // дуги миграций — тонкий живой пунктир
  const gA = document.createElementNS(NS, "g");
  svg.appendChild(gA);
  for (const [a, b] of arcPairs.values()) {
    const x1 = px(a.lon), y1 = py(a.lat), x2 = px(b.lon), y2 = py(b.lat);
    const lift = Math.min(110, Math.hypot(x2 - x1, y2 - y1) * 0.28 + 10);
    const arc = document.createElementNS(NS, "path");
    arc.setAttribute("d", `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2 - lift).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`);
    arc.classList.add("mig-arc");
    gA.appendChild(arc);
  }

  // точки мест — маленькие, с тёмной обводкой против слипания
  const tip = document.getElementById("w3dTip");
  const gS = document.createElementNS(NS, "g");
  svg.appendChild(gS);
  const sorted = [...spots.values()].sort((a, b) => b.people.length - a.people.length);
  for (const s of sorted) {
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", px(s.lon).toFixed(1));
    dot.setAttribute("cy", py(s.lat).toFixed(1));
    dot.setAttribute("r", (3 + Math.sqrt(s.people.length) * 1.8).toFixed(1));
    dot.setAttribute("fill", GOLD);
    dot.setAttribute("stroke", "#14100c");
    dot.setAttribute("stroke-width", "1.6");
    dot.classList.add("map-spot");
    dot.addEventListener("pointerenter", () => {
      tip.innerHTML = `<b>${s.label}</b><span>${s.people.length} чел. · показать список</span>`;
      tip.classList.remove("neon");
      tip.hidden = false;
    });
    dot.addEventListener("pointermove", (e) => {
      tip.style.left = Math.min(e.clientX + 16, innerWidth - 240) + "px";
      tip.style.top = (e.clientY - 14) + "px";
    });
    dot.addEventListener("pointerleave", () => { tip.hidden = true; });
    dot.addEventListener("click", () => ui.onOpenSpot?.(s));
    gS.appendChild(dot);
  }

  // ——— подписи стран без наложений ———
  // крупные — внутри силуэта; мелкие — выносками в свободные колонки
  const gL = document.createElementNS(NS, "g");
  svg.appendChild(gL);
  const placedBoxes = [];
  const overlaps = (x, y, w, h) =>
    placedBoxes.some(b => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
  const claim = (x, y, w, h) => placedBoxes.push({ x, y, w, h });

  function addLabel(x, y, name, n, anchor) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", x.toFixed(1));
    t.setAttribute("y", y.toFixed(1));
    if (anchor) t.setAttribute("text-anchor", anchor);
    t.classList.add("country-label");
    t.textContent = name;
    const sub = document.createElementNS(NS, "tspan");
    sub.setAttribute("dx", "8");
    sub.classList.add("country-count");
    sub.textContent = `· ${n}`;
    t.appendChild(sub);
    gL.appendChild(t);
    return t;
  }

  labelInfo.sort((a, b) => b.best.area - a.best.area);
  const pending = [];
  for (const li of labelInfo) {
    const { best } = li;
    const wEst = (li.c.n.length + 4) * 10.5;
    if (best.w > wEst * 1.15 && best.h > 46) {
      // влезает внутрь силуэта
      let lx = best.cx, ly = best.cy;
      if (!overlaps(lx - wEst / 2, ly - 14, wEst, 22)) {
        addLabel(lx, ly, li.c.n, li.n, "middle");
        claim(lx - wEst / 2, ly - 14, wEst, 22);
        continue;
      }
    }
    pending.push(li);
  }
  // выноски: стопкой слева и справа от кучного центра
  pending.sort((a, b) => a.best.cy - b.best.cy);
  let leftY = 40, rightY = 40;
  for (const li of pending) {
    const { best } = li;
    const toLeft = best.cx < W * 0.55;
    const wEst = (li.c.n.length + 4) * 10.5;
    let lx, ly;
    if (toLeft) {
      lx = Math.max(20, best.cx - Math.max(180, best.w / 2 + 120));
      ly = Math.max(leftY, best.cy - 60);
      while (overlaps(lx, ly - 14, wEst, 24)) ly += 28;
      leftY = ly + 28;
      addLabel(lx, ly, li.c.n, li.n);
      claim(lx, ly - 14, wEst, 24);
    } else {
      lx = Math.min(W - 20 - wEst, best.cx + Math.max(160, best.w / 2 + 100));
      ly = Math.max(rightY, best.cy - 60);
      while (overlaps(lx, ly - 14, wEst, 24)) ly += 28;
      rightY = ly + 28;
      addLabel(lx, ly, li.c.n, li.n);
      claim(lx, ly - 14, wEst, 24);
    }
    // тонкая выноска к стране
    const lead = document.createElementNS(NS, "path");
    const ex = toLeft ? lx + wEst - 8 : lx - 6;
    lead.setAttribute("d", `M ${ex.toFixed(1)} ${(ly - 5).toFixed(1)} L ${best.cx.toFixed(1)} ${best.cy.toFixed(1)}`);
    lead.setAttribute("stroke", GOLD_DIM);
    lead.setAttribute("stroke-width", "0.8");
    lead.setAttribute("opacity", "0.55");
    lead.setAttribute("stroke-dasharray", "3 4");
    gL.insertBefore(lead, gL.firstChild);
  }

  return {
    dispose() {
      tip.hidden = true;
      svg.remove();
    },
  };
}
