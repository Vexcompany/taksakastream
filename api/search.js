const { searchAnoboy } = require("../lib/anoboy")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { q } = req.query
  if (!q) {
    return res.status(400).json({ status: false, message: "Parameter ?q wajib diisi" })
  }

  try {
    const result = await searchAnoboy(q)
    return res.status(200).json({ status: true, ...result })
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message })
  }
}
