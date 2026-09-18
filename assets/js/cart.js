/**
 * cart.js - Rashmi Rao Designs / Rhytara
 * --------------------------------------------------------------------------
 * A real, persistent cart backed by the Shopify Cart API. Replaces the
 * per-page `let cart = []` that emptied on every navigation.
 *
 *   Cart.init()                      rehydrate from localStorage (called once)
 *   Cart.add(variantId, qty, attrs)  add a line (creates the cart on first add)
 *   Cart.setQuantity(lineId, qty)    change a line's quantity (0 removes it)
 *   Cart.remove(lineId)              remove a line
 *   Cart.get()                       current normalised cart (sync)
 *   Cart.checkout()                  hand off to Shopify's hosted checkout
 *
 * Fires a `cart:change` event on `document` after every mutation; the drawer
 * listens for it. Shopify checkout prices are USD; the existing display layer
 * keeps INR as its internal conversion base.
 * --------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var LS_KEY = 'rrd_cart_id';
  var Store = window.Store || { isConfigured: function () { return false; } };

  var EMPTY = { id: null, checkoutUrl: null, totalQuantity: 0, subtotalInr: 0, lines: [] };
  var state = EMPTY;
  var ready = false;

  /* -- GraphQL ------------------------------------------------------------ */
  var CART_FIELDS = [
    'id',
    'checkoutUrl',
    'totalQuantity',
    'cost { subtotalAmount { amount currencyCode } }',
    'lines(first: 100) { nodes {',
    '  id quantity',
    '  cost { totalAmount { amount currencyCode } }',
    '  attributes { key value }',
    '  merchandise { ... on ProductVariant {',
    '    id title',
    '    image { url altText }',
    '    price { amount currencyCode }',
    '    selectedOptions { name value }',
    '    product { title handle featuredImage { url altText } }',
    '  } }',
    '} }'
  ].join(' ');

  function money(node) {
    if (!node || node.amount == null) return 0;
    return Math.round(parseFloat(node.amount) * (node.currencyCode === 'USD' ? 84 : 1));
  }

  function normalise(cart) {
    if (!cart) return EMPTY;
    var lines = (cart.lines && cart.lines.nodes ? cart.lines.nodes : []).map(function (l) {
      var m = l.merchandise || {};
      var prod = m.product || {};
      var img = (m.image && m.image.url) ||
        (prod.featuredImage && prod.featuredImage.url) || '';
      var opts = (m.selectedOptions || []).filter(function (o) {
        return !/^(title|default title)$/i.test(o.value);
      });
      return {
        id: l.id,
        quantity: l.quantity,
        variantId: m.id,
        title: prod.title || m.title || 'Item',
        handle: prod.handle || '',
        variantTitle: /^default title$/i.test(m.title || '') ? '' : (m.title || ''),
        options: opts,
        attributes: (l.attributes || []).filter(function (a) { return a.value; }),
        image: img,
        priceInr: money(m.price),
        lineTotalInr: money(l.cost && l.cost.totalAmount)
      };
    });
    return {
      id: cart.id,
      checkoutUrl: cart.checkoutUrl,
      totalQuantity: cart.totalQuantity || 0,
      subtotalInr: money(cart.cost && cart.cost.subtotalAmount),
      lines: lines
    };
  }

  function persist() {
    try {
      if (state.id) localStorage.setItem(LS_KEY, state.id);
      else localStorage.removeItem(LS_KEY);
    } catch (e) { /* private mode - cart just won't survive reloads */ }
  }

  function emit() {
    document.dispatchEvent(new CustomEvent('cart:change', { detail: Cart.get() }));
  }

  function apply(cart) {
    state = normalise(cart);
    persist();
    emit();
    return state;
  }

  function userErr(result, key) {
    var block = result && result[key];
    if (block && block.userErrors && block.userErrors.length) {
      throw new Error(block.userErrors.map(function (e) { return e.message; }).join('; '));
    }
    return block;
  }

  /* -- Mutations -------------------------------------------------------- */
  function createCart(lines) {
    var q = 'mutation($lines:[CartLineInput!]){ cartCreate(input:{lines:$lines}){ ' +
      'cart { ' + CART_FIELDS + ' } userErrors { message } } }';
    return Store.query(q, { lines: lines || [] }).then(function (d) {
      return apply(userErr(d, 'cartCreate').cart);
    });
  }

  function linesAdd(lines) {
    var q = 'mutation($cartId:ID!,$lines:[CartLineInput!]!){ cartLinesAdd(cartId:$cartId,lines:$lines){ ' +
      'cart { ' + CART_FIELDS + ' } userErrors { message } } }';
    return Store.query(q, { cartId: state.id, lines: lines }).then(function (d) {
      return apply(userErr(d, 'cartLinesAdd').cart);
    });
  }

  function linesUpdate(lines) {
    var q = 'mutation($cartId:ID!,$lines:[CartLineUpdateInput!]!){ cartLinesUpdate(cartId:$cartId,lines:$lines){ ' +
      'cart { ' + CART_FIELDS + ' } userErrors { message } } }';
    return Store.query(q, { cartId: state.id, lines: lines }).then(function (d) {
      return apply(userErr(d, 'cartLinesUpdate').cart);
    });
  }

  function linesRemove(lineIds) {
    var q = 'mutation($cartId:ID!,$lineIds:[ID!]!){ cartLinesRemove(cartId:$cartId,lineIds:$lineIds){ ' +
      'cart { ' + CART_FIELDS + ' } userErrors { message } } }';
    return Store.query(q, { cartId: state.id, lineIds: lineIds }).then(function (d) {
      return apply(userErr(d, 'cartLinesRemove').cart);
    });
  }

  function fetchCart(id) {
    var q = 'query($id:ID!){ cart(id:$id){ ' + CART_FIELDS + ' } }';
    return Store.query(q, { id: id }).then(function (d) { return d && d.cart; });
  }

  /* -- Public -------------------------------------------------------------- */
  var Cart = {
    isConfigured: function () { return Store.isConfigured(); },

    init: function () {
      if (ready) return Promise.resolve(state);
      ready = true;
      var id = null;
      try { id = localStorage.getItem(LS_KEY); } catch (e) { /* ignore */ }
      if (!id || !Store.isConfigured()) { emit(); return Promise.resolve(state); }
      return fetchCart(id)
        .then(function (cart) {
          if (cart) apply(cart);
          else { state = EMPTY; persist(); emit(); }
        })
        .catch(function (e) {
          console.warn('[Cart] rehydrate failed', e);
          emit();
        })
        .then(function () { return state; });
    },

    get: function () {
      return {
        id: state.id,
        checkoutUrl: state.checkoutUrl,
        totalQuantity: state.totalQuantity,
        subtotalInr: state.subtotalInr,
        lines: state.lines.slice()
      };
    },

    add: function (variantId, quantity, attributes) {
      if (!Store.isConfigured()) {
        return Promise.reject(new Error('Store not connected'));
      }
      if (!variantId) return Promise.reject(new Error('No variant selected'));
      var line = {
        merchandiseId: variantId,
        quantity: quantity || 1
      };
      if (attributes && attributes.length) {
        line.attributes = attributes.filter(function (a) { return a && a.key && a.value; });
      }
      return state.id ? linesAdd([line]) : createCart([line]);
    },

    setQuantity: function (lineId, qty) {
      if (!state.id) return Promise.resolve(state);
      if (qty <= 0) return linesRemove([lineId]);
      return linesUpdate([{ id: lineId, quantity: qty }]);
    },

    remove: function (lineId) {
      if (!state.id) return Promise.resolve(state);
      return linesRemove([lineId]);
    },

    checkout: function () {
      if (state.checkoutUrl) window.location.href = state.checkoutUrl;
    }
  };

  window.Cart = Cart;
}());
