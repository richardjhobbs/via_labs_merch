// Transactional email through Resend (already configured for VIA Labs).
// Every message uses the same branded wrapper as the Supabase sign-in template (web/emails/magic-link.html):
// the VIA Merch stacked mark, one heading, short paragraphs, an optional button, the VIA Labs footer.
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz';

export function brandedHtml({ title, paragraphs, cta, footnote }: { title: string; paragraphs: string[]; cta?: { label: string; url: string }; footnote?: string }) {
  const ps = paragraphs.map((p) => `<p style="margin:12px 0 0 0;font-size:15px;line-height:1.55;color:#3d4944;">${esc(p)}</p>`).join('');
  const button = cta ? `<div style="margin:22px 0 0 0;"><a href="${esc(cta.url)}" style="display:inline-block;background:#0a4a3a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${esc(cta.label)}</a></div>
        <p style="margin:12px 0 0 0;font-size:12.5px;line-height:1.55;color:#6b7772;">Or copy this link: <a href="${esc(cta.url)}" style="color:#0a4a3a;word-break:break-all;">${esc(cta.url)}</a></p>` : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:32px 16px;font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15201c;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e8e5;border-radius:12px;">
      <tr><td style="padding:28px 32px 0 32px;"><img src="${APP}/via-merch-black.png" alt="VIA Merch" width="88" height="56" style="height:56px;width:auto;display:block;"></td></tr>
      <tr><td style="padding:24px 32px 0 32px;"><div style="font-size:20px;font-weight:600;letter-spacing:-.01em;">${esc(title)}</div>${ps}${button}</td></tr>
      <tr><td style="padding:24px 32px 28px 32px;">${footnote ? `<p style="margin:0 0 12px 0;font-size:12.5px;line-height:1.55;color:#6b7772;">${esc(footnote)}</p>` : ''}<p style="margin:0;font-size:12.5px;color:#6b7772;">VIA Labs Pte. Ltd. · <a href="https://getvia.xyz" style="color:#0a4a3a;">getvia.xyz</a> · <a href="mailto:richard@getvia.xyz" style="color:#0a4a3a;">richard@getvia.xyz</a></p></td></tr>
    </table>
  </td></tr>
</table>`;
}

export async function sendMail({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('[mail] RESEND_API_KEY missing; not sent:', subject); return { skipped: true }; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'VIA Merch <merch@getvia.xyz>', to, subject, text, html: html || brandedHtml({ title: subject, paragraphs: text.split(/\n\n+/) }) }),
  });
  if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
