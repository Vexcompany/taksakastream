/**
 * TaksakaStream — Core Library v3
 * Data: Jikan v4 API (MyAnimeList) — tidak diblock Vercel, gratis, no auth
 * Stream: anoboy.be scraper (dengan multi-domain + anti-403 fallback)
 **/

const cheerio = require("cheerio")

const JIKAN_BASE_URL = "https://api.jikan.moe/v4"
const JIKAN_TIMEOUT = 20000

async function jikanFetch(endpoint, params = {}) {
  const url = new URL(`${JIKAN_BASE_URL}${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), JIKAN_TIMEOUT)

  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json" },
      redirect: "follow",
      signal: controller.signal,
    })

    const body = await res.text()
    if (!res.ok) {
      let json = null
      try { json = JSON.parse(body) } catch (err) { }
      const message = json?.message || json?.error || res.statusText || `Request failed ${res.status}`
      const error = new Error(message)
      error.response = { data: json || body, status: res.status }
      throw error
    }

    return JSON.parse(body)
  } finally {
    clearTimeout(timeout)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── GENRE MAP ───────────────────────────────
const GENRE_IDS = {
  "action": 1, "adventure": 2, "comedy": 4, "drama": 8,
  "ecchi": 9, "fantasy": 10, "horror": 14, "mystery": 7,
  "romance": 22, "school": 23, "sci-fi": 24, "seinen": 42,
  "shoujo": 25, "shounen": 27, "slice of life": 36, "slice-of-life": 36,
  "sports": 30, "supernatural": 37, "mecha": 18, "military": 38,
  "psychological": 40, "isekai": 62, "magic": 16, "thriller": 41, "josei": 43,
}

const GENRE_SLUGS = {
  "action":"action","adventure":"adventure","comedy":"comedy","drama":"drama",
  "ecchi":"ecchi","fantasy":"fantasy","horror":"horror","isekai":"isekai",
  "josei":"josei","magic":"magic","mecha":"mecha","military":"military",
  "mystery":"mystery","psychological":"psychological","romance":"romance",
  "school":"school","sci-fi":"sci-fi","seinen":"seinen","shoujo":"shoujo",
  "shounen":"shounen","slice of life":"slice-of-life","sports":"sports",
  "supernatural":"supernatural","thriller":"thriller",
}

const DAY_MAP_TO_JIKAN = {
  "Senin": "monday", "Selasa": "tuesday", "Rabu": "wednesday",
  "Kamis": "thursday", "Jumat": "friday", "Sabtu": "saturday", "Minggu": "sunday",
}

// ─── NORMALIZE JIKAN → CARD FORMAT ───────────
function normalizeAnime(a) {
  return {
    title: a.title_indonesian || a.title || a.title_english || "",
    url: a.url || `https://myanimelist.net/anime/${a.mal_id}`,
    thumbnail: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
    status: a.status || null,
    type: a.type || null,
    episode: a.episodes ? `Ep ${a.episodes}` : (a.airing ? "Ongoing" : null),
    mal_id: a.mal_id || null,
    score: a.score || null,
    genres: (a.genres || []).map(g => g.name),
    synopsis: a.synopsis || null,
    aired: a.aired?.string || null,
    studios: (a.studios || []).map(s => s.name),
    season: a.season ? `${a.season} ${a.year}` : null,
  }
}

// ─── MAIN FUNCTIONS ──────────────────────────

async function getLatest(page = 1) {
  try {
    const { data } = await jikanFetch("/anime", { status: "airing", order_by: "start_date", sort: "desc", sfw: true, page, limit: 18 })
    const results = (data.data || []).map(normalizeAnime)
    return {
      code: 200, timestamp: Date.now(),
      data: { page, total_pages: data.pagination?.last_visible_page || 1, total_results: results.length, results }
    }
  } catch (err) {
    throw new Error(`Gagal mengambil latest: ${err.response?.data?.message || err.message}`)
  }
}

