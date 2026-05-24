/**
 * @project    : TaksakaStream — Core Scraper Library
 * @author     : Kayllano Aveline  👨‍💻
 * @license    : MIT / Personal
 * @description: Powered by AliciaCode — Web Scraping Specialist
 * Website     : xalixia.biz.id
 *
 * Pure functions — no Express. Importable by Vercel serverless functions.
 *
 * BUG FIXES v2:
 *  - getAnimeDetail: episode list multi-selector fallback
 *  - getByGenre: dual URL pattern (genre + category), robust pagination
 *  - getLatest: correct pagination detection
 *  - getSchedule: full HTML dump strategy + multiple fallbacks
 **/

const axios   = require("axios")
const cheerio = require("cheerio")

// ─────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────

function unpackEval(packed) {
  if (!/eval\(function\(p,a,c,k,e,[dr]\)/.test(packed)) return packed
  try {
    const match = packed.match(
      /eval\(function\(p,a,c,k,e,[dr]\)\{.*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/
    )
    if (!match) return packed
    let [, p, a, , k] = match
    a = parseInt(a)
    k = k.split("|")
    p = p.replace(/\b\w+\b/g, w => {
      const i = parseInt(w, a)
      return k[i] !== undefined && k[i] !== "" ? k[i] : w
    })
    return p
  } catch { return packed }
}

function buildClient(referer = "https://anoboy.be/") {
  return axios.create({
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer,
    },
    maxRedirects: 5,
    timeout: 20000,
  })
}

function detectProvider(iframeSrc = "") {
  const url = iframeSrc.toLowerCase()
  if (url.includes("dood"))                                      return "doodstream"
  if (url.includes("mp4upload"))                                  return "mp4upload"
  if (url.includes("filemoon") || url.includes("fmoonembed"))    return "filemoon"
  if (url.includes("yourupload"))                                 return "yourupload"
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
  if (!srcMatch) throw new Error("Mp4Upload: MP4 URL not found")
  return { stream_url: srcMatch[1], type: "mp4", headers: { referer: origin + "/", origin }, provider: "mp4upload" }
}

async function extractFilemoon(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const { data: html } = await client.get(iframeSrc)
  const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const script of scriptTags) {
    const unpacked = unpackEval(script.replace(/<\/?script[^>]*>/gi, ""))
    const m = unpacked.match(/sources:\s*\[\s*\{[^}]*file:\s*["']([^"']+\.m3u8[^"']*)["']/) ||
              unpacked.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/) ||
              unpacked.match(/"file":"([^"]+\.m3u8[^"]*)"/)
    if (m) return { stream_url: m[1], type: "m3u8", headers: { referer: origin + "/", origin }, provider: "filemoon" }
  }
  throw new Error("Filemoon: m3u8 not found")
}

async function extractYourUpload(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const { data: html } = await client.get(iframeSrc)
  const m = html.match(/file:\s*["']([^"']+\.(mp4|m3u8)[^"']*)["']/) ||
            html.match(/src:\s*["']([^"']+\.(mp4|m3u8)[^"']*)["']/)
  if (!m) throw new Error("YourUpload: stream not found")
  return { stream_url: m[1], type: m[2] === "m3u8" ? "m3u8" : "mp4", headers: { referer: origin + "/", origin }, provider: "yourupload" }
}

async function extractStreamSB(iframeSrc) {
  const origin = new URL(iframeSrc).origin
  const client = buildClient(iframeSrc)
  const idMatch = iframeSrc.match(/\/(?:e|embed|v|play)\/([a-zA-Z0-9]+)/)
  if (!idMatch) throw new Error("StreamSB: video ID not found")
  const videoId = idMatch[1]
  const { data } = await client.get(`${origin}/sources43/rr=${videoId}||${videoId}||streamsb`, {
    headers: { watchsb: "sbstream", referer: iframeSrc }
  })
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
    const unpacked = unpackEval(script.replace(/<\/?script[^>]*>/gi, ""))
    const m = unpacked.match(/file:\s*["']([^"']+\.(m3u8|mp4)[^"']*)["']/) ||
              unpacked.match(/src:\s*["']([^"']+\.(m3u8|mp4)[^"']*)["']/) ||
              unpacked.match(/["'](https?:\/\/[^"']+\.(m3u8|mp4)[^"']*)["']/)
    if (m) {
      const ext = m[2] || "mp4"
      return { stream_url: m[1], type: ext === "m3u8" ? "m3u8" : "mp4", headers: { referer: origin + "/", origin }, provider: "generic" }
    }
  }
  throw new Error("Generic extractor: stream URL not found")
}

// ─────────────────────────────────────────────
// SCRAPER HELPERS
// ─────────────────────────────────────────────

/** Extract anime cards from any Anoboy list page */
function extractCards($) {
  const results = []
  const seen    = new Set()
  // Use only top-level .bs inside .listupd/.postbody to avoid double-counting .bsx children
  $(".listupd > .bs, .postbody > .bs, .listupd > ul > .bs, .listupd > .bsx, .postbody > .bsx").each((_, el) => {
    const $el  = $(el)
    const $a   = $el.find("a").first()
    const aUrl = $a.attr("href")
    if (!aUrl || seen.has(aUrl)) return
    seen.add(aUrl)
    const title= $el.find(".tt, .title, h2").first().text().trim() || $a.attr("title") || ""
    const thumb= $el.find("img").attr("src")
               || $el.find("img").attr("data-src")
               || $el.find("img").attr("data-lazy-src")
               || null
    const status = $el.find(".status").text().trim() || null
    const type   = $el.find(".typez, .type").text().trim() || null
    const ep     = $el.find(".epx, .ep").text().trim() || null
    if (title) results.push({ title, url: aUrl, thumbnail: thumb, status, type, episode: ep })
  })
  return results
}

/** Detect last page number from Anoboy pagination */
function detectLastPage($) {
  // Try numbered pagination links
  let lastPage = 1
  $(".pagination a, .nav-links a, .page-numbers").each((_, el) => {
    const href = $(el).attr("href") || ""
    const m    = href.match(/\/page\/(\d+)/)
    if (m) lastPage = Math.max(lastPage, parseInt(m[1]))
    const txt = parseInt($(el).text().trim())
    if (!isNaN(txt) && txt > lastPage) lastPage = txt
  })
  return lastPage
}

// ─────────────────────────────────────────────
// MAIN FUNCTIONS
// ─────────────────────────────────────────────

async function searchAnoboy(query) {
  if (!query) throw new Error("Query pencarian tidak boleh kosong")
  const client = buildClient("https://anoboy.be/")
  try {
    const { data: html } = await client.get(`https://anoboy.be/?s=${encodeURIComponent(query)}`)
    const $ = cheerio.load(html)
    const results = extractCards($)
    return {
      code: 200, timestamp: Date.now(),
      data: { query, search_title: $(".releases h1 span, .search-title").text().trim() || `Search '${query}'`, total_results: results.length, results }
    }
  } catch (err) { throw new Error(`Gagal mencari anime: ${err.message}`) }
}

async function getAnimeDetail(url) {
  if (!url) throw new Error("URL anime tidak boleh kosong")
  const client = buildClient("https://anoboy.be/")
  try {
    const { data: html } = await client.get(url)
    const $ = cheerio.load(html)

    const title     = $(".entry-title, h1.entry-title, h1.film-title").first().text().trim()
    const thumbnail = $(".thumb img, .thumbook img, .poster img, .wp-post-image").first().attr("src") || null
    const rating    = $(".rating strong, .rating-number").first().text().trim() || null
    const genres    = []
    $(".genxed a, .genres a, .genre a").each((_, el) => genres.push($(el).text().trim()))

    // Robust info extraction — Anoboy uses both :contains and data-attributes
    const getInfo = (label) => {
      // Try :contains approach
      let val = $(".spe span, .info-list span, .detail-item").filter((_, el) => {
        return $(el).text().includes(label)
      }).first().text().replace(label, "").replace(":", "").trim()
      return val || null
    }

    const status   = getInfo("Status")
    const episodes = getInfo("Episodes") || getInfo("Episode")
    const released = getInfo("Released") || getInfo("Tahun")
    const type     = getInfo("Type") || getInfo("Tipe")
    const season   = getInfo("Season") || null
    const studio   = $(".spe span:contains('Studio') a, .studio a").first().text().trim() || null
    const synopsis = $(".entry-content p, .synopsis p, .film-description p")
                       .map((_, el) => $(el).text().trim()).get()
                       .filter(t => t.length > 10).join("\n") || null

    // ── BUG FIX: Episode list — try multiple selectors ──
    const episodeList = []
    const epSelectors = [
      ".eplister ul li",
      ".episodelist ul li",
      ".eplisterfull ul li",
      "#episodelist li",
      ".eps-list li",
      ".episode-list li",
      ".soralist li",
      ".bxcl ul li",
      ".listing li",
    ]
    for (const sel of epSelectors) {
      $(sel).each((i, el) => {
        const $li  = $(el)
        const $a   = $li.find("a").first()
        const epUrl = $a.attr("href")
        if (!epUrl || !epUrl.startsWith("http")) return

        // Extract ep number from multiple possible elements
        const epNum =
          $li.find(".epl-num, .num, .ep-num, .episode-number").text().trim() ||
          $li.find(".epl-title, .title").text().match(/\d+/)?.[0] ||
          $a.text().match(/\d+/)?.[0] ||
          String(i + 1)

        const epTitle = $li.find(".epl-title, .ep-title, .title").text().trim()
        const epDate  = $li.find(".epl-date, .ep-date, .date").text().trim()

        episodeList.push({
          episode: epNum,
          title: epTitle || `Episode ${epNum}`,
          url: epUrl,
          release_date: epDate || null,
        })
      })
      if (episodeList.length > 0) break
    }

    // Deduplicate
    const seen = new Set()
    const uniqueEps = episodeList.filter(ep => {
      if (seen.has(ep.url)) return false
      seen.add(ep.url); return true
    })

    const recommendations = []
    $(".listupd .bs, .bsx").each((i, el) => {
      if (i >= 10) return
      const $el = $(el)
      const recUrl   = $el.find("a").first().attr("href")
      const recTitle = $el.find(".tt, .title").first().text().trim()
      if (recUrl && recTitle) recommendations.push({
        title: recTitle, url: recUrl,
        thumbnail: $el.find("img").attr("src") || null,
        type: $el.find(".typez").text().trim() || null,
        status: $el.find(".status").text().trim() || null,
      })
    })

    return {
      code: 200, timestamp: Date.now(),
      data: {
        title, url, thumbnail,
        rating: rating ? parseFloat(rating) : null,
        status, type, released, season, studio, genres, synopsis,
        episodes_total: episodes ? parseInt(episodes) : uniqueEps.length,
        first_episode: uniqueEps.length > 0 ? uniqueEps[uniqueEps.length - 1] : null,
        last_episode:  uniqueEps.length > 0 ? uniqueEps[0] : null,
        episode_list:  uniqueEps,
        recommendations,
      }
    }
  } catch (err) { throw new Error(`Gagal mengambil detail anime: ${err.message}`) }
}

async function getEpisodeDetail(url) {
  if (!url) throw new Error("URL episode tidak boleh kosong")
  const client = buildClient("https://anoboy.be/")
  try {
    const { data: html } = await client.get(url)
    const $ = cheerio.load(html)
    const title = $(".entry-title, h1").first().text().trim()
    const downloadLinks = []
    $(".dlbox ul li, .eps-list li, .mirror li, .download li").each((i, el) => {
      const $a     = $(el).find("a").first()
      const linkUrl= $a.attr("href")
      const quality= $(el).find(".quality, .size, .resolution").text().trim() || $a.text().trim() || `Link ${i + 1}`
      const size   = $(el).find(".size").text().trim() || null
      if (linkUrl && linkUrl.startsWith("http")) downloadLinks.push({ quality, url: linkUrl, size })
    })
    return {
      code: 200, timestamp: Date.now(),
      data: { title, url, video_iframe: $("iframe").first().attr("src") || null, download_links: downloadLinks }
    }
  } catch (err) { throw new Error(`Gagal mengambil detail episode: ${err.message}`) }
}

async function getStreamUrl(url) {
  if (!url) throw new Error("URL episode tidak boleh kosong")
  const client = buildClient("https://anoboy.be/")
  const { data: html } = await client.get(url)
  const $ = cheerio.load(html)
  const title = $(".entry-title, h1").first().text().trim()
  const iframes = []
  $("iframe, [data-src]").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src")
    if (src && src.startsWith("http")) iframes.push(src)
  })
  if (iframes.length === 0) throw new Error("Tidak ditemukan iframe video")

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

// ─────────────────────────────────────────────
// GENRE SLUG MAP
// ─────────────────────────────────────────────
const GENRE_SLUGS = {
  "action":"action","adventure":"adventure","comedy":"comedy","drama":"drama",
  "ecchi":"ecchi","fantasy":"fantasy","horror":"horror","isekai":"isekai",
  "josei":"josei","magic":"magic","martial arts":"martial-arts","mecha":"mecha",
  "military":"military","mystery":"mystery","psychological":"psychological",
  "romance":"romance","school":"school","sci-fi":"sci-fi","seinen":"seinen",
  "shoujo":"shoujo","shounen":"shounen","slice of life":"slice-of-life",
  "sports":"sports","supernatural":"supernatural","thriller":"thriller",
}

/**
 * getByGenre — BUG FIX: try both /genre/ and /category/, robust pagination
 */
async function getByGenre(genre, page = 1) {
  if (!genre) throw new Error("Genre tidak boleh kosong")
  const slug = GENRE_SLUGS[genre.toLowerCase()] || genre.toLowerCase().replace(/\s+/g, "-")

  const client = buildClient("https://anoboy.be/")

  // Anoboy uses either /genre/ or /category/ depending on version
  const urlVariants = [
    page > 1 ? `https://anoboy.be/genre/${slug}/page/${page}/`    : `https://anoboy.be/genre/${slug}/`,
    page > 1 ? `https://anoboy.be/category/${slug}/page/${page}/` : `https://anoboy.be/category/${slug}/`,
    page > 1 ? `https://anoboy.be/genres/${slug}/page/${page}/`   : `https://anoboy.be/genres/${slug}/`,
  ]

  let html = null
  for (const urlTry of urlVariants) {
    try {
      const res = await client.get(urlTry)
      // Check page returned real content (not 404 page)
      if (res.data && res.data.includes("entry-title") || res.data.includes("listupd")) {
        html = res.data; break
      }
    } catch { continue }
  }
  if (!html) throw new Error(`Gagal mengambil genre "${genre}" — URL tidak ditemukan`)

  const $ = cheerio.load(html)
  const results = extractCards($)

  // BUG FIX: robust pagination — detect last page from all pagination links
  const lastPage = detectLastPage($)

  return {
    code: 200, timestamp: Date.now(),
    data: { genre, slug, page, total_pages: Math.max(lastPage, page), total_results: results.length, results }
  }
}

/**
 * getSchedule — scrape jadwal tayang dari anoboy.be dengan multi-strategy
 */
async function getSchedule() {
  const client   = buildClient("https://anoboy.be/")
  const dayOrder = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"]
  const dayMap   = {
    "senin":"Senin","selasa":"Selasa","rabu":"Rabu","kamis":"Kamis",
    "jumat":"Jumat","sabtu":"Sabtu","minggu":"Minggu",
    "monday":"Senin","tuesday":"Selasa","wednesday":"Rabu","thursday":"Kamis",
    "friday":"Jumat","saturday":"Sabtu","sunday":"Minggu",
  }

  const scheduleUrls = [
    "https://anoboy.be/jadwal-tayang/",
    "https://anoboy.be/jadwal/",
    "https://anoboy.be/schedule/",
    "https://anoboy.be/",
  ]

  const schedule = {}
  dayOrder.forEach(d => { schedule[d] = [] })

  const addItem = (day, title, url, time, episode) => {
    if (!title || title.length < 2) return
    schedule[day].push({ title: title.trim(), url: url || null, time: time || null, episode: episode || null })
  }

  const matchDay = (txt) => {
    const low = txt.trim().toLowerCase()
    return dayOrder.find(d => low === d.toLowerCase() || low.includes(d.toLowerCase()))
      || dayOrder.find(d => dayMap[low] === d)
      || null
  }

  for (const schedUrl of scheduleUrls) {
    try {
      const { data: html } = await client.get(schedUrl)
      const $ = cheerio.load(html)

      // ── Strategy 1: .kage atau .schedule-day container ──
      // Anoboy baru pakai struktur: div.kage > h2 (nama hari) + ul > li
      $(".kage, .schedule-day, .jadwal-hari, [class*='jadwal'], [class*='schedule']").each((_, container) => {
        const $c     = $(container)
        const dayTxt = $c.find("h2, h3, h4, .day-name, .title, .hari").first().text()
        const day    = matchDay(dayTxt)
        if (!day) return
        $c.find("li, .anime-item").each((_, item) => {
          const $i  = $(item)
          const $a  = $i.find("a").first()
          addItem(day, $a.text() || $i.text(), $a.attr("href"), $i.find(".time,.jam,.hour").text(), $i.find(".ep,.episode,.epx").text())
        })
      })

      // ── Strategy 2: heading diikuti sibling list (h2/h3 + ul) ──
      $("h2, h3, h4").each((_, heading) => {
        const day = matchDay($(heading).text())
        if (!day) return
        // cari ul/ol setelah heading (nextUntil next h2/h3/h4)
        $(heading).nextUntil("h2, h3, h4").filter("ul, ol, .anime-list").each((_, list) => {
          $(list).find("li").each((_, li) => {
            const $li = $(li)
            const $a  = $li.find("a").first()
            addItem(day, $a.text() || $li.text(), $a.attr("href"), $li.find(".time,.jam").text(), null)
          })
        })
        // juga cari div.list setelah heading
        $(heading).nextUntil("h2, h3, h4").filter("div").find("a").each((_, a) => {
          addItem(day, $(a).text(), $(a).attr("href"), null, null)
        })
      })

      // ── Strategy 3: tabel jadwal ──
      $("table tr").each((_, row) => {
        const cells = $(row).find("td, th")
        if (cells.length < 2) return
        const day = matchDay($(cells[0]).text())
        if (!day) return
        const $cell = $(cells[1])
        const title = $cell.find("a").text().trim() || $cell.text().trim()
        const url   = $cell.find("a").attr("href") || null
        const time  = $(cells[cells.length - 1]).text().trim() || null
        addItem(day, title, url, time, null)
      })

      // ── Strategy 4: data-day attribute (beberapa tema WordPress) ──
      $("[data-day]").each((_, el) => {
        const day = matchDay($(el).attr("data-day") || "")
        if (!day) return
        $(el).find("li, a, .item").each((_, item) => {
          const $i = $(item)
          const $a = $i.is("a") ? $i : $i.find("a").first()
          addItem(day, $a.text() || $i.text(), $a.attr("href"), null, null)
        })
      })

      // ── Strategy 5: widget sidebar ──
      $(".widget, .sidebar-widget, #sidebar").find("ul, ol").each((_, list) => {
        const $prev = $(list).prev()
        const day   = matchDay($prev.text())
        if (!day) return
        $(list).find("li").each((_, li) => {
          const $li = $(li)
          const $a  = $li.find("a").first()
          addItem(day, $a.text() || $li.text(), $a.attr("href"), null, null)
        })
      })

      const totalItems = dayOrder.reduce((acc, d) => acc + schedule[d].length, 0)
      if (totalItems > 0) break

    } catch { continue }
  }

  // Deduplicate setiap hari
  dayOrder.forEach(d => {
    const seen  = new Set()
    schedule[d] = schedule[d].filter(item => {
      const key = item.title.toLowerCase() + (item.url || "")
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  })

  return { code: 200, timestamp: Date.now(), data: { schedule, day_order: dayOrder } }
}

/**
 * getLatest — BUG FIX: detect total_pages correctly
 */
async function getLatest(page = 1) {
  const url    = page > 1 ? `https://anoboy.be/page/${page}/` : "https://anoboy.be/"
  const client = buildClient("https://anoboy.be/")
  try {
    const { data: html } = await client.get(url)
    const $   = cheerio.load(html)
    const results   = extractCards($)
    // BUG FIX: detect real last page number
    const lastPage  = detectLastPage($)

    return {
      code: 200, timestamp: Date.now(),
      data: { page, total_pages: Math.max(lastPage, page), total_results: results.length, results }
    }
  } catch (err) { throw new Error(`Gagal mengambil latest: ${err.message}`) }
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  searchAnoboy, getAnimeDetail, getEpisodeDetail, getStreamUrl,
  getByGenre, getSchedule, getLatest,
  extractDoodstream, extractMp4Upload, extractFilemoon, extractYourUpload, extractStreamSB, extractGeneric,
  detectProvider, unpackEval, GENRE_SLUGS,
}
