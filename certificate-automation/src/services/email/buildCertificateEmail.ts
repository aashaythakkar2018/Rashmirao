import fs from 'fs';
import path from 'path';
import { paths } from '../../config/env';
import { renderTemplate } from '../../utils/renderTemplate';
import { findDesignForProductTitle } from '../../config/designs';
import { Certificate } from '../../db/certificates';
import { formatEditionNumber } from '../certificate/templateData';

/** Builds the customer email for one issued certificate. */
export function buildCertificateEmailHtml(cert: Certificate): {
  subject: string;
  html: string;
} {
  if (!cert.certificate_url) {
    throw new Error('buildCertificateEmailHtml requires a certificate with a certificate_url');
  }

  const template = fs.readFileSync(path.join(paths.templates, 'email.html'), 'utf-8');
  const design = findDesignForProductTitle(cert.design_name);
  const editionLabel = formatEditionNumber(cert.certificate_number, cert.edition_total);

  const itemHtml = `
    <div style="margin:12px 0 20px;padding:16px 18px;background:#faf6ee;border:1px solid #eee6d3;">
      <p style="font-size:16px;font-weight:bold;margin:0 0 6px;color:#2a2016;">${escapeHtml(cert.design_name)}</p>
      <p style="font-size:13px;margin:0;color:#6b5a3e;">Edition: <strong>${escapeHtml(editionLabel)}</strong></p>
      ${design?.story ? `<p style="font-size:13px;line-height:1.6;font-style:italic;color:#4a3a22;margin:10px 0 0;">${escapeHtml(design.story)}</p>` : ''}
    </div>`;

  const buttonHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
      <tr>
        <td style="border-radius:4px;background-color:#4a3418;">
          <a href="${cert.certificate_url}" style="display:inline-block;padding:14px 28px;font-family:Georgia,serif;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
            Download Your Certificate of Authenticity
          </a>
        </td>
      </tr>
    </table>
    <p style="font-size:11px;color:#9a8a68;margin:0 0 20px;word-break:break-all;">
      ${cert.certificate_url}
    </p>`;

  const html = renderTemplate(template, {
    customer_first_name: cert.customer_first_name || 'there',
    customer_full_name: [cert.customer_first_name, cert.customer_last_name].filter(Boolean).join(' '),
    collection_name: design?.collection ?? "Nature's Rhythm",
    certificate_items_html: itemHtml,
    download_buttons_html: buttonHtml,
    plural_suffix: '',
    is_are: 'is',
    issue_date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    order_number: cert.order_number,
  });

  return {
    subject: 'Your Rhytara Certificate of Authenticity',
    html,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
