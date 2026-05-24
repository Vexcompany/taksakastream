/**
 * Debug endpoint — test Jikan API connectivity & data
 * Usage: /api/debug?target=latest|schedule|genre&name=action
 */
const { getLatest, getSchedule, getByGenre, searchAnoboy } = require("../lib/anoboy")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { target = "latest", name = "action", page = "1" } = req.query

  try {
    let result
    if (target === "latest")   result = await getLatest(parseInt(page))
    else if (target === "schedule") result = await getSchedule()
    else if (target === "genre")    result = await getByGenre(name, parseInt(page))
    else if (target === "search")   result = await searchAnoboy(name)
    else return res.status(400).json({ status: false, message: "target tidak dikenal" })

    return res.status(200).json({ status: true, source: "jikan-api", ...result })
  } catch (e) {
    return res.status(500).json({ status: false, message: e.message })
  }
}
