# Rashmi Rao Designs

Static marketing and catalogue site for Rashmi Rao Designs — original contemporary
paintings, wearable art, and limited-edition collections.

Pure HTML / CSS / JavaScript. No build step, no dependencies to install.

## Structure

```
.
├── index.html              Home
├── collections.html        Collections listing
├── product.html            Product detail (reads ?id= from the query string)
├── about.html              About / story / press
├── giftcard.html           Gift cards
├── contact.html            Contact
├── assets/
│   ├── css/animations.css  Shared scroll/reveal animation styles
│   ├── js/site.js          Shared site behaviour (nav, cart, reveals)
│   ├── js/currency.js      Live currency conversion helper
│   ├── images/             Photography and artwork
│   └── video/              Hero background video
├── .nojekyll               Serve files as-is on GitHub Pages
├── .gitignore
└── README.md
```

Page-specific CSS lives in a `<style>` block in the `<head>` of each page, and
page-specific JavaScript in `<script>` blocks at the end of each `<body>`.
`assets/css/animations.css`, `assets/js/site.js`, and `assets/js/currency.js`
hold the parts shared across pages.

## Running locally

Open `index.html` directly in a browser, or — recommended, so `fetch` and the
product page's query-string routing behave exactly as they do in production —
serve the folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, VS Code Live Server).

## Deploying to GitHub Pages

1. Create a new repository on GitHub.
2. From this folder:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```

3. In the repository: **Settings → Pages → Build and deployment**.
   Set **Source** to *Deploy from a branch*, **Branch** to `main` and folder to
   `/ (root)`, then **Save**.
4. The site publishes at `https://<user>.github.io/<repo>/` within a minute or two.

All internal links and asset paths are relative, so the site works from a
repository subpath as well as from a custom domain.

### Custom domain

Add a file named `CNAME` in this folder containing only your domain
(e.g. `rashmiraodesigns.com`), commit it, then set the domain under
**Settings → Pages**.

## External dependencies

Loaded from CDNs at runtime — an internet connection is needed for these, and
the site degrades gracefully without them:

| Service | Used for |
| --- | --- |
| Google Fonts | Cormorant Garamond, DM Sans, DM Mono |
| cdnjs (GSAP + ScrollTrigger) | Scroll-driven animations |
| jsDelivr | Supporting library |
| open.er-api.com | Live exchange rates for the currency switcher |

## Asset notes

### Images

`assets/images/` holds web-optimised derivatives, not the camera originals:

- Resized to 2560 px on the long edge (1708 × 2560 for the photography,
  1200 × 1200 for the logos), from 5464 × 8192 originals.
- Progressive JPEG, quality 82, 4:2:0 chroma subsampling.
- EXIF orientation baked in, then all metadata stripped.

Total image weight went from 212 MB to 4.6 MB (a 97.8% reduction) with no
visible difference at screen sizes. **Keep the full-resolution originals
somewhere outside this repository** — they are the masters for print and for
any future re-export, and they are not recoverable from these files.

### Video

The hero background clip is 30 seconds and is offered in two encodings; the
browser downloads only the first one it can play:

| File | Codec | Resolution | Size |
| --- | --- | --- | --- |
| `rashmi-rao-bts.mp4` | HEVC | 1920 × 1080 | 21 MB |
| `rashmi-rao-bts-h264.mp4` | H.264 | 960 × 540 | 17 MB |

The HEVC file is the original and is listed first, so Safari — and Chrome,
Edge, and Firefox where hardware HEVC decode is available — get the sharper
1080p version. Everything else falls back to the H.264 file. Previously both
`<source>` tags pointed at the same HEVC file, so browsers without HEVC support
showed no video at all.

The video is now by far the heaviest part of the site. Both files were produced
with macOS `avconvert`, whose presets encode at a fixed high bitrate. Re-encoding
with `ffmpeg` using quality-targeted settings would bring the clip to roughly
3–5 MB with no perceptible loss for a muted, overlaid background video:

```bash
# H.264 fallback, ~3-4 MB
ffmpeg -i rashmi-rao-bts.mp4 -vf scale=1280:-2 -c:v libx264 -crf 28 \
       -preset slow -profile:v high -pix_fmt yuv420p -an \
       -movflags +faststart rashmi-rao-bts-h264.mp4

# HEVC primary, ~2-3 MB
ffmpeg -i rashmi-rao-bts.mp4 -c:v libx265 -crf 30 -preset slow -tag:v hvc1 \
       -an -movflags +faststart rashmi-rao-bts.mp4
```

Both encodes drop the audio track (`-an`), which the hero video does not use —
it is `muted` and looping.
