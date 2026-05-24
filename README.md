# 🐉 TaksakaStream

> Anime streaming & API platform powered by Anoboy scraper — deployed on Vercel Serverless Functions.

---

## Struktur Project

```
taksaka-vercel/
├── api/
│   ├── search.js       ← GET /api/search?q={keyword}
│   ├── detail.js       ← GET /api/detail?url={anime_url}
│   ├── episode.js      ← GET /api/episode?url={ep_url}
│   └── stream.js       ← GET /api/stream?q={ep_url}
├── lib/
│   └── anoboy.js       ← Core scraper (shared by all functions)
├── public/
│   └── index.html      ← Frontend website
├── vercel.json         ← Vercel config (routes, timeout, headers)
├── package.json
└── README.md
```

---

## Deploy ke Vercel

### Cara 1 — Via GitHub (Recommended)

1. Push project ke GitHub repo baru
2. Buka [vercel.com](https://vercel.com) → **New Project**
3. Import repo GitHub kamu
4. Vercel auto-detect settings dari `vercel.json`
5. Klik **Deploy** — selesai ✅

### Cara 2 — Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy dari folder project
cd taksaka-vercel
vercel

# Deploy ke production
vercel --prod
```

---

## Development Lokal

```bash
# Install dependencies
npm install

# Jalankan local dev server (mirip Vercel)
npx vercel dev
```

Local server akan jalan di `http://localhost:3000` dengan routing yang sama persis seperti di Vercel.

---

## API Endpoints

Base URL: `https://your-project.vercel.app`

| Method | Endpoint | Parameter | Deskripsi |
|--------|----------|-----------|-----------|
| GET | `/api/search` | `?q=keyword` | Cari anime |
| GET | `/api/detail` | `?url=anime_url` | Detail anime + daftar episode |
| GET | `/api/episode` | `?url=ep_url` | Detail episode + link download |
| GET | `/api/stream` | `?q=ep_url` | Direct stream / m3u8 URL |
| POST | `/api/auth/member` | JSON { action, fullname, jabatan, generasi } | Member login / register |
| POST | `/api/auth/google` | JSON { idToken } | Public Google login |
| GET | `/api/auth/me` | Authorization: Bearer <token> | Validasi sesi user |

### Contoh Request

```bash
# Cari anime
curl "https://your-project.vercel.app/api/search?q=alya"

# Detail anime
curl "https://your-project.vercel.app/api/detail?url=https://anoboy.be/anime/alya"

# Stream URL
curl "https://your-project.vercel.app/api/stream?q=https://anoboy.be/episode/alya-ep-1"
```

### Contoh Response `/api/stream`

```json
{
  "status": true,
  "title": "Alya Sometimes Hides Her Feelings Episode 1",
  "provider": "doodstream",
  "stream_url": "https://d0000d.com/...",
  "type": "mp4",
  "headers": {
    "referer": "https://dood.la/",
    "origin": "https://dood.la"
  }
}
```

---

## Auth dan environment

Beberapa endpoint internal sekarang memerlukan token otentikasi:
 - `/api/detail` — memerlukan `Authorization: Bearer <token>`
 - `/api/stream` — memerlukan `Authorization: Bearer <token>`

Gunakan `/api/auth/member` untuk login anggota Pagaska dan `/api/auth/google` untuk login pengguna umum.

### Vercel environment variables

Tambahkan variabel berikut di Vercel Dashboard atau via CLI:
 - `SUPABASE_URL` — URL Supabase project
 - `SUPABASE_SERVICE_KEY` — service role key untuk backend
 - `GOOGLE_CLIENT_ID` — Google OAuth Web client ID
 - `JWT_SECRET` — rahasia JWT untuk sign/verify token

Contoh `.env` lokal:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
JWT_SECRET=some-long-secret-value
```

Untuk seed Supabase members dari data eksternal, gunakan `scripts/seed-supabase-members.js` dan jalankan SQL di `supabase.sql`.

## Provider yang Didukung

| Provider | Type | Status |
|----------|------|--------|
| DoodStream | MP4 | ✅ |
| Mp4Upload | MP4 | ✅ |
| Filemoon | M3U8 | ✅ |
| YourUpload | MP4/M3U8 | ✅ |
| StreamSB | M3U8 | ✅ |
| Generic (fallback) | MP4/M3U8 | ✅ |

---

## Catatan Vercel

- **Function timeout**: `/api/stream` diberi 60 detik, sisanya 30 detik
- **Cold start**: Request pertama mungkin sedikit lambat (~1-2 detik)
- **CORS**: Sudah dikonfigurasi `Access-Control-Allow-Origin: *`
- **Cache**: Response API di-cache 60 detik di edge Vercel

---

## Tech Stack

- **Runtime**: Node.js 18.x
- **Scraping**: axios + cheerio
- **Hosting**: Vercel Serverless Functions
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
