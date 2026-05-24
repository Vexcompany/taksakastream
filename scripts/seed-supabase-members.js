const fs = require('fs').promises
const path = require('path')
const { getSupabase, findMemberInSupabase, createMemberInSupabase } = require('../lib/supabase')

const MEMBER_SOURCE_URL = process.argv.find(arg => arg.startsWith('--source='))?.split('=')[1] || process.env.MEMBER_SOURCE_URL
const WRITE_JSON = process.argv.includes('--write')
const MEMBERS_FILE = path.join(__dirname, '..', 'data', 'members.json')

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Gagal mengambil data anggota dari ${url} (${res.status})`)
  }
  return await res.text()
}

function parseMembersFromText(text) {
  const lines = text.split(/\r?\n/)
  let currentGeneration = ''
  const members = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const generationMatch = line.match(/^['"]?(\d+)['"]?\s*:\s*\[/)
    if (generationMatch) {
      currentGeneration = generationMatch[1]
      continue
    }

    const objectMatch = line.match(/\{([^}]+)\}/)
    if (!objectMatch) continue

    const fields = objectMatch[1]
    const nameMatch = fields.match(/nama\s*:\s*['\"]([^'\"]+)['\"]/i)
    const roleMatch = fields.match(/jabatan\s*:\s*['\"]([^'\"]+)['\"]/i)
    const typeMatch = fields.match(/tipe\s*:\s*['\"]([^'\"]+)['\"]/i)

    const fullname = nameMatch?.[1]?.trim()
    const jabatan = roleMatch?.[1]?.trim() || typeMatch?.[1]?.trim()

    if (fullname && jabatan) {
      members.push({ fullname, jabatan, generasi: currentGeneration || 'unknown', role: 'member' })
    }
  }

  return members
}

async function loadLocalMembers() {
  try {
    const content = await fs.readFile(MEMBERS_FILE, 'utf-8')
    return JSON.parse(content || '[]')
  } catch (err) {
    return []
  }
}

async function seedMembers(members) {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_KEY harus diatur untuk menulis ke Supabase')
  }

  console.log(`Menyiapkan ${members.length} anggota ke Supabase...`)
  let added = 0
  for (const member of members) {
    try {
      const existing = await findMemberInSupabase(member)
      if (existing) {
        continue
      }
      await createMemberInSupabase(member)
      added += 1
    } catch (err) {
      console.error('Gagal menyimpan:', member, err.message)
    }
  }

  console.log(`Selesai: ${added}/${members.length} anggota diproses.`)
}

async function main() {
  let members = []

  if (MEMBER_SOURCE_URL) {
    console.log('Mengambil daftar anggota dari:', MEMBER_SOURCE_URL)
    const text = await fetchText(MEMBER_SOURCE_URL)
    members = parseMembersFromText(text)
  } else {
    console.log('Membaca daftar anggota lokal dari data/members.json')
    members = await loadLocalMembers()
  }

  if (!members.length) {
    throw new Error('Tidak ada anggota yang ditemukan untuk di-seed. Periksa sumber data atau file lokal.')
  }

  if (WRITE_JSON) {
    await fs.mkdir(path.dirname(MEMBERS_FILE), { recursive: true })
    await fs.writeFile(MEMBERS_FILE, JSON.stringify(members, null, 2), 'utf-8')
    console.log('Menulis data anggota ke', MEMBERS_FILE)
  }

  await seedMembers(members)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
