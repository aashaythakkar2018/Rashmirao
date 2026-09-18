# Connecting the site to Shopify (headless)

The site is a static front end that reads its catalogue, prices, inventory and
cart from a **Shopify** store through the **Storefront API**. Checkout is handed
off to Shopify's hosted checkout.

Until the two values in `assets/js/shopify-config.js` are filled in, the site
runs in **offline mode**: every page shows its built-in copy and the cart is
disabled with a notice. Nothing breaks, so you can deploy at any point.

---

## 1. Create the store

1. Create the Shopify store.
2. **Settings → General → Store currency**: set to **USD** *before* importing
   products. The import generator converts the frontend's INR source values to
   USD at a fixed 84 INR per USD, and the storefront displays USD by default.
3. Optional: **Settings → Markets** to sell in other currencies. Shopify's
   checkout will price in the buyer's market currency.

## 2. Import the products

1. **Products → Import** → upload [`shopify/products.csv`](shopify/products.csv).
   Leave *"Overwrite products with matching handles"* **off** for the first run.
2. This creates 6 products with these handles (the site links to them by handle):

   | Handle | Title | Price (USD) |
   |---|---|---|
   | `echoes-of-earth` | Echoes Of Earth | 295 / 310 by width |
   | `grounding-nature` | Grounding Nature | 295 / 310 by width |
   | `magical-pansies` | Magical Pansies | 295 / 310 by width |
   | `purple-petals-reverie` | Purple Petals Reverie | 295 / 310 by width |
   | `shifting-glacier` | Shifting Glacier | 295 / 310 by width |
   | `rhytara-gift-card` | Rhytara Gift Card | 100 / 150 |

   Regenerate the CSV any time the site copy changes:
   `python3 shopify/build-products-csv.py` (see [`shopify/README.md`](shopify/README.md)).

## 3. Define the product metafields

The product page reads six metafields for the gallery-style detail. Create the
definitions once under **Settings → Custom data → Products → Add definition**,
and make sure **"Storefront access"** is enabled on each (it is by default for
new definitions):

| Namespace · key | Type | Shows up as |
|---|---|---|
| `custom.medium` | Single line text | Line under the product title |
| `custom.edition` | Single line text | Edition line |
| `custom.badge` | Single line text | Corner badge on the image |
| `custom.artist_quote` | Single line text | Italic line in "About the Work" |
| `custom.specifications` | Multi-line text | "Dimensions & Specifications" table |
| `custom.medium_care` | Multi-line text | "Medium & Care" table |

The two table metafields take one `Label: value` per line, e.g.

```
Artist: Rashmi Rao
Material: Georgette Satin
Weight: 450 g
```

The CSV import already fills these in. Leave any blank and that element is simply
not rendered.

Optional: `custom.note` (single line text) — a short caveat shown in the "Please
note" strip on the product page.

## 4. Create the collections

**Products → Collections → Create collection**, once each:

| Title | Handle | Contents |
|---|---|---|
| All Works | `all` | every buyable product (a smart collection on "Product type / Tag") — drives `collections.html` |
| Featured | `featured` | 3–6 hand-picked products — drives the homepage grid |

If `featured` is empty or missing, the homepage falls back to the first products
in `all`. The handles are configurable in `assets/js/shopify-config.js`
(`collections.all` / `collections.featured`).

## 5. Create the Storefront API access token

1. **Settings → Apps and sales channels → Develop apps → Create an app**
   (name it e.g. "Headless storefront").
2. **Configure Storefront API scopes** and enable:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_read_product_tags`
   - `unauthenticated_read_content`
   - `unauthenticated_write_checkouts`
   - `unauthenticated_read_checkouts`
3. **Install app**, then open the **API credentials** tab and copy the
   **Storefront API access token**.

This token is designed to be read by browsers — committing it to the repo for a
static host (GitHub Pages) is expected and safe. It grants only the read/checkout
scopes above.

## 6. Point the site at the store

Edit [`assets/js/shopify-config.js`](assets/js/shopify-config.js):

```js
window.SHOPIFY_CONFIG = {
   domain: 'bjmcta-mt.myshopify.com',     // Shopify API domain, not rhytara.com
  storefrontToken: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  apiVersion: '2025-04',
  collections: { all: 'all', featured: 'featured' }
};
```

Commit and deploy exactly as before (see [`README.md`](README.md)). No build step.

## What each page does once connected

| Page | Reads from Shopify |
|---|---|
| `index.html` | Homepage grid ← `featured` collection |
| `collections.html` | Full grid, filter counts, sort ← `all` collection |
| `product.html` | Product detail, images, variants, metafields ← `?handle=`; "you may also like" ← Shopify recommendations. Legacy `?id=` links auto-map to the new handles. |
| `giftcard.html` | Denomination cards ← `rhytara-gift-card` variants. Add to cart carries recipient name / email / message as line-item properties. |
| everywhere | The cart drawer, badge and "Proceed to Checkout" ← Shopify Cart API; checkout redirects to `your-store.myshopify.com/cart/c/…` |

The cart is persisted per browser (`localStorage` key `rrd_cart_id`) and survives
navigation and reloads.

## Notes / limitations

- **Custom gift-card amounts** are not possible — the Storefront API can only
  sell prices that exist as variants. Add more variants to the gift card product
  for more tiers; the custom-amount box is hidden.
- **No Content-Security-Policy** is set on these pages. If you add one, allow
  `connect-src https://your-store.myshopify.com https://open.er-api.com`.
- The currency toggle stays a **display** conversion (via `open.er-api.com`).
  Shopify's checkout charges in the market currency. For true multi-currency,
  configure **Settings → Markets** and consider removing the toggle.
