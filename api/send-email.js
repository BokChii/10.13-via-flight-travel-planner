// Minimal serverless email sender using Resend
// Environment variables required:
// - RESEND_API_KEY: API key for Resend
// - EMAIL_FROM: Verified sender email, e.g., "Via Flight <no-reply@yourdomain.com>"

import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { to, subject, text, attachment } = req.body || {};
    if (!to || !attachment?.base64 || !attachment?.filename) {
      res.status(400).json({ error: 'invalid payload' });
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM || 'Via Flight <no-reply@example.com>';

    const result = await resend.emails.send({
      from,
      to,
      subject: subject || 'Via Flight',
      text: text || '',
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.base64,
          contentType: attachment.contentType || 'application/pdf',
        },
      ],
    });

    res.status(200).json({ ok: true, id: result?.id });
  } catch (e) {
    console.error('send-email error:', e);
    res.status(500).json({ error: 'send failed' });
  }
}


