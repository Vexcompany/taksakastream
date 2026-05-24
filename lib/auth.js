const fs = require('fs').promises
const path = require('path')
const jwt = require('jsonwebtoken')
const { findMemberInSupabase, createMemberInSupabase } = require('./supabase')

const DATA_DIR = path.join(__dirname, '..', 'data')
const MEMBERS_DB = path.join(DATA_DIR, 'members.json')
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-please'
const JWT_EXPIRES_IN = '7d'

const MEMBER_POSITIONS = [
  'Ketua Umum', 'Wakil Ketua Umum', 'Sekretaris', 'Bendahara',
  'DTP', 'Koor GK3', 'Koor DIsarda', 'Koor Infokom'
]
const MEMBER_GENERATIONS = ['generasi 1', 'generasi 2', 'generasi 3', 'generasi 4']

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function loadMembers() {
  try {
    const content = await fs.readFile(MEMBERS_DB, 'utf-8')
    return JSON.parse(content || '[]')
  } catch (err) {
    return []
  }
}

async function saveMembers(members) {
  await ensureDataDir()
  await fs.writeFile(MEMBERS_DB, JSON.stringify(members, null, 2), 'utf-8')
  return members
}

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

function verifyToken(token) {
  if (!token) throw new Error('Token tidak ditemukan')
  return jwt.verify(token, JWT_SECRET)
}

async function findMember({ fullname, jabatan, generasi }) {
  const normalizedFullname = normalizeText(fullname)
  const normalizedJabatan = normalizeText(jabatan)
  const normalizedGenerasi = normalizeText(generasi)

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    return await findMemberInSupabase({ fullname: normalizedFullname, jabatan: normalizedJabatan, generasi: normalizedGenerasi })
  }

  const members = await loadMembers()
  return members.find(m =>
    normalizeText(m.fullname) === normalizedFullname &&
    normalizeText(m.jabatan) === normalizedJabatan &&
    normalizeText(m.generasi) === normalizedGenerasi
  )
}

async function registerMember({ fullname, jabatan, generasi }) {
  const existing = await findMember({ fullname, jabatan, generasi })
  if (existing) return existing
  const member = { fullname: String(fullname).trim(), jabatan, generasi, role: 'member' }
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    return await createMemberInSupabase(member)
  }
  const members = await loadMembers()
  members.push(member)
  await saveMembers(members)
  return member
}

async function memberLogin({ fullname, jabatan, generasi }) {
  if (!fullname || !jabatan || !generasi) {
    throw new Error('Nama lengkap, jabatan, dan generasi wajib diisi')
  }
  if (!MEMBER_POSITIONS.includes(jabatan)) {
    throw new Error(`Jabatan harus salah satu: ${MEMBER_POSITIONS.join(', ')}`)
  }
  if (!MEMBER_GENERATIONS.includes(generasi)) {
    throw new Error(`Generasi harus salah satu: ${MEMBER_GENERATIONS.join(', ')}`)
  }
  const member = await findMember({ fullname, jabatan, generasi })
  if (!member) {
    throw new Error('Akun anggota tidak ditemukan. Pastikan data sudah terdaftar.')
  }
  const token = createToken({ fullname: member.fullname, jabatan: member.jabatan, generasi: member.generasi, role: member.role })
  return { user: member, token }
}

async function googleLogin({ idToken }) {
  if (!idToken) throw new Error('Google token wajib diisi')
  const profile = await verifyGoogleToken(idToken)
  const user = {
    role: 'public',
    provider: 'google',
    email: profile.email,
    fullname: profile.name || profile.email,
    picture: profile.picture || null,
    sub: profile.sub,
  }
  const token = createToken(user)
  return { user, token }
}

async function verifyGoogleToken(idToken) {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Google token tidak valid (${res.status})`)
  }
  const payload = await res.json()
  const expectedClientId = process.env.GOOGLE_CLIENT_ID
  if (expectedClientId && payload.aud !== expectedClientId) {
    throw new Error('Google token tidak cocok dengan client ID')
  }
  return payload
}

module.exports = {
  MEMBER_POSITIONS,
  MEMBER_GENERATIONS,
  loadMembers,
  saveMembers,
  registerMember,
  memberLogin,
  googleLogin,
  verifyToken,
  verifyGoogleToken,
}
