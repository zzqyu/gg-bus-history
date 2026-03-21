#!/usr/bin/env python3
"""Run a group_timetable lookup locally against basedata.db.

Usage:
  python3 tools/group_timetable_local.py BOARD_STATION_ID ALIGHT_STATION_ID [sDay] [routeId]

Example:
  python3 tools/group_timetable_local.py 233003085 233001438 2026-03-15
"""
import sys
import sqlite3
import time
import json
from pathlib import Path
import requests
from requests.exceptions import RequestException


def fetch_past_arrivals(routeId, stationId, staOrder, sday_norm, max_attempts=3):
    if not sday_norm:
        return []
    url = 'https://m.gbis.go.kr/api/pastArrival'
    params = {'routeId': str(routeId), 'stationId': str(stationId), 'staOrder': str(staOrder), 'sDay': str(sday_norm)}
    backoff = 0.6
    last_exc = None
    for attempt in range(1, max_attempts+1):
        try:
            r = requests.get(url, params=params, timeout=6)
            r.raise_for_status()
            doc = r.json()
            lst = doc.get('response', {}).get('msgBody', {}).get('pastArrivalList') or []
            if lst:
                return lst
        except RequestException as e:
            last_exc = e
        except ValueError as e:
            last_exc = e
        if attempt < max_attempts:
            time.sleep(backoff)
            backoff *= 2
    return []

