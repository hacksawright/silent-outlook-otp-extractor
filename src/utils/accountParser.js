/**
 * Parser and validator for pipe-delimited account credential strings
 * Format: EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID|RECOVERY_EMAIL
 */

import fs from 'node:fs';
import readline from 'node:readline';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parses a single pipe-delimited account string.
 *
 * @param {string} rawLine - The raw input line
 * @param {number} [lineNumber=1] - Line number in file (for error reporting)
 * @returns {Object|null} Parsed account object or null if blank/comment
 * @throws {Error} If format is invalid or required fields are missing
 */
export function parseAccountLine(rawLine, lineNumber = 1) {
  if (typeof rawLine !== 'string') {
    throw new Error(`Line ${lineNumber}: Expected string input, got ${typeof rawLine}`);
  }

  const trimmed = rawLine.trim();

  // Skip empty lines and comment lines
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null;
  }

  const parts = trimmed.split('|').map((p) => p.trim());

  let email = '';
  let password = '';
  let refreshToken = '';
  let clientId = '';
  let recoveryEmail = '';

  if (parts.length >= 5) {
    // Standard format: EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID|RECOVERY_EMAIL
    [email, password, refreshToken, clientId, recoveryEmail] = parts;
  } else if (parts.length === 4) {
    // EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID
    [email, password, refreshToken, clientId] = parts;
  } else if (parts.length === 3) {
    // EMAIL|REFRESH_TOKEN|CLIENT_ID
    [email, refreshToken, clientId] = parts;
  } else {
    throw new Error(
      `Line ${lineNumber}: Invalid format. Expected at least 3 pipe-separated fields (EMAIL|REFRESH_TOKEN|CLIENT_ID), got ${parts.length} fields.`
    );
  }

  // Validate Email
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new Error(`Line ${lineNumber}: Invalid or missing email address: "${email}"`);
  }

  // Validate Refresh Token
  if (!refreshToken) {
    throw new Error(`Line ${lineNumber}: Missing OAuth2 refresh_token for ${email}`);
  }

  // Validate Client ID
  if (!clientId) {
    throw new Error(`Line ${lineNumber}: Missing OAuth2 client_id for ${email}`);
  }

  return {
    email,
    password: password || null,
    refreshToken,
    clientId,
    recoveryEmail: recoveryEmail || null,
    rawLine: trimmed,
    lineNumber
  };
}

/**
 * Reads and parses an entire accounts text file line by line.
 *
 * @param {string} filePath - Path to .txt file
 * @returns {Promise<{ accounts: Array<Object>, errors: Array<Object> }>}
 */
export async function parseAccountFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Accounts file not found: ${filePath}`);
  }

  const accounts = [];
  const errors = [];
  let lineCount = 0;

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    lineCount++;
    try {
      const parsed = parseAccountLine(line, lineCount);
      if (parsed) {
        accounts.push(parsed);
      }
    } catch (err) {
      errors.push({
        lineNumber: lineCount,
        lineContent: line,
        error: err.message
      });
    }
  }

  return { accounts, errors, totalLines: lineCount };
}
