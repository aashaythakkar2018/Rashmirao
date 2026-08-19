/**
 * site.js - Rashmi Rao Designs
 * Shared shell behaviour for every page: mobile navigation, nav scroll state,
 * and skip-link injection.
 *
 * Replaces two things that were previously wrong:
 *   1. A burger button that existed on four pages with no handler, which left
 *      the site unnavigable below 768px.
 *   2. window.addEventListener('scroll') for the nav background, which runs on
 *      every scroll frame. An IntersectionObserver sentinel does the same job
 *      without touching the scroll path.
 */
(function () {
  'use strict';

  var nav = document.getElementById('nav');
  if (!nav) return;

  var links  = nav.querySelector('.nav-links');
  var burger = nav.querySelector('.nav-burger');
  var ann    = document.getElementById('ann');

  /* -- Skip link ------------------------------------------------ */
  function addSkipLink() {
    var main = document.querySelector('main, .product-page, .page-hero, .hero');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    var a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + main.id;
    a.textContent = 'Skip to content';
    document.body.insertBefore(a, document.body.firstChild);
  }

  /* -- Drawer offset ------------------------------------------- */
  /* The drawer opens below the nav. Its top depends on whether the
     announcement bar is still on the page. */
  function syncNavOffset() {
    var rect = nav.getBoundingClientRect();
    document.documentElement.style.setProperty(
      '--nav-offset', Math.max(0, rect.bottom) + 'px'
    );
  }

  /* -- Mobile menu --------------------------------------------- */
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
    burger.setAttribute('aria-label', 'Open menu');

    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!menuOpen);
    });

    // Any link tap closes the drawer
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) {
        setMenu(false);
        burger.focus();
      }
    });

    // Leaving mobile width must not strand the drawer open
    var mq = window.matchMedia('(min-width: 769px)');
    var onChange = function (ev) { if (ev.matches && menuOpen) setMenu(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* -- Nav scroll state (IntersectionObserver, not a scroll listener) -- */
  function watchScrollState() {
    // The homepage nav sits over the hero and only turns solid after it.
    // Other pages are solid from the start and opt out via data-nav-solid.
    if (nav.dataset.navSolid === 'true') { nav.classList.add('scrolled'); return; }

    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:60px;pointer-events:none;';
    document.body.insertBefore(sentinel, document.body.firstChild);

    if (!('IntersectionObserver' in window)) { nav.classList.add('scrolled'); return; }

    new IntersectionObserver(function (entries) {
      nav.classList.toggle('scrolled', !entries[0].isIntersecting);
      syncNavOffset();
    }, { threshold: 0 }).observe(sentinel);
  }

  /* -- Announcement bar dismissal keeps offsets in sync --------- */
  if (ann) {
    new MutationObserver(syncNavOffset).observe(ann.parentNode, { childList: true });
  }

  addSkipLink();
  syncNavOffset();
  watchScrollState();
  window.addEventListener('resize', syncNavOffset, { passive: true });
}());
