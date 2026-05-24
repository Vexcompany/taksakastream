const { getByGenre } = require("../lib/anoboy")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { name, page = "1" } = req.query
  if (!name) return res.status(400).json({ status: false, message: "Parameter ?name wajib diisi" })

  try {
    const result = await getByGenre(name, parseInt(page))
    return res.status(200).json({ status: true, ...result })
  } catch (e) {
    return res.status(500).json({ status: false, message: e.message })
  }
}
