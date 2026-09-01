# Rhytara — Shopify theme

An Online Store 2.0 theme converted from the static site. The design is the
same; what changed is where the content comes from.

## Upload

Shopify admin → Online Store → Themes → Add theme → Upload zip file, and pick
`rhytara-theme.zip` (rebuild it with `./build-theme-zip.sh`). Upload it as an
unpublished theme first and preview before publishing.

## Adding products later — you do not touch the theme

This is the part that changes day to day. Products live in Shopify's database,
not in theme files, so:

**Products → Add product** in admin. Fill in title, description, price, images,
inventory. Assign it to a collection. Publish. It appears on the collection
page, in the homepage grid, and in search — no theme edit, no re-upload.

The theme reads six optional metafields for the gallery-style detail. Define
them once under **Settings → Custom data → Products**, then they appear as
fields on every product form:

| Namespace and key | Type | Shows up as |
|---|---|---|
| `custom.medium` | Single line text | Line under the product title |
| `custom.edition` | Single line text | Edition badge |
| `custom.badge` | Single line text | Corner badge on the image |
| `custom.artist_quote` | Single line text | Italic line in "About the Work" |
| `custom.specifications` | Multi-line text | "Dimensions & Specifications" table |
| `custom.medium_care` | Multi-line text | "Medium & Care" table |

The two table metafields take one `Label: value` per line:

```
Dimensions: 36 × 48 inches (91 × 122 cm)
Year: 2024
Edition: Original · 1 of 1
```

Leave any of them blank and that element is simply not rendered — a product
with only a title, price, image and description still looks right.

## What you edit where

| Change | Where |
|---|---|
| Add / edit / price / stock a product | Admin → Products |
| Group works into collections | Admin → Products → Collections |
| Nav and footer links | Admin → Navigation |
| Homepage sections, order, headings, hero video | Theme editor (Customize) |
| Announcement bar text | Theme editor → Header group |
| Colours | Theme editor → Theme settings → Colours |
| Layout, spacing, new section types | Theme files (here) |

## Structure

```
assets/theme.css      design tokens, chrome, collection grid, product page
assets/theme.js       nav, announcement, and the AJAX cart
layout/theme.liquid   the shell every page renders inside
sections/             header, footer, hero, and the main-* page bodies
snippets/             product-card, cart-drawer, spec-table, icons
templates/            which sections each page type uses
config/               theme settings schema
locales/              UI strings
```

## What changed from the static site

- **The cart is real.** The static site kept `let cart = []` in page scope, so
  it emptied on every navigation, and "Proceed to Checkout" linked to the
  contact page. It now reads `cart.items`, persists, and submits to Shopify
  checkout.
- **Product options only render when the product has them.** The static
  product page showed a "Print Size" choice (44 / 58 inch width) on every
  product, including one-of-one paintings that have no such option.
- **The currency toggle is Shopify's**, not a live FX display. Checkout always
  charges in the market's currency, so a display-only toggle would have shown
  one number and charged another. Configure real currencies under
  Settings → Markets.
- **Filter tabs and counts are derived** from the product types actually
  present in a collection, rather than hardcoded to five works.
- **Prices, badges and "sold" states come from inventory**, so a sold original
  cannot be bought twice.

## Not carried over

- The hero's `toggleHeroSound()` mute button. Shopify's `video_tag` renders its
  own element; re-add it as a section setting if you want it back.
- GSAP scroll animations. The `.rv` classes and CSS are still in place, so
  re-adding the GSAP script in `theme.liquid` will light them up again.
- `about.html`, `contact.html` and `giftcard.html` page bodies. They are
  content pages now: create them under Admin → Pages and paste the copy in, or
  ask for dedicated section templates if you want their bespoke layouts back.
