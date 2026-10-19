/*
 * Rhytara certificate dashboard - rhytara.com/certificates.
 *
 * A static page: Supabase holds the staff logins, a backup of every
 * certificate PDF (private "certificates" bucket) and a register of what was
 * issued (public.certificates: order, design, edition, SKU - no customer
 * details), and cert-render.js makes each PDF in the browser. The customer's
 * name is typed in, printed on the PDF, and not stored anywhere else.
 * Access rules live in supabase-setup.sql, not here - this script only asks.
 */
(function () {
  'use strict';

  var cfg = window.RHYTARA_CERTS_CONFIG || {};
  var DESIGNS = window.RHYTARA_DESIGNS || [];
  var BUCKET = 'certificates';
  var PAGE_SIZE = 25;
  var SKU_PATTERN = /^RHY-([A-Z]{2,5})-([A-Z]{2,5})-(\d+)\/(\d+)$/;
  var SKU_EXAMPLE = 'RHY-EOE-GRS-001/250';

  function $(id) { return document.getElementById(id); }

  var state = {
    page: 1,
    design: '',
    search: '',
    editingId: null,
    issued: {},       // design code -> highest certificate number issued
    lastIssued: null, // register row from the most recent "Generate certificate"
  };

  // --------------------------------------------------------------- gates --
  var GATES = ['setupGate', 'loginGate', 'passwordGate', 'app'];
  function show(id) {
    GATES.forEach(function (g) { $(g).classList.toggle('hidden', g !== id); });
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    show('setupGate');
    return;
  }

  // Invite and password-reset links land here with type=invite|recovery in
  // the URL fragment; Supabase signs the visitor in, then they set a password.
  var arrivedToSetPassword = /(^|[#&])type=(invite|recovery)(&|$)/.test(location.hash);

  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  // --------------------------------------------------------------- toast --
  var toastTimer = null;
  function toast(message, isError) {
    var el = $('toast');
    el.textContent = message;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 4000);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var pad = window.RhytaraCertRender.formatEdition;

  function findDesign(name) {
    var n = String(name || '').trim().toLowerCase();
    return DESIGNS.find(function (d) { return d.name.toLowerCase() === n; }) || null;
  }
  function designByCode(code) {
    return DESIGNS.find(function (d) { return d.code === code; }) || null;
  }

  // ---------------------------------------------------------------- auth --
  async function enter(session) {
    if (!session) { show('loginGate'); return; }
    if (arrivedToSetPassword) {
      history.replaceState(null, '', location.pathname);
      show('passwordGate');
      $('newPassword').focus();
      return;
    }
    var email = session.user.email;
    var res = await sb.from('staff').select('email').limit(1);
    if (res.error || !res.data.length) {
      await sb.auth.signOut();
      show('loginGate');
      $('loginMessage').textContent = res.error
        ? 'Could not check your access: ' + res.error.message
        : email + ' is not on the staff list for this dashboard.';
      return;
    }
    $('userEmail').textContent = email;
    show('app');
    refreshAll();
  }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = $('loginMessage');
    msg.textContent = '';
    $('loginSubmit').disabled = true;
    var res = await sb.auth.signInWithPassword({
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value,
    });
    $('loginSubmit').disabled = false;
    if (res.error) {
      msg.textContent = res.error.message === 'Invalid login credentials'
        ? 'That email and password don\'t match.'
        : res.error.message;
      return;
    }
    $('loginPassword').value = '';
    enter(res.data.session);
  });

  $('forgotBtn').addEventListener('click', async function () {
    var msg = $('loginMessage');
    var email = $('loginEmail').value.trim();
    if (!email) { msg.textContent = 'Enter your email above first.'; return; }
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    msg.textContent = res.error
      ? res.error.message
      : 'If that email has an account, a reset link is on its way.';
  });

  $('passwordForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = $('passwordMessage');
    msg.textContent = '';
    var res = await sb.auth.updateUser({ password: $('newPassword').value });
    if (res.error) { msg.textContent = res.error.message; return; }
    $('newPassword').value = '';
    arrivedToSetPassword = false;
    toast('Password saved.');
    var s = await sb.auth.getSession();
    enter(s.data.session);
  });

  $('logoutBtn').addEventListener('click', async function () {
    await sb.auth.signOut();
    show('loginGate');
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') show('loginGate');
    if (event === 'PASSWORD_RECOVERY') {
      arrivedToSetPassword = true;
      show('passwordGate');
    }
  });

  // --------------------------------------------------------- stats/designs --
  async function loadSummary() {
    // The register is small (one row per saree sold), so stats and the
    // next-SKU suggestion are computed from a light select of every row.
    var res = await sb.from('certificates').select('design_code, certificate_number, created_at');
    if (res.error) { toast('Could not load stats: ' + res.error.message, true); return; }

    var count = {};
    var thisMonth = 0;
    var now = new Date();
    state.issued = {};
    res.data.forEach(function (r) {
      count[r.design_code] = (count[r.design_code] || 0) + 1;
      state.issued[r.design_code] = Math.max(state.issued[r.design_code] || 0, r.certificate_number);
      var d = new Date(r.created_at);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) thisMonth += 1;
    });

    $('statsRow').innerHTML =
      '<div class="stat-card"><div class="stat-value">' + res.data.length + '</div><div class="stat-label">Certificates backed up</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + thisMonth + '</div><div class="stat-label">Issued this month</div></div>';

    document.querySelector('#designTable tbody').innerHTML = DESIGNS.map(function (d) {
      return '<tr><td>' + esc(d.name) + '</td><td class="mono">' + esc(d.code) + '</td>' +
        '<td>' + (count[d.code] || 0) + '</td><td>' + d.editionTotal + '</td></tr>';
    }).join('');
  }

  function fillDesignSelects() {
    var form = $('f_designName');
    var filter = $('designFilter');
    DESIGNS.forEach(function (d) {
      form.add(new Option(d.name, d.name));
      filter.add(new Option(d.name, d.code));
    });
  }

  function nextSuggestedNumber(design) {
    return Math.max(design.lastKnownEditionNumber || 0, state.issued[design.code] || 0) + 1;
  }

  function updateSkuSuggestion() {
    var design = findDesign($('f_designName').value);
    var skuInput = $('f_sku');
    var hint = $('f_skuHint');
    if (!design) return;
    if (!design.skuCode || !design.skuLineCode) {
      skuInput.value = '';
      hint.textContent = 'No SKU prefix is configured for this design yet. Enter the complete SKU exactly as printed on the physical piece.';
      return;
    }
    var next = nextSuggestedNumber(design);
    if (next > design.editionTotal) {
      skuInput.value = '';
      hint.textContent = 'All known editions are assigned for this design. Confirm any remaining SKU directly against the physical label.';
      return;
    }
    skuInput.value = 'RHY-' + design.skuCode + '-' + design.skuLineCode + '-' + pad(next, design.editionTotal);
    hint.textContent = 'Suggested next SKU based on known sold pieces and issued certificates. Confirm the complete SKU matches the physical label.';
  }

  $('f_designName').addEventListener('change', updateSkuSuggestion);
  // Typing a SKU whose design code is known picks that design for you.
  $('f_sku').addEventListener('input', function (e) {
    var match = /^RHY-([A-Z]{2,5})-/.exec(e.target.value.replace(/\s+/g, '').toUpperCase());
    if (!match) return;
    var owner = DESIGNS.find(function (d) { return d.skuCode && d.skuCode === match[1]; });
    if (owner) $('f_designName').value = owner.name;
  });

  // ----------------------------------------------------------------- SKU --
  /**
   * Reads the edition from the piece's SKU and checks it belongs to the
   * chosen design - same rules as certificate-automation/src/certificates/sku.ts.
   * Returns { sku, editionNumber, editionTotal } or throws with a message
   * fit for the form.
   */
  function parseSku(raw, design) {
    var sku = raw.replace(/\s+/g, '').toUpperCase();
    var m = SKU_PATTERN.exec(sku);
    if (!m) throw new Error('"' + raw.trim() + '" is not a Rhytara SKU. Expected the format ' + SKU_EXAMPLE + '.');
    var designCode = m[1], numberPart = m[3], totalPart = m[4];
    var editionNumber = parseInt(numberPart, 10);
    var editionTotal = parseInt(totalPart, 10);

    if (numberPart.length !== totalPart.length) {
      throw new Error('The edition number in "' + sku + '" should be zero-padded to ' + totalPart.length + ' digits, e.g. ' + SKU_EXAMPLE + '.');
    }
    if (editionNumber < 1 || editionNumber > editionTotal) {
      throw new Error('Edition ' + numberPart + '/' + totalPart + ' in "' + sku + '" is outside the edition.');
    }
    var owner = DESIGNS.find(function (d) { return d.skuCode && d.skuCode === designCode; });
    if (owner && owner.name !== design.name) {
      throw new Error('SKU ' + sku + ' belongs to ' + owner.name + ', not ' + design.name + '.');
    }
    if (design.skuCode && design.skuCode !== designCode) {
      throw new Error(design.name + ' SKUs start with RHY-' + design.skuCode + '-, but this one is ' + sku + '.');
    }
    if (editionTotal !== design.editionTotal) {
      throw new Error(design.name + ' is an edition of ' + design.editionTotal + ', but SKU ' + sku + ' says /' + editionTotal + '.');
    }
    return { sku: sku, editionNumber: editionNumber, editionTotal: editionTotal };
  }

  // ---------------------------------------------------------------- PDFs --
  /** certificates/MP/Rhytara_Certificate_1012_RHY-MP-GRS-001-of-250.pdf, as before. */
  function pdfFileName(cert) {
    var order = String(cert.order_number).replace(/[^A-Za-z0-9-]/g, '');
    var piece = cert.sku
      ? cert.sku.replace('/', '-of-')
      : cert.design_code + '-' + pad(cert.certificate_number, cert.edition_total).replace('/', '-of-');
    return 'Rhytara_Certificate_' + order + '_' + piece + '.pdf';
  }

  /**
   * Renders a certificate and stores the PDF. `cert` is a register row plus
   * the customer's name, which goes on the PDF only. Without `replace`, an
   * existing file at that path (the same order and piece) is an error, never
   * overwritten.
   */
  async function renderAndUpload(cert, path, replace) {
    var blob = await window.RhytaraCertRender.renderPdf(cert, designByCode(cert.design_code) || findDesign(cert.design_name));
    var up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: !!replace });
    if (up.error) {
      if (!replace && /exists|duplicate/i.test(up.error.message)) {
        throw new Error('A certificate PDF for order ' + cert.order_number + ' and ' + cert.sku + ' is already backed up.');
      }
      throw new Error('Could not back up the PDF: ' + up.error.message);
    }
  }

  /**
   * Opens a short-lived signed link to a stored PDF. `win` is a tab opened
   * synchronously in the click handler, so pop-up blockers allow it.
   */
  async function openPdf(cert, download, win) {
    var res = await sb.storage.from(BUCKET).createSignedUrl(
      cert.pdf_path, 3600, download ? { download: pdfFileName(cert) } : undefined
    );
    if (res.error) {
      if (win) win.close();
      toast('Could not open the PDF: ' + res.error.message, true);
      return;
    }
    if (win) win.location.href = res.data.signedUrl;
    else window.location.assign(res.data.signedUrl);
  }

  function openBlankTab() {
    var win = window.open('', '_blank');
    if (win) win.document.title = 'Preparing certificate…';
    return win;
  }

  // -------------------------------------------------------- certificates --
  function renderRow(cert) {
    var isEditing = state.editingId === cert.id;
    var issued = new Date(cert.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    var actions;
    if (isEditing) {
      actions =
        '<div class="name-edit-row">' +
        '<input type="text" class="edit-first" placeholder="First name" aria-label="Corrected first name" autocomplete="off" />' +
        '<input type="text" class="edit-last" placeholder="Last name" aria-label="Corrected last name" autocomplete="off" />' +
        '</div>' +
        '<div class="action-btns" style="margin-top:6px;">' +
        '<button class="btn btn-sm btn-primary" data-action="save-name" data-id="' + cert.id + '">Replace PDF</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="cancel-edit">Cancel</button>' +
        '</div>';
    } else {
      actions = '<button class="btn btn-sm btn-ghost" data-action="edit" data-id="' + cert.id + '">Correct name</button>';
    }

    return (
      '<tr>' +
      '<td class="mono">' + esc(cert.order_number) + '</td>' +
      '<td>' + esc(cert.design_name) + '</td>' +
      '<td class="mono">' + pad(cert.certificate_number, cert.edition_total) + '</td>' +
      '<td class="mono nowrap">' + esc(cert.sku) + '</td>' +
      '<td class="nowrap">' + esc(issued) + '</td>' +
      '<td class="nowrap"><button class="link-btn" data-action="preview" data-id="' + cert.id + '">Preview PDF</button>' +
        ' &middot; <button class="link-btn" data-action="download" data-id="' + cert.id + '">Download</button></td>' +
      '<td>' + actions + '</td>' +
      '</tr>'
    );
  }

  var rowsById = {};

  async function loadCertificates() {
    var q = sb.from('certificates').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE - 1);
    if (state.design) q = q.eq('design_code', state.design);
    if (state.search) {
      // Characters PostgREST's or() filter treats as syntax are dropped.
      var term = state.search.replace(/[,()*%\\:"]/g, ' ').trim();
      if (term) {
        var like = '%' + term + '%';
        q = q.or(['order_number', 'design_name', 'sku']
          .map(function (col) { return col + '.ilike.' + like; }).join(','));
      }
    }

    var res = await q;
    if (res.error) { toast('Could not load certificates: ' + res.error.message, true); return; }

    rowsById = {};
    res.data.forEach(function (r) { rowsById[r.id] = r; });
    $('certTableBody').innerHTML = res.data.map(renderRow).join('') ||
      '<tr><td colspan="7" class="muted empty-row">No certificates match these filters.</td></tr>';

    var total = res.count || 0;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    $('pageInfo').textContent = 'Page ' + state.page + ' of ' + totalPages + ' — ' + total + ' total';
    $('prevPage').disabled = state.page <= 1;
    $('nextPage').disabled = state.page >= totalPages;
  }

  function refreshAll() {
    loadSummary();
    loadCertificates();
  }

  // ------------------------------------------------------------ actions --
  $('certTableBody').addEventListener('click', async function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var cert = rowsById[btn.dataset.id];

    if (action === 'preview') { openPdf(cert, false, openBlankTab()); return; }
    if (action === 'download') { openPdf(cert, true); return; }
    if (action === 'edit') { state.editingId = cert.id; loadCertificates(); return; }
    if (action === 'cancel-edit') { state.editingId = null; loadCertificates(); return; }

    if (action === 'save-name') {
      var row = btn.closest('tr');
      var first = row.querySelector('.edit-first').value.trim();
      var last = row.querySelector('.edit-last').value.trim();
      if (!first) { toast('Enter the corrected first name.', true); return; }
      btn.disabled = true;
      btn.textContent = 'Generating…';
      try {
        // Same order, piece and date of issue; only the printed name changes.
        await renderAndUpload(
          Object.assign({}, cert, { customer_first_name: first, customer_last_name: last }),
          cert.pdf_path,
          true
        );
        state.editingId = null;
        toast('Certificate PDF replaced with the corrected name.');
        loadCertificates();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        btn.textContent = 'Replace PDF';
      }
    }
  });

  // ------------------------------------------------------- issue form ---
  $('issueForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var error = $('issueError');
    var status = $('issueStatus');
    error.textContent = '';
    $('issueResult').hidden = true;

    var design = findDesign($('f_designName').value);
    if (!design) { error.textContent = 'Choose a design.'; return; }
    var parsed;
    try {
      parsed = parseSku($('f_sku').value, design);
    } catch (err) {
      error.textContent = err.message;
      return;
    }

    var record = {
      order_number: $('f_orderNumber').value.trim(),
      design_name: design.name,
      design_code: design.code,
      certificate_number: parsed.editionNumber,
      edition_total: parsed.editionTotal,
      sku: parsed.sku,
      created_at: new Date().toISOString(),
    };
    var duplicate = design.name + ' edition ' + pad(parsed.editionNumber, parsed.editionTotal) + ' (' + parsed.sku + ') already has a certificate.';
    record.pdf_path = design.code + '/' + pdfFileName(record);

    $('issueSubmit').disabled = true;
    // Nothing is saved until the PDF is made, so a failure leaves no trace
    // and the form keeps its values for another try.
    try {
      status.textContent = 'Checking the register…';
      var checks = await Promise.all([
        sb.from('certificates').select('id').eq('sku', parsed.sku).limit(1),
        sb.from('certificates').select('id').eq('design_code', design.code).eq('certificate_number', parsed.editionNumber).limit(1),
      ]);
      checks.forEach(function (c) { if (c.error) throw new Error('Could not check the register: ' + c.error.message); });
      if (checks[0].data.length || checks[1].data.length) throw new Error(duplicate);

      // Rendering runs in this tab, so no preview tab is opened until it's
      // done: a background tab gets its rendering paused by the browser.
      status.textContent = 'Generating certificate PDF…';
      await renderAndUpload(Object.assign({}, record, {
        customer_first_name: $('f_firstName').value.trim(),
        customer_last_name: $('f_lastName').value.trim(),
      }), record.pdf_path, false);

      status.textContent = 'Recording it…';
      var ins = await sb.from('certificates').insert(record).select().single();
      if (ins.error) throw new Error(ins.error.code === '23505' ? duplicate : 'Could not record the certificate: ' + ins.error.message);

      state.lastIssued = ins.data;
      $('issueResult').hidden = false;
      $('issueForm').reset();
      toast('Certificate ready and backed up — preview or download it below the form.');
      state.page = 1;
      refreshAll();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      $('issueSubmit').disabled = false;
      status.textContent = '';
    }
  });

  $('issuePreviewBtn').addEventListener('click', function () {
    if (state.lastIssued) openPdf(state.lastIssued, false, openBlankTab());
  });
  $('issueDownloadBtn').addEventListener('click', function () {
    if (state.lastIssued) openPdf(state.lastIssued, true);
  });

  // ------------------------------------------------------------ filters --
  $('filterApply').addEventListener('click', function () {
    state.design = $('designFilter').value;
    state.search = $('searchInput').value.trim();
    state.page = 1;
    loadCertificates();
  });
  $('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('filterApply').click();
  });
  $('prevPage').addEventListener('click', function () {
    if (state.page > 1) { state.page -= 1; loadCertificates(); }
  });
  $('nextPage').addEventListener('click', function () {
    state.page += 1;
    loadCertificates();
  });
  $('refreshBtn').addEventListener('click', refreshAll);

  // ------------------------------------------------------------- boot ---
  fillDesignSelects();
  sb.auth.getSession().then(function (res) { enter(res.data.session); });
})();
