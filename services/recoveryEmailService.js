const nodemailer = require("nodemailer");
function configuration() {
  let origin;
  try { origin = new URL(process.env.PASSWORD_RESET_ORIGIN || ""); }
  catch { throw Object.assign(new Error("Invalid recovery origin"), { code: "RECOVERY_ORIGIN_INVALID" }); }
  if (process.env.NODE_ENV === "production" && origin.protocol === "http:") {
    throw Object.assign(new Error("Recovery origin requires HTTPS in production"), { code: "RECOVERY_HTTPS_REQUIRED" });
  }
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
      !["http:", "https:"].includes(origin.protocol) ||
      (process.env.NODE_ENV === "production" && origin.protocol !== "https:")) {
    throw Object.assign(new Error("Invalid recovery origin"), { code: "RECOVERY_ORIGIN_INVALID" });
  }
  const port = Number(process.env.SMTP_PORT);
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || /[\r\n]/.test(process.env.SMTP_FROM) ||
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) {
    throw Object.assign(new Error("Missing SMTP configuration"), { code: "RECOVERY_SMTP_INVALID" });
  }
  return { origin: origin.origin, port };
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function sendResetEmail(email, token) {
  const { origin, port } = configuration();
  // Fragment is never sent to HTTP servers or included in Referer headers.
  const url = `${origin}/reset-password#token=${token}`;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port,
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.NODE_ENV === "production" && process.env.SMTP_SECURE !== "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // Match the independently verified SMTP profile. A short HTTP response does not
    // imply a short SMTP handshake or final message acknowledgement.
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    logger: false, debug: false,
  });
  const result = await transport.sendMail({
    from: process.env.SMTP_FROM, to: email, subject: "Redefina sua senha do MiqFlix",
    text: `Recebemos uma solicitação para redefinir sua senha do MiqFlix. Acesse: ${url}\nO link expira em 30 minutos e só pode ser usado uma vez. Se não solicitou a alteração, ignore este e-mail.`,
    html: `<div style="background:#09090d;color:#f5f5f7;padding:32px;font-family:Arial,sans-serif"><h1 style="color:#e50914">MiqFlix</h1><h2>Redefina sua senha</h2><p>Recebemos uma solicitação para redefinir sua senha.</p><p><a style="display:inline-block;background:#e50914;color:white;padding:14px 20px;border-radius:8px" href="${escapeHtml(url)}">Redefinir senha</a></p><p>O link expira em 30 minutos e só pode ser usado uma vez.</p><p>Se você não fez esta solicitação, ignore este e-mail. Sua senha permanece a mesma.</p></div>`,
  });
  if (!result.accepted?.length || result.rejected?.length) throw new Error("SMTP rejected delivery");
}
module.exports = { configuration, sendResetEmail };
