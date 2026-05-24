const { getStreamUrl } = require("../lib/anoboy")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
  if (req.method === "OPTIONS") return res.status(200).end()

  // Endpoint ini publik — tidak perlu token
  const episodeUrl = req.query.q
  if (!episodeUrl) {
    return res.status(400).json({ status: false, message: "Parameter ?q=<episode_url> wajib diisi" })
  }

  try {
    const result = await getStreamUrl(episodeUrl)
    const { title, stream_url, type, headers, provider, fallback, fallback_reason } = result.data
    return res.status(200).json({
      status: result.code === 200,
      title,
      provider,
      stream_url,
      type,
      headers,
      ...(fallback && { fallback: true, fallback_reason }),
    })
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message })
  }
}