async function searchAnoboy(query) {
  if (!query) throw new Error("Query pencarian tidak boleh kosong")
  try {
    const { data } = await jikanFetch("/anime", { q: query, sfw: true, limit: 12 })
    const results = (data.data || []).map(normalizeAnime)
    return {
      code: 200, timestamp: Date.now(),
      data: { query, search_title: `Search '${query}'`, total_results: results.length, results }
    }
  } catch (err) {
    throw new Error(`Gagal mencari anime: ${err.response?.data?.message || err.message}`)
  }
}

async function getByGenre(genre, page = 1) {
  if (!genre) throw new Error("Genre tidak boleh kosong")
  const slug = genre.toLowerCase().replace(/\s+/g, "-")
  const genreId = GENRE_IDS[genre.toLowerCase()] || GENRE_IDS[slug]
  if (!genreId) throw new Error(`Genre "${genre}" tidak ditemukan`)
  try {
    const { data } = await jikanFetch("/anime", { genres: genreId, status: "airing", order_by: "score", sort: "desc", sfw: true, page, limit: 18 })
    const results = (data.data || []).map(normalizeAnime)
    return {
      code: 200, timestamp: Date.now(),
      data: { genre, slug, page, total_pages: data.pagination?.last_visible_page || 1, total_results: results.length, results }
    }
  } catch (err) {
    throw new Error(`Gagal mengambil genre: ${err.response?.data?.message || err.message}`)
  }
}

async function getSchedule() {
  const dayOrder = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"]
  const jikanDayMap = {
    "mondays":"Senin","tuesdays":"Selasa","wednesdays":"Rabu","thursdays":"Kamis",
    "fridays":"Jumat","saturdays":"Sabtu","sundays":"Minggu",
    "monday":"Senin","tuesday":"Selasa","wednesday":"Rabu","thursday":"Kamis",
    "friday":"Jumat","saturday":"Sabtu","sunday":"Minggu",
  }
  const schedule = {}
  dayOrder.forEach(d => { schedule[d] = [] })

  try {
    let page = 1
    let lastPage = 1

    do {
      const { data } = await jikanFetch("/seasons/now", { sfw: true, page, limit: 25 })
      lastPage = data.pagination?.last_visible_page || 1
      for (const anime of (data.data || [])) {
        const day = jikanDayMap[(anime.broadcast?.day || "").toLowerCase()]
        if (!day) continue
        schedule[day].push({
          title: anime.title_indonesian || anime.title || anime.title_english || "",
          url: anime.url || `https://myanimelist.net/anime/${anime.mal_id}`,
          time: anime.broadcast?.time || null,
          episode: anime.episodes ? `Ep ${anime.episodes}` : anime.airing ? "Ongoing" : null,
          mal_id: anime.mal_id,
          thumbnail: anime.images?.jpg?.image_url || null,
        })
      }
      page += 1
      if (page <= lastPage) await sleep(350)
    } while (page <= lastPage)

    const total = dayOrder.reduce((a, d) => a + schedule[d].length, 0)
    if (total === 0) {
      // Fallback to older schedule API if current season data is unavailable
      const { data } = await jikanFetch("/schedules", { sfw: true, limit: 25 })
      for (const anime of (data.data || [])) {
        const day = jikanDayMap[(anime.broadcast?.day || "").toLowerCase()]
        if (!day) continue
        schedule[day].push({
          title: anime.title_indonesian || anime.title || anime.title_english || "",
          url: anime.url || `https://myanimelist.net/anime/${anime.mal_id}`,
          time: anime.broadcast?.time || null,
          episode: anime.episodes ? `Ep ${anime.episodes}` : anime.airing ? "Ongoing" : null,
          mal_id: anime.mal_id,
          thumbnail: anime.images?.jpg?.image_url || null,
        })
      }
    }

    for (const day of dayOrder) {
      schedule[day].sort((a, b) => {
        if (!a.time) return 1
        if (!b.time) return -1
        return a.time.localeCompare(b.time)
      })
    }

    return { code: 200, timestamp: Date.now(), data: { schedule, day_order: dayOrder } }
  } catch (err) {
    if (err.response?.status === 429) throw new Error("Jikan API rate limit — coba lagi dalam beberapa detik")
    throw new Error(`Gagal mengambil jadwal: ${err.response?.data?.message || err.message}`)
  }
}

