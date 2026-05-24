const { getAnimeDetail } = require("../lib/anoboy")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  let { url, mal_id } = req.query
  if (!url && !mal_id) {
    return res.status(400).json({ status: false, message: "Parameter ?url atau ?mal_id wajib diisi" })
  }
  if (!url && mal_id) {
    url = `https://myanimelist.net/anime/${mal_id}`
  }

  try {
    const result = await getAnimeDetail(url)
    return res.status(200).json({ status: true, ...result })
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message })
  }
}
