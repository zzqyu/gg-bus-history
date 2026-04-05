from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import sqlite3
import math
from pathlib import Path
import requests
from requests.exceptions import RequestException
import logging
import time
import os

app = FastAPI()

# Simple in-memory cache for external calls and assembled timetables
from threading import Lock
CACHE = {}
CACHE_LOCK = Lock()
CACHE_TTL = 300  # seconds

def cache_get(key):
    with CACHE_LOCK:
        ent = CACHE.get(key)
        if not ent:
            return None
        ts, val = ent
        if time.time() - ts > CACHE_TTL:
            del CACHE[key]
            return None
        return val

def cache_set(key, val):
    with CACHE_LOCK:
        CACHE[key] = (time.time(), val)

# configure simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('bus-api')
from logging.handlers import RotatingFileHandler

# file handler for errors (keeps recent history)
file_handler = RotatingFileHandler('/app/pastArrival_errors.log', maxBytes=5 * 1024 * 1024, backupCount=3)
file_handler.setLevel(logging.ERROR)
file_formatter = logging.Formatter('%(asctime)s %(levelname)s %(name)s %(message)s')
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)


def get_db_connection(db_path: str = 'basedata.db'):
    conn = sqlite3.connect(str(Path(db_path)), timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA synchronous = NORMAL;")
        cur.execute("PRAGMA temp_store = MEMORY;")
        cur.execute("PRAGMA cache_size = -10000;")
        cur.execute("PRAGMA mmap_size = 268435456;")
        cur.execute("PRAGMA busy_timeout = 5000;")
    except Exception as e:
        logger.warning(f"get_db_connection: PRAGMA apply failed: {e}")
    return conn

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    to_rad = math.pi / 180.0
    dlat = (lat2 - lat1) * to_rad
    dlon = (lon2 - lon1) * to_rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _median(lst):
    """Return median of a numeric list, or None if empty."""
    if not lst:
        return None
    s = sorted(lst)
    n = len(s)
    m = n // 2
    return s[m] if n % 2 == 1 else (s[m - 1] + s[m]) / 2


def _low_median(lst, pct=0.10):
    """Return median of the lowest `pct` fraction of lst (minimum 1 element), or None."""
    if not lst:
        return None
    s = sorted(lst)
    k = max(1, int(len(s) * pct))
    return _median(s[:k])


def _match_vehicle_dp(b_times, a_times, prev_dts, max_trip_sec=6 * 3600, max_prev_to_alight=600):
    """Order-preserving DP matching for one vehicle.

    Maximises match count first, then minimises total cost.

    If prev_dts[i] is not None (prev-stop arrival time for board i):
      - hard-reject: alight < prev  (physically impossible)
      - hard-reject: alight - prev > max_prev_to_alight  (stale / device-left-on scan)
      - cost = alight - prev  (small gap = good)
    Otherwise:
      - cost = alight - board
    """
    nb, na = len(b_times), len(a_times)
    dp = [[(0, 0)] * (na + 1) for _ in range(nb + 1)]
    parent = [[None] * (na + 1) for _ in range(nb + 1)]
    dp[0][0] = (0, 0)
    for i in range(nb + 1):
        for j in range(na + 1):
            cur = dp[i][j]
            if i < nb and cur < dp[i + 1][j]:
                dp[i + 1][j] = cur
                parent[i + 1][j] = (i, j, 'sb')
            if j < na and cur < dp[i][j + 1]:
                dp[i][j + 1] = cur
                parent[i][j + 1] = (i, j, 'sa')
            if i < nb and j < na:
                b = b_times[i]
                a = a_times[j]
                if a is None or b is None or a <= b:
                    continue
                delta = (a - b).total_seconds()
                if delta > max_trip_sec:
                    continue
                pdt = prev_dts[i]
                if pdt is not None:
                    if a < pdt:
                        continue
                    pg = (a - pdt).total_seconds()
                    if pg > max_prev_to_alight:
                        continue
                    cost = pg
                else:
                    cost = delta
                cand = (cur[0] - 1, cur[1] + cost)
                if cand < dp[i + 1][j + 1]:
                    dp[i + 1][j + 1] = cand
                    parent[i + 1][j + 1] = (i, j, 'm')
    i, j = nb, na
    matches = []
    while i > 0 or j > 0:
        p = parent[i][j]
        if p is None:
            break
        pi, pj, act = p
        if act == 'm':
            matches.append((pi, pj))
        i, j = pi, pj
    matches.reverse()
    return matches


def select_best_order_pair_per_route(rows):
    """For each route, keep one A->B candidate with smallest positive staOrder gap.
    This avoids mixing multiple direction/order candidates for the same route.
    """
    best_by_route = {}
    for row in rows or []:
        try:
            route_id = str(row.get('routeId') or '')
            board_order = int(row.get('boardOrder'))
            alight_order = int(row.get('alightOrder'))
        except Exception:
            continue

        if not route_id or alight_order <= board_order:
            continue

        # Prefer shortest positive travel segment first, then smaller board order.
        rank = (
            alight_order - board_order,
            board_order,
            alight_order,
        )
        prev = best_by_route.get(route_id)
        if prev is None or rank < prev[0]:
            best_by_route[route_id] = (rank, row)

    selected = [v[1] for v in best_by_route.values()]
    selected.sort(key=lambda r: (str(r.get('routeName') or ''), str(r.get('routeId') or '')))
    return selected


def fetch_past_arrivals(routeId, stationId, staOrder, sday_norm):
    # Only use external API (no local sample fallback)
    if not sday_norm:
        return []

    # cache key
    cache_key = ('pastArrival', str(routeId), str(stationId), str(staOrder), str(sday_norm))
    cached = cache_get(cache_key)
    if cached is not None:
        logger.info(f"fetch_past_arrivals: cache hit for routeId={routeId} stationId={stationId} sDay={sday_norm}")
        return cached

    url = 'https://m.gbis.go.kr/api/pastArrival'
    params = {
        'routeId': str(routeId),
        'stationId': str(stationId),
        'staOrder': str(staOrder),
        'sDay': str(sday_norm)
    }

    max_attempts = 3
    backoff = 0.6
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        try:
            logger.info(f"fetch_past_arrivals: calling external API attempt={attempt} routeId={routeId} stationId={stationId} sDay={sday_norm}")
            r = requests.get(url, params=params, timeout=6)
            r.raise_for_status()
            doc = r.json()
            lst = doc.get('response', {}).get('msgBody', {}).get('pastArrivalList') or []
            if lst:
                logger.info(f"fetch_past_arrivals: external API returned {len(lst)} entries for routeId={routeId}")
                cache_set(cache_key, lst)
                return lst
        except RequestException as e:
            last_exc = e
            logger.warning(f"fetch_past_arrivals: attempt {attempt} failed: {e}")
        except ValueError as e:
            last_exc = e
            logger.warning(f"fetch_past_arrivals: invalid JSON on attempt {attempt}: {e}")

        if attempt < max_attempts:
            time.sleep(backoff)
            backoff *= 2

    # log final failure with stack/exception details to error file via logger
    if last_exc is not None:
        logger.exception(f"fetch_past_arrivals: external API failed after {max_attempts} attempts for routeId={routeId} stationId={stationId} sDay={sday_norm}")
    # cache empty result to avoid hammering failing external API
    cache_set(cache_key, [])
    return []


def prefetch_past_arrivals(fetch_keys, max_workers=12):
    """Warm the pastArrival cache by fetching a batch of (routeId, stationId, staOrder, sday_norm)
    tuples in parallel. Only dispatches keys not already cached; deduplicates automatically.
    """
    from concurrent.futures import ThreadPoolExecutor

    seen = set()
    to_fetch = []
    for key in fetch_keys:
        routeId, stationId, staOrder, sday_n = key
        ck = ('pastArrival', str(routeId), str(stationId), str(staOrder), str(sday_n))
        if ck not in seen and cache_get(ck) is None:
            seen.add(ck)
            to_fetch.append(key)

    if not to_fetch:
        return

    def _do(key):
        try:
            fetch_past_arrivals(*key)
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=min(max_workers, len(to_fetch))) as executor:
        list(executor.map(_do, to_fetch))