def group_timetable_local(boardStationId, alightStationId, routeId=None, sday=None, db_path='basedata.db'):
    sday_norm = sday
    dbp = Path(db_path)
    if not dbp.exists():
        raise SystemExit(f"DB not found: {db_path}")

    conn = sqlite3.connect(str(dbp))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    pair_sql = '''
    SELECT r1.routeId, r1.routeName, r1.upDown, CAST(r1.staOrder AS INTEGER) AS boardOrder, CAST(r2.staOrder AS INTEGER) AS alightOrder
    FROM routestation r1
    JOIN routestation r2 ON r1.routeId = r2.routeId AND r1.upDown = r2.upDown
    WHERE r1.stationId = ? AND r2.stationId = ? AND CAST(r1.staOrder AS INTEGER) < CAST(r2.staOrder AS INTEGER)
    LIMIT 500
    '''

    cur.execute(pair_sql, (boardStationId, alightStationId))
    rows = [dict(r) for r in cur.fetchall()]
    if not rows:
        conn.close()
        return {'routes': [], 'timetables': []}

    routes = []
    for r in rows:
        if routeId and str(r['routeId']) != str(routeId):
            continue
        routes.append(r)

    timetables = []
    for r in routes:
        rid = r['routeId']
        boardOrder = r['boardOrder']
        alightOrder = r['alightOrder']
        board_list = fetch_past_arrivals(rid, boardStationId, boardOrder, sday_norm)
        alight_list = fetch_past_arrivals(rid, alightStationId, alightOrder, sday_norm)

        # Group entries by vehicle id (`vehId`) and sort by time so multiple
        # runs by the same vehicle are paired in order.
        from datetime import datetime
        def parse_time(s):
            if not s:
                return None
            for fmt in ('%Y-%m-%d %H:%M:%S','%Y-%m-%d %H:%M'):
                try:
                    return datetime.strptime(s, fmt)
                except Exception:
                    continue
            return None

        def group_by_vid(lst):
            d = {}
            for e in lst:
                vid = e.get('vehId')
                if not vid:
                    continue
                k = str(vid)
                t = parse_time(e.get('arrivalDate') or e.get('depatureDate'))
                d.setdefault(k, []).append((t, e))
            # sort lists by time
            for k in list(d.keys()):
                d[k].sort(key=lambda x: (x[0] is None, x[0]))
            return d

        board_groups = group_by_vid(board_list)
        alight_groups = group_by_vid(alight_list)

        entries = []
        # For vehicles present in both, pair their runs in order (1st->1st, 2nd->2nd...)
        common_vids = [v for v in board_groups.keys() if v in alight_groups]
        for vid in common_vids:
            b_seq = board_groups.get(vid, [])
            a_seq = alight_groups.get(vid, [])
            # iterate through sequences and pair by index, but ensure alight time > board time
            j = 0
            for i in range(min(len(b_seq), len(a_seq))):
                bt, b = b_seq[i]
                at, a = a_seq[i]
                if bt is None or at is None:
                    continue
                # require alight after board
                if at <= bt:
                    # try to find a later alight in a_seq
                    found = False
                    for k in range(i+1, len(a_seq)):
                        at2, a2 = a_seq[k]
                        if at2 and at2 > bt:
                            entries.append({
                                'vehId': vid,
                                'boardRunSeq': b.get('runSeq'),
                                'alightRunSeq': a2.get('runSeq'),
                                'boardTime': b.get('arrivalDate') or b.get('depatureDate'),
                                'alightTime': a2.get('arrivalDate') or a2.get('depatureDate')
                            })
                            found = True
                            break
                    if not found:
                        continue
                else:
                    entries.append({
                        'vehId': vid,
                        'boardRunSeq': b.get('runSeq'),
                        'alightRunSeq': a.get('runSeq'),
                        'boardTime': b.get('arrivalDate') or b.get('depatureDate'),
                        'alightTime': a.get('arrivalDate') or a.get('depatureDate')
                    })
        # Fallback: try to match unmatched board entries to unmatched alight entries
        matched_alight_vids = set(str(x.get('vehId')) for x in entries if x.get('vehId'))
        matched_board_vids = set(str(x.get('vehId')) for x in entries if x.get('vehId'))

        unmatched_boards = [b for b in board_list if str(b.get('vehId')) not in matched_board_vids]
        unmatched_alights = [a for a in alight_list if str(a.get('vehId')) not in matched_alight_vids]

        # parse times helper
        from datetime import datetime
        def parse_time(s):
            if not s:
                return None
            for fmt in ('%Y-%m-%d %H:%M:%S','%Y-%m-%d %H:%M'):
                try:
                    return datetime.strptime(s, fmt)
                except Exception:
                    continue
            return None

        used_alight_idxs = set()
        for b in unmatched_boards:
            bt = parse_time(b.get('arrivalDate') or b.get('depatureDate'))
            if not bt:
                continue
            # find alight candidate with time > bt and minimal delta
            best_idx = None
            best_delta = None
            for i,a in enumerate(unmatched_alights):
                if i in used_alight_idxs:
                    continue
                at = parse_time(a.get('arrivalDate') or a.get('depatureDate'))
                if not at:
                    continue
                delta = (at - bt).total_seconds()
                if delta <= 0:
                    continue
                # ignore unreasonably long gaps (>6 hours)
                if delta > 6*3600:
                    continue
                if best_delta is None or delta < best_delta:
                    best_delta = delta
                    best_idx = i
            if best_idx is not None:
                a = unmatched_alights[best_idx]
                used_alight_idxs.add(best_idx)
                entries.append({
                    'vehId': str(b.get('vehId')) if b.get('vehId') else None,
                    'boardRunSeq': b.get('runSeq'),
                    'alightRunSeq': a.get('runSeq'),
                    'boardTime': b.get('arrivalDate') or b.get('depatureDate'),
                    'alightTime': a.get('arrivalDate') or a.get('depatureDate')
                })

        entries.sort(key=lambda x: x['boardTime'])
        timetables.append({'routeId': rid, 'routeName': r.get('routeName'), 'entries': entries})

    conn.close()
    return {'routes': routes, 'timetables': timetables}

def main(argv):
    if len(argv) < 3:
        print('Usage: python3 tools/group_timetable_local.py BOARD_STATION_ID ALIGHT_STATION_ID [sDay] [routeId]')
        raise SystemExit(2)
    board = argv[1]
    alight = argv[2]
    sday = argv[3] if len(argv) > 3 else None
    routeId = argv[4] if len(argv) > 4 else None
    out = group_timetable_local(board, alight, routeId, sday)
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main(sys.argv)
