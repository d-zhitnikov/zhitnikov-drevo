// Плоская карта расселения рода (SVG): контуры и русские названия стран,
// страны, где жили родственники, — залиты; точки мест и дуги миграций.

const NS = "http://www.w3.org/2000/svg";

// проекция: равнопромежуточная, обрезаем Антарктиду
const LAT_TOP = 84, LAT_BOT = -58;
const W = 1600, H = (LAT_TOP - LAT_BOT) / 360 * 2 * (1600 / 2) * 0.86;
const px = (lon) => (lon + 180) / 360 * W;
const py = (lat) => (LAT_TOP - lat) / (LAT_TOP - LAT_BOT) * H;

function pointInRing(lon, lat, ring) {
  // ray casting; ring = [lon,lat,lon,lat,...]
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

  // ——— какие страны «наши» ———
  const countryPeople = new Map(); // iso -> {country, n}
  for (const s of spots.values()) {
    for (const c of countries) {
      let hit = false;
      for (const ring of c.p) {
        if (pointInRing(s.lon, s.lat, ring)) { hit = true; break; }
      }
      if (hit) {
        if (!countryPeople.has(c.iso)) countryPeople.set(c.iso, { country: c, n: 0 });
        countryPeople.get(c.iso).n += s.people.length;
        break;
      }
    }
  }

  // ——— SVG ———
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H.toFixed(0)}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("map2d");
  container.appendChild(svg);

  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `
    <filter id="mglow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="mvig" cx="50%" cy="45%" r="72%">
      <stop offset="0%" stop-color="#0a1a2c"/>
      <stop offset="70%" stop-color="#050d1a"/>
      <stop offset="100%" stop-color="#03060d"/>
    </radialGradient>`;
  svg.appendChild(defs);

  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("width", W); bg.setAttribute("height", H);
  bg.setAttribute("fill", "url(#mvig)");
  svg.appendChild(bg);

  // сетка
  const grid = document.createElementNS(NS, "path");
  {
    let d = "";
    for (let lon = -160; lon < 180; lon += 20) d += `M ${px(lon).toFixed(1)} 0 V ${H.toFixed(0)} `;
    for (let lat = -40; lat <= 80; lat += 20) d += `M 0 ${py(lat).toFixed(1)} H ${W} `;
    grid.setAttribute("d", d);
    grid.setAttribute("stroke", "#0c2036");
    grid.setAttribute("stroke-width", "1");
    grid.setAttribute("fill", "none");
    grid.setAttribute("opacity", "0.6");
  }
  svg.appendChild(grid);

  // страны
  const gCountries = document.createElementNS(NS, "g");
  svg.appendChild(gCountries);
  const labelTargets = [];
  for (const c of countries) {
    const ours = countryPeople.get(c.iso);
    let d = "";
    let best = null; // крупнейшее кольцо — для подписи
    for (const ring of c.p) {
      d += "M ";
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (let i = 0; i < ring.length; i += 2) {
        const x = px(ring[i]), y = py(ring[i + 1]);
        d += `${x.toFixed(1)} ${y.toFixed(1)} `;
        if (i === 0) d += "L ";
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
      d += "Z ";
      const area = (maxx - minx) * (maxy - miny);
      if (!best || area > best.area) best = { area, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx };
    }
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    if (ours) {
      path.setAttribute("fill", "rgba(34,116,165,0.34)");
      path.setAttribute("stroke", "#38d1ff");
      path.setAttribute("stroke-width", "1.5");
      path.classList.add("country-ours");
      labelTargets.push({ c, ours, best });
    } else {
      path.setAttribute("fill", "rgba(13,32,50,0.25)");
      path.setAttribute("stroke", "#1b3a55");
      path.setAttribute("stroke-width", "0.8");
    }
    gCountries.appendChild(path);
  }

  // дуги миграций
  const gArcs = document.createElementNS(NS, "g");
  svg.appendChild(gArcs);
  for (const [a, b] of arcPairs.values()) {
    const x1 = px(a.lon), y1 = py(a.lat), x2 = px(b.lon), y2 = py(b.lat);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const lift = Math.min(120, Math.hypot(x2 - x1, y2 - y1) * 0.3 + 12);
    const arc = document.createElementNS(NS, "path");
    arc.setAttribute("d", `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${mx.toFixed(1)} ${(my - lift).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`);
    arc.classList.add("mig-arc");
    gArcs.appendChild(arc);
  }

  // точки мест
  const tip = document.getElementById("w3dTip");
  const gSpots = document.createElementNS(NS, "g");
  svg.appendChild(gSpots);
  for (const s of spots.values()) {
    const r = 4 + Math.sqrt(s.people.length) * 2.6;
    const halo = document.createElementNS(NS, "circle");
    halo.setAttribute("cx", px(s.lon).toFixed(1)); halo.setAttribute("cy", py(s.lat).toFixed(1));
    halo.setAttribute("r", (r * 1.9).toFixed(1));
    halo.setAttribute("fill", "#38d1ff"); halo.setAttribute("opacity", "0.14");
    halo.setAttribute("filter", "url(#mglow)");
    gSpots.appendChild(halo);
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", px(s.lon).toFixed(1)); dot.setAttribute("cy", py(s.lat).toFixed(1));
    dot.setAttribute("r", r.toFixed(1));
    dot.setAttribute("fill", "#9fe8ff");
    dot.setAttribute("filter", "url(#mglow)");
    dot.classList.add("map-spot");
    dot.addEventListener("pointerenter", () => {
      tip.innerHTML = `<b>${s.label}</b><span>${s.people.length} чел. · показать список</span>`;
      tip.classList.add("neon");
      tip.hidden = false;
    });
    dot.addEventListener("pointermove", (e) => {
      tip.style.left = Math.min(e.clientX + 16, innerWidth - 240) + "px";
      tip.style.top = (e.clientY - 14) + "px";
    });
    dot.addEventListener("pointerleave", () => { tip.hidden = true; });
    dot.addEventListener("click", () => ui.onOpenSpot?.(s));
    gSpots.appendChild(dot);
  }

  // подписи наших стран — поверх всего
  const gLabels = document.createElementNS(NS, "g");
  svg.appendChild(gLabels);
  for (const { c, ours, best } of labelTargets) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", best.cx.toFixed(1));
    t.setAttribute("y", best.cy.toFixed(1));
    t.classList.add("country-label");
    t.textContent = c.n;
    const sub = document.createElementNS(NS, "tspan");
    sub.setAttribute("x", best.cx.toFixed(1));
    sub.setAttribute("dy", "16");
    sub.classList.add("country-count");
    sub.textContent = `${ours.n} чел.`;
    t.appendChild(sub);
    gLabels.appendChild(t);
  }

  return {
    dispose() {
      tip.hidden = true;
      svg.remove();
    },
  };
}