def estimate_walk_time_seconds(distance_m: float) -> int:
    """Fallback walking time estimate (4km/h)."""
    try:
        d = float(distance_m)
    except Exception:
        d = 0.0
    if d <= 0:
        return 0
    speed_mps = 4000.0 / 3600.0
    return int(round(d / speed_mps))


def fetch_pedestrian_route(start_lon, start_lat, end_lon, end_lat, start_name='출발지', end_name='도착지', include_path=False):
    """Call TMAP pedestrian API and return walk distance/time (+ path if requested)."""
    try:
        s_lon = float(start_lon)
        s_lat = float(start_lat)
        e_lon = float(end_lon)
        e_lat = float(end_lat)
    except Exception:
        return None

    # identical point shortcut
    if abs(s_lon - e_lon) < 1e-9 and abs(s_lat - e_lat) < 1e-9:
        return {
            'distance': 0,
            'timeSec': 0,
            'path': [[s_lon, s_lat], [e_lon, e_lat]] if include_path else None,
        }

    app_key = (os.getenv('TMAP_APP_KEY') or '').strip()
    if not app_key:
        return None

    cache_key = (
        'pedestrianRoute',
        round(s_lon, 6), round(s_lat, 6),
        round(e_lon, 6), round(e_lat, 6),
        bool(include_path),
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    url = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json'
    headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'appKey': app_key,
    }
    payload = {
        'startX': str(s_lon),
        'startY': str(s_lat),
        'endX': str(e_lon),
        'endY': str(e_lat),
        'startName': str(start_name or '출발지'),
        'endName': str(end_name or '도착지'),
        'reqCoordType': 'WGS84GEO',
        'resCoordType': 'WGS84GEO',
        'searchOption': '0',
    }

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=7)
        r.raise_for_status()
        doc = r.json() or {}
        features = doc.get('features') or []

        total_distance = None
        total_time = None
        path_coords = []

        for f in features:
            if not isinstance(f, dict):
                continue
            props = f.get('properties') or {}
            if total_distance is None and props.get('totalDistance') is not None:
                try:
                    total_distance = int(float(props.get('totalDistance')))
                except Exception:
                    pass
            if total_time is None and props.get('totalTime') is not None:
                try:
                    total_time = int(float(props.get('totalTime')))
                except Exception:
                    pass

            if include_path:
                geo = f.get('geometry') or {}
                gtype = str(geo.get('type') or '')
                if gtype != 'LineString':
                    continue
                coords = geo.get('coordinates') or []
                for c in coords:
                    if not isinstance(c, (list, tuple)) or len(c) < 2:
                        continue
                    try:
                        lon = float(c[0])
                        lat = float(c[1])
                        path_coords.append([lon, lat])
                    except Exception:
                        continue

        if total_distance is None:
            total_distance = int(round(haversine(s_lat, s_lon, e_lat, e_lon)))
        if total_time is None:
            total_time = estimate_walk_time_seconds(total_distance)

        out = {
            'distance': total_distance,
            'timeSec': total_time,
            'path': path_coords if include_path else None,
        }
        cache_set(cache_key, out)
        return out
    except Exception as e:
        logger.warning(f"fetch_pedestrian_route failed: {e}")
        return None


