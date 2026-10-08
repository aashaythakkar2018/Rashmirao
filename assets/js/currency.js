/**
 * Shared USD pricing for the static storefront.
 * Catalogue amounts retain their legacy INR encoding (84 units per USD).
 * Tag price elements with data-price-inr, then call initCurrency().
 */
(function () {
  'use strict';

  var USD_ENCODING_RATE = 84;
  var OFFER_PCT = 15;
  var OFFER_END = new Date('2026-10-21T23:59:59+05:30');

  function fmt(inrAmt) {
    return '$ ' + Math.round(inrAmt / USD_ENCODING_RATE).toLocaleString('en-US');
  }

  function money(usdAmt) {
    return '$ ' + usdAmt.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function offerActive() { return Date.now() <= OFFER_END.getTime(); }

  function fmtOfferHtml(inrAmt) {
    if (!offerActive()) return fmt(inrAmt);
    var usd = Math.round(inrAmt / USD_ENCODING_RATE) * (100 - OFFER_PCT) / 100;
    return '<s class="price-was">' + fmt(inrAmt) + '</s> <span class="price-now">' + money(usd) + '</span>';
  }

  function refreshAllPrices() {
    document.querySelectorAll('[data-price-inr]').forEach(function (el) {
      var inr = parseInt(el.dataset.priceInr, 10);
      if (el.dataset.sold === 'true') { el.textContent = fmt(inr) + ' (Sold)'; return; }
      if (el.hasAttribute('data-no-offer')) { el.textContent = fmt(inr); return; }
      el.innerHTML = fmtOfferHtml(inr);
    });
    if (typeof window.renderCart === 'function') {
      window.renderCart();
    }
  }

  window.formatPrice = fmt;
  window.formatOfferPriceHtml = fmtOfferHtml;
  window.formatUsdExact = money;
  window.offerActive = offerActive;
  window.OFFER_PCT = OFFER_PCT;
  window.CURRENCY_USD_ENCODING_RATE = USD_ENCODING_RATE;
  window.initCurrency = refreshAllPrices;
}());
