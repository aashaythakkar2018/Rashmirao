/**
 * currency.js - Rashmi Rao Designs
 * Shared INR ↔ USD toggle with live exchange rate.
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
  var CURR_KEY     = 'rrd_currency';       // 'INR' or 'USD'
  var CACHE_MS     = 3600000;             // 1 hour
  var FALLBACK     = 84;                  // ₹84 = $1 (used if API unavailable)

  /* -- State --------------------- */
  var inrPerUsd = FALLBACK;
  var current   = localStorage.getItem(CURR_KEY) || 'INR';

  /* -- Formatting ---------------- */
  function fmt(inrAmt) {
    if (current === 'USD') {
      var usd = Math.round(inrAmt / inrPerUsd);
      return '$ ' + usd.toLocaleString('en-US');
    }
    return '₹ ' + parseInt(inrAmt, 10).toLocaleString('en-IN');
  }

  /* -- DOM update ---------------- */
  function refreshAllPrices() {
    document.querySelectorAll('[data-price-inr]').forEach(function (el) {
      var inr  = parseInt(el.dataset.priceInr, 10);
      var sold = el.dataset.sold === 'true';
      el.textContent = sold ? fmt(inr) + ' (Sold)' : fmt(inr);
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
      if (current === 'USD') refreshAllPrices();
      return;
    }

    // Fetch from open.er-api.com - free, CORS-enabled, updated daily
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
          // Refresh displayed prices with accurate rate
          if (current === 'USD') refreshAllPrices();
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

  /**
   * Call once after DOM ready (e.g. at the bottom of each page's <script>).
   * Syncs the toggle UI, applies saved currency, and kicks off the live rate fetch.
   */
  window.initCurrency = function () {
    syncToggleUI();
    if (current === 'USD') refreshAllPrices(); // apply saved preference immediately
    fetchLiveRate();                           // update rate async (refreshes again if USD)
  };

}());
