(function () {
  'use strict';

  var TOKEN_KEY = 'rhytara_admin_token';
  var API = '/admin/dashboard/api';

  var state = {
    page: 1,
    pageSize: 25,
    status: '',
    product: '',
    search: '',
    autoRefreshTimer: null,
    editingId: null,
    designs: [],
  };

  // ---------------------------------------------------------------- auth --
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ 'x-admin-token': getToken() }, opts.headers || {});
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    var res = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      clearToken();
      showTokenGate('That token was rejected. Try again.');
      throw new Error('Unauthorized');
    }
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok && res.status !== 207) {
      var err = new Error(json.error || ('Request failed with HTTP ' + res.status));
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return { json: json, status: res.status };
  }

  // -------------------------------------------------------------- toast --
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 3200);
  }

  // ---------------------------------------------------------- token gate --
  var tokenGate = document.getElementById('tokenGate');
  var app = document.getElementById('app');
  var tokenInput = document.getElementById('tokenInput');
  var tokenError = document.getElementById('tokenError');

  function showTokenGate(errorMsg) {
    tokenGate.classList.remove('hidden');
    app.classList.add('hidden');
    tokenError.textContent = errorMsg || '';
    tokenInput.focus();
  }
  function showApp() {
    tokenGate.classList.add('hidden');
    app.classList.remove('hidden');
  }

  document.getElementById('tokenSubmit').addEventListener('click', trySubmitToken);
  tokenInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') trySubmitToken(); });

  async function trySubmitToken() {
    var value = tokenInput.value.trim();
    if (!value) return;
    setToken(value);
    try {
      await api('/meta');
      showApp();
      boot();
    } catch (err) {
      // api() already re-shows the gate with a message on 401
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    clearToken();
    stopAutoRefresh();
    showTokenGate('');
  });

  // ------------------------------------------------------------- stats --
  function renderStats(stats) {
    var order = ['generated', 'processing', 'pending', 'failed'];
    var labels = {
      generated: 'Ready to download',
      processing: 'Processing',
      pending: 'Pending',
      failed: 'Failed',
    };
    var row = document.getElementById('statsRow');
    var html = '<div class="stat-card"><div class="stat-value">' + stats.totalCertificates + '</div><div class="stat-label">Total certificates</div></div>';
    order.forEach(function (key) {
      html +=
        '<div class="stat-card"><div class="stat-value">' + (stats.byStatus[key] || 0) + '</div>' +
        '<div class="stat-label">' + labels[key] + '</div></div>';
    });
    row.innerHTML = html;

    var tbody = document.querySelector('#productTable tbody');
    tbody.innerHTML = stats.byDesign.map(function (p) {
      return '<tr><td>' + esc(p.designName) + '</td><td class="mono">' + esc(p.designCode) + '</td>' +
        '<td>' + p.issuedCount + '</td><td>' + p.editionTotal + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted">No certificates issued yet.</td></tr>';
  }

  async function loadStats() {
    try {
      var r = await api('/stats');
      renderStats(r.json);
    } catch (err) {
      toast('Could not load stats: ' + err.message, true);
    }
  }

  // ------------------------------------------------------------ designs --
  async function loadDesigns() {
    try {
      var r = await api('/designs');
      state.designs = r.json.designs;

      var filterSelect = document.getElementById('productFilter');
      filterSelect.querySelectorAll('option:not(:first-child)').forEach(function (o) { o.remove(); });
      var formSelect = document.getElementById('f_designName');
      formSelect.querySelectorAll('option:not(:first-child)').forEach(function (o) { o.remove(); });

      state.designs.forEach(function (d) {
        var opt1 = document.createElement('option');
        opt1.value = d.code;
        opt1.textContent = d.name;
        filterSelect.appendChild(opt1);

        var opt2 = document.createElement('option');
        opt2.value = d.name;
        opt2.dataset.code = d.code;
        opt2.dataset.editionTotal = d.editionTotal;
        opt2.dataset.nextSuggested = d.nextSuggestedNumber;
        opt2.textContent = d.name + ' (next: ' + d.nextSuggestedNumber + '/' + d.editionTotal + ')';
        formSelect.appendChild(opt2);
      });
    } catch (err) {
      // non-fatal
    }
  }

  document.getElementById('f_designName').addEventListener('change', function (e) {
    var opt = e.target.selectedOptions[0];
    if (!opt || !opt.dataset.code) return;
    document.getElementById('f_certNumber').value = opt.dataset.nextSuggested;
    document.getElementById('f_editionTotal').value = opt.dataset.editionTotal;
    document.getElementById('f_certHint').textContent =
      'Next unused number for this design: ' + opt.dataset.nextSuggested + ' of ' + opt.dataset.editionTotal + '. You can change it.';
  });

  // ------------------------------------------------------------ meta ----
  function showModeBadge() {
    var badge = document.getElementById('modeBadge');
    badge.textContent = 'PDF only — download and send manually';
    badge.className = 'badge';
  }

  // -------------------------------------------------------- certificates --
  function statusLabel(status) {
    return status.replace(/_/g, ' ');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pad(n, total) {
    var width = String(total).length;
    return String(n).padStart(width, '0') + '/' + total;
  }

  function renderRow(cert) {
    var isEditing = state.editingId === cert.id;
    var nameCell;
    if (isEditing) {
      nameCell =
        '<div class="name-edit-row">' +
        '<input type="text" class="edit-first" value="' + esc(cert.customer_first_name || '') + '" placeholder="First" />' +
        '<input type="text" class="edit-last" value="' + esc(cert.customer_last_name || '') + '" placeholder="Last" />' +
        '</div>' +
        '<div class="action-btns" style="margin-top:6px;">' +
        '<button class="btn btn-sm btn-primary" data-action="save-name" data-id="' + cert.id + '">Save</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="cancel-edit">Cancel</button>' +
        '</div>';
    } else {
      var fullName = [cert.customer_first_name, cert.customer_last_name].filter(Boolean).join(' ') || '—';
      nameCell =
        '<div class="name-cell"><strong>' + esc(fullName) + '</strong>' +
        '<span class="muted">' + esc(cert.customer_email || '—') + '</span></div>';
    }

    var certCell = cert.certificate_url
      ? '<a href="' + cert.certificate_url + '" target="_blank" rel="noopener" download>Download PDF</a>'
      : '<span class="muted">—</span>';

    var actions = '<div class="action-btns">';
    if (!isEditing) {
      actions += '<button class="btn btn-sm btn-ghost" data-action="edit" data-id="' + cert.id + '">Edit name</button>';
    }
    actions += '<button class="btn btn-sm btn-primary" data-action="regenerate" data-id="' + cert.id + '">' +
      (cert.status === 'generated' ? 'Regenerate PDF' : 'Generate PDF') + '</button>';
    actions += '</div>';
    if (cert.error_message) {
      actions += '<div class="muted" style="margin-top:6px;max-width:220px;font-size:11px;">' + esc(cert.error_message) + '</div>';
    }

    return (
      '<tr data-row-id="' + cert.id + '">' +
      '<td class="mono">' + esc(cert.order_number) + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + esc(cert.design_name || '—') + '</td>' +
      '<td class="mono">' + pad(cert.certificate_number, cert.edition_total) + '</td>' +
      '<td><span class="status-pill status-' + cert.status + '">' + statusLabel(cert.status) + '</span></td>' +
      '<td>' + certCell + '</td>' +
      '<td>' + actions + '</td>' +
      '</tr>'
    );
  }

  async function loadCertificates() {
    var params = new URLSearchParams();
    if (state.status) params.set('status', state.status);
    if (state.product) params.set('design', state.product);
    if (state.search) params.set('search', state.search);
    params.set('page', state.page);
    params.set('pageSize', state.pageSize);

    try {
      var r = await api('/certificates?' + params.toString());
      var result = r.json;
      var tbody = document.getElementById('certTableBody');
      tbody.innerHTML = result.rows.map(renderRow).join('') ||
        '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px;">No certificates match these filters.</td></tr>';

      var totalPages = Math.max(1, Math.ceil(result.total / state.pageSize));
      document.getElementById('pageInfo').textContent = 'Page ' + state.page + ' of ' + totalPages + ' — ' + result.total + ' total';
      document.getElementById('prevPage').disabled = state.page <= 1;
      document.getElementById('nextPage').disabled = state.page >= totalPages;
    } catch (err) {
      toast('Could not load certificates: ' + err.message, true);
    }
  }

  function refreshAll() {
    loadStats();
    loadCertificates();
    loadDesigns();
  }

  // ------------------------------------------------------------ actions --
  document.getElementById('certTableBody').addEventListener('click', async function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id ? Number(btn.dataset.id) : null;

    if (action === 'edit') {
      state.editingId = id;
      loadCertificates();
      return;
    }
    if (action === 'cancel-edit') {
      state.editingId = null;
      loadCertificates();
      return;
    }
    if (action === 'save-name') {
      var row = btn.closest('tr');
      var first = row.querySelector('.edit-first').value.trim();
      var last = row.querySelector('.edit-last').value.trim();
      if (!first) { toast('First name is required.', true); return; }
      btn.disabled = true;
      try {
        await api('/certificates/' + id, { method: 'PATCH', body: { customerFirstName: first, customerLastName: last } });
        toast('Name updated. Click "Regenerate PDF" to get a corrected certificate.');
        state.editingId = null;
        loadCertificates();
      } catch (err) {
        toast('Could not save name: ' + err.message, true);
        btn.disabled = false;
      }
      return;
    }
    if (action === 'regenerate') {
      btn.disabled = true;
      btn.textContent = 'Generating…';
      try {
        await api('/certificates/' + id + '/regenerate', { method: 'POST' });
        toast('Certificate PDF is ready.');
        loadCertificates();
        loadStats();
      } catch (err) {
        toast('Generation failed: ' + err.message, true);
        btn.disabled = false;
        btn.textContent = 'Regenerate PDF';
      }
      return;
    }
  });

  // ------------------------------------------------------- issue form ---
  var issueForm = document.getElementById('issueForm');
  var issueSubmit = document.getElementById('issueSubmit');
  var issueStatus = document.getElementById('issueStatus');
  var issueError = document.getElementById('issueError');

  issueForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    issueError.textContent = '';

    var body = {
      orderNumber: document.getElementById('f_orderNumber').value.trim(),
      designName: document.getElementById('f_designName').value,
      customerFirstName: document.getElementById('f_firstName').value.trim(),
      customerLastName: document.getElementById('f_lastName').value.trim(),
      customerEmail: document.getElementById('f_email').value.trim(),
      certificateNumber: Number(document.getElementById('f_certNumber').value),
    };
    var editionTotalVal = document.getElementById('f_editionTotal').value;
    if (editionTotalVal) body.editionTotal = Number(editionTotalVal);

    if (!body.designName) { issueError.textContent = 'Choose a design.'; return; }
    if (!body.certificateNumber) { issueError.textContent = 'Enter a certificate number.'; return; }

    issueSubmit.disabled = true;
    issueStatus.textContent = 'Generating certificate PDF…';

    try {
      var r = await api('/certificates', { method: 'POST', body: body });
      if (r.status === 207) {
        // row created but PDF generation failed
        toast('Certificate record created, but PDF generation failed: ' + (r.json.error || 'unknown error'), true);
      } else {
        var url = r.json.job && r.json.job.certificate_url;
        toast('Certificate ready. Scroll down to download it and attach it to your email.');
        if (url) window.open(url, '_blank');
      }
      issueForm.reset();
      issueStatus.textContent = '';
      refreshAll();
    } catch (err) {
      if (err.status === 409) {
        issueError.textContent = err.message; // duplicate certificate number for this design
      } else {
        issueError.textContent = 'Could not issue certificate: ' + err.message;
      }
      issueStatus.textContent = '';
    } finally {
      issueSubmit.disabled = false;
    }
  });

  // ------------------------------------------------------------ filters --
  document.getElementById('filterApply').addEventListener('click', function () {
    state.status = document.getElementById('statusFilter').value;
    state.product = document.getElementById('productFilter').value;
    state.search = document.getElementById('searchInput').value.trim();
    state.page = 1;
    loadCertificates();
  });
  document.getElementById('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('filterApply').click();
  });

  document.getElementById('prevPage').addEventListener('click', function () {
    if (state.page > 1) { state.page -= 1; loadCertificates(); }
  });
  document.getElementById('nextPage').addEventListener('click', function () {
    state.page += 1; loadCertificates();
  });

  document.getElementById('refreshBtn').addEventListener('click', refreshAll);

  // ------------------------------------------------------- auto-refresh --
  function startAutoRefresh() {
    stopAutoRefresh();
    state.autoRefreshTimer = setInterval(function () {
      if (state.editingId === null) refreshAll();
    }, 15000);
  }
  function stopAutoRefresh() {
    if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
  document.getElementById('autoRefreshToggle').addEventListener('change', function (e) {
    if (e.target.checked) startAutoRefresh(); else stopAutoRefresh();
  });

  // ------------------------------------------------------------- boot ---
  function boot() {
    showModeBadge();
    refreshAll();
    startAutoRefresh();
  }

  (async function init() {
    if (!getToken()) { showTokenGate(''); return; }
    try {
      await api('/meta');
      showApp();
      boot();
    } catch (err) {
      // showTokenGate already called by api() on 401
    }
  })();
})();
