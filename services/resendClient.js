// Official HTTPS API: https://resend.com/docs/api-reference/emails/send-email
// Normalize provider failures here; raw responses can contain personal data.
function failure(code, status) {
  return Object.assign(new Error("Recovery email delivery failed"), { code, ...(Number.isInteger(status) ? { status } : {}) });
}
function providerFailure(body, status) {
  const message = typeof body?.message === "string" ? body.message.toLowerCase() : "";
  const name = body?.name;
  if (status === 401 || ["missing_api_key", "restricted_api_key", "suspended_api_key", "invalid_api_key"].includes(name) || /api key is invalid/.test(message)) return failure("RESEND_AUTHENTICATION", status);
  // Both documented cases can be validation_error/403; do not classify by status alone.
  if (status === 403 && /only send testing emails to your own email address/.test(message)) return failure("RESEND_RECIPIENT_UNAUTHORIZED", status);
  if (status === 403 && /domain.*(?:is not verified|not verified)/.test(message)) return failure("RESEND_DOMAIN_UNVERIFIED", status);
  if (status === 403) return failure("RESEND_FORBIDDEN", status);
  if (status === 429) return failure("RESEND_RATE_LIMIT", status);
  if (status >= 500) return failure("RESEND_UNAVAILABLE", status);
  return failure("RESEND_REJECTED", status);
}
async function send(message, apiKey) {
  const signal = AbortSignal.timeout(20000);
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    let body;
    try { body = await response.json(); }
    catch (error) {
      if (signal.aborted || ["TimeoutError", "AbortError"].includes(error?.name) || error?.name !== "SyntaxError") throw error;
      return { data: null, error: failure("RESEND_INVALID_RESPONSE", response.status) };
    }
    // Handle both HTTP failures and explicit error results; neither is an accepted send.
    if (!response.ok || body?.error) return { data: null, error: providerFailure(body?.error || body, response.status) };
    if (!body || typeof body.id !== "string" || !body.id.trim()) return { data: null, error: failure("RESEND_INVALID_RESPONSE", response.status) };
    return { data: { id: body.id }, error: null };
  } catch (error) {
    const timeout = signal.aborted || ["TimeoutError", "AbortError"].includes(error?.name) || ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(error?.code || error?.cause?.code);
    return { data: null, error: failure(timeout ? "RESEND_TIMEOUT" : "RESEND_CONNECTION") };
  }
}
module.exports = { send };
