const { getLatest } = require("../lib/anoboy")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { page = "1" } = req.query
  try {
    const result = await getLatest(parseInt(page))
    return res.status(200).json({ status: true, ...result })
  } catch (e) {
    return res.status(500).json({ status: false, message: e.message })
  }
}
