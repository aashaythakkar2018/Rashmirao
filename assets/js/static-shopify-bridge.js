/* Connect the existing static catalogue UI to the Shopify Storefront cart. */
(function () {
  'use strict';

  /* Legacy id -> Shopify handle map, kept only for the 5 original listings
     that predate the data-handle attribute below. A new listing should use
     data-handle="its-shopify-handle" on its .art-card (grid pages) or set
     `handle` in its PRODUCTS entry (product.html) instead of adding a line
     here - that's the whole point of data-handle: new listings need zero
     JS changes to get working availability checks, sold-out state, and a
     live countdown. */
  var ID_TO_HANDLE = {
    'monsoon-dream': 'echoes-of-earth',
    'crimson-solitude': 'grounding-nature',
    'whispers-of-ochre': 'magical-pansies',
    'the-blue-hour': 'purple-petals-reverie',
    'monsoon-saree': 'shifting-glacier'
  };

  function ready() {
    if (!window.Store || !window.Cart || !window.Store.isConfigured()) return;
    window.Cart.init();
    hydrateCardAvailability();
  }

  function findVariant(product, optionValue) {
    var variants = product && product.variants ? product.variants : [];
    return variants.find(function (variant) {
      return (variant.selectedOptions || []).some(function (option) {
        return option.value === optionValue;
      });
    }) || variants[0];
  }

  /**
   * Adds a variant to the cart, but only after checking Shopify's own,
   * up-to-the-second availableForSale for THAT exact variant - not just
   * the product overall (a product can show "in stock" because its 58
   * inch is available while the 44 inch someone actually wants is sold
   * out). This is what a customer used to be able to add to their cart
   * and only discover was unavailable at Shopify's final checkout step.
   * Checking here means they find out immediately, before checkout, for
   * every listing - current and future - since it always re-fetches
   * live data rather than trusting anything cached on the page.
   */
  function addProduct(handle, title, optionValue) {
    if (!window.Store || !window.Cart || !window.Store.isConfigured()) {
      window.showToast && window.showToast('Shopify checkout is unavailable.');
      return Promise.reject(new Error('Shopify Storefront API is not configured'));
    }

    return window.Store.getProduct(handle).then(function (product) {
      if (!product) throw new Error('Product not found in Shopify: ' + handle);
      var variant = findVariant(product, optionValue || '44 inch');
      if (!variant || !variant.id) throw new Error('No purchasable variant found for ' + title);
      if (variant.availableForSale === false) {
        var label = optionValue || variant.title || '';
        if (window.showToast) {
          window.showToast(title + (label ? ' (' + label + ')' : '') + ' just sold out - sorry!');
        }
        markVariantSoldOut(handle, optionValue);
        var err = new Error('Variant sold out: ' + handle + ' / ' + label);
        err.soldOut = true;
        throw err;
      }
      return window.Cart.add(variant.id, 1).then(function () {
        if (window.showToast) window.showToast(title + ' added to cart');
        window.openCart();
      });
    }).catch(function (error) {
      if (!error || !error.soldOut) {
        console.error('[Shopify] Add to cart failed', error);
        if (window.showToast && !(error && error.soldOut)) {
          window.showToast('Could not add this product.');
        }
      }
    });
  }

  /** Reflects a just-discovered sold-out variant in the grid card's UI, if that card is on this page. */
  function markVariantSoldOut(handle, optionValue) {
    document.querySelectorAll('.art-card[data-handle="' + handle + '"]').forEach(function (card) {
      if (optionValue && optionValue !== '44 inch') return; // cards only ever offer the default (44 inch) size
      setCardSoldOut(card);
    });
  }

  function setCardSoldOut(card) {
    card.classList.add('is-sold-out');
    var badge = card.querySelector('.art-badge');
    if (badge) badge.textContent = 'Sold Out';
    var buyBtn = card.querySelector('.reveal-btn-add');
    if (buyBtn) {
      buyBtn.textContent = 'Sold Out';
      buyBtn.disabled = true;
      buyBtn.classList.add('is-disabled');
    }
  }

  window.addToCart = function (name) {
    if (!name) return window.addCurrentProductToCart();
    var products = window.Store.getProducts ? window.Store.getProducts({ first: 50 }) : Promise.resolve([]);
    return products.then(function (items) {
      var product = items.find(function (item) { return item.title === name; });
      if (!product) throw new Error('Product not found in Shopify: ' + name);
      return addProduct(product.handle, name, '44 inch');
    });
  };

  window.addCurrentProductToCart = function () {
    var params = new URLSearchParams(window.location.search);
    var pid = params.get('id') || 'monsoon-dream';
    // Prefer the handle product.html's own script already resolved (from
    // its PRODUCTS[pid].handle) - falls back to the legacy map/URL param
    // so this still works if that global isn't set for some reason.
    var handle = window.CURRENT_PRODUCT_HANDLE || ID_TO_HANDLE[pid] || params.get('handle');
    var sizeButton = document.querySelector('.option-pill.active');
    var optionValue = sizeButton && sizeButton.textContent.indexOf('58 inch') !== -1 ? '58 inch' : '44 inch';
    var title = document.getElementById('pi-title');
    return addProduct(handle, title ? title.textContent : 'Product', optionValue);
  };

  /**
   * Grid-card live hydration (shop.html, collections.html, and any future
   * page using the same .art-card markup): for every card with a
   * data-handle, fetches its real Shopify availability and remaining
   * count and updates the "Limited Edition · 250 Worldwide" badge to a
   * live "X of 250 remaining" (or "Sold Out"), non-destructively - if
   * live data can't be fetched (offline, scope not yet granted, etc.) the
   * badge is simply left exactly as it was written in the page.
   */
  function hydrateCardAvailability() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.art-card[data-handle], .art-card[data-id]'));
    if (!cards.length) return;

    var byHandle = {};
    cards.forEach(function (card) {
      var handle = card.dataset.handle || ID_TO_HANDLE[card.dataset.id];
      if (!handle) return;
      card.dataset.handle = handle; // backfill so later lookups (e.g. markVariantSoldOut) don't need the id map
      (byHandle[handle] = byHandle[handle] || []).push(card);
    });

    var handles = Object.keys(byHandle);
    if (!handles.length) return;

    Promise.all(handles.map(function (handle) {
      return window.Store.getProduct(handle).then(function (product) {
        return { handle: handle, product: product };
      });
    })).then(function (results) {
      var variantIds = [];
      results.forEach(function (r) {
        var v = r.product && findVariant(r.product, '44 inch');
        if (v && v.id) variantIds.push(v.id);
      });
      return window.Store.getVariantQuantities(variantIds).then(function (quantities) {
        results.forEach(function (r) {
          applyCardAvailability(byHandle[r.handle], r.product, quantities);
        });
      });
    }).catch(function (e) {
      console.warn('[Shopify] Card availability hydration failed - leaving static badges as-is', e);
    });
  }

  function applyCardAvailability(cards, product, quantities) {
    if (!product) return;
    var variant = findVariant(product, '44 inch');
    cards.forEach(function (card) {
      if (variant && variant.availableForSale === false) {
        setCardSoldOut(card);
        return;
      }
      var qty = variant && variant.id ? quantities[variant.id] : undefined;
      if (typeof qty !== 'number') return; // scope not granted yet / unknown - leave the static badge text alone
      var badge = card.querySelector('.art-badge');
      if (badge) {
        // The "250" denominator is the fixed edition size (from this
        // card's own existing copy, e.g. "Limited Edition · 250
        // Worldwide") - only the live remaining count (the numerator)
        // comes from Shopify.
        var m = /(\d[\d,]*)/.exec(badge.textContent);
        var total = m ? m[1] : '250';
        badge.textContent = qty > 0
          ? qty + ' of ' + total + ' Remaining'
          : 'Sold Out';
        badge.classList.toggle('badge-low-stock', qty > 0 && qty <= 10);
      }
      if (qty <= 0) setCardSoldOut(card);
    });
  }

  window.hydrateCardAvailability = hydrateCardAvailability;

  ready();
}());