def build_timetables_for_routes(routes, board_station_id: str, alight_station_id: str, sday_norm: str):
    timetables = []

    from datetime import datetime, timedelta

    def parse_time(s):
        if not s:
            return None
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                continue
        return None

    MAX_TRIP_SEC = 6 * 3600
    # Genuine prev->alight gaps are 60-120 s; 600 s cap cleanly rejects "device left on" stale scans.
    MAX_PREV_TO_ALIGHT = 600
    LOW_PCT = 0.10

    # ── Look up prev stationId (alightOrder - 1) and station coords for geo fallback ──
    prev_station_by_route = {}
    prev_station_coords = {}  # str(rid) -> (lat, lon)
    alight_coords = None      # (lat, lon) shared across routes in this call
    try:
        dbp = Path('basedata.db')
        if dbp.exists():
            _conn = get_db_connection(str(dbp))
            _cur = _conn.cursor()
            # fetch alight station coords once (shared across all routes)
            _cur.execute("SELECT CAST(y AS REAL), CAST(x AS REAL) FROM station WHERE stationId=?",
                         (str(alight_station_id),))
            _ac = _cur.fetchone()
            if _ac:
                alight_coords = (float(_ac[0]), float(_ac[1]))
            for r in routes or []:
                rid = r.get('routeId')
                try:
                    prev_order = int(r.get('alightOrder')) - 1
                except Exception:
                    continue
                if rid is not None and prev_order > 0:
                    _cur.execute(
                        "SELECT stationId FROM routestation WHERE routeId=? AND CAST(staOrder AS INTEGER)=?",
                        (str(rid), prev_order)
                    )
                    row = _cur.fetchone()
                    if row:
                        prev_station_by_route[str(rid)] = str(row[0])
                        # also fetch coords for this prev station
                        _cur.execute("SELECT CAST(y AS REAL), CAST(x AS REAL) FROM station WHERE stationId=?",
                                     (str(row[0]),))
                        _pc = _cur.fetchone()
                        if _pc:
                            prev_station_coords[str(rid)] = (float(_pc[0]), float(_pc[1]))
            _conn.close()
    except Exception as _e:
        logger.warning(f"build_timetables_for_routes: prev station lookup failed: {_e}")

    # ── Parallel-fetch all external API data before the processing loop ──────
    # Collects every (routeId, stationId, staOrder, sday) key this batch needs and
    # fires them concurrently; the per-route loop below will then hit cache only.
    _pre_keys = []
    for _r in routes or []:
        _rid2 = _r.get('routeId')
        if _rid2 is None:
            continue
        try:
            _bo2 = int(_r.get('boardOrder'))
            _ao2 = int(_r.get('alightOrder'))
        except Exception:
            continue
        _pre_keys.append((_rid2, board_station_id, _bo2, sday_norm))
        _pre_keys.append((_rid2, alight_station_id, _ao2, sday_norm))
        _prev_sid2 = prev_station_by_route.get(str(_rid2))
        if _prev_sid2:
            _pre_keys.append((_rid2, _prev_sid2, _ao2 - 1, sday_norm))
    if _pre_keys:
        prefetch_past_arrivals(_pre_keys)

    def group_by_vid(lst):
        d = {}
        for e in lst:
            if not isinstance(e, dict):
                continue
            vid = e.get('vehId')
            if not vid:
                continue
            k = str(vid)
            t = parse_time(e.get('arrivalDate') or e.get('depatureDate'))
            d.setdefault(k, []).append((t, e))
        for k in list(d.keys()):
            d[k].sort(key=lambda x: (x[0] is None, x[0]))
        return d

    for r in routes or []:
        rid = r.get('routeId')
        if rid is None:
            continue
        try:
            board_order = int(r.get('boardOrder'))
            alight_order = int(r.get('alightOrder'))
        except Exception:
            continue

        board_list  = fetch_past_arrivals(rid, board_station_id, board_order, sday_norm)
        alight_list = fetch_past_arrivals(rid, alight_station_id, alight_order, sday_norm)

        prev_station_id = prev_station_by_route.get(str(rid))
        prev_list = []
        if prev_station_id:
            prev_list = fetch_past_arrivals(rid, prev_station_id, alight_order - 1, sday_norm)

        board_groups  = group_by_vid(board_list)
        alight_groups = group_by_vid(alight_list)
        prev_groups   = group_by_vid(prev_list)

        def find_prev_dt(vid, board_dt, _pg=prev_groups):
            """Return the first prev-stop arrival >= board_dt for this vehicle."""
            for pt, _ in _pg.get(str(vid), []):
                if pt and board_dt and pt >= board_dt:
                    return pt
            return None

        # ── Per-vehicle DP matching ───────────────────────────────────────────────
        entries = []
        obs_prev_gaps_by_vid = {}  # vid -> [prev->alight seconds]
        all_prev_gaps = []
        unmatched_boards = []  # (vid, bt, b_entry, prev_dt)

        for vid in board_groups:
            b_seq = board_groups[vid]
            a_seq = alight_groups.get(vid, [])
            b_times_l = [bt for bt, _ in b_seq]
            a_times_l = [at for at, _ in a_seq]
            prev_dts  = [find_prev_dt(vid, bt) for bt in b_times_l]

            matches = _match_vehicle_dp(
                b_times_l, a_times_l, prev_dts,
                max_trip_sec=MAX_TRIP_SEC,
                max_prev_to_alight=MAX_PREV_TO_ALIGHT,
            )
            matched_b_idx = {bi for bi, _ in matches}

            for bi, ai in matches:
                bt, b_entry = b_seq[bi]
                at, a_entry = a_seq[ai]
                pdt = prev_dts[bi]
                prev_str = pdt.strftime('%Y-%m-%d %H:%M:%S') if pdt else None
                entries.append({
                    'vehId': str(vid),
                    'boardRunSeq': b_entry.get('runSeq'),
                    'alightRunSeq': a_entry.get('runSeq'),
                    'boardTime': b_entry.get('arrivalDate') or b_entry.get('depatureDate'),
                    'alightTime': a_entry.get('arrivalDate') or a_entry.get('depatureDate'),
                    'prevTime': prev_str,
                    'inferred': False,
                    'inference_method': None,
                    'inference_confidence': None,
                    'reason': None,
                })
                if pdt and at and at > pdt:
                    g = (at - pdt).total_seconds()
                    obs_prev_gaps_by_vid.setdefault(str(vid), []).append(g)
                    all_prev_gaps.append(g)

            for i, (bt, b_entry) in enumerate(b_seq):
                if i not in matched_b_idx and bt is not None:
                    unmatched_boards.append((str(vid), bt, b_entry, prev_dts[i]))

        # ── Build inference statistics ────────────────────────────────────────────
        per_veh_low    = {vid: _low_median(gaps, LOW_PCT) for vid, gaps in obs_prev_gaps_by_vid.items()}
        global_low_prev = _low_median(all_prev_gaps, LOW_PCT)
        global_med_prev = _median(all_prev_gaps)

        # Fallback: board->alight median from clean observed entries
        board_alight_durs = []
        for e in entries:
            bt = parse_time(e.get('boardTime'))
            at = parse_time(e.get('alightTime'))
            if bt and at and at > bt:
                board_alight_durs.append((at - bt).total_seconds())
        global_board_alight_med = _median(board_alight_durs)

        n_obs = len(entries)
        def _conf(n):
            return 'high' if n >= 10 else ('medium' if n >= 3 else 'low')

        # ── Infer unmatched boards ────────────────────────────────────────────────
        for vid, bt, b_entry, pdt in unmatched_boards:
            prev_str     = pdt.strftime('%Y-%m-%d %H:%M:%S') if pdt else None
            inferred_dt  = None
            method       = None

            if pdt:
                delta = per_veh_low.get(vid) or global_low_prev or global_med_prev
                if delta:
                    inferred_dt = pdt + timedelta(seconds=delta)
                    method = 'prev_perveh' if per_veh_low.get(vid) else 'prev_global'

            if inferred_dt is None and global_board_alight_med:
                inferred_dt = bt + timedelta(seconds=global_board_alight_med)
                method = 'median_duration'

            # 4th tier: geo-distance fallback (prev→alight haversine / 30 km/h)
            if inferred_dt is None and pdt:
                _p_coords = prev_station_coords.get(str(rid))
                if _p_coords and alight_coords:
                    _dist_m = haversine(_p_coords[0], _p_coords[1], alight_coords[0], alight_coords[1])
                    _geo_sec = _dist_m / (30 * 1000 / 3600)  # 30 km/h in m/s
                    inferred_dt = pdt + timedelta(seconds=_geo_sec)
                    method = 'geo_distance'

            entries.append({
                'vehId': vid,
                'boardRunSeq': b_entry.get('runSeq'),
                'alightRunSeq': None,
                'boardTime': b_entry.get('arrivalDate') or b_entry.get('depatureDate'),
                'alightTime': inferred_dt.strftime('%Y-%m-%d %H:%M:%S') if inferred_dt else None,
                'prevTime': prev_str,
                'inferred': True,
                'inference_method': method,
                'inference_confidence': _conf(n_obs) if method else None,
                'reason': 'missing_alight_record' if inferred_dt else 'no_historical_duration',
            })

        entries.sort(key=lambda x: x.get('boardTime') or '')
        timetables.append({
            'routeId': rid,
            'routeName': r.get('routeName'),
            'routeTypeCd': r.get('routeTypeCd'),
            'boardOrder': board_order,
            'alightOrder': alight_order,
            'orderGap': int(alight_order) - int(board_order),
            'entries': entries,
        })

    def parse_time_global(s):
        if not s:
            return None
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                continue
        return None

    combined = []
    for t in timetables:
        for e in t['entries']:
            bt = parse_time_global(e.get('boardTime'))
            combined.append({
                'routeId': t.get('routeId'),
                'routeName': t.get('routeName'),
                'routeTypeCd': t.get('routeTypeCd'),
                'vehId': e.get('vehId'),
                'boardRunSeq': e.get('boardRunSeq'),
                'alightRunSeq': e.get('alightRunSeq'),
                'boardOrder': t.get('boardOrder'),
                'alightOrder': t.get('alightOrder'),
                'orderGap': t.get('orderGap'),
                'boardTime': e.get('boardTime'),
                'alightTime': e.get('alightTime'),
                'prevTime': e.get('prevTime'),
                'inferred': e.get('inferred'),
                'inference_method': e.get('inference_method'),
                'inference_confidence': e.get('inference_confidence'),
                '_bt_parsed': bt,
            })
    combined.sort(key=lambda x: (x['_bt_parsed'] is None, x['_bt_parsed']))
    for c in combined:
        if '_bt_parsed' in c:
            del c['_bt_parsed']

    return timetables, combined


