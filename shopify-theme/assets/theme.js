/**
 * theme.js - Rhytara
 *
 * Ported from the static site's site.js (mobile nav, nav scroll state,
 * announcement offsets) with the cart rewritten against Shopify's Cart AJAX
 * API. The static version kept `let cart = []` in page scope, so the cart
 * emptied on every navigation; this reads and writes the real cart.
 */
(function () {
  'use strict';

  /* ================= shell ================= */

  var nav = document.getElementById('nav');
  var links = nav && nav.querySelector('.nav-links');
  var burger = nav && nav.querySelector('.nav-burger');
  var ann = document.getElementById('ann');

  function syncNavOffset() {
    if (!nav) return;
    var rect = nav.getBoundingClientRect();
    document.documentElement.style.setProperty(
      '--nav-offset', Math.max(0, rect.bottom) + 'px'
    );
  }

  var menuOpen = false;
  function setMenu(open) {
    if (!links || !burger) return;
    menuOpen = open;
    syncNavOffset();
    links.classList.toggle('mobile-open', open);
    nav.setAttribute('data-menu', open ? 'open' : 'closed');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  if (burger && links) {
    if (!links.id) links.id = 'primary-nav';
    burger.setAttribute('aria-controls', links.id);
    burger.setAttribute('aria-expanded', 'false');
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!menuOpen);
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); }
    });
    var mq = window.matchMedia('(min-width: 769px)');
    var onChange = function (ev) { if (ev.matches && menuOpen) setMenu(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  function watchScrollState() {
    if (!nav) return;
    if (nav.dataset.navSolid === 'true') { nav.classList.add('scrolled'); return; }
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText =
      'position:absolute;top:0;left:0;width:1px;height:60px;pointer-events:none;';
    document.body.insertBefore(sentinel, document.body.firstChild);
    if (!('IntersectionObserver' in window)) { nav.classList.add('scrolled'); return; }
    new IntersectionObserver(function (entries) {
      nav.classList.toggle('scrolled', !entries[0].isIntersecting);
      syncNavOffset();
    }, { threshold: 0 }).observe(sentinel);
  }

  if (ann) {
    new MutationObserver(syncNavOffset).observe(ann.parentNode, { childList: true });
  }

  window.closeAnn = function () {
    var el = document.getElementById('ann');
    if (!el) return;
    el.style.transition = 'height .3s ease, opacity .3s ease, padding .3s ease';
    el.style.height = '0'; el.style.opacity = '0'; el.style.padding = '0';
    setTimeout(function () {
      el.remove();
      if (nav) nav.classList.add('no-ann');
      syncNavOffset();
    }, 320);
  };

  /* ================= cart ================= */

  var routes = window.routes || {};

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  window.openCart = function (e) {
    // The cart icon is a real link to /cart, so it still works without JS.
    if (e && e.preventDefault) e.preventDefault();
    var d = document.getElementById('cartDrawer');
    var s = document.getElementById('cartScrim');
    if (!d) return;
    d.classList.add('open');
    if (s) s.classList.add('show');
    document.body.style.overflow = 'hidden';
  };

  window.closeCart = function () {
    var d = document.getElementById('cartDrawer');
    var s = document.getElementById('cartScrim');
    if (d) d.classList.remove('open');
    if (s) s.classList.remove('show');
    document.body.style.overflow = '';
  };

  /**
   * Re-render the drawer from the server so line prices, discounts and
   * totals always match what checkout will charge.
   */
  function refreshCart() {
    return fetch(routes.cart_url + '?section_id=cart-drawer', { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        ['cartBody', 'cartFoot', 'cartTotal'].forEach(function (id) {
          var fresh = doc.getElementById(id);
          var live = document.getElementById(id);
          if (fresh && live) live.innerHTML = fresh.innerHTML;
        });
        var foot = doc.getElementById('cartFoot');
        var liveFoot = document.getElementById('cartFoot');
        if (foot && liveFoot) liveFoot.style.display = foot.style.display;
      })
      .catch(function () { window.location.href = routes.cart_url; });
  }

  function setBadge(count) {
    var b = document.getElementById('cartBadge');
    if (b) b.textContent = count;
  }

  window.addToCart = function (variantId, quantity) {
    if (!variantId) return;
    return fetch(routes.cart_add_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items: [{ id: variantId, quantity: quantity || 1 }] })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          // Selling a 1-of-1 twice is the failure mode that matters here.
          toast(res.data.description || (window.cartStrings && window.cartStrings.error) || 'Unavailable');
          return;
        }
        return fetch(routes.cart_url + '.js', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (cart) {
            setBadge(cart.item_count);
            return refreshCart().then(function () { window.openCart(); });
          });
      })
      .catch(function () { toast('Could not add to cart'); });
  };

  window.changeCartLine = function (line, quantity) {
    return fetch(routes.cart_change_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ line: line, quantity: quantity })
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        setBadge(cart.item_count);
        return refreshCart();
      })
      .catch(function () { window.location.href = routes.cart_url; });
  };

  /* ================= misc ================= */

  document.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
    img.classList.add('loading');
    if (img.complete) img.classList.remove('loading');
    else img.addEventListener('load', function () { img.classList.remove('loading'); });
  });

  syncNavOffset();
  watchScrollState();
  window.addEventListener('resize', syncNavOffset, { passive: true });
}());
