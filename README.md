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
│   ├── js/currency.js      Shared USD price formatting and launch offer
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

The project includes a `CNAME` file for `rhytara.com`. In the GitHub
repository, open **Settings → Pages → Custom domain**, enter `rhytara.com`,
and enable HTTPS after DNS verification completes.

Point the domain DNS to GitHub Pages using the four A records GitHub provides,
or use the repository's GitHub Pages URL as the CNAME target. Keep
`bjmcta-mt.myshopify.com` in `assets/js/shopify-config.js`; that permanent
Shopify domain is required for Storefront API requests even when the frontend
is served from `rhytara.com`.

## External dependencies

Loaded from CDNs at runtime — an internet connection is needed for these, and
the site degrades gracefully without them:

| Service | Used for |
| --- | --- |
| Google Fonts | Cormorant Garamond, DM Sans, DM Mono |
| cdnjs (GSAP + ScrollTrigger) | Scroll-driven animations |
| jsDelivr | Supporting library |

## Storefront pricing

All displayed prices use USD. The currency selector is currently removed, and
previously saved INR preferences no longer affect prices. No exchange-rate
request is made. Catalogue and cart amounts retain their legacy internal
encoding of 84 units per USD, matching the Shopify integration; this is not a
live exchange rate. Gift cards remain $100 and $150, without the launch offer.

The homepage artist portrait uses a shorter responsive frame with a centered
top-and-bottom crop. The original image file is unchanged.

## Featured magazine interview

The Featured page's magazine viewer is restricted to Rashmi Rao's interview,
pages 62-67 of Artist Talk Magazine Issue 45. Desktop shows two-page spreads;
mobile shows one page at a time. Previous/Next buttons and arrow keys stop at
the interview boundaries, and reopening starts at page 62. Pages 62-63 are
bundled locally; pages 64-67 load directly from the publisher and need an
internet connection. The opening animation uses only interview pages.

## Contact form delivery

The static contact form submits to Web3Forms. Its public access key is configured
in `contact.html`; the recipient mailbox is associated with that key in
Web3Forms, not chosen by the email links displayed on the page. The configured
route is Web3Forms to `rhytara.collections@gmail.com`, with Gmail forwarding
intended to deliver to `studio@rhytara.com`. Forwarding must be verified and
enabled in Gmail; it is not controlled by the website. The separate Shopify
theme uses Shopify's native contact form instead.

The form shows success and clears the enquiry only when Web3Forms returns an
HTTP success response with `success: true`. Failed or invalid responses retain
the entered details and display an error. Duplicate submissions are blocked
while a request is pending.

A provider success response confirms submission acceptance, not mailbox receipt.
To verify delivery, send one labelled enquiry with a unique marker and confirm
it in the recipient's inbox or spam folder, or inspect the provider's delivery
record. Do not infer delivery from a success notification alone.

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

### Journey images

The About page's journey section uses all eight uploads from `Journey RR images/`,
with web copies in `assets/images/journey/`:

| Original upload | Web image |
| --- | --- |
| `IMG_0027 (1).jpeg` | `alcohol-inks-challenge.jpg` |
| `IMG_0028.jpg` | `finding-flow.jpg` |
| `IMG_0029 (1).jpg` | `art-in-many-forms.jpg` |
| `IMG_0030.jpg` | `expanding-the-language.jpg` |
| `IMG_0031.JPG` | `natures-rhythm.jpg` |
| `IMG_0032 (1).jpg` | `blue-fabric.jpg` |
| `IMG_0033.jpeg` | `silk-scarf.jpg` |
| `IMG_0034 (1).jpg` | `coaster.jpg` |

Web copies are progressive JPEGs, resized to at most 1800 pixels on the long edge,
with metadata stripped. The larger images also have `-640.jpg` versions selected
through `srcset` for smaller screens. The originals are not modified.
The blue fabric upload is only 464 × 304 pixels; it is not enlarged beyond its
native width. A higher-resolution original would improve its sharpness.

Journey frames follow each image's intrinsic aspect ratio so artwork is not
cropped or letterboxed. Portrait milestones use narrower image columns on desktop
and stack below their copy on mobile. The closing painting and saree remain fully
visible side by side on desktop.

### Video

The hero background clip is 30 seconds and is offered in two encodings; the
browser downloads only the first one it can play:

| File | Codec | Resolution | Size |
| --- | --- | --- | --- |
| `rashmi-rao-bts.mp4` | HEVC, CRF 32 | 1920 × 1080 | 4.4 MB |
| `rashmi-rao-bts-h264.mp4` | H.264, CRF 28 | 1280 × 720 | 4.4 MB |

The HEVC file is the original and is listed first, so Safari — and Chrome,
Edge, and Firefox where hardware HEVC decode is available — get the sharper
1080p version. Everything else falls back to the H.264 file. Previously both
`<source>` tags pointed at the same HEVC file, so browsers without HEVC support
showed no video at all.

The master is a 10-bit 4:2:2 HEVC intermediate at 5.3 Mb/s — a grading format,
not a delivery one. Both files above were re-encoded from it to 8-bit 4:2:0 with
quality-targeted CRF, taking the pair from 38 MB to 8.8 MB:

```bash
# HEVC primary
ffmpeg -i master.mp4 -map 0:v:0 -map 0:a:0 \
       -c:v libx265 -crf 32 -preset slow -tag:v hvc1 -pix_fmt yuv420p \
       -c:a aac -b:a 96k -movflags +faststart rashmi-rao-bts.mp4

# H.264 720p fallback
ffmpeg -i master.mp4 -map 0:v:0 -map 0:a:0 -vf scale=1280:-2 \
       -c:v libx264 -crf 28 -preset slow -profile:v high -pix_fmt yuv420p \
       -c:a aac -b:a 96k -movflags +faststart rashmi-rao-bts-h264.mp4
```

**Both encodes must keep the audio track.** The hero video starts `muted`, but
the sound toggle in the bottom-right corner (`toggleHeroSound()`) unmutes it, so
an `-an` encode would silently break that control. The source audio was 319 kb/s
stereo AAC, which is far more than a background clip needs — 96 kb/s is
transparent here and saves about 0.8 MB.

The 10-bit master is not kept in this repository. Re-encodes should start from
the original file held outside it.
