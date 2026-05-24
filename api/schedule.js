const { getSchedule } = require("../lib/anoboy")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  // Cache 1 hour — schedule rarely changes
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=300")
  if (req.method === "OPTIONS") return res.status(200).end()

  try {
    const result = await getSchedule()
    return res.status(200).json({ status: true, ...result })
  } catch (e) {
    // Avoid returning HTTP 500 to the frontend for transient upstream errors (rate limits, timeouts).
    // Instead return a graceful JSON payload the frontend can handle and display.
    console.error('api/schedule error:', e && e.stack ? e.stack : e)
    const msg = e?.message || 'Gagal mengambil jadwal'
    return res.status(200).json({ status: false, message: msg, data: { schedule: {}, day_order: [] } })
  }
}
