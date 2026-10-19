// Supabase Edge Function: send-certificate
//
// Emails one stored certificate PDF to a customer, from the Rhytara Gmail
// account. Called by the dashboard (rhytara.com/certificates) as the signed-in
// staff member: the certificate row and its PDF are read with that person's
// own token, so the row-level security in supabase-setup.sql decides access -
// anyone not on the staff list gets "not found".
//
// The recipient's address is used for this one email and not stored; the
// send is logged in public.certificate_emails (certificate, sender, time).
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   GMAIL_USER          rhytaracollections@gmail.com
//   GMAIL_APP_PASSWORD  a Google app password for that account
//
// Deployed with JWT verification on, from certificates/functions/.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.14';

const ALLOWED_ORIGINS = ['https://rhytara.com', 'https://www.rhytara.com'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function edition(n: number, total: number): string {
  return `${String(n).padStart(String(total).length, '0')}/${total}`;
}

interface Certificate {
  id: number;
  order_number: string;
  design_name: string;
  certificate_number: number;
  edition_total: number;
  sku: string;
  pdf_path: string;
  created_at: string;
}

function buildEmail(cert: Certificate, firstName: string, note: string) {
  const ed = edition(cert.certificate_number, cert.edition_total);
  const issued = new Date(cert.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const greeting = firstName ? `Dear ${firstName},` : 'Dear Collector,';
  const noteHtml = note
    ? `<p style="font-size:15px;line-height:1.75;margin:0 0 14px;">${esc(note).replace(/\n/g, '<br />')}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Your Rhytara Certificate of Authenticity</title></head>
<body style="margin:0;padding:0;background-color:#f3efe7;font-family:Georgia,'Times New Roman',serif;color:#2a2016;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3efe7;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e4dcc8;max-width:600px;width:100%;">
  <tr><td style="padding:36px 40px 8px;text-align:center;">
    <p style="letter-spacing:0.3em;text-transform:uppercase;font-size:12px;color:#7a5c2e;margin:0 0 4px;">Rhytara</p>
    <p style="letter-spacing:0.08em;text-transform:uppercase;font-size:11px;color:#9a8a68;margin:0;">Nature's Rhythm Collection</p>
  </td></tr>
  <tr><td style="padding:26px 40px 0;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${esc(greeting)}</p>
    <p style="font-size:15px;line-height:1.75;margin:0 0 14px;">
      Thank you for welcoming a piece of Rhytara into your life. Every design in the
      Nature's Rhythm Collection begins as an original painting by Rashmi Rao, long
      before it becomes a saree &mdash; so what you now hold is not simply a garment, but a
      numbered, one-of-a-kind piece of that story.
    </p>
    ${noteHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;border-top:1px solid #eee6d3;border-bottom:1px solid #eee6d3;">
      <tr><td style="padding:14px 0;">
        <p style="font-size:18px;font-style:italic;margin:0 0 4px;">${esc(cert.design_name)}</p>
        <p style="font-size:13px;color:#7a6c52;margin:0;letter-spacing:0.04em;">Edition ${ed} &middot; ${esc(cert.sku)}</p>
      </td></tr>
    </table>
    <p style="font-size:15px;line-height:1.75;margin:0 0 8px;">
      Your Certificate of Authenticity is attached to this email &mdash; it records your
      piece's design, its edition number, and the order it belongs to, as a permanent
      record of provenance.
    </p>
  </td></tr>
  <tr><td style="padding:12px 40px 28px;">
    <p style="font-size:14px;line-height:1.75;margin:0;">
      We're glad you're part of this collection, and we hope this piece brings you as
      much joy to wear as it did to create.
    </p>
    <p style="font-size:14px;line-height:1.75;margin:16px 0 0;">With gratitude,<br /><strong>The Rhytara Team</strong></p>
  </td></tr>
  <tr><td style="padding:0 40px 32px;border-top:1px solid #eee6d3;">
    <p style="font-size:12px;line-height:1.6;color:#8a7a58;margin:20px 0 0;">
      Certificate issued: ${esc(issued)}<br />Order: ${esc(cert.order_number)}
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    greeting,
    '',
    'Thank you for welcoming a piece of Rhytara into your life. Your Certificate of Authenticity is attached to this email.',
    ...(note ? ['', note] : []),
    '',
    `${cert.design_name} - Edition ${ed} - ${cert.sku}`,
    `Certificate issued: ${issued}`,
    `Order: ${cert.order_number}`,
    '',
    'With gratitude,',
    'The Rhytara Team',
  ].join('\n');

  return { subject: `Your Rhytara Certificate of Authenticity - ${cert.design_name} ${ed}`, html, text };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const gmailUser = Deno.env.get('GMAIL_USER');
  const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!gmailUser || !gmailPassword) {
    return reply(503, { error: 'Email sending is not set up yet: add GMAIL_USER and GMAIL_APP_PASSWORD in Supabase.' });
  }

  let body: { certificateId?: unknown; to?: unknown; firstName?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }
  const certificateId = Number(body.certificateId);
  const to = String(body.to ?? '').trim();
  const firstName = String(body.firstName ?? '').trim().slice(0, 100);
  const note = String(body.note ?? '').trim().slice(0, 2000);
  if (!Number.isInteger(certificateId) || certificateId < 1) return reply(400, { error: 'Missing certificate.' });
  if (!EMAIL_PATTERN.test(to) || to.length > 254) return reply(400, { error: 'Enter a valid email address.' });

  // Everything below runs as the caller, under row-level security.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });

  const { data: cert, error: certError } = await sb
    .from('certificates')
    .select('id, order_number, design_name, certificate_number, edition_total, sku, pdf_path, created_at')
    .eq('id', certificateId)
    .maybeSingle<Certificate>();
  if (certError) return reply(500, { error: certError.message });
  if (!cert) return reply(404, { error: 'Certificate not found.' });

  const { data: pdf, error: pdfError } = await sb.storage.from('certificates').download(cert.pdf_path);
  if (pdfError || !pdf) return reply(500, { error: 'Could not read the certificate PDF.' });

  const email = buildEmail(cert, firstName, note);
  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPassword },
    });
    await transport.sendMail({
      from: `Rhytara <${gmailUser}>`,
      replyTo: gmailUser,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [{
        filename: cert.pdf_path.split('/').pop(),
        content: new Uint8Array(await pdf.arrayBuffer()),
        contentType: 'application/pdf',
      }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply(502, {
      error: /Invalid login|Username and Password not accepted|535/i.test(message)
        ? 'Gmail rejected the sign-in. Check GMAIL_APP_PASSWORD in Supabase.'
        : 'The email could not be sent: ' + message,
    });
  }

  const { data: logged } = await sb
    .from('certificate_emails')
    .insert({ certificate_id: cert.id })
    .select('sent_at')
    .single();

  return reply(200, { ok: true, sentAt: logged?.sent_at ?? new Date().toISOString() });
});
