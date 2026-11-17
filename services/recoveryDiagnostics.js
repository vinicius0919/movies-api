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
    case "ETIMEDOUT": case "ESOCKET": return "connection_timeout_or_socket";
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