@app.get('/findRoutes')
def find_routes(ax: float, ay: float, bx: float, by: float, radius: int = 500, aradius: int = None, bradius: int = None, sday: str = None, db_path: str = 'basedata.db', debug: bool = False):
    dbp = Path(db_path)
    if not dbp.exists():
        raise HTTPException(status_code=400, detail=f"DB not found: {db_path}")

    conn = get_db_connection(str(dbp))
    cur = conn.cursor()

    start_radius = int(aradius) if aradius is not None else int(radius)
    end_radius = int(bradius) if bradius is not None else int(radius)

    # bounding box prefilter
    deg_per_meter = 1 / 111320.0
    lat_delta_a = start_radius * deg_per_meter
    lon_delta_a = start_radius * deg_per_meter / max(0.000001, math.cos(math.radians(ay)))
    lat_delta_b = end_radius * deg_per_meter
    lon_delta_b = end_radius * deg_per_meter / max(0.000001, math.cos(math.radians(by)))

    cur.execute("SELECT stationId, stationName, x AS lon, y AS lat FROM station WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND stationName NOT LIKE ?",
                (ax - lon_delta_a, ax + lon_delta_a, ay - lat_delta_a, ay + lat_delta_a, '%(미정차)%'))
    stations_a = [dict(r) for r in cur.fetchall()]
    # ensure lon/lat are floats
    for s in stations_a:
        try:
            s['lon'] = float(s['lon'])
            s['lat'] = float(s['lat'])
        except Exception:
            pass

    cur.execute("SELECT stationId, stationName, x AS lon, y AS lat FROM station WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND stationName NOT LIKE ?",
                (bx - lon_delta_b, bx + lon_delta_b, by - lat_delta_b, by + lat_delta_b, '%(미정차)%'))
    stations_b = [dict(r) for r in cur.fetchall()]
    for s in stations_b:
        try:
            s['lon'] = float(s['lon'])
            s['lat'] = float(s['lat'])
        except Exception:
            pass

    near_a = []
    for s in stations_a:
        d = haversine(ay, ax, s['lat'], s['lon'])
        if d <= start_radius:
            s['dist'] = d
            near_a.append(s)

    near_b = []
    for s in stations_b:
        d = haversine(by, bx, s['lat'], s['lon'])
        if d <= end_radius:
            s['dist'] = d
            near_b.append(s)

    if not near_a or not near_b:
        conn.close()
        return {'groups': [], 'nearA': near_a, 'nearB': near_b}

    # Build groups by (boardStation, alightStation) with matching routes.
    # Performance optimization: fetch all A-set x B-set route pairs in one query
    # then group in Python, instead of executing one SQL per station-pair.
    groups = []
    a_ids = [str(s.get('stationId')) for s in near_a]
    b_ids = [str(s.get('stationId')) for s in near_b]

    _pair_sql_count = 0
    _pair_sql_total_ms = 0.0
    _pair_sql_slowest = []

    if a_ids and b_ids:
        a_ph = ','.join(['?'] * len(a_ids))
        b_ph = ','.join(['?'] * len(b_ids))
        pair_sql = f"""
        SELECT r1.stationId AS boardStationId, r2.stationId AS alightStationId,
               r1.routeId, r1.routeName, rt.routeTypeCd, r1.upDown,
               CAST(r1.staOrder AS INTEGER) AS boardOrder, CAST(r2.staOrder AS INTEGER) AS alightOrder
        FROM routestation r1
        JOIN routestation r2 ON r1.routeId = r2.routeId
        LEFT JOIN route rt ON r1.routeId = rt.routeId
        WHERE r1.stationId IN ({a_ph})
          AND r2.stationId IN ({b_ph})
          AND CAST(r1.staOrder AS INTEGER) < CAST(r2.staOrder AS INTEGER)
        LIMIT 20000
        """
        t0 = time.time()
        cur.execute(pair_sql, a_ids + b_ids)
        all_rows = [dict(r) for r in cur.fetchall()]
        elapsed_ms = (time.time() - t0) * 1000.0
        _pair_sql_count = 1
        _pair_sql_total_ms = elapsed_ms
        _pair_sql_slowest = [(elapsed_ms, 'BATCH', 'BATCH', len(all_rows))]

        pair_map = {}
        for row in all_rows:
            key = (str(row.get('boardStationId') or ''), str(row.get('alightStationId') or ''))
            pair_map.setdefault(key, []).append(row)

        a_map = {str(s.get('stationId')): s for s in near_a}
        b_map = {str(s.get('stationId')): s for s in near_b}

        for (board_sid, alight_sid), rows in pair_map.items():
            rows = select_best_order_pair_per_route(rows)
            if not rows:
                continue

            routes = []
            route_ids = set()
            order_gap_score = 0
            for r in rows:
                gap = int(r['alightOrder']) - int(r['boardOrder'])
                routes.append({
                    'routeId': r['routeId'],
                    'routeName': r['routeName'],
                    'routeTypeCd': r.get('routeTypeCd'),
                    'upDown': r.get('upDown'),
                    'boardOrder': r['boardOrder'],
                    'alightOrder': r['alightOrder'],
                    'orderGap': gap,
                })
                route_ids.add(r['routeId'])
                order_gap_score += gap

            sa = a_map.get(board_sid)
            sb = b_map.get(alight_sid)
            if not sa or not sb:
                continue

            score = float(sa.get('dist', 1e9)) + float(sb.get('dist', 1e9))
            groups.append({
                'board': {
                    'stationId': sa['stationId'],
                    'stationName': sa['stationName'],
                    'lon': sa['lon'],
                    'lat': sa['lat'],
                    'dist': sa['dist'],
                },
                'alight': {
                    'stationId': sb['stationId'],
                    'stationName': sb['stationName'],
                    'lon': sb['lon'],
                    'lat': sb['lat'],
                    'dist': sb['dist'],
                },
                'routes': routes,
                'routeIds': sorted(list(route_ids)),
                'orderGapScore': order_gap_score,
                'score': score,
            })

    if _pair_sql_count:
        avg_ms = _pair_sql_total_ms / float(_pair_sql_count)
        top = sorted(_pair_sql_slowest, key=lambda x: x[0], reverse=True)[:5]
        logger.info(f"find_routes: pair_sql executed {_pair_sql_count} times avg={avg_ms:.1f}ms top={[(round(x[0],1), x[1], x[2], x[3]) for x in top]}")

    # Per-route station-pair selection rule:
    # 1) valid forward pairs only (already ensured by boardOrder < alightOrder)
    # 2) among candidates close to minimal walking distance, prefer smaller orderGap
    WALK_TOLERANCE_METERS = 120.0
    route_candidates = {}
    for g in groups:
        board_sid = str((g.get('board') or {}).get('stationId') or '')
        alight_sid = str((g.get('alight') or {}).get('stationId') or '')
        walk_sum = float(g.get('score') or 1e12)
        for r in (g.get('routes') or []):
            rid = str(r.get('routeId') or '')
            if not rid:
                continue
            try:
                gap = int(r.get('orderGap'))
                board_order = int(r.get('boardOrder'))
                alight_order = int(r.get('alightOrder'))
            except Exception:
                continue
            route_candidates.setdefault(rid, []).append({
                'boardStationId': board_sid,
                'alightStationId': alight_sid,
                'walkSum': walk_sum,
                'orderGap': gap,
                'boardOrder': board_order,
                'alightOrder': alight_order,
            })

    # Choose per-route best candidate allowing a small orderGap tolerance.
    # Rationale: prefer small staOrder gap, but if a slightly larger gap yields much better
    # walk proximity to A/B, prefer that. We allow candidates with orderGap <= min_gap + GAP_TOLERANCE_STOPS
    # then pick the one with minimal walkSum.
    GAP_TOLERANCE_STOPS = 5
    route_best = {}
    for rid, cand_list in route_candidates.items():
        if not cand_list:
            continue
        # compute integer gaps safely
        gaps = []
        for c in cand_list:
            try:
                gaps.append(int(c.get('orderGap') or 10**9))
            except Exception:
                gaps.append(10**9)
        min_gap = min(gaps) if gaps else None

        if min_gap is None:
            # fallback to walk-based selection
            try:
                min_walk = min(float(c.get('walkSum') or 1e12) for c in cand_list)
            except Exception:
                min_walk = 1e12
            near_walk = [c for c in cand_list if float(c.get('walkSum') or 1e12) <= min_walk + WALK_TOLERANCE_METERS]
            near_walk.sort(key=lambda c: (int(c.get('orderGap') or 10**9), float(c.get('walkSum') or 1e12), c.get('boardOrder'), c.get('alightOrder')))
            route_best[rid] = near_walk[0]
            continue

        # allow small increase in stops
        allowed_max_gap = int(min_gap) + GAP_TOLERANCE_STOPS
        allowed = [c for c in cand_list if int(c.get('orderGap') or 10**9) <= allowed_max_gap]
        if not allowed:
            allowed = cand_list

        # choose minimal walkSum among allowed candidates, tiebreak by smaller gap then order
        allowed.sort(key=lambda c: (float(c.get('walkSum') or 1e12), int(c.get('orderGap') or 10**9), c.get('boardOrder'), c.get('alightOrder')))
        route_best[rid] = allowed[0]

    filtered_groups = []
    for g in groups:
        board_sid = str((g.get('board') or {}).get('stationId') or '')
        alight_sid = str((g.get('alight') or {}).get('stationId') or '')

        kept_routes = []
        for r in (g.get('routes') or []):
            rid = str(r.get('routeId') or '')
            best = route_best.get(rid)
            if not best:
                continue
            try:
                board_order = int(r.get('boardOrder'))
                alight_order = int(r.get('alightOrder'))
            except Exception:
                continue

            if (
                best['boardStationId'] == board_sid
                and best['alightStationId'] == alight_sid
                and best['boardOrder'] == board_order
                and best['alightOrder'] == alight_order
            ):
                kept_routes.append(r)

        if not kept_routes:
            continue

        g2 = dict(g)
        g2['routes'] = kept_routes
        g2['routeIds'] = sorted({x.get('routeId') for x in kept_routes})
        g2['orderGapScore'] = sum(int(x.get('orderGap') or 0) for x in kept_routes)
        filtered_groups.append(g2)

    groups = filtered_groups

    # ── Outlier-gap filter ────────────────────────────────────────────────────────
    # Removes routes with disproportionately large orderGap when shorter alternatives
    # exist.  Catches one-way / wrong-direction / heavy-detour routes that share a stop
    # with both A and B but travel a long loop between them.
    #
    # Limit = min_global_gap + max(12, min_global_gap * 2).
    # Scales naturally: min=4 → limit=16;  min=14 → limit=42;  min=30 → limit=90.
    # When all routes are inherently long the limit still only trims extreme outliers.
    _all_route_gaps = [
        int(r.get('orderGap') or 10 ** 9)
        for g in groups
        for r in (g.get('routes') or [])
        if r.get('orderGap') is not None
    ]
    if _all_route_gaps:
        _min_global_gap = min(_all_route_gaps)
        # Ratio-based limit: allows gaps up to min + max(12, min*2).
        # This scales naturally for short routes (min=4 → limit=16) and
        # mid-range routes (min=14 → limit=42) without a fixed min_gap guard.
        _gap_limit = _min_global_gap + max(12, _min_global_gap * 2)
        _outlier_filtered = []
        for g in groups:
            kept = [r for r in (g.get('routes') or []) if int(r.get('orderGap') or 10 ** 9) <= _gap_limit]
            if not kept:
                continue
            g2 = dict(g)
            g2['routes'] = kept
            g2['routeIds'] = sorted({str(x.get('routeId') or '') for x in kept})
            g2['orderGapScore'] = sum(int(x.get('orderGap') or 0) for x in kept)
            _outlier_filtered.append(g2)
        _removed = sum(1 for g in groups for r in (g.get('routes') or []) if int(r.get('orderGap') or 10 ** 9) > _gap_limit)
        if _removed:
            logger.info(f"find_routes: outlier-gap filter removed {_removed} route(s) with gap > {_gap_limit} (min_global={_min_global_gap})")
        groups = _outlier_filtered

    # Deduplicate groups with identical routeId sets, keep one with best (lowest) score
    dedup = {}
    for g in groups:
        key = tuple(g['routeIds'])
        if key not in dedup:
            dedup[key] = g
            continue

        prev = dedup[key]
        prev_rank = (float(prev.get('orderGapScore') or 1e12), float(prev.get('score') or 1e12))
        cur_rank = (float(g.get('orderGapScore') or 1e12), float(g.get('score') or 1e12))
        if cur_rank < prev_rank:
            dedup[key] = g

    uniq_groups = list(dedup.values())

    # Remove dominated groups: if another group has a superset of routes and <= score, drop this group
    final_groups = []
    for g in uniq_groups:
        gid_set = set(g['routeIds'])
        dominated = False
        for h in uniq_groups:
            if h is g:
                continue
            hid_set = set(h['routeIds'])
            if gid_set.issubset(hid_set) and h['score'] <= g['score']:
                # h has at least the same routes (maybe more) and is equal-or-better proximity
                dominated = True
                break
        if not dominated:
            final_groups.append(g)

    # sort by staOrder gap first, then walking distance
    if not final_groups and uniq_groups:
        final_groups = list(uniq_groups)
    final_groups.sort(key=lambda x: (float(x.get('orderGapScore') or 1e12), float(x.get('score') or 1e12)))

    # remove helper keys `routeIds` before returning
    for g in final_groups:
        if 'routeIds' in g:
            del g['routeIds']
        if 'orderGapScore' in g:
            del g['orderGapScore']

    # attach walking info for each result (start->board, alight->end)
    for g in final_groups:
        board = g.get('board') or {}
        alight = g.get('alight') or {}

        b_lon = board.get('lon')
        b_lat = board.get('lat')
        a_lon = alight.get('lon')
        a_lat = alight.get('lat')

        start_walk = fetch_pedestrian_route(
            ax, ay, b_lon, b_lat,
            start_name='출발지',
            end_name=str(board.get('stationName') or '탑승 정류장'),
            include_path=False,
        )
        end_walk = fetch_pedestrian_route(
            a_lon, a_lat, bx, by,
            start_name=str(alight.get('stationName') or '하차 정류장'),
            end_name='도착지',
            include_path=False,
        )

        start_distance = int(round(float(board.get('dist') or 0)))
        end_distance = int(round(float(alight.get('dist') or 0)))
        start_time = estimate_walk_time_seconds(start_distance)
        end_time = estimate_walk_time_seconds(end_distance)

        sw_dist = int(start_walk.get('distance')) if isinstance(start_walk, dict) and start_walk.get('distance') is not None else start_distance
        sw_time = int(start_walk.get('timeSec')) if isinstance(start_walk, dict) and start_walk.get('timeSec') is not None else start_time
        ew_dist = int(end_walk.get('distance')) if isinstance(end_walk, dict) and end_walk.get('distance') is not None else end_distance
        ew_time = int(end_walk.get('timeSec')) if isinstance(end_walk, dict) and end_walk.get('timeSec') is not None else end_time

        g['walk'] = {
            'startToBoard': {
                'distance': sw_dist,
                'timeSec': sw_time,
            },
            'alightToEnd': {
                'distance': ew_dist,
                'timeSec': ew_time,
            },
            'totalDistance': sw_dist + ew_dist,
            'totalTimeSec': sw_time + ew_time,
        }

    sday_norm = sday.strip() if sday else None

    # NOTE: timetable fetching removed from findRoutes. Use `/groupTimetable` endpoint to fetch
    # per-group timetables on demand to avoid expensive work during route search.

    conn.close()
    return {'groups': final_groups, 'nearA': near_a, 'nearB': near_b}


