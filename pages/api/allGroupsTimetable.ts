import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const qs = new URLSearchParams(req.query as Record<string, string>).toString()
    const API_BASE = process.env.API_BASE_URL ?? 'http://api:8000'
    const target = `${API_BASE}/allGroupsTimetable?${qs}`
    const r = await fetch(target)
    const body = await r.text()
    res.status(r.status)
    const ct = r.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    res.send(body)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
