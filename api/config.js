module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  if (req.method === 'OPTIONS') return res.status(200).end()
  return res.status(200).json({
    status: true,
    data: {
      google_client_id: process.env.GOOGLE_CLIENT_ID || null,
    }
  })
}
