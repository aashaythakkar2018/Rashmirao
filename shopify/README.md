# Shopify product import

`products.csv` is a Shopify-format product import built from the site's own
catalogue copy. Regenerate it any time the site content changes:

```bash
python3 shopify/build-products-csv.py
```

The generator reads the `PRODUCTS` object in `product.html` and the
denomination cards in `giftcard.html`, so the CSV never drifts from the
live copy. Requires `node` (used only to parse the JS object literal).

## What's in it

6 products / 26 rows:

| Handle | Title | Price (INR) | Inventory |
|---|---|---|---|
| `echoes-of-earth` | Echoes Of Earth | 85,000 | 1 |
| `grounding-nature` | Grounding Nature | 65,000 | 1 |
| `magical-pansies` | Magical Pansies | 72,000 | 0 (sold) |
| `purple-petal` | Purple Petal | 92,000 | 1 |
| `shifting-glacier` | Shifting Glacier | 18,500 | 5 (edition 3 of 8) |
| `rhytara-gift-card` | Rhytara Gift Card | 10,000 / 50,000 | untracked |

Images are pulled from `raw.githubusercontent.com` at import time — all 23
URLs were verified reachable. They only stay reachable while the repo is
public; if it goes private, re-point `IMAGE_BASE` in the generator or upload
the files to Shopify's CDN first.

## Importing

Shopify admin → Products → Import → upload `products.csv`. Leave
"Overwrite products with matching handles" **off** for the first run.

## Before you import — decisions baked in

These were inferred from the site. Check them against what you actually want:

1. **Prices are INR.** The CSV carries the `data-price-inr` values verbatim.
   The store's currency must be set to INR before importing, or every price
   will be read as USD. The site's USD toggle is a live FX conversion, so
   there are no fixed USD prices to import.
2. **Sold work is published with 0 inventory.** `magical-pansies` imports as
   active and sold-out rather than hidden, matching how the site still shows
   it. Set `Status` to `draft` if it should come off the storefront.
3. **The saree has two width variants** (44 inch / 58 inch) at the same
   price, from the Print Size pills on the product page. The originals are
   one-of-one and use Shopify's default single variant. If the widths should
   be priced differently, edit the two `shifting-glacier` rows.
4. **Two weights are missing.** `magical-pansies` and `shifting-glacier`
   state no weight on the site, so `Variant Grams` is blank — weight-based
   shipping rates will misprice them until filled in.
5. **Collections are not created by this import.** Shopify's product CSV has
   no collection column. Every product is tagged (medium, year, `Original
   Work`, `Wearable Art`, `Limited Edition`), so build automated collections
   on those tags after importing.
6. **The gift card rows use `Gift Card = TRUE`.** Some stores reject gift
   cards on CSV import; if it errors, create the product in admin and set the
   two denominations as variants manually.

## Known content mismatch (site-side, not fixed here)

The `PRODUCTS` keys are still the pre-rename ids — `monsoon-dream`,
`crimson-solitude`, `whispers-of-ochre`, `the-blue-hour`, `monsoon-saree` —
while the titles are the current collection names. Some descriptions were
never rewritten to match: "Grounding Nature" is described as *"deep crimson
layered with raw umber"*, and "Shifting Glacier" as *"the Echoes Of Earth
painting, adapted for georgette"*. That stale copy is carried into
`Body (HTML)` as-is. Fix it in `product.html` and re-run the generator.

The CSV uses title-based handles, so Shopify URLs will not match the site's
existing `product.html?id=...` links.
