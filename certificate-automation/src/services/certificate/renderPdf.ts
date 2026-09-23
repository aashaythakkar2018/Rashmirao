import fs from 'fs';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer';
import { paths } from '../../config/env';
import { renderTemplate } from '../../utils/renderTemplate';
import { CertificateTemplateData } from './templateData';

let browserPromise: Promise<Browser> | null = null;

/**
 * Puppeteer launches a browser process, which is expensive - reuse a single
 * headless instance across requests instead of spawning one per
 * certificate. It's created lazily on first use.
 */
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

/**
 * Renders templates/certificate.html (+ certificate.css inlined) with the
 * given data into a PDF buffer. HTML/CSS stay in /templates, separate from
 * this application logic, per spec section 8.
 */
export async function renderCertificatePdf(data: CertificateTemplateData): Promise<Buffer> {
  const htmlTemplate = fs.readFileSync(path.join(paths.templates, 'certificate.html'), 'utf-8');
  const css = fs.readFileSync(path.join(paths.templates, 'certificate.css'), 'utf-8');

  const html = renderTemplate(htmlTemplate, data as unknown as Record<string, string>).replace(
    '<link rel="stylesheet" href="certificate.css" />',
    `<style>${css}</style>`
  );

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
