/**
 * newsletter.js - "Stay in the Loop" signup band, added above the footer on
 * every page. Sign-ups go to studio@rhytara.com through Web3Forms (public key),
 * the same service the About page already uses. Skips pages that already have
 * their own #nlForm (About).
 */
(function () {
  'use strict';
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
