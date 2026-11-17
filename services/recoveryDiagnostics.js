// Only emit locally defined categories. Never serialize an error, its message,
// stack, query, SMTP response, request body or environment variable values.
const emailFailures = new WeakMap();
const operations = new Set(["configuration", "recovery_link", "smtp_transport", "message_build", "smtp_send", "smtp_acceptance"]);
function annotateEmailFailure(error, operation) {
  if (error && (typeof error === "object" || typeof error === "function") && operations.has(operation)) {
    emailFailures.set(error, operation);
  }
}
function category(error) {
  switch (error?.code) {
    case "RECOVERY_HTTPS_REQUIRED": return "production_https_required";
    case "RECOVERY_ORIGIN_INVALID": return "invalid_recovery_origin";
    case "RECOVERY_SMTP_INVALID": return "invalid_smtp_configuration";
    case 11000: return "database_duplicate_key";
    case 13: return "database_permission_denied";
    case 18: return "database_authentication_failed";
    case "RECOVERY_SMTP_NOT_ACCEPTED": return "smtp_delivery_not_accepted";
    case "EENVELOPE": return "smtp_envelope_rejected";
    case "EMESSAGE": return "smtp_message_rejected";
    case "EPROTOCOL": return "smtp_protocol_error";
    case "EDNS": return "smtp_dns_error";
    case "ESTREAM": return "message_stream_error";
    case "EREQUIRETLS": return "smtp_requiretls_error";
    case "EAUTH": return "smtp_authentication_failed";
    case "ECONNECTION": case "ECONNREFUSED": return "connection_failed";
    case "ETIMEDOUT":
      // Nodemailer exposes a fixed timeoutType; never log its raw error/message.
      switch (error?.timeoutType) {
        case "CONNECT_TIMEOUT": return "smtp_connection_timeout";
        case "UPGRADE_TIMEOUT": return "smtp_tls_timeout";
        case "GREETING_TIMEOUT": return "smtp_greeting_timeout";
        case "SOCKET_TIMEOUT": return "smtp_socket_timeout";
        default: return "smtp_timeout";
      }
    case "ESOCKET": return "smtp_socket_error";
    case "ETLS": return "smtp_tls_error";
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
    const codes = new Set(["EAUTH", "EENVELOPE", "EMESSAGE", "EPROTOCOL", "EDNS", "ESTREAM", "EREQUIRETLS", "ETLS", "ETIMEDOUT", "ESOCKET", "ECONNECTION", "ECONNREFUSED", "RECOVERY_SMTP_NOT_ACCEPTED", "RECOVERY_ORIGIN_INVALID", "RECOVERY_HTTPS_REQUIRED", "RECOVERY_SMTP_INVALID"]);
    const commands = new Set(["CONN", "API", "EHLO", "HELO", "LHLO", "STARTTLS", "AUTH", "AUTH PLAIN", "AUTH LOGIN", "AUTH CRAM-MD5", "AUTH XOAUTH2", "MAIL FROM", "RCPT TO", "DATA", "RSET", "QUIT"]);
    const operation = error && typeof error === "object" ? emailFailures.get(error) : undefined;
    const name = names.has(error?.name) ? error.name : "unknown";
    const code = codes.has(error?.code) ? error.code : "unknown";
    // Only exact commands are allowed. A command containing an address or auth payload is discarded.
    const command = commands.has(error?.command) ? error.command.replaceAll(" ", "_") : "unknown";
    const status = Number.isInteger(error?.responseCode) && error.responseCode >= 100 && error.responseCode <= 599 ? error.responseCode : "unknown";
    details = ` operation=${operation || "unknown"} error_name=${name} code=${code} command=${command} smtp_status=${status}`;
  }
  console.error(`[PASSWORD RECOVERY] ${event} stage=${stage} category=${category(error)}${details}`);
}
module.exports = { logFailure, annotateEmailFailure };
