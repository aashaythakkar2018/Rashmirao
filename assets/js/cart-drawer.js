/**
 * cart-drawer.js - Rashmi Rao Designs / Rhytara
 * --------------------------------------------------------------------------
 * The one cart drawer, shared by every page. Injects its own markup (so
 * pages that never had a working cart get one), renders from window.Cart on
 * every `cart:change`, and hands off to Shopify checkout.
 *
 * Exposes window.openCart / window.closeCart (kept as globals because the
 * existing nav buttons call them via inline onclick), and window.renderCart
 * so currency.js re-prices the drawer on an INR<->USD toggle.
 * --------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var Cart = window.Cart;
  var configured = Cart && Cart.isConfigured && Cart.isConfigured();

  function fmt(inr) {
    if (typeof window.formatPrice === 'function') return window.formatPrice(inr);
    return '₹ ' + (parseInt(inr, 10) || 0).toLocaleString('en-IN');
  }

  /* -- Inject markup ------------------------------------------------------- */
  function ensureMarkup() {
    if (document.getElementById('cartDrawer')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="cart-scrim" id="cartScrim"></div>' +
      '<div class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="Shopping cart">' +
        '<div class="cart-top">' +
          '<span class="cart-ttl">Your Cart</span>' +
          '<button class="cart-x" type="button" aria-label="Close cart">×</button>' +
        '</div>' +
        '<div class="cart-body" id="cartBody"></div>' +
        '<div class="cart-foot" id="cartFoot" style="display:none">' +
          '<div class="cart-total-row">' +
            '<span class="cart-total-lbl">Subtotal</span>' +
            '<span class="cart-total-val" id="cartTotal">₹ 0</span>' +
          '</div>' +
          '<button type="button" class="btn-olive" id="cartCheckout" style="width:100%;justify-content:center;">Proceed to Checkout</button>' +
          '<div class="cart-continue"><button type="button" id="cartContinue">Continue Shopping</button></div>' +
        '</div>' +
      '</div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  /* -- Open / close ------------------------------------------------------ */
  function openCart() {
    var d = document.getElementById('cartDrawer');
    var s = document.getElementById('cartScrim');
    if (!d) return;
    d.classList.add('open');
    if (s) s.classList.add('show');
    document.body.style.overflow = 'hidden';
    render();
  }
  function closeCart() {
    var d = document.getElementById('cartDrawer');
    var s = document.getElementById('cartScrim');
    if (d) d.classList.remove('open');
    if (s) s.classList.remove('show');
    document.body.style.overflow = '';
  }
  window.openCart = openCart;
  window.closeCart = closeCart;

  /* -- Badge ----------------------------------------------------------- */
  function setBadge(n) {
    ['cartBadge', 'cartCount'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = n;
    });
  }

  /* -- Render --------------------------------------------------------- */
  function subLine(line) {
    var bits = [];
    if (line.variantTitle) bits.push(line.variantTitle);
    (line.options || []).forEach(function (o) { bits.push(o.value); });
    (line.attributes || []).forEach(function (a) {
      if (!/^_/.test(a.key)) bits.push(a.key + ': ' + a.value);
    });
    return bits.join(' · ') || 'Original';
  }

  function render() {
    var body = document.getElementById('cartBody');
    var foot = document.getElementById('cartFoot');
    if (!body || !foot) return;

    if (!configured) {
      body.innerHTML = '<div class="cart-empty-msg"><p>Store not connected.</p>' +
        '<p>Online checkout is being set up. Please use the contact page to enquire.</p></div>';
      foot.style.display = 'none';
      setBadge(0);
      return;
    }

    var c = Cart.get();
    setBadge(c.totalQuantity || 0);

    if (!c.lines.length) {
      body.innerHTML = '<div class="cart-empty-msg"><p>Your cart is empty.</p>' +
        '<p>Discover original artworks ready to collect.</p></div>';
      foot.style.display = 'none';
      return;
    }

    foot.style.display = 'block';
    body.innerHTML = c.lines.map(function (line) {
      return '' +
        '<div class="cart-item" data-line="' + line.id + '">' +
          '<img class="cart-item-img" src="' + esc(line.image || '') + '" alt="' + esc(line.title) + '" ' +
            'onerror="this.style.visibility=\'hidden\'">' +
          '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + esc(line.title) + '</div>' +
            '<div class="cart-item-sub">' + esc(subLine(line)) + '</div>' +
            '<div class="cart-item-price">' + fmt(line.lineTotalInr || line.priceInr * line.quantity) + '</div>' +
            '<div class="cart-qty">' +
              '<button class="cart-qty-btn" type="button" data-act="dec" aria-label="Decrease quantity">−</button>' +
              '<span class="cart-qty-val">' + line.quantity + '</span>' +
              '<button class="cart-qty-btn" type="button" data-act="inc" aria-label="Increase quantity">+</button>' +
            '</div>' +
          '</div>' +
          '<button class="cart-rm" type="button" data-act="rm" aria-label="Remove ' + esc(line.title) + '">×</button>' +
        '</div>';
    }).join('');

    var total = document.getElementById('cartTotal');
    if (total) total.textContent = fmt(c.subtotalInr);
  }
  window.renderCart = render;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* -- Wire events -------------------------------------------------------- */
  function wire() {
    var scrim = document.getElementById('cartScrim');
    var drawer = document.getElementById('cartDrawer');
    if (scrim) scrim.addEventListener('click', closeCart);
    if (drawer) {
      var x = drawer.querySelector('.cart-x');
      if (x) x.addEventListener('click', closeCart);
    }
    var cont = document.getElementById('cartContinue');
    if (cont) cont.addEventListener('click', closeCart);
    var co = document.getElementById('cartCheckout');
    if (co) co.addEventListener('click', function (event) {
      event.preventDefault();
      co.disabled = true;
      co.textContent = 'Redirecting…';
      Cart.checkout().catch(function (error) {
        co.disabled = false;
        co.textContent = 'Proceed to Checkout';
        if (window.showToast) window.showToast(error.message || 'Checkout is unavailable.');
        console.error('[Cart] Checkout failed', error);
      });
    });

    var body = document.getElementById('cartBody');
    if (body) body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var row = e.target.closest('[data-line]');
      if (!row) return;
      var lineId = row.getAttribute('data-line');
      var act = btn.getAttribute('data-act');
      var qtyEl = row.querySelector('.cart-qty-val');
      var qty = qtyEl ? parseInt(qtyEl.textContent, 10) || 1 : 1;
      row.style.opacity = '.5';
      var p;
      if (act === 'rm') p = Cart.remove(lineId);
      else if (act === 'inc') p = Cart.setQuantity(lineId, qty + 1);
      else if (act === 'dec') p = Cart.setQuantity(lineId, qty - 1);
      if (p) p.catch(function (err) {
        console.warn('[Cart]', err);
        row.style.opacity = '';
        alert(err.message || 'Could not update the cart.');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeCart();
    });
    document.addEventListener('cart:change', render);
  }

  /* -- Boot ------------------------------------------------------------- */
  function boot() {
    ensureMarkup();
    wire();
    render();
    if (Cart && Cart.init) Cart.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
