import nodemailer from "nodemailer";

type Surat = { to: string; subject: string; text: string; html?: string };

/** Send email through SMTP. Without SMTP, the message body is printed to the server log (enough for development). */
export async function sendEmail(surat: Surat) {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    console.log(`
[email:dev] To: ${surat.to}
[email:dev] Subject: ${surat.subject}
[email:dev] ${surat.text}
`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "Harmoni Music Class <no-reply@localhost>",
    to: surat.to,
    subject: surat.subject,
    text: surat.text,
    html: surat.html,
  });
}
