/**
 * newsletter.js - "Stay in the Loop" signup band, added above the footer on
 * every page. Sign-ups go to studio@rhytara.com through Web3Forms (public key),
 * the same service the About page already uses. Skips pages that already have
 * their own #nlForm (About).
 */
(function () {
  'use strict';

  var POPUP_KEY = 'rhytara_lead_popup_v1';
  var POPUP_COOLDOWN = 30 * 24 * 60 * 60 * 1000;

  function popupSuppressed() {
    try {
      var last = Number(localStorage.getItem(POPUP_KEY) || 0);
      return last && Date.now() - last < POPUP_COOLDOWN;
    } catch (e) {
      return false;
    }
  }

  function suppressPopup() {
    try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch (e) {}
  }

  function initLeadPopup() {
    if (popupSuppressed()) return;

    var popup = document.createElement('dialog');
    popup.id = 'leadPopup';
    popup.className = 'lead-popup';
    popup.setAttribute('aria-labelledby', 'leadPopupTitle');
    popup.setAttribute('aria-describedby', 'leadPopupText');
    popup.innerHTML =
      '<div class="lead-popup-panel">' +
        '<button type="button" class="lead-popup-close" id="leadPopupClose" aria-label="Close">Close</button>' +
        '<div class="lead-popup-copy">' +
          '<p class="lead-popup-kicker">Join the Rhytara circle</p>' +
          '<h2 id="leadPopupTitle">New works, thoughtfully shared.</h2>' +
          '<p id="leadPopupText">Receive first look updates on new releases, exhibitions and studio stories.</p>' +
        '</div>' +
        '<form class="lead-popup-form" id="leadPopupForm" novalidate>' +
          '<div class="lead-popup-field">' +
            '<label for="leadFirstName">First name</label>' +
            '<input id="leadFirstName" name="firstName" type="text" autocomplete="given-name" maxlength="80" required>' +
          '</div>' +
          '<div class="lead-popup-field">' +
            '<label for="leadEmail">Email address</label>' +
            '<input id="leadEmail" name="email" type="email" autocomplete="email" maxlength="254" required>' +
          '</div>' +
          '<input type="checkbox" name="botcheck" id="leadPopupHoney" tabindex="-1" autocomplete="off" aria-hidden="true" style="display:none">' +
          '<button type="submit" class="lead-popup-submit" id="leadPopupSubmit">Join the circle</button>' +
          '<p class="lead-popup-status" id="leadPopupStatus" aria-live="polite"></p>' +
        '</form>' +
        '<p class="lead-popup-privacy">By joining, you agree to receive occasional Rhytara updates. Unsubscribe anytime.</p>' +
      '</div>';
    document.body.appendChild(popup);

    var form = document.getElementById('leadPopupForm');
    var nameInput = document.getElementById('leadFirstName');
    var emailInput = document.getElementById('leadEmail');
    var submit = document.getElementById('leadPopupSubmit');
    var status = document.getElementById('leadPopupStatus');
    var close = document.getElementById('leadPopupClose');

    function closePopup() {
      suppressPopup();
      if (typeof popup.close === 'function') popup.close();
      else popup.removeAttribute('open');
    }

    close.addEventListener('click', closePopup);
    popup.addEventListener('cancel', function (e) {
      e.preventDefault();
      closePopup();
    });
    popup.addEventListener('click', function (e) {
      if (e.target === popup) closePopup();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstName = nameInput.value.trim();
      var email = emailInput.value.trim();
      if (!firstName) {
        status.textContent = 'Please enter your first name.';
        nameInput.focus();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        status.textContent = 'Please enter a valid email address.';
        emailInput.focus();
        return;
      }
      if (document.getElementById('leadPopupHoney').checked) return;

      submit.disabled = true;
      submit.textContent = 'Joining...';
      status.textContent = '';
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          access_key: 'e83decf9-acf1-4f4f-bd51-9b5671adcc21',
          subject: 'Rhytara circle sign-up · ' + firstName + ' · ' + email,
          from_name: 'Rhytara Website',
          replyto: email,
          Form: 'Storefront lead popup',
          'First name': firstName,
          Email: email,
          Page: location.href
        })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || data.success === false) throw new Error(data.message);
        });
      }).then(function () {
        suppressPopup();
        submit.textContent = 'You’re on the list';
        status.textContent = 'Thank you. Watch your inbox for Rhytara updates.';
        form.reset();
        setTimeout(closePopup, 2200);
      }).catch(function () {
        submit.disabled = false;
        submit.textContent = 'Join the circle';
        status.textContent = 'Sorry, that did not go through. Please try again.';
      });
    });

    window.setTimeout(function () {
      if (document.hidden || document.querySelector('dialog[open]')) return;
      if (typeof popup.showModal === 'function') popup.showModal();
      else popup.setAttribute('open', '');
      nameInput.focus();
    }, 8000);
  }

  initLeadPopup();

  if (document.getElementById('nlForm')) return;
  var footer = document.querySelector('footer');
  if (!footer) return;

  var page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';

  var band = document.createElement('section');
  band.className = 'nl-band';
  band.setAttribute('aria-label', 'Newsletter signup');
  band.innerHTML =
    '<div class="nl-band-inner">' +
      '<span class="nl-label">Stay in the Loop</span>' +
      '<p class="nl-lede">New works, exhibition invites, and studio notes, when there is something worth sharing.</p>' +
      '<form class="nl-row" id="nlForm" novalidate>' +
        '<input type="email" class="nl-input" id="nlEmail" placeholder="Your email address" aria-label="Newsletter email" autocomplete="email" maxlength="254" required>' +
        '<input type="checkbox" id="nlHoney" tabindex="-1" autocomplete="off" aria-hidden="true" style="display:none">' +
        '<button type="submit" class="nl-btn" id="nlBtn">Join</button>' +
      '</form>' +
      '<p class="nl-sub" id="nlSub" aria-live="polite">No noise. No promotions. Only work that matters.</p>' +
    '</div>';
  footer.parentNode.insertBefore(band, footer);

  var form = document.getElementById('nlForm');
  var input = document.getElementById('nlEmail');
  var button = document.getElementById('nlBtn');
  var note = document.getElementById('nlSub');
  var defaultNote = note.textContent;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      input.setAttribute('aria-invalid', 'true');
      note.textContent = 'Please enter a valid email address.';
      input.focus();
      return;
    }
    if (document.getElementById('nlHoney').checked) return;
    input.removeAttribute('aria-invalid');
    button.disabled = true;
    button.textContent = '…';
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: 'e83decf9-acf1-4f4f-bd51-9b5671adcc21',
        subject: 'Rhytara newsletter sign-up · ' + email,
        from_name: 'Rhytara Website',
        replyto: email,
        Form: 'Stay in the Loop (' + page + ' page)',
        Email: email
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.success === false) throw new Error(data.message);
      });
    }).then(function () {
      form.reset();
      button.textContent = '✓ Joined';
      note.textContent = 'Thank you. You’re on the list.';
    }).catch(function () {
      button.disabled = false;
      button.textContent = 'Join';
      note.textContent = 'Sorry, that didn’t go through. Please try again.';
    });
  });
  input.addEventListener('input', function () {
    input.removeAttribute('aria-invalid');
    if (!button.disabled) note.textContent = defaultNote;
  });
}());
