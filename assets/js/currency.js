/**
 * currency.js - Rashmi Rao Designs
 * Shared USD ↔ INR toggle with live exchange rate.
 *
 * Rate source: open.er-api.com (free, no API key required)
 * Falls back to ₹84/$ if the network request fails.
 * Rate is cached in localStorage for 1 hour to avoid hammering the API.
 *
 * Usage on each page:
 *   1. Include this script before your page's <script> block.
 *   2. Tag every price element: <span data-price-inr="85000">₹ 85,000</span>
 *      For sold items add data-sold="true".
 *   3. Call initCurrency() after the DOM is ready.
 *   4. Wire the toggle button onclick="toggleCurrency()".
 *   5. In renderCart(), use formatPrice(item.priceInr) for all price display.
 */

(function () {
  'use strict';

  /* -- Constants ---------------- */
  var RATE_KEY     = 'rrd_inr_per_usd';   // cached rate (INR per 1 USD)
  var TIME_KEY     = 'rrd_rate_ts';        // cache timestamp
  var CURR_KEY     = 'rrd_currency_v2';    // 'INR' or 'USD'; USD is the new default
  var CACHE_MS     = 3600000;             // 1 hour
  var FALLBACK     = 84;                  // ₹84 = $1 (used if API unavailable)

  /* -- State --------------------- */
  var inrPerUsd = FALLBACK;
  var current   = localStorage.getItem(CURR_KEY) || 'USD';

  /* -- Formatting ----------------
     USD is the primary, stable price: it never moves with the exchange
     rate. INR is a live-converted display of that fixed USD price, so it
     tracks the real rate whenever someone toggles to it. */
  function fmt(inrAmt) {
    var usd = Math.round(inrAmt / FALLBACK);
    if (current === 'USD') {
      return '$ ' + usd.toLocaleString('en-US');
    }
    var inr = Math.round(usd * inrPerUsd);
    return '₹ ' + inr.toLocaleString('en-IN');
  }

  /* -- Launch offer ----------------
     15% off for the first month. Display-only: the matching discount must
     also exist in Shopify (automatic discount) so checkout charges the same.
     After OFFER_END the site reverts to plain prices on its own. */
  var OFFER_PCT = 15;
  var OFFER_END = new Date('2026-10-21T23:59:59+05:30');

  function offerActive() { return Date.now() <= OFFER_END.getTime(); }

  function money(amount, cur) {
    if (cur === 'USD') {
      return '$ ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '₹ ' + Math.round(amount).toLocaleString('en-IN');
  }

  /* Discounted price string, computed from the fixed USD price. */
  function fmtOffer(inrAmt) {
    var usd = Math.round(inrAmt / FALLBACK) * (100 - OFFER_PCT) / 100;
    return current === 'USD' ? money(usd, 'USD') : money(usd * inrPerUsd, 'INR');
  }

  /* HTML: struck-through original + real (discounted) amount. */
  function fmtOfferHtml(inrAmt) {
    if (!offerActive()) return fmt(inrAmt);
    return '<s class="price-was">' + fmt(inrAmt) + '</s> <span class="price-now">' + fmtOffer(inrAmt) + '</span>';
  }

  /* -- DOM update ---------------- */
  function refreshAllPrices() {
    document.querySelectorAll('[data-price-inr]').forEach(function (el) {
      var inr  = parseInt(el.dataset.priceInr, 10);
      var sold = el.dataset.sold === 'true';
      if (sold) { el.textContent = fmt(inr) + ' (Sold)'; return; }
      if (el.hasAttribute('data-no-offer')) { el.textContent = fmt(inr); return; }
      el.innerHTML = fmtOfferHtml(inr);
    });
    // Re-render cart if the page has one
    if (typeof window.renderCart === 'function') {
      window.renderCart();
    }
  }

  /* -- Toggle UI ----------------- */
  function syncToggleUI() {
    var track = document.getElementById('currencyTrack');
    var lInr  = document.getElementById('currLabelINR');
    var lUsd  = document.getElementById('currLabelUSD');
    if (!track) return;
    var isUSD = (current === 'USD');
    track.classList.toggle('usd', isUSD);
    track.setAttribute('aria-checked', String(isUSD));
    if (lInr) lInr.classList.toggle('active', !isUSD);
    if (lUsd) lUsd.classList.toggle('active',  isUSD);
  }

  /* -- Live rate fetch ----------- */
  function fetchLiveRate() {
    var cached    = localStorage.getItem(RATE_KEY);
    var cacheTime = parseInt(localStorage.getItem(TIME_KEY) || '0', 10);

    // Use cached rate if it's fresh
    if (cached && (Date.now() - cacheTime) < CACHE_MS) {
      inrPerUsd = parseFloat(cached);
      if (current === 'INR') refreshAllPrices();
      return;
    }

    // Fetch from open.er-api.com - free, CORS-enabled, updated daily.
    // Runs on every page load (not just when INR is active) so the rate is
    // already warm and instant the moment someone toggles to INR.
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data && data.rates && data.rates.INR) {
          inrPerUsd = data.rates.INR;
          localStorage.setItem(RATE_KEY, inrPerUsd);
          localStorage.setItem(TIME_KEY, Date.now());
          // Refresh displayed prices with the live rate
          if (current === 'INR') refreshAllPrices();
        }
      })
      .catch(function (err) {
        console.warn('[RRD] Exchange rate fetch failed - using fallback ₹' + FALLBACK + '/$1', err);
        // Keep the fallback; nothing else to do
      });
  }

  /* -- Public API ---------------- */

  /** Toggle between INR and USD. Wire to onclick="toggleCurrency()" */
  window.toggleCurrency = function () {
    current = (current === 'INR') ? 'USD' : 'INR';
    localStorage.setItem(CURR_KEY, current);
    syncToggleUI();
    refreshAllPrices();
  };

  /**
   * Format an INR amount in the currently active currency.
   * Use this inside renderCart() for prices and totals.
   */
  window.formatPrice = function (inrAmt) {
    return fmt(inrAmt);
  };

  /** HTML with the original struck through and the offer price beside it. */
  window.formatOfferPriceHtml = fmtOfferHtml;
  window.offerActive = offerActive;
  window.OFFER_PCT = OFFER_PCT;

  /**
   * Exposed so a page that overrides window.toggleCurrency/initCurrency
   * (e.g. giftcard.html, which needs its own price logic for the fixed
   * $100/$150 denominations) can still keep the toggle switch's visual
   * state - thumb position, which label is bold - in sync with the real
   * currency, instead of reimplementing this.
   */
  window.syncCurrencyToggleUI = syncToggleUI;

  /**
   * The fixed rate used to encode a stable USD price as the "inrAmt"
   * this module's functions take (inrAmt / FALLBACK = the real USD price -
   * see fmt() above). Exposed so a page with its own fixed USD prices (e.g.
   * giftcard.html's $100/$150) can pass formatPrice(usd * this) and get a
   * correctly live-rate-converted INR amount back, instead of duplicating
   * this constant or - worse - passing a stale, independently-set INR
   * number that drifts from the real exchange rate.
   */
  window.CURRENCY_USD_ENCODING_RATE = FALLBACK;

  /**
   * Call once after DOM ready (e.g. at the bottom of each page's <script>).
   * Syncs the toggle UI, applies saved currency, and kicks off the live rate fetch.
   */
  window.initCurrency = function () {
    syncToggleUI();
    refreshAllPrices(); // apply saved preference immediately (fallback rate if INR and not yet live)
    fetchLiveRate();    // update rate async (refreshes again once the live rate lands, if INR)
  };

}());
