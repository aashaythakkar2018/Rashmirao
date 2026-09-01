#!/usr/bin/env python3
"""
Build a Shopify product-import CSV from the site's own catalogue data.

The source of truth is the PRODUCTS object inside product.html, plus the
gift-card denominations in giftcard.html - so this script is re-runnable
whenever the site copy changes. Output: shopify/products.csv

Usage:  python3 shopify/build-products-csv.py
"""

import csv
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "shopify", "products.csv")

VENDOR = "Rhytara"
# Shopify pulls images over HTTP at import time, so they must be public URLs.
# The repo is public, so raw.githubusercontent serves them directly.
IMAGE_BASE = "https://raw.githubusercontent.com/aashaythakkar2018/Rashmirao/main/"

# Shopify standard product taxonomy
CAT_ART = "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork"
CAT_APPAREL = "Apparel & Accessories > Clothing"

COLUMNS = [
    "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type",
    "Tags", "Published",
    "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value",
    "Option3 Name", "Option3 Value",
    "Variant SKU", "Variant Grams", "Variant Inventory Tracker",
    "Variant Inventory Qty", "Variant Inventory Policy",
    "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price",
    "Variant Requires Shipping", "Variant Taxable", "Variant Barcode",
    "Image Src", "Image Position", "Image Alt Text", "Gift Card",
    "SEO Title", "SEO Description", "Variant Weight Unit", "Status",
    # Metafields the theme reads. Column names follow Shopify's
    # "Metafield: <namespace>.<key> [<type>]" import format.
    "Metafield: custom.medium [single_line_text_field]",
    "Metafield: custom.edition [single_line_text_field]",
    "Metafield: custom.badge [single_line_text_field]",
    "Metafield: custom.artist_quote [single_line_text_field]",
    "Metafield: custom.specifications [multi_line_text_field]",
    "Metafield: custom.medium_care [multi_line_text_field]",
]


def extract_products():
    """Pull the PRODUCTS literal out of product.html and JSON-ify it via node."""
    src = os.path.join(ROOT, "product.html")
    with open(src, encoding="utf-8") as fh:
        s = fh.read()
    start = s.index("const PRODUCTS = {")
    open_brace = s.index("{", start)
    depth, i = 0, open_brace
    while i < len(s):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                i += 1
                break
        i += 1
    literal = s[open_brace:i]
    node = subprocess.run(
        ["node", "-e", "process.stdout.write(JSON.stringify(eval('('+require('fs')"
                       ".readFileSync(0,'utf8')+')')))"],
        input=literal, capture_output=True, text=True, check=True,
    )
    return json.loads(node.stdout)


def gift_card_denominations():
    """Read the denomination cards out of giftcard.html: [(inr, usd, title)]."""
    src = os.path.join(ROOT, "giftcard.html")
    with open(src, encoding="utf-8") as fh:
        s = fh.read()
    out = []
    # A card block runs to its own first </div>; the spans inside close with
    # </span>, so a non-greedy stop at </div> keeps each card separate.
    for m in re.finditer(r'selectDenomCard\(this,\s*(\d+),\s*(\d+)\)(.*?)</div>',
                         s, re.S):
        inr, usd, block = int(m.group(1)), int(m.group(2)), m.group(3)
        t = re.search(r'class="denom-title">(.*?)</span>', block, re.S)
        out.append((inr, usd, html.unescape(t.group(1)).strip() if t else f"Rs {inr}"))
    return out


def handle_for(title):
    h = title.lower().strip()
    h = re.sub(r"[^a-z0-9]+", "-", h).strip("-")
    return h


def sku_for(title, year):
    initials = "".join(w[0] for w in re.findall(r"[A-Za-z]+", title))[:3].upper()
    return f"RHY-{initials}-{year}"


def grams_from(specs):
    """'Approx. 0.8 kg' or '450 g' -> grams; returns '' when unspecified."""
    for key, val in specs.items():
        if "weight" in key.lower():
            m = re.search(r"([\d.]+)\s*kg", val, re.I)
            if m:
                return str(int(round(float(m.group(1)) * 1000)))
            m = re.search(r"(\d+)\s*g", val, re.I)
            if m:
                return m.group(1)
    return ""


def qty_from(specs, sold):
    """Originals are 1 of 1. Editions state '3 of 8, 5 remaining'."""
    if sold:
        return "0"
    edition = specs.get("Edition", "")
    m = re.search(r"(\d+)\s*remaining", edition, re.I)
    if m:
        return m.group(1)
    return "1"


def image_url(src):
    return IMAGE_BASE + src.split("?")[0]


def body_html(p):
    """Description only. Specs live in metafields; the theme renders them as
    accordion tables, so repeating them here would show them twice."""
    parts = [
        f"<p><em>{html.escape(p['medium'])}</em></p>",
        f"<p>{html.escape(p['description'])}</p>",
    ]
    return "".join(parts)


def spec_lines(d):
    """Shopify multi-line text metafield: one 'Label: value' line per spec."""
    return "\n".join(f"{k}: {v}" for k, v in d.items())