async function getAnimeDetail(url) {
  if (!url) throw new Error("URL anime tidak boleh kosong")
  const malIdMatch = url.match(/myanimelist\.net\/anime\/(\d+)/)
  if (!malIdMatch) {
    const titleGuess = url.split("/").pop()?.replace(/-/g, " ") || url
    const searchRes = await searchAnoboy(titleGuess)
    if (!searchRes.data?.results?.length) throw new Error("Anime tidak ditemukan")
    return getAnimeDetail(searchRes.data.results[0].url)
  }
  const malId = malIdMatch[1]
  try {
    const [detailRes, episodesRes] = await Promise.allSettled([
      jikanFetch(`/anime/${malId}/full`),
      jikanFetch(`/anime/${malId}/episodes`),
    ])
    const anime = detailRes.status === "fulfilled" ? detailRes.value.data : null
    if (!anime) throw new Error("Detail anime tidak ditemukan")
    const episodeList = (episodesRes.status === "fulfilled" ? episodesRes.value.data?.data : []).map(ep => ({
      episode: String(ep.mal_id),
      title: ep.title || `Episode ${ep.mal_id}`,
      url: ep.url || null,
      release_date: ep.aired || null,
    }))
    return {
      code: 200, timestamp: Date.now(),
      data: {
        title: anime.title_indonesian || anime.title,
        url, thumbnail: anime.images?.jpg?.large_image_url || null,
        rating: anime.score || null, status: anime.status || null,
        type: anime.type || null, released: anime.aired?.string || null,
        season: anime.season ? `${anime.season} ${anime.year}` : null,
        studio: (anime.studios || []).map(s => s.name).join(", ") || null,
        genres: (anime.genres || []).map(g => g.name),
        synopsis: anime.synopsis || null,
        episodes_total: anime.episodes || episodeList.length,
        episode_list: episodeList,
        first_episode: episodeList.length ? episodeList[episodeList.length - 1] : null,
        last_episode: episodeList.length ? episodeList[0] : null,
        recommendations: [], mal_id: malId,
      }
    }
  } catch (err) {
    if (err.message.includes("tidak ditemukan")) throw err
    throw new Error(`Gagal mengambil detail anime: ${err.response?.data?.message || err.message}`)
  }
}

async function getEpisodeDetail(url) {
  return {
    code: 200, timestamp: Date.now(),
    data: { title: "Episode Detail", url, video_iframe: null, download_links: [],
      note: "Stream langsung tidak tersedia via API ini. Gunakan /api/stream untuk ekstrak stream." }
  }
}

// ─── STREAM EXTRACTORS (anoboy.be scraper) ───

