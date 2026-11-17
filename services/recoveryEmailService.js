const resendClient = require("./resendClient");
const { annotateEmailFailure } = require("./recoveryDiagnostics");
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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey?.trim() || /[\r\n]/.test(apiKey) || !from?.trim() || /[\r\n]/.test(from)) {
    throw Object.assign(new Error("Missing Resend configuration"), { code: "RECOVERY_RESEND_INVALID" });
  }
  return { origin: origin.origin, apiKey, from };
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function sendResetEmail(email, token) {
  let operation = "configuration";
  try {
    const { origin, apiKey, from } = configuration();
    // Fragment is never sent to HTTP servers or included in Referer headers.
    operation = "recovery_link";
    const url = `${origin}/reset-password#token=${token}`;
    operation = "message_build";
    const message = {
      from, to: email, subject: "Redefina sua senha do MiqFlix",
      text: `Recebemos uma solicitação para redefinir sua senha do MiqFlix. Acesse: ${url}\nO link expira em 30 minutos e só pode ser usado uma vez. Se não solicitou a alteração, ignore este e-mail.`,
      html: `<div style="background:#09090d;color:#f5f5f7;padding:32px;font-family:Arial,sans-serif"><h1 style="color:#e50914">MiqFlix</h1><h2>Redefina sua senha</h2><p>Recebemos uma solicitação para redefinir sua senha.</p><p><a style="display:inline-block;background:#e50914;color:white;padding:14px 20px;border-radius:8px" href="${escapeHtml(url)}">Redefinir senha</a></p><p>O link expira em 30 minutos e só pode ser usado uma vez.</p><p>Se você não fez esta solicitação, ignore este e-mail. Sua senha permanece a mesma.</p></div>`,
    };
    operation = "resend_send";
    const result = await resendClient.send(message, apiKey);
    if (result?.error) throw result.error;
    operation = "resend_acceptance";
    if (!result?.data?.id) {
      throw Object.assign(new Error("Resend did not confirm acceptance"), { code: "RESEND_INVALID_RESPONSE" });
    }
  } catch (error) {
    annotateEmailFailure(error, operation);
    throw error;
  }
}
module.exports = { configuration, sendResetEmail };
