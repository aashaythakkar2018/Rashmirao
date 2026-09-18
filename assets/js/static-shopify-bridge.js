/* Connect the existing static catalogue UI to the Shopify Storefront cart. */
(function () {
  'use strict';

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
  }

  function findVariant(product, optionValue) {
    var variants = product && product.variants ? product.variants : [];
    return variants.find(function (variant) {
      return (variant.selectedOptions || []).some(function (option) {
        return option.value === optionValue;
      });
    }) || variants[0];
  }

  function addProduct(handle, title, optionValue) {
    if (!window.Store || !window.Cart || !window.Store.isConfigured()) {
      window.showToast && window.showToast('Shopify checkout is unavailable.');
      return Promise.reject(new Error('Shopify Storefront API is not configured'));
    }

    return window.Store.getProduct(handle).then(function (product) {
      if (!product) throw new Error('Product not found in Shopify: ' + handle);
      var variant = findVariant(product, optionValue || '44 inch');
      if (!variant || !variant.id) throw new Error('No purchasable variant found for ' + title);
      return window.Cart.add(variant.id, 1).then(function () {
        if (window.showToast) window.showToast(title + ' added to cart');
        window.openCart();
      });
    }).catch(function (error) {
      console.error('[Shopify] Add to cart failed', error);
      if (window.showToast) window.showToast('Could not add this product.');
    });
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
    var handle = ID_TO_HANDLE[params.get('id') || 'monsoon-dream'] || params.get('handle');
    var sizeButton = document.querySelector('.option-pill.active');
    var optionValue = sizeButton && sizeButton.textContent.indexOf('58 inch') !== -1 ? '58 inch' : '44 inch';
    var title = document.getElementById('pi-title');
    return addProduct(handle, title ? title.textContent : 'Product', optionValue);
  };

  ready();
}());
