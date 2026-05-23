/**
 * @project    : TaksakaStream — Core Scraper Library
 * @author     : Kayllano Aveline  👨‍💻
 * @license    : MIT / Personal
 * @description: Powered by AliciaCode — Web Scraping Specialist
 * Website     : xalixia.biz.id
 *
 * Pure functions only — no Express, importable by Vercel serverless functions.
 **/

const axios = require("axios")
const cheerio = require("cheerio")

// ─────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────

function unpackEval(packed) {
  const packedPattern = /eval\(function\(p,a,c,k,e,[dr]\)/
  if (!packedPattern.test(packed)) return packed
  try {
    const match = packed.match(
      /eval\(function\(p,a,c,k,e,[dr]\)\{.*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/
    )
    if (!match) return packed
    let [, p, a, , k] = match
    a = parseInt(a)
    k = k.split("|")
    p = p.replace(/\b\w+\b/g, (word) => {
      const idx = parseInt(word, a)
      return k[idx] !== undefined && k[idx] !== "" ? k[idx] : word
    })
    return p
  } catch {
    return packed
  }
}

function buildClient(referer = "https://anoboy.be/") {
  return axios.create({
    headers: {
      "user-agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      referer,
    },
    maxRedirects: 5,
    timeout: 15000,
  })
}

function detectProvider(iframeSrc = "") {
  if (!iframeSrc) return "unknown"
  const url = iframeSrc.toLowerCase()
  if (url.includes("dood")) return "doodstream"
  if (url.includes("mp4upload")) return "mp4upload"
  if (url.includes("filemoon") || url.includes("fmoonembed")) return "filemoon"
  if (url.includes("yourupload")) return "yourupload"
  if (url.includes("streamsb") || url.includes("sbplay") || url.includes("sblongvu")) return "streamsb"
  return "unknown"
}

// ─────────────────────────────────────────────
// PROVIDER EXTRACTORS
// ─────────────────────────────────────────────

async function extractDoodstream(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const { data: html } = await client.get(iframeSrc)
  const passMd5Match = html.match(/\/pass_md5\/[^"']+/)
  if (!passMd5Match) throw new Error("DoodStream: pass_md5 token not found")
  const tokenUrl = `${origin}${passMd5Match[0]}`
  const { data: token } = await client.get(tokenUrl, { headers: { referer: iframeSrc } })
  const rand = Math.random().toString(36).substring(2, 10)
  const streamUrl = `${token}${rand}?token=${passMd5Match[0].split("/").pop()}&expiry=${Date.now()}`
  return { stream_url: streamUrl, type: "mp4", headers: { referer: origin + "/", origin }, provider: "doodstream" }
}

async function extractMp4Upload(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const { data: html } = await client.get(iframeSrc)
  const unpacked = unpackEval(html)
  const srcMatch =
    unpacked.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/) ||
    unpacked.match(/file:\s*["']([^"']+\.mp4[^"']*)["']/) ||
    html.match(/src="(https?:\/\/[^"]+\.mp4[^"]*)"/)
  if (!srcMatch) throw new Error("Mp4Upload: direct MP4 URL not found")
  return { stream_url: srcMatch[1], type: "mp4", headers: { referer: origin + "/", origin }, provider: "mp4upload" }
}

async function extractFilemoon(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const { data: html } = await client.get(iframeSrc)
  const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || []
  let streamUrl = null
  for (const script of scriptTags) {
    const content = script.replace(/<\/?script[^>]*>/gi, "")
    const unpacked = unpackEval(content)
    const m3u8Match =
      unpacked.match(/sources:\s*\[\s*\{[^}]*file:\s*["']([^"']+\.m3u8[^"']*)["']/) ||
      unpacked.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/) ||
      unpacked.match(/"file":"([^"]+\.m3u8[^"]*)"/)
    if (m3u8Match) { streamUrl = m3u8Match[1]; break }
  }
  if (!streamUrl) throw new Error("Filemoon: m3u8 URL not found")
  return { stream_url: streamUrl, type: "m3u8", headers: { referer: origin + "/", origin }, provider: "filemoon" }
}

async function extractYourUpload(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const { data: html } = await client.get(iframeSrc)
  const srcMatch =
    html.match(/file:\s*["']([^"']+\.(mp4|m3u8)[^"']*)["']/) ||
    html.match(/src:\s*["']([^"']+\.(mp4|m3u8)[^"']*)["']/)
  if (!srcMatch) throw new Error("YourUpload: stream URL not found")
  const ext = srcMatch[2] || "mp4"
  return { stream_url: srcMatch[1], type: ext === "m3u8" ? "m3u8" : "mp4", headers: { referer: origin + "/", origin }, provider: "yourupload" }
}

async function extractStreamSB(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const idMatch = iframeSrc.match(/\/(?:e|embed|v|play)\/([a-zA-Z0-9]+)/)
  if (!idMatch) throw new Error("StreamSB: video ID not found")
  const videoId = idMatch[1]
  const apiUrl = `${origin}/sources43/rr=${videoId}||${videoId}||streamsb`
  const { data } = await client.get(apiUrl, { headers: { watchsb: "sbstream", referer: iframeSrc } })
  const streamUrl = data?.stream_data?.file
  if (!streamUrl) throw new Error("StreamSB: stream data not found")
  return { stream_url: streamUrl, type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4", headers: { referer: origin + "/", origin }, provider: "streamsb" }
}

async function extractGeneric(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const { data: html } = await client.get(iframeSrc)
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const script of scripts) {
    const content = script.replace(/<\/?script[^>]*>/gi, "")
    const unpacked = unpackEval(content)
    const match =
      unpacked.match(/file:\s*["']([^"']+\.(m3u8|mp4)[^"']*)["']/) ||
      unpacked.match(/src:\s*["']([^"']+\.(m3u8|mp4)[^"']*)["']/) ||
      unpacked.match(/["'](https?:\/\/[^"']+\.(m3u8|mp4)[^"']*)["']/)
    if (match) {
      const ext = match[2] || "mp4"
      return { stream_url: match[1], type: ext === "m3u8" ? "m3u8" : "mp4", headers: { referer: origin + "/", origin }, provider: "generic" }
    }
  }
  throw new Error("Generic extractor: tidak ditemukan URL stream")
}

// ─────────────────────────────────────────────
// MAIN FUNCTIONS
// ─────────────────────────────────────────────

async function searchAnoboy(query) {
  if (!query) throw new Error("Query pencarian tidak boleh kosong")
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    referer: "https://anoboy.be/",
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
    "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "upgrade-insecure-requests": "1",
  }
  try {
    const response = await axios.get(`https://anoboy.be/?s=${encodeURIComponent(query)}`, { headers })
    const $ = cheerio.load(response.data)
    const results = []
    $(".listupd .bs").each((index, element) => {
      const $element = $(element)
      const $link = $element.find("a")
      const url = $link.attr("href")
      const title = $link.find(".tt").text().trim() || $link.attr("title")
      const thumbnail = $element.find("img").attr("src")
      const status = $element.find(".status").text().trim()
      const type = $element.find(".typez").text().trim()
      const subtitle = $element.find(".sb").text().trim()
      const episode = $element.find(".epx").text().trim()
      if (url && title) results.push({ title, url, thumbnail: thumbnail || null, status: status || null, type: type || null, subtitle: subtitle || null, episode: episode || null })
    })
    return { code: 200, timestamp: Date.now(), data: { query, search_title: $(".releases h1 span").text().trim() || `Search '${query}'`, total_results: results.length, results } }
  } catch (error) {
    throw new Error(`Gagal mencari anime: ${error.message}`)
  }
}

async function getAnimeDetail(url) {
  if (!url) throw new Error("URL anime tidak boleh kosong")
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    referer: "https://anoboy.be/",
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  }
  try {
    const response = await axios.get(url, { headers })
    const $ = cheerio.load(response.data)
    const title = $(".entry-title").text().trim() || $("h1.entry-title").text().trim()
    const thumbnail = $(".thumb img").attr("src") || $(".thumbook .thumb img").attr("src")
    const rating = $(".rating strong").text().trim() || null
    const ratingPercent = $(".rtb span").attr("style")?.match(/\d+(?:\.\d+)?/)?.[0] || null
    const genres = []
    $(".genxed a").each((i, el) => genres.push($(el).text().trim()))
    const studio = $(".spe span:contains('Studio:') a").first().text().trim() || null
    const status = $(".spe span:contains('Status:')").text().replace("Status:", "").trim() || null
    const episodes = $(".spe span:contains('Episodes:')").text().replace("Episodes:", "").trim() || null
    const released = $(".spe span:contains('Released:')").text().replace("Released:", "").trim() || null
    const type = $(".spe span:contains('Type:')").text().replace("Type:", "").trim() || null
    const season = $(".spe span:contains('Season:') a").first().text().trim() || null
    const synopsis = $(".entry-content p").map((i, el) => $(el).text().trim()).get().join("\n") || null
    const characters = []
    $(".cvitem").each((i, el) => {
      const characterName = $(el).find(".cvchar .charname").first().text().trim()
      const characterRole = $(el).find(".cvchar .charrole").first().text().trim()
      const voiceActor = $(el).find(".cvactor .charname a").first().text().trim()
      if (characterName) characters.push({ name: characterName, role: characterRole || null, voice_actor: voiceActor || null })
    })
    const episodeList = []
    $(".eplister ul li").each((i, el) => {
      const episodeUrl = $(el).find("a").attr("href")
      const episodeNum = $(el).find(".epl-num").text().trim()
      const episodeTitle = $(el).find(".epl-title").text().trim()
      const episodeDate = $(el).find(".epl-date").text().trim()
      if (episodeUrl) episodeList.push({ episode: episodeNum, title: episodeTitle || `Episode ${episodeNum}`, url: episodeUrl, release_date: episodeDate || null })
    })
    const recommendations = []
    $(".listupd .bs").each((i, el) => {
      if (i < 10) {
        const recUrl = $(el).find("a").attr("href")
        const recTitle = $(el).find(".tt").text().trim()
        if (recUrl && recTitle) recommendations.push({ title: recTitle, url: recUrl, thumbnail: $(el).find("img").attr("src") || null, type: $(el).find(".typez").text().trim() || null, status: $(el).find(".status").text().trim() || null })
      }
    })
    return {
      code: 200, timestamp: Date.now(),
      data: { title, url, thumbnail: thumbnail || null, rating: rating ? parseFloat(rating) : null, rating_percent: ratingPercent ? parseFloat(ratingPercent) : null, status, type, episodes_total: episodes ? parseInt(episodes) : episodeList.length, released, season, studio, genres, synopsis, characters, first_episode: episodeList.length > 0 ? episodeList[episodeList.length - 1] : null, last_episode: episodeList.length > 0 ? episodeList[0] : null, episode_list: episodeList, recommendations }
    }
  } catch (error) {
    throw new Error(`Gagal mengambil detail anime: ${error.message}`)
  }
}

async function getEpisodeDetail(url) {
  if (!url) throw new Error("URL episode tidak boleh kosong")
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  }
  try {
    const response = await axios.get(url, { headers })
    const $ = cheerio.load(response.data)
    const title = $(".entry-title").text().trim() || $("h1").first().text().trim()
    const downloadLinks = []
    $(".dlbox ul li, .eps-list li").each((i, el) => {
      const linkUrl = $(el).find("a").attr("href")
      const quality = $(el).find(".quality, .size").text().trim() || `Link ${i + 1}`
      const size = $(el).find(".size").text().trim() || null
      if (linkUrl && linkUrl.startsWith("http")) downloadLinks.push({ quality, url: linkUrl, size })
    })
    return { code: 200, timestamp: Date.now(), data: { title, url, video_iframe: $("iframe").first().attr("src") || null, download_links: downloadLinks } }
  } catch (error) {
    throw new Error(`Gagal mengambil detail episode: ${error.message}`)
  }
}

async function getStreamUrl(url) {
  if (!url) throw new Error("URL episode tidak boleh kosong")
  const client = buildClient("https://anoboy.be/")
  const { data: html } = await client.get(url)
  const $ = cheerio.load(html)
  const title = $(".entry-title").text().trim() || $("h1").first().text().trim()
  const iframes = []
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src")
    if (src) iframes.push(src)
  })
  if (iframes.length === 0) throw new Error("Tidak ditemukan iframe video di halaman episode")
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
      return { code: 200, timestamp: Date.now(), data: { title, url, stream_url: result.stream_url, type: result.type, headers: result.headers, provider: result.provider } }
    } catch (err) { lastError = err; continue }
  }
  return {
    code: 206, timestamp: Date.now(),
    data: { title, url, stream_url: iframes[0], type: "iframe", headers: {}, provider: detectProvider(iframes[0]) || "unknown", fallback: true, fallback_reason: lastError?.message || "Semua extractor gagal" }
  }
}

module.exports = {
  searchAnoboy, getAnimeDetail, getEpisodeDetail, getStreamUrl,
  extractDoodstream, extractMp4Upload, extractFilemoon, extractYourUpload, extractStreamSB, extractGeneric,
  detectProvider, unpackEval,
}
