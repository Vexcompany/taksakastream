/**
 * Debug endpoint — dumps raw HTML structure info from Anoboy
 * Usage: /api/debug?target=schedule|genre&name=action
 * Remove or restrict this in production!
 */
const axios   = require("axios")
const cheerio = require("cheerio")

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (req.method === "OPTIONS") return res.status(200).end()

  const { target = "schedule", name = "action" } = req.query
  const UA = "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"

  try {
    let url
    if (target === "schedule")      url = "https://anoboy.be/jadwal-tayang/"
    else if (target === "genre")    url = `https://anoboy.be/genre/${name}/`
    else if (target === "category") url = `https://anoboy.be/category/${name}/`
    else if (target === "home")     url = "https://anoboy.be/"
    else                            url = target // allow raw URL

    const { data: html } = await axios.get(url, { headers: { "user-agent": UA, referer: "https://anoboy.be/" }, timeout: 15000 })
    const $ = cheerio.load(html)

    // Extract all class names found in page to help identify selectors
    const classes = new Set()
    $("*[class]").each((_, el) => {
      const c = $(el).attr("class") || ""
      c.split(/\s+/).filter(Boolean).forEach(cn => classes.add(cn))
    })

    // Extract page title and key structural info
    const info = {
      url,
      page_title: $("title").text().trim(),
      h1: $("h1").map((_, el) => $(el).text().trim()).get(),
      h2: $("h2").map((_, el) => $(el).text().trim()).get().slice(0, 20),
      h3: $("h3").map((_, el) => $(el).text().trim()).get().slice(0, 20),
      bs_cards: $(".bs, .bsx").length,
      listupd_cards: $(".listupd .bs").length,
      eplister_items: $(".eplister li").length,
      episodelist_items: $(".episodelist li").length,
      soralist_items: $(".soralist li").length,
      pagination_links: $(".pagination a, .nav-links a").map((_, el) => $(el).attr("href")).get(),
      classes_found: [...classes].sort().slice(0, 100),
      // First 500 chars of raw HTML for inspection
      html_preview: html.slice(0, 1000),
    }

    return res.status(200).json({ status: true, data: info })
  } catch (e) {
    return res.status(500).json({ status: false, message: e.message })
  }
}
