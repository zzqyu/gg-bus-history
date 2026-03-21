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


def build_timetables_for_routes(routes, board_station_id: str, alight_station_id: str, sday_norm: str):
    timetables = []

    from datetime import datetime

    def parse_time(s):
        if not s:
            return None
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M'):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                continue
        return None

    for r in routes or []:
        rid = r.get('routeId')
        if rid is None:
            continue
        try:
            board_order = int(r.get('boardOrder'))
            alight_order = int(r.get('alightOrder'))
        except Exception:
            continue

        board_list = fetch_past_arrivals(rid, board_station_id, board_order, sday_norm)
        alight_list = fetch_past_arrivals(rid, alight_station_id, alight_order, sday_norm)

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

        board_groups = group_by_vid(board_list)
        alight_groups = group_by_vid(alight_list)

        entries = []
        max_trip_sec = 2 * 3600
        for vid in [v for v in board_groups.keys() if v in alight_groups]:
            b_seq = board_groups.get(vid, [])
            a_seq = alight_groups.get(vid, [])
            a_idx = 0

            for bt, b in b_seq:
                if bt is None:
                    continue

                while a_idx < len(a_seq):
                    at0, _ = a_seq[a_idx]
                    if at0 is None or at0 <= bt:
                        a_idx += 1
                        continue
                    break

                if a_idx >= len(a_seq):
                    continue

                best_idx = None
                best_delta = None
                probe = a_idx
                while probe < len(a_seq):
                    at, _ = a_seq[probe]
                    if at is None:
                        probe += 1
                        continue
                    delta = (at - bt).total_seconds()
                    if delta <= 0:
                        probe += 1
                        continue
                    if delta > max_trip_sec:
                        break
                    if best_delta is None or delta < best_delta:
                        best_delta = delta
                        best_idx = probe
                    probe += 1

                if best_idx is None:
                    continue

                at, a = a_seq[best_idx]
                entries.append({
                    'vehId': vid,
                    'boardRunSeq': b.get('runSeq'),
                    'alightRunSeq': a.get('runSeq'),
                    'boardTime': b.get('arrivalDate') or b.get('depatureDate'),
                    'alightTime': a.get('arrivalDate') or a.get('depatureDate')
                })
                a_idx = best_idx + 1

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
                '_bt_parsed': bt
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