def tags_for(p, key):
    year = p["specs"].get("Year", "2024")
    medium = p["mediumSpecs"].get("Medium", p["category"].split("·")[0].strip())
    tags = [VENDOR, medium.split(":")[0].strip(), f"Year {year}"]
    if "Wearable" in p["category"]:
        tags += ["Wearable Art", "Limited Edition", "Saree"]
    else:
        tags += ["Original Work", "One of One", "Painting"]
    if p.get("sold"):
        tags.append("Sold")
    return ", ".join(dict.fromkeys(tags))


def blank_row():
    return {c: "" for c in COLUMNS}


def main():
    products = extract_products()
    rows = []

    for key, p in products.items():
        title = p["title"]
        handle = handle_for(title)
        year = p["specs"].get("Year", "2024")
        wearable = "Wearable" in p["category"]
        sold = bool(p.get("sold"))
        images = [image_url(i["src"]) for i in p["images"]]
        alts = [i.get("alt", title) for i in p["images"]]

        # Wearable art is sold by fabric width (the site's Print Size option);
        # originals are one-of-one, so they take Shopify's default variant.
        if wearable:
            variants = [("Width", "44 inch"), ("Width", "58 inch")]
        else:
            variants = [("Title", "Default Title")]

        for vi, (opt_name, opt_val) in enumerate(variants):
            r = blank_row()
            r["Handle"] = handle
            if vi == 0:
                r["Title"] = title
                r["Body (HTML)"] = body_html(p)
                r["Vendor"] = VENDOR
                r["Product Category"] = CAT_APPAREL if wearable else CAT_ART
                r["Type"] = "Wearable Art" if wearable else "Original Painting"
                r["Tags"] = tags_for(p, key)
                r["Published"] = "TRUE"
                r["SEO Title"] = f"{title} - {VENDOR}"
                r["SEO Description"] = p["description"][:320]
                r["Status"] = "active"
                r["Metafield: custom.medium [single_line_text_field]"] = p["medium"]
                r["Metafield: custom.edition [single_line_text_field]"] = p["edition"]
                r["Metafield: custom.badge [single_line_text_field]"] = p.get("badge", "")
                r["Metafield: custom.artist_quote [single_line_text_field]"] = p.get("quote", "")
                r["Metafield: custom.specifications [multi_line_text_field]"] = spec_lines(p["specs"])
                r["Metafield: custom.medium_care [multi_line_text_field]"] = spec_lines(p["mediumSpecs"])
            r["Option1 Name"] = opt_name
            r["Option1 Value"] = opt_val
            sku = sku_for(title, year)
            r["Variant SKU"] = f"{sku}-{opt_val.split()[0]}" if wearable else sku
            r["Variant Grams"] = grams_from(p["specs"])
            r["Variant Weight Unit"] = "kg"
            r["Variant Inventory Tracker"] = "shopify"
            r["Variant Inventory Qty"] = qty_from(p["specs"], sold)
            r["Variant Inventory Policy"] = "deny"
            r["Variant Fulfillment Service"] = "manual"
            r["Variant Price"] = str(p["priceInr"])
            r["Variant Requires Shipping"] = "TRUE"
            r["Variant Taxable"] = "TRUE"
            r["Gift Card"] = "FALSE"
            if vi == 0 and images:
                r["Image Src"] = images[0]
                r["Image Position"] = "1"
                r["Image Alt Text"] = alts[0]
            rows.append(r)

        # Remaining gallery images: image-only rows sharing the handle.
        for n, (src, alt) in enumerate(zip(images[1:], alts[1:]), start=2):
            r = blank_row()
            r["Handle"] = handle
            r["Image Src"] = src
            r["Image Position"] = str(n)
            r["Image Alt Text"] = alt
            rows.append(r)

    # ---- Gift card -------------------------------------------------------
    denoms = gift_card_denominations()
    if denoms:
        gc_handle = "rhytara-gift-card"
        for vi, (inr, usd, name) in enumerate(denoms):
            r = blank_row()
            r["Handle"] = gc_handle
            if vi == 0:
                r["Title"] = "Rhytara Gift Card"
                r["Body (HTML)"] = (
                    "<p>A Rhytara gift card, delivered by email with a unique "
                    "code. Redeemable against any original work, wearable piece "
                    "or limited edition in the studio shop.</p>"
                    "<p>No expiry. The balance carries over across orders.</p>"
                )
                r["Vendor"] = VENDOR
                r["Type"] = "Gift Card"
                r["Tags"] = "Gift Card, Rhytara"
                r["Published"] = "TRUE"
                r["SEO Title"] = "Rhytara Gift Card"
                r["SEO Description"] = (
                    "Give the gift of original art. Redeemable against any work "
                    "in the Rhytara studio shop."
                )
                r["Status"] = "active"
            r["Option1 Name"] = "Denomination"
            r["Option1 Value"] = f"Rs {inr:,} - {name}"
            r["Variant SKU"] = f"RHY-GC-{inr}"
            r["Variant Inventory Tracker"] = ""
            r["Variant Inventory Policy"] = "continue"
            r["Variant Fulfillment Service"] = "manual"
            r["Variant Price"] = str(inr)
            r["Variant Requires Shipping"] = "FALSE"
            r["Variant Taxable"] = "FALSE"
            r["Gift Card"] = "TRUE"
            rows.append(r)

    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    handles = len({r["Handle"] for r in rows})
    print(f"Wrote {OUT}")
    print(f"  {handles} products, {len(rows)} rows")


if __name__ == "__main__":
    sys.exit(main())
