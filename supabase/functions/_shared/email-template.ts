export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[char] as string))

type BrandedEmailOptions = {
  preheader: string
  eyebrow?: string
  title: string
  body: string
  actionUrl?: string
  actionLabel?: string
  code?: string
  codeLabel?: string
  footer: string
}

export const renderBrandedEmail = ({
  preheader,
  eyebrow = 'Música conecta pessoas',
  title,
  body,
  actionUrl,
  actionLabel,
  code,
  codeLabel = 'Código de segurança',
  footer,
}: BrandedEmailOptions) => {
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>')
  const button = actionUrl && actionLabel
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 0"><tr><td bgcolor="#e8b65d" style="border-radius:10px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 24px;color:#071426;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px">${escapeHtml(actionLabel)} &nbsp;→</a></td></tr></table>`
    : ''
  const codeBlock = code
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px"><tr><td style="padding:18px;background:#07101f;border:1px solid #263750;border-radius:12px"><p style="margin:0 0 8px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">${escapeHtml(codeLabel)}</p><p style="margin:0;color:#f4c76f;font-family:Consolas,Monaco,monospace;font-size:23px;font-weight:700;letter-spacing:5px;text-align:center">${escapeHtml(code)}</p></td></tr></table>`
    : ''

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#050b15;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#050b15">
    <tr><td align="center" style="padding:34px 14px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
        <tr><td style="padding:0 4px 22px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td valign="middle"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:13px"><span style="display:inline-block;color:#e8b65d;font-size:29px;line-height:1">▮▮▮</span></td><td><p style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700">Mercado do <span style="color:#e8b65d">Compositor</span></p><p style="margin:3px 0 0;color:#718096;font-size:9px;letter-spacing:2px;text-transform:uppercase">Canções encontram vozes</p></td></tr></table></td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#0a1526;border:1px solid #263750;border-radius:18px;overflow:hidden">
          <div style="height:4px;background:#e8b65d;line-height:4px;font-size:4px">&nbsp;</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:38px 38px 34px">
            <p style="margin:0 0 13px;color:#e8b65d;font-size:10px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase">${escapeHtml(eyebrow)}</p>
            <h1 style="margin:0 0 18px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:700">${escapeHtml(title)}</h1>
            <p style="margin:0;color:#cbd5e1;font-size:15px;line-height:1.75">${safeBody}</p>
            ${button}${codeBlock}
            <div style="height:1px;background:#263750;margin:32px 0 20px"></div>
            <p style="margin:0;color:#7f8da3;font-size:11px;line-height:1.65">${escapeHtml(footer)}</p>
          </td></tr></table>
        </td></tr>
        <tr><td align="center" style="padding:22px 20px 0"><p style="margin:0;color:#526078;font-size:10px;line-height:1.6">© ${new Date().getUTCFullYear()} Mercado do Compositor<br>Esta é uma mensagem automática. Não responda a este e-mail.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
