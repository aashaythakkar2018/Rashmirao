/*
 * Renders a Certificate of Authenticity PDF in the browser.
 *
 * The certificate is template/certificate.html + certificate.css - the same
 * files the old Puppeteer service used - laid out at A4 landscape in an
 * off-screen iframe (so its page-level CSS can't touch the dashboard),
 * captured with html2canvas and placed full-bleed on an A4 jsPDF page.
 *
 *   RhytaraCertRender.renderPdf(cert, design) -> Promise<Blob>
 *
 * `cert` is a certificates row; nothing on it is recomputed - the edition
 * number and SKU print exactly as recorded.
 */
window.RhytaraCertRender = (function () {
  'use strict';

  var BASE = new URL('./', document.currentScript.src).href;
  var HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  // certificate.css already falls back to these when Didot / Baskerville
  // aren't installed (anything but a Mac); loading them keeps it consistent.
  var FONTS = 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital@0;1&family=Playfair+Display:ital@0;1&display=block';
  // No signature file yet: the line prints blank for a hand signature.
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var ARTIST_NAME = 'Rashmi Rao';
  var MEDIUM = 'Limited-edition wearable art saree, georgette satin';
  var PAGE_PX = { w: 1123, h: 794 }; // 297 x 210 mm at 96 dpi
  var SCALE = 2.5;

  var templatePromise = null;
  function loadTemplate() {
    if (!templatePromise) {
      templatePromise = Promise.all([
        fetch(BASE + 'template/certificate.html').then(text),
        fetch(BASE + 'template/certificate.css').then(text),
      ]).catch(function (err) {
        templatePromise = null;
        throw err;
      });
    }
    return templatePromise;
  }
  function text(res) {
    if (!res.ok) throw new Error('Could not load the certificate template (HTTP ' + res.status + ')');
    return res.text();
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 37 + 250 -> "037/250" */
  function formatEdition(n, total) {
    return String(n).padStart(String(total).length, '0') + '/' + total;
  }

  /** Date of first issue, so a regenerated PDF keeps its original date. */
  function formatIssueDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function templateData(cert, design) {
    var collection = (design && design.collection) || "Nature's Rhythm";
    var code = (design && design.code) || cert.design_code;
    var name = [cert.customer_first_name, cert.customer_last_name].filter(Boolean).join(' ').trim() || 'Valued Collector';
    var textValues = {
      collection_name: collection + ' Collection',
      design_name: cert.design_name,
      edition_number: formatEdition(cert.certificate_number, cert.edition_total),
      edition_total: String(cert.edition_total),
      sku: cert.sku || '',
      artist_name: ARTIST_NAME,
      medium: MEDIUM,
      origin: 'From ' + ARTIST_NAME + "'s original artwork, " + collection + ' solo exhibition',
      customer_full_name: name,
      order_number: cert.order_number,
      issue_date: formatIssueDate(cert.created_at),
    };
    var data = {};
    Object.keys(textValues).forEach(function (k) { data[k] = esc(textValues[k]); });
    data.sku_row_class = cert.sku ? '' : 'is-hidden';
    data.signature_url = BLANK;
    return Promise.all([
      dataUri('assets/rhytara-logo.png'),
      dataUri('assets/ornament-crown.png'),
      dataUri('assets/ornament-corner.png'),
      dataUri('assets/artwork/' + encodeURIComponent(code) + '.jpg'),
    ]).then(function (uris) {
      data.logo_url = uris[0];
      data.crown_url = uris[1];
      data.corner_url = uris[2];
      data.artwork_image_url = uris[3];
      return data;
    });
  }

  /*
   * Images are inlined as data URIs, as the old service did: the srcdoc
   * frame has an opaque origin, so html2canvas would otherwise treat every
   * linked image as cross-origin and leave it out.
   */
  var uriCache = {};
  function dataUri(path) {
    if (!uriCache[path]) {
      uriCache[path] = fetch(BASE + path)
        .then(function (res) {
          if (!res.ok) throw new Error('Could not load ' + path.split('/').pop() + ' for the certificate.');
          return res.blob();
        })
        .then(function (blob) {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(blob);
          });
        })
        .catch(function (err) {
          delete uriCache[path];
          throw err;
        });
    }
    return uriCache[path];
  }

  function buildDocument(html, css, data) {
    var filled = html.replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '';
    });
    return filled.replace(
      '<link rel="stylesheet" href="certificate.css" />',
      '<link rel="stylesheet" href="' + FONTS + '" />' +
        '<style>' + css + '</style>' +
        '<script src="' + HTML2CANVAS + '"></script>'
    );
  }

  function mountFrame(doc) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText =
        'position:fixed;left:-20000px;top:0;border:0;visibility:hidden;' +
        'width:' + PAGE_PX.w + 'px;height:' + PAGE_PX.h + 'px;';
      var timer = setTimeout(function () {
        frame.remove();
        reject(new Error('The certificate template took too long to load.'));
      }, 30000);
      frame.onload = function () {
        clearTimeout(timer);
        resolve(frame);
      };
      frame.srcdoc = doc;
      document.body.appendChild(frame);
    });
  }

  async function renderPdf(cert, design) {
    if (!window.jspdf) throw new Error('The PDF library did not load. Check the connection and reload.');
    var parts = await loadTemplate();
    var data = await templateData(cert, design);
    var frame = await mountFrame(buildDocument(parts[0], parts[1], data));
    try {
      var win = frame.contentWindow;
      var doc = frame.contentDocument;
      if (!win.html2canvas) throw new Error('The image library did not load. Check the connection and reload.');
      await doc.fonts.ready;
      var images = Array.prototype.slice.call(doc.images);
      await Promise.all(images.map(function (img) {
        return img.decode().catch(function () {
          throw new Error('A certificate image could not be read. Reload and try again.');
        });
      }));

      var canvas = await win.html2canvas(doc.querySelector('.certificate'), {
        scale: SCALE,
        backgroundColor: '#f3efe6',
        logging: false,
        width: PAGE_PX.w,
        height: PAGE_PX.h,
        windowWidth: PAGE_PX.w,
        windowHeight: PAGE_PX.h,
      });

      var pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      pdf.setProperties({
        title: 'Rhytara Certificate of Authenticity - ' + cert.design_name + ' ' + formatEdition(cert.certificate_number, cert.edition_total),
        author: 'Rhytara',
        subject: 'Certificate of Authenticity',
      });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
      return pdf.output('blob');
    } finally {
      frame.remove();
    }
  }

  return { renderPdf: renderPdf, formatEdition: formatEdition };
})();