function unpackEval(packed) {
  if (!/eval\(function\(p,a,c,k,e,[dr]\)/.test(packed)) return packed
  try {
    const match = packed.match(/eval\(function\(p,a,c,k,e,[dr]\)\{.*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/)
    if (!match) return packed
    let [, p, a, , k] = match
    a = parseInt(a); k = k.split("|")
    p = p.replace(/\b\w+\b/g, w => { const i = parseInt(w, a); return k[i] !== undefined && k[i] !== "" ? k[i] : w })
    return p
  } catch { return packed }
}

const ANOBOY_DOMAINS = ["https://anoboy.be", "https://anoboy.app", "https://anoboy.me"]
const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]
const randomUA = () => UA_LIST[Math.floor(Math.random() * UA_LIST.length)]

function defaultStreamHeaders(referer = "https://anoboy.be/") {
  return {
    "user-agent": randomUA(),
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8",
    "cache-control": "no-cache", "pragma": "no-cache",
    "upgrade-insecure-requests": "1", referer,
  }
}

async function fetchText(src, referer) {
  const url = src.startsWith("http") ? src : new URL(src, "https://anoboy.be/").toString()
  const res = await fetch(url, { headers: defaultStreamHeaders(referer || "https://anoboy.be/"), redirect: "follow" })
  if (!res.ok) throw new Error(`Request failed ${res.status} for ${url}`)
  return { data: await res.text(), url: res.url, status: res.status }
}

async function fetchJson(src, referer) {
  const url = src.startsWith("http") ? src : new URL(src, "https://anoboy.be/").toString()
  const res = await fetch(url, { headers: defaultStreamHeaders(referer || "https://anoboy.be/"), redirect: "follow" })
  if (!res.ok) throw new Error(`Request failed ${res.status} for ${url}`)
  return { data: await res.json(), url: res.url, status: res.status }
}

function detectProvider(src = "") {
  const u = src.toLowerCase()
  if (u.includes("dood")) return "doodstream"
  if (u.includes("mp4upload")) return "mp4upload"
  if (u.includes("filemoon") || u.includes("fmoonembed")) return "filemoon"
  if (u.includes("yourupload")) return "yourupload"
  if (u.includes("streamsb") || u.includes("sbplay") || u.includes("sblongvu")) return "streamsb"
  return "unknown"
}

async function extractDoodstream(src) {
  const { data: html, url: finalUrl } = await fetchText(src, src)
  const origin = new URL(finalUrl).origin
  const m = html.match(/\/pass_md5\/[^"']+/)
  if (!m) throw new Error("DoodStream: pass_md5 not found")
  const { data: token } = await fetchText(`${origin}${m[0]}`, src)
  const rand = Math.random().toString(36).substring(2, 10)
  return { stream_url: `${token}${rand}?token=${m[0].split("/").pop()}&expiry=${Date.now()}`, type: "mp4", headers: { referer: origin+"/", origin }, provider: "doodstream" }
}

async function extractMp4Upload(src) {
  const { data: html, url: finalUrl } = await fetchText(src, src)
  const origin = new URL(finalUrl).origin
  const u = unpackEval(html)
  const m = u.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/) || u.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/) || html.match(/src="(https?:\/\/[^"]+\.mp4[^"]*)"/)
  if (!m) throw new Error("Mp4Upload: MP4 URL not found")
  return { stream_url: m[1], type: "mp4", headers: { referer: origin+"/", origin }, provider: "mp4upload" }
}

async function extractFilemoon(src) {
  const { data: html, url: finalUrl } = await fetchText(src, src)
  const origin = new URL(finalUrl).origin
  for (const script of (html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [])) {
    const u = unpackEval(script.replace(/<\/?script[^>]*>/gi, ""))
    const m = u.match(/sources:\s*\[\s*\{[^}]*file:\s*["']([^"']+\.m3u8[^"']*)["']/) || u.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/) || u.match(/"file":"([^"]+\.m3u8[^"]*)"/)
    if (m) return { stream_url: m[1], type: "m3u8", headers: { referer: origin+"/", origin }, provider: "filemoon" }
  }
  throw new Error("Filemoon: m3u8 not found")
}

async function extractYourUpload(src) {
  const { data: html, url: finalUrl } = await fetchText(src, src)
  const origin = new URL(finalUrl).origin
  const m = html.match(/file:\s*["']([^"']+\.(mp4|m3u8)[^"']*)["']/) || html.match(/src:\s*["']([^"']+\.(mp4|m3u8)[^"']*)["']/)
  if (!m) throw new Error("YourUpload: stream not found")
  return { stream_url: m[1], type: m[2] === "m3u8" ? "m3u8" : "mp4", headers: { referer: origin+"/", origin }, provider: "yourupload" }
}

async function extractStreamSB(src) {
  const { url: finalUrl } = await fetchText(src, src)
  const origin = new URL(finalUrl).origin
  const idMatch = finalUrl.match(/\/(?:e|embed|v|play)\/([a-zA-Z0-9]+)/)
  if (!idMatch) throw new Error("StreamSB: video ID not found")
  const { data } = await fetchJson(`${origin}/sources43/rr=${idMatch[1]}||${idMatch[1]}||streamsb`, src)
  const streamUrl = data?.stream_data?.file
  if (!streamUrl) throw new Error("StreamSB: stream data not found")
  return { stream_url: streamUrl, type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4", headers: { referer: origin+"/", origin }, provider: "streamsb" }
}

async function extractGeneric(src) {
  const { data: html, url: finalUrl } = await fetchText(src, src)
  const origin = new URL(finalUrl).origin
  for (const script of (html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [])) {
    const u = unpackEval(script.replace(/<\/??script[^>]*>/gi, ""))
    const m = u.match(/file:\s*["']([^"']+\.(m3u8|mp4)[^"']*)["']/) || u.match(/src:\s*["']([^"']+\.(m3u8|mp4)[^"']*)["']/) || u.match(/['"](https?:\/\/[^"']+\.(m3u8|mp4)[^"']*)['"]/) 
    if (m) return { stream_url: m[1], type: m[2] === "m3u8" ? "m3u8" : "mp4", headers: { referer: origin+"/", origin }, provider: "generic" }
  }
  throw new Error("Generic extractor: stream URL not found")
}

async function getStreamUrl(url) {
  if (!url) throw new Error("URL episode tidak boleh kosong")
  // Try fetching from all anoboy domains with anti-403 headers
  let html = null
  for (const domain of ANOBOY_DOMAINS) {
    const targetUrl = url.startsWith("http") ? url.replace(/^https?:\/\/anoboy\.\w+/, domain) : `${domain}${url}`
    try {
      const res = await fetchText(targetUrl, `${domain}/`)
      if (res.status === 200 && res.data?.length > 500) { html = res.data; break }
    } catch { continue }
  }
  if (!html) throw new Error("Tidak dapat mengakses halaman episode (semua domain 403/timeout)")

  const $      = cheerio.load(html)
  const title  = $(".entry-title, h1").first().text().trim()
  const iframes = []
  $("iframe, [data-src]").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src")
    if (src && src.startsWith("http")) iframes.push(src)
  })
  if (!iframes.length) throw new Error("Tidak ditemukan iframe video")

  let lastError = null
  for (const iframeSrc of iframes) {
    const provider = detectProvider(iframeSrc)
    try {
      let result
      switch (provider) {
        case "doodstream": result = await extractDoodstream(iframeSrc); break
        case "mp4upload":  result = await extractMp4Upload(iframeSrc);  break
        case "filemoon":   result = await extractFilemoon(iframeSrc);   break
        case "yourupload": result = await extractYourUpload(iframeSrc); break
        case "streamsb":   result = await extractStreamSB(iframeSrc);   break
        default:           result = await extractGeneric(iframeSrc)
      }
      return { code: 200, timestamp: Date.now(), data: { title, url, ...result } }
    } catch (err) { lastError = err; continue }
  }
  return {
    code: 206, timestamp: Date.now(),
    data: { title, url, stream_url: iframes[0], type: "iframe", headers: {}, provider: detectProvider(iframes[0]) || "unknown", fallback: true, fallback_reason: lastError?.message || "Semua extractor gagal" }
  }
}

// ─── EXPORTS ─────────────────────────────────
module.exports = {
  searchAnoboy, getAnimeDetail, getEpisodeDetail, getStreamUrl,
  getByGenre, getSchedule, getLatest,
  extractDoodstream, extractMp4Upload, extractFilemoon, extractYourUpload, extractStreamSB, extractGeneric,
  detectProvider, unpackEval, GENRE_SLUGS,
}
