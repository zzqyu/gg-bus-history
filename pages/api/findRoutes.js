import Database from 'better-sqlite3'

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000 // meters
  const toRad = (v) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function handler(req, res) {
  try {
    const { ax, ay, bx, by, radius = '500' } = req.query
    if (!ax || !ay || !bx || !by) {
      res.status(400).json({ error: 'Missing coordinates (ax, ay, bx, by)' })
      return
    }

    const aLon = parseFloat(ax)
    const aLat = parseFloat(ay)
    const bLon = parseFloat(bx)
    const bLat = parseFloat(by)
    const rad = Number(radius)

    const db = new Database('basedata.db', { readonly: true })

    // rough degree deltas
    const degPerMeter = 1 / 111320 // deg per meter for latitude
    const latDeltaA = rad * degPerMeter
    const lonDeltaA = rad * degPerMeter / Math.cos((aLat * Math.PI) / 180)
    const latDeltaB = rad * degPerMeter
    const lonDeltaB = rad * degPerMeter / Math.cos((bLat * Math.PI) / 180)

    const stationsA = db.prepare(
      'SELECT stationId, stationName, x AS lon, y AS lat FROM station WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?'
    ).all(aLon - lonDeltaA, aLon + lonDeltaA, aLat - latDeltaA, aLat + latDeltaA)

    const stationsB = db.prepare(
      'SELECT stationId, stationName, x AS lon, y AS lat FROM station WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?'
    ).all(bLon - lonDeltaB, bLon + lonDeltaB, bLat - latDeltaB, bLat + latDeltaB)

    const nearA = stationsA
      .map((s) => ({ ...s, dist: haversine(aLat, aLon, s.lat, s.lon) }))
      .filter((s) => s.dist <= rad)

    const nearB = stationsB
      .map((s) => ({ ...s, dist: haversine(bLat, bLon, s.lat, s.lon) }))
      .filter((s) => s.dist <= rad)

    if (nearA.length === 0 || nearB.length === 0) {
      res.json({ routes: [], nearA, nearB })
      db.close()
      return
    }

    const idsA = [...new Set(nearA.map((s) => s.stationId))]
    const idsB = [...new Set(nearB.map((s) => s.stationId))]

    const placeholdersA = idsA.map(() => '?').join(',')
    const placeholdersB = idsB.map(() => '?').join(',')

    const sql = `SELECT DISTINCT r1.routeId, r1.routeName, r1.upDown
      FROM routestation r1
      JOIN routestation r2 ON r1.routeId = r2.routeId AND r1.upDown = r2.upDown
      WHERE r1.stationId IN (${placeholdersA}) AND r2.stationId IN (${placeholdersB}) AND r1.staOrder < r2.staOrder
      LIMIT 500`

    const params = [...idsA, ...idsB]
    const routes = db.prepare(sql).all(...params)

    db.close()

    res.json({ routes, nearA, nearB })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