@app.get('/groupTimetable')
def group_timetable(boardStationId: str, alightStationId: str, routeId: str = None, allowedRouteIds: str = None, sday: str = None):
    """Return combined timetable for a group (board station, alight station) on given sDay.
    If routeId provided, restrict to that route, otherwise return for all matching routes.
    """
    sday_norm = sday.strip() if sday else None
    if not sday_norm:
        raise HTTPException(status_code=400, detail='sday (date) is required in YYYY-MM-DD or YYYYMMDD')

    # caching: try to return cached assembled timetable
    group_cache_key = ('groupTimetable', str(boardStationId), str(alightStationId), str(routeId) if routeId else '', str(allowedRouteIds) if allowedRouteIds else '', str(sday_norm))
    cached_group = cache_get(group_cache_key)
    if cached_group is not None:
        return cached_group

    # fetch routes that go from board to alight
    dbp = Path('basedata.db')
    if not dbp.exists():
        raise HTTPException(status_code=400, detail='DB not found: basedata.db')
    conn = get_db_connection(str(dbp))
    cur = conn.cursor()

    pair_sql = """
    SELECT r1.routeId, r1.routeName, rt.routeTypeCd, r1.upDown, CAST(r1.staOrder AS INTEGER) AS boardOrder, CAST(r2.staOrder AS INTEGER) AS alightOrder
    FROM routestation r1
    JOIN routestation r2 ON r1.routeId = r2.routeId
    LEFT JOIN route rt ON r1.routeId = rt.routeId
    WHERE r1.stationId = ? AND r2.stationId = ? AND CAST(r1.staOrder AS INTEGER) < CAST(r2.staOrder AS INTEGER)
    LIMIT 500
    """

    cur.execute(pair_sql, (boardStationId, alightStationId))
    rows = [dict(r) for r in cur.fetchall()]
    # If caller provided an explicit allowedRouteIds list, filter rows to that set first.
    if allowedRouteIds:
        allowed_set = {x.strip() for x in str(allowedRouteIds).split(',') if x and x.strip()}
        if allowed_set:
            rows = [r for r in rows if str(r.get('routeId')) in allowed_set]
    # Backwards-compatible single-route filter
    elif routeId:
        rows = [r for r in rows if str(r.get('routeId')) == str(routeId)]
    routes = select_best_order_pair_per_route(rows)
    if not routes:
        conn.close()
        return {'routes': [], 'timetables': []}

    timetables, combined = build_timetables_for_routes(routes, str(boardStationId), str(alightStationId), sday_norm)
    conn.close()

    out = {'routes': routes, 'timetables': timetables, 'combined': combined}
    cache_set(group_cache_key, out)
    return out


