// The look of every email Tinkr sends, so emails match the app: white card, hi-vis yellow stripe and button, graphite text.
//
// Email apps (Gmail, Outlook, Apple Mail) are much pickier than web browsers. They ignore most modern styling,
// strip out style sheets, and can't load our Barlow font. So these emails use old-school tricks on purpose:
// tables for layout, styles written directly on each tag ("inline"), and Arial as the font.
//
// Everything passed in here must already be made safe with escapeHtml() in email.ts.

const INK = "#18181b"; // graphite text (Tailwind zinc-900)
const MUTED = "#52525b"; // grey secondary text (zinc-600)
const HIVIS = "#ffc20e"; // hi-vis yellow (our hivis-400)
const PAGE = "#f4f4f5"; // light grey around the card (zinc-100)
const FONT = "Arial, Helvetica, sans-serif";

// One paragraph of body text.
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};">${html}</p>`;
}

// A big, tappable yellow button. It's really a link styled to look like a button, which every email app supports.
export function emailButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
<td style="background:${HIVIS};border-radius:8px;">
<a href="${url}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:16px;font-weight:bold;color:${INK};text-decoration:none;border-radius:8px;">${label}</a>
</td></tr></table>`;
}

// The frame around every email: grey background, a white card with a yellow stripe on top, and a small footer.
// "preview" is the one-line summary many inboxes show next to the subject; it's hidden in the email itself.
export function emailLayout({ preview, body }: { preview: string; body: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="height:6px;background:${HIVIS};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px;">${body}</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">Sent with Tinkr</p>
</td></tr></table>
</body></html>`;
}
