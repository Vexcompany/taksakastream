const { registerMember, memberLogin } = require('../../lib/auth')

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) }
      catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ status: false, message: 'Method tidak didukung' })

  try {
    const body = await jsonBody(req)
    const action = String(body.action || 'login')
    const payload = {
      fullname: body.fullname,
      jabatan: body.jabatan,
      generasi: body.generasi,
    }

    let result
    if (action === 'register') {
      await registerMember(payload)
      result = await memberLogin(payload)
      result.message = 'Akun anggota terdaftar dan Anda telah login.'
    } else {
      result = await memberLogin(payload)
    }

    return res.status(200).json({ status: true, ...result })
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message })
  }
}
