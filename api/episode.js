const { getEpisodeDetail } = require("../lib/anoboy")

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { url } = req.query
  if (!url) {
    return res.status(400).json({ status: false, message: "Parameter ?url wajib diisi" })
  }

  try {
    const result = await getEpisodeDetail(url)
    return res.status(200).json({ status: true, ...result })
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message })
  }
}
