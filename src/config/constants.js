/**
 * Configuration constants for Microsoft OAuth2 and Graph API
 */

export const ENDPOINTS = {
  // Microsoft Identity Platform token endpoint for personal (MSA) and organizational (AAD) accounts
  TOKEN_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  // Microsoft Graph API base URL
  GRAPH_BASE_URL: 'https://graph.microsoft.com/v1.0'
};

export const DEFAULTS = {
  // Scopes requested (Mail.Read + offline_access for refresh tokens)
  SCOPES: 'https://graph.microsoft.com/Mail.Read offline_access',
  // Timeout for individual HTTP requests (milliseconds)
  REQUEST_TIMEOUT_MS: 15000,
  // Concurrency limit for batch processing
  CONCURRENCY: 5,
  // Default mail folder to inspect
  MAIL_FOLDER: 'inbox',
  // Default number of latest emails to retrieve per account
  TOP_EMAILS: 1,
  // Polling interval when waiting for fresh OTP (milliseconds)
  POLL_INTERVAL_MS: 3000,
  // Maximum duration to wait when polling for fresh OTP (milliseconds)
  WAIT_TIMEOUT_MS: 60000,
  // Maximum retry attempts for transient errors
  MAX_RETRIES: 3,
  // Initial retry delay for exponential backoff (milliseconds)
  INITIAL_RETRY_DELAY_MS: 1000
};

/**
 * OTP Regular Expression Patterns
 * Arranged by priority / confidence level.
 */
export const OTP_PATTERNS = {
  // Prefix-tagged codes (e.g., G-123456, M-123456)
  PREFIXED_CODE: /\b([A-Z]-[0-9]{4,8})\b/i,

  // Contextual phrases: "verification code is: 123456", "authentication code 84920192", "OTP: 987654", "passcode is 4920"
  CONTEXTUAL_CODE: /(?:verification\s*code|security\s*code|one[- ]time\s*(?:passcode|password|code)|confirmation\s*code|auth(?:entication)?\s*code|passcode|secret\s*code|pin|otp|code|c[oó]digo\s*(?:de\s*verificaci[oó]n)?)(?:\s+is)?[:\s\t\n\r\-]+(?:[a-zA-Z]-)?([0-9]{4,8})\b/i,

  // Numbers highlighted in HTML tags like <strong>123456</strong>, <h1>849201</h1>, or <span style="...">381940</span>
  HTML_HIGHLIGHTED: /<(?:strong|b|h[1-6]|span)[^>]*?>\s*([0-9]{4,8})\s*<\/(?:strong|b|h[1-6]|span)>/i,

  // Generic 4 to 8 digit word boundary pattern (fallback)
  GENERIC_DIGITS: /\b([0-9]{4,8})\b/g
};

// Context keywords that indicate OTP relevance
export const OTP_CONTEXT_KEYWORDS = [
  'code',
  'otp',
  'verification',
  'verify',
  'security',
  'confirm',
  'confirmation',
  'passcode',
  'password',
  'pin',
  'one-time',
  'auth',
  'login',
  'signin',
  'sign-in'
];
