const { getSchedule } = require("../lib/anoboy")

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  // Cache 1 hour — schedule rarely changes
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=300")
  if (req.method === "OPTIONS") return res.status(200).end()

  try {
    const result = await getSchedule()
    return res.status(200).json({ status: true, ...result })
  } catch (e) {
    return res.status(500).json({ status: false, message: e.message })
  }
}