@app.get('/allGroupsTimetable')
def all_groups_timetable(ax: float, ay: float, bx: float, by: float, radius: int = 500, aradius: int = None, bradius: int = None, sday: str = None):
    """Return merged timetable across all search groups for A->B on sDay."""
    sday_norm = sday.strip() if sday else None
    if not sday_norm:
        raise HTTPException(status_code=400, detail='sday (date) is required in YYYY-MM-DD or YYYYMMDD')

    start_radius = int(aradius) if aradius is not None else int(radius)
    end_radius = int(bradius) if bradius is not None else int(radius)

    cache_key = ('allGroupsTimetable', str(ax), str(ay), str(bx), str(by), str(start_radius), str(end_radius), str(sday_norm))
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    search = find_routes(ax=ax, ay=ay, bx=bx, by=by, radius=radius, aradius=start_radius, bradius=end_radius, sday=sday_norm)
    groups = search.get('groups') or []

    # ── Parallel pre-fetch: warm cache for all groups across all routes ───────
    # Look up prev station IDs for every route, then fire all external API calls
    # concurrently so the per-group build_timetables_for_routes loop hits cache only.
    _pre_keys_all = []
    try:
        _dbp_pre = Path('basedata.db')
        if _dbp_pre.exists():
            _conn_pre = get_db_connection(str(_dbp_pre))
            _cur_pre = _conn_pre.cursor()
            _prev_sid_pre = {}  # routeId -> prevStationId (deduped)
            for _g in groups:
                _bsid = str((_g.get('board') or {}).get('stationId') or '')
                _asid = str((_g.get('alight') or {}).get('stationId') or '')
                if not _bsid or not _asid:
                    continue
                for _r in (_g.get('routes') or []):
                    _rid = _r.get('routeId')
                    if not _rid:
                        continue
                    try:
                        _bo = int(_r.get('boardOrder'))
                        _ao = int(_r.get('alightOrder'))
                    except Exception:
                        continue
                    _ridstr = str(_rid)
                    _pre_keys_all.append((_ridstr, _bsid, _bo, sday_norm))
                    _pre_keys_all.append((_ridstr, _asid, _ao, sday_norm))
                    if _ridstr not in _prev_sid_pre:
                        if _ao - 1 > 0:
                            _cur_pre.execute(
                                "SELECT stationId FROM routestation WHERE routeId=? AND CAST(staOrder AS INTEGER)=?",
                                (_ridstr, _ao - 1)
                            )
                            _row_pre = _cur_pre.fetchone()
                            _prev_sid_pre[_ridstr] = str(_row_pre[0]) if _row_pre else None
                    _psid = _prev_sid_pre.get(_ridstr)
                    if _psid:
                        _pre_keys_all.append((_ridstr, _psid, _ao - 1, sday_norm))
            _conn_pre.close()
    except Exception as _pre_e:
        logger.warning(f"allGroupsTimetable: pre-fetch key collection failed: {_pre_e}")
    if _pre_keys_all:
        prefetch_past_arrivals(_pre_keys_all, max_workers=16)

    from datetime import datetime
    def parse_time_global(s):
        if not s:
            return None
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                continue
        return None

    def minute_key(s):
        t = parse_time_global(s)
        if not t:
            return str(s or '')
        return t.strftime('%Y-%m-%d %H:%M')

    def combined_entry_key(e):
        route_id = str(e.get('routeId') or '')
        veh_id = str(e.get('vehId') or '')

        # conservative fallback for entries without enough information
        if not route_id or not veh_id:
            return (
                'fallback',
                route_id,
                minute_key(e.get('boardTime')),
                minute_key(e.get('alightTime')),
                str(e.get('boardStationId') or ''),
                str(e.get('alightStationId') or ''),
            )

        return (
            'rv-time',
            route_id,
            veh_id,
            minute_key(e.get('boardTime')),
            minute_key(e.get('alightTime')),
        )

    group_results = []
    combined = []

    group_tt_cache = {}

    for g in groups:
        board = g.get('board') or {}
        alight = g.get('alight') or {}
        walk = g.get('walk') or {}
        walk_start = walk.get('startToBoard') or {}
        walk_end = walk.get('alightToEnd') or {}
        try:
            walk_to_board_sec = int(walk_start.get('timeSec') or 0)
        except Exception:
            walk_to_board_sec = 0
        try:
            walk_from_alight_sec = int(walk_end.get('timeSec') or 0)
        except Exception:
            walk_from_alight_sec = 0
        walk_total_sec = walk_to_board_sec + walk_from_alight_sec

        board_station_id = str(board.get('stationId'))
        alight_station_id = str(alight.get('stationId'))
        gt_routes = g.get('routes') or []
        route_sig = tuple(sorted(
            (str(r.get('routeId') or ''), str(r.get('boardOrder') or ''), str(r.get('alightOrder') or ''))
            for r in gt_routes
        ))
        tt_key = (board_station_id, alight_station_id, route_sig, sday_norm)

        if tt_key in group_tt_cache:
            gt_timetables, gt_combined = group_tt_cache[tt_key]
        else:
            gt_timetables, gt_combined = build_timetables_for_routes(gt_routes, board_station_id, alight_station_id, sday_norm)
            group_tt_cache[tt_key] = (gt_timetables, gt_combined)

        group_results.append({
            'board': board,
            'alight': alight,
            'routes': gt_routes,
            'timetables': gt_timetables,
            'combined': gt_combined,
        })

        for e in gt_combined:
            bt = parse_time_global(e.get('boardTime'))
            group_score = float(board.get('dist') or 1e9) + float(alight.get('dist') or 1e9)
            try:
                order_gap = int(e.get('orderGap'))
            except Exception:
                order_gap = 10**9
            combined.append({
                'boardStationId': board_station_id,
                'boardStationName': board.get('stationName'),
                'alightStationId': alight_station_id,
                'alightStationName': alight.get('stationName'),
                'routeId': e.get('routeId'),
                'routeName': e.get('routeName'),
                'routeTypeCd': e.get('routeTypeCd'),
                'vehId': e.get('vehId'),
                'boardRunSeq': e.get('boardRunSeq'),
                'alightRunSeq': e.get('alightRunSeq'),
                'boardOrder': e.get('boardOrder'),
                'alightOrder': e.get('alightOrder'),
                'orderGap': e.get('orderGap'),
                'boardTime': e.get('boardTime'),
                'alightTime': e.get('alightTime'),
                'inferred': e.get('inferred'),
                'inference_method': e.get('inference_method'),
                'inference_confidence': e.get('inference_confidence'),
                'walkToBoardSec': walk_to_board_sec,
                'walkFromAlightSec': walk_from_alight_sec,
                'walkTotalSec': walk_total_sec,
                '_bt_parsed': bt,
                '_order_gap': order_gap,
                '_group_score': group_score,
            })

    def entry_rank(e):
        bt = parse_time_global(e.get('boardTime'))
        at = parse_time_global(e.get('alightTime'))
        dur = 10**12
        if bt and at:
            delta = (at - bt).total_seconds()
            if delta > 0:
                dur = delta
        return (
            int(e.get('_order_gap') or 10**9),
            dur,
            float(e.get('_group_score') or 1e9),
        )

    # Simple staOrder-gap-based dedup by board minute
    by_board_key = {}
    for e in combined:
        route_id = str(e.get('routeId') or '')
        veh_id = str(e.get('vehId') or '')
        if route_id and veh_id:
            k = ('rv-board', route_id, veh_id, minute_key(e.get('boardTime')))
        else:
            k = ('fallback-board',) + combined_entry_key(e)
        prev = by_board_key.get(k)
        if prev is None or entry_rank(e) < entry_rank(prev):
            by_board_key[k] = e

    # Then dedup by alight minute with same ranking
    by_alight_key = {}
    for e in by_board_key.values():
        route_id = str(e.get('routeId') or '')
        veh_id = str(e.get('vehId') or '')
        if route_id and veh_id:
            k = ('rv-alight', route_id, veh_id, minute_key(e.get('alightTime')))
        else:
            k = ('fallback-alight',) + combined_entry_key(e)
        prev = by_alight_key.get(k)
        if prev is None or entry_rank(e) < entry_rank(prev):
            by_alight_key[k] = e

    combined = list(by_alight_key.values())

    combined.sort(key=lambda x: (x['_bt_parsed'] is None, x['_bt_parsed']))
    for e in combined:
        if '_bt_parsed' in e:
            del e['_bt_parsed']
        if '_order_gap' in e:
            del e['_order_gap']
        if '_group_score' in e:
            del e['_group_score']

    out = {
        'groupCount': len(group_results),
        'groups': group_results,
        'combined': combined,
    }
    cache_set(cache_key, out)
    return out


