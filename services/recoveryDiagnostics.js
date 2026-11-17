// Only emit locally defined categories. Never serialize an error, its message,
// stack, query, SMTP response, request body or environment variable values.
function category(error) {
  switch (error?.code) {
    case "RECOVERY_HTTPS_REQUIRED": return "production_https_required";
    case "RECOVERY_ORIGIN_INVALID": return "invalid_recovery_origin";
    case "RECOVERY_SMTP_INVALID": return "invalid_smtp_configuration";
    case 11000: return "database_duplicate_key";
    case 13: return "database_permission_denied";
    case 18: return "database_authentication_failed";
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
  console.error(`[PASSWORD RECOVERY] ${event} stage=${stage} category=${category(error)}`);
}
module.exports = { logFailure };
