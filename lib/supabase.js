const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
let supabaseClient = null

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  }
  return supabaseClient
}

async function findMemberInSupabase({ fullname, jabatan, generasi }) {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .ilike('fullname', fullname)
    .eq('jabatan', jabatan)
    .eq('generasi', generasi)
    .limit(1)

  if (error) {
    throw new Error(`Supabase query error: ${error.message}`)
  }
  return data?.[0] || null
}

async function createMemberInSupabase({ fullname, jabatan, generasi, role }) {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('members')
    .insert([{ fullname, jabatan, generasi, role }])
    .select()
    .limit(1)

  if (error) {
    throw new Error(`Supabase insert error: ${error.message}`)
  }
  return data?.[0] || null
}

module.exports = {
  getSupabase,
  findMemberInSupabase,
  createMemberInSupabase,
}