@app.get('/walkRoute')
def walk_route(ax: float, ay: float, boardx: float, boardy: float, alightx: float, alighty: float, bx: float, by: float):
    """Return pedestrian guide for start->board and alight->end, including polyline paths."""
    start_leg = fetch_pedestrian_route(
        ax, ay, boardx, boardy,
        start_name='출발지',
        end_name='탑승 정류장',
        include_path=True,
    )
    end_leg = fetch_pedestrian_route(
        alightx, alighty, bx, by,
        start_name='하차 정류장',
        end_name='도착지',
        include_path=True,
    )

    def _fallback(s_lon, s_lat, e_lon, e_lat):
        dist = int(round(haversine(float(s_lat), float(s_lon), float(e_lat), float(e_lon))))
        return {
            'distance': dist,
            'timeSec': estimate_walk_time_seconds(dist),
            'path': [[float(s_lon), float(s_lat)], [float(e_lon), float(e_lat)]],
        }

    if not start_leg:
        start_leg = _fallback(ax, ay, boardx, boardy)
    if not end_leg:
        end_leg = _fallback(alightx, alighty, bx, by)

    return {
        'startToBoard': start_leg,
        'alightToEnd': end_leg,
        'totalTimeSec': int(start_leg.get('timeSec') or 0) + int(end_leg.get('timeSec') or 0),
        'totalDistance': int(start_leg.get('distance') or 0) + int(end_leg.get('distance') or 0),
    }


