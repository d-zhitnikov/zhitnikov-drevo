#!/usr/bin/env python3
"""Геокодинг мест из data.json через Nominatim (1 rps, с кэшем).

Пишет docs/places.json: {исходная строка места: {lat, lon, label}}.
Кэш data/geocode_cache.json переживает перезапуски.
"""
import json, re, time, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
DB = json.load(open(HERE.parent / "docs" / "data.json"))
CACHE_PATH = HERE / "geocode_cache.json"
OUT = HERE.parent / "docs" / "places.json"

cache = {}
if CACHE_PATH.exists():
    cache = json.load(open(CACHE_PATH))

def collect_places():
    places = set()
    for p in DB["persons"].values():
        for ev in ("birth", "death", "burial"):
            pl = (p.get(ev) or {}).get("place")
            if pl:
                places.add(pl.strip())
    for f in DB["families"].values():
        pl = (f.get("marriage") or {}).get("place")
        if pl:
            places.add(pl.strip())
    return sorted(places)

DROP_WORDS = r"(ул\.|улица|д\.\s*\d|дом\s*\d|пер\.|кв\.|переулок)"

def clean(s):
    s = re.sub(r"^(Россия|СССР|Российская [Ии]мперия|РФ)[,\s]+", "", s.strip(), flags=re.I)
    parts = [p.strip() for p in s.split(",") if p.strip()]
    parts = [p for p in parts if not re.search(DROP_WORDS, p, flags=re.I)]
    return ", ".join(parts[:3])

def query(q):
    url = ("https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ru&q="
           + urllib.parse.quote(q))
    req = urllib.request.Request(url, headers={
        "User-Agent": "zhitnikov-family-site/1.0 (dan.zhitnik@gmail.com)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
    except Exception as e:
        print(f"  ! {q!r}: {e}", flush=True)
        return None
    time.sleep(1.15)
    if not data:
        return None
    hit = data[0]
    return {"lat": float(hit["lat"]), "lon": float(hit["lon"]),
            "label": hit.get("display_name", q).split(",")[0]}

def geocode(place):
    cleaned = clean(place)
    candidates = [cleaned]
    parts = [p.strip() for p in cleaned.split(",") if p.strip()]
    if len(parts) > 1:
        candidates.append(parts[-1])   # только город/село
        candidates.append(parts[0])    # только первый сегмент
    # деревня без слова "город/с." иногда находится лучше без префиксов
    for c in list(candidates):
        c2 = re.sub(r"^(г\.|город|с\.|село|дер\.|деревня|пос\.|посёлок|ст\.|станица)\s+", "", c, flags=re.I)
        if c2 != c:
            candidates.append(c2)
    for cand in candidates:
        if not cand:
            continue
        if cand in cache:
            if cache[cand]:
                return cache[cand]
            continue
        res = query(cand)
        cache[cand] = res
        json.dump(cache, open(CACHE_PATH, "w"), ensure_ascii=False)
        if res:
            return res
    return None

places = collect_places()
print(f"уникальных мест: {len(places)}", flush=True)
out = {}
ok = 0
for i, pl in enumerate(places):
    res = geocode(pl)
    if res:
        out[pl] = res
        ok += 1
    print(f"[{i+1}/{len(places)}] {'✓' if res else '✗'} {pl[:70]}", flush=True)

json.dump(out, open(OUT, "w"), ensure_ascii=False)
print(f"готово: {ok}/{len(places)} → {OUT}", flush=True)
