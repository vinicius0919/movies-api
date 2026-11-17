// Only emit locally defined categories. Never serialize an error, its message,
// stack, query, SMTP response, request body or environment variable values.
const emailFailures = new WeakMap();
const operations = new Set(["configuration", "recovery_link", "message_build", "resend_send", "resend_acceptance"]);
function annotateEmailFailure(error, operation) {
  if (error && (typeof error === "object" || typeof error === "function") && operations.has(operation)) {
    emailFailures.set(error, operation);
  }
}
function category(error) {
  switch (error?.code) {
    case "RECOVERY_HTTPS_REQUIRED": return "production_https_required";
    case "RECOVERY_ORIGIN_INVALID": return "invalid_recovery_origin";
    case "RECOVERY_RESEND_INVALID": return "invalid_resend_configuration";
    case "RESEND_CONNECTION": return "resend_connection_failed";
    case "RESEND_TIMEOUT": return "resend_timeout";
    case "RESEND_AUTHENTICATION": return "resend_authentication_failed";
    case "RESEND_DOMAIN_UNVERIFIED": return "resend_domain_unverified";
    case "RESEND_RECIPIENT_UNAUTHORIZED": return "resend_recipient_unauthorized";
    case "RESEND_FORBIDDEN": return "resend_permission_denied";
    case "RESEND_RATE_LIMIT": return "resend_rate_limited";
    case "RESEND_UNAVAILABLE": return "resend_unavailable";
    case "RESEND_REJECTED": return "resend_request_rejected";
    case "RESEND_INVALID_RESPONSE": return "resend_invalid_response";
    case 11000: return "database_duplicate_key";
    case 13: return "database_permission_denied";
    case 18: return "database_authentication_failed";

  }
  switch (error?.name) {
    case "MongoServerError": return "database_server_error";
    case "MongoNetworkError": case "MongoServerSelectionError": return "database_connection_failed";
    case "ValidationError": case "CastError": return "database_validation_failed";
    default: return "unexpected_failure";
  }
}
function logFailure(event, stage, error) {
  let details = "";
  if (process.env.PASSWORD_RECOVERY_DIAGNOSTICS === "true" && stage === "email_delivery") {
    const names = new Set(["Error", "TypeError", "RangeError", "SyntaxError"]);
    const codes = new Set(["RESEND_CONNECTION", "RESEND_TIMEOUT", "RESEND_AUTHENTICATION", "RESEND_DOMAIN_UNVERIFIED", "RESEND_RECIPIENT_UNAUTHORIZED", "RESEND_FORBIDDEN", "RESEND_RATE_LIMIT", "RESEND_UNAVAILABLE", "RESEND_REJECTED", "RESEND_INVALID_RESPONSE", "RECOVERY_RESEND_INVALID", "RECOVERY_ORIGIN_INVALID", "RECOVERY_HTTPS_REQUIRED"]);
    const operation = error && typeof error === "object" ? emailFailures.get(error) : undefined;
    const name = names.has(error?.name) ? error.name : "unknown";
    const code = codes.has(error?.code) ? error.code : "unknown";
    const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : "unknown";
    details = ` operation=${operation || "unknown"} error_name=${name} code=${code} http_status=${status}`;
  }
  console.error(`[PASSWORD RECOVERY] ${event} stage=${stage} category=${category(error)}${details}`);
}
module.exports = { logFailure, annotateEmailFailure };