@app.get('/routeLine')
def route_line(
    routeId: str,
    boardx: float = None,
    boardy: float = None,
    alightx: float = None,
    alighty: float = None,
    db_path: str = 'basedata.db',
):
    """Return route polyline points from routeline table.

    If board/alight coordinates are provided, return only the segment between
    nearest points to board and alight.
    """
    rid = str(routeId or '').strip()
    if not rid:
        raise HTTPException(status_code=400, detail='routeId is required')

    dbp = Path(db_path)
    if not dbp.exists():
        dbp = Path('basedata.db')

    conn = get_db_connection(str(dbp))
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT x, y
            FROM routeline
            WHERE routeId = ?
            ORDER BY CAST(lineSeq AS INTEGER), lineSeq
            """,
            (rid,),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    path = []
    for r in rows or []:
        try:
            x = float(r['x'])
            y = float(r['y'])
            path.append([x, y])
        except Exception:
            continue

    # Optional segment clipping between board/alight stations
    if path and boardx is not None and boardy is not None and alightx is not None and alighty is not None:
        def _nearest_idx(px, py, coords):
            best_i = 0
            best_d = None
            for i, c in enumerate(coords):
                try:
                    cx = float(c[0])
                    cy = float(c[1])
                    d = haversine(float(py), float(px), cy, cx)
                    if best_d is None or d < best_d:
                        best_d = d
                        best_i = i
                except Exception:
                    continue
            return best_i

        try:
            bi = _nearest_idx(boardx, boardy, path)
            ai = _nearest_idx(alightx, alighty, path)
            lo = min(bi, ai)
            hi = max(bi, ai)
            clipped = path[lo:hi + 1]
            if len(clipped) >= 2:
                path = clipped
        except Exception:
            # Keep full path on clipping failure
            pass

    return {
        'routeId': rid,
        'path': path,
    }
