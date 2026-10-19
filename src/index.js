/**
 * Microsoft Outlook OAuth2 OTP Retrieval Service
 * High-performance, lightweight background OTP extractor
 */

import { DEFAULTS } from './config/constants.js';
import { AuthService } from './services/authService.js';
import { MailService } from './services/mailService.js';
import { extractOtp } from './utils/otpExtractor.js';
import { parseAccountLine, parseAccountFile } from './utils/accountParser.js';
import { runWithConcurrency, sleep } from './utils/rateLimiter.js';
import { logger } from './utils/logger.js';
import { cleanHtml, decodeHtmlEntities } from './utils/htmlCleaner.js';

export class OutlookOtpService {
  /**
   * @param {Object} [config]
   * @param {string} [config.tokenEndpoint]
   * @param {string} [config.graphEndpoint]
   * @param {number} [config.requestTimeoutMs]
   */
  constructor(config = {}) {
    this.authService = new AuthService({
      tokenEndpoint: config.tokenEndpoint,
      timeoutMs: config.requestTimeoutMs
    });
    this.mailService = new MailService({
      graphEndpoint: config.graphEndpoint,
      timeoutMs: config.requestTimeoutMs
    });
  }

  /**
   * Retrieves the latest OTP verification code for a single account.
   *
   * @param {string|Object} accountInput - Raw pipe-delimited string or parsed account object
   * @param {Object} [options]
   * @param {number} [options.top=1] - Number of emails to inspect
   * @param {string} [options.folder='inbox'] - Mail folder name
   * @param {string} [options.since] - ISO timestamp filter
   * @param {string} [options.search] - Search keyword filter
   * @returns {Promise<Object>} Retrieval result
   */
  async getOtpForAccount(accountInput, options = {}) {
    const account = typeof accountInput === 'string' ? parseAccountLine(accountInput) : accountInput;

    if (!account || !account.email || !account.refreshToken || !account.clientId) {
      throw new Error('Invalid account payload: email, refreshToken, and clientId are required');
    }

    const { top = DEFAULTS.TOP_EMAILS, folder = DEFAULTS.MAIL_FOLDER, since, search } = options;

    try {
      // 1. Refresh OAuth2 access token
      logger.debug(`[${account.email}] Authenticating via OAuth2 refresh token...`);
      const auth = await this.authService.refreshAccessToken({
        clientId: account.clientId,
        refreshToken: account.refreshToken
      });

      // 2. Fetch latest inbox email(s) via Graph API
      logger.debug(`[${account.email}] Fetching latest message from folder "${folder}"...`);
      const messages = await this.mailService.getLatestMessages({
        accessToken: auth.accessToken,
        top,
        folder,
        since,
        search
      });

      if (!messages || messages.length === 0) {
        return {
          success: false,
          email: account.email,
          otp: null,
          confidence: 'NONE',
          error: 'No emails found in mailbox matching criteria',
          subject: null,
          sender: null,
          receivedAt: null,
          newRefreshToken: auth.newRefreshToken
        };
      }

      // 3. Scan messages for OTP
      let bestResult = null;

      const scannedList = messages.map((m) => ({
        id: m.id,
        subject: m.subject || '(No subject)',
        sender: m.from?.address || 'Unknown',
        senderName: m.from?.name || '',
        receivedDateTime: m.receivedDateTime
      }));

      for (const msg of messages) {
        const extraction = extractOtp({
          subject: msg.subject,
          body: msg.body.content,
          contentType: msg.body.contentType
        });

        if (extraction.success) {
          bestResult = {
            success: true,
            email: account.email,
            otp: extraction.otp,
            confidence: extraction.confidence,
            matchedPattern: extraction.matchedPattern,
            subject: msg.subject,
            sender: msg.from?.address,
            senderName: msg.from?.name,
            receivedAt: msg.receivedDateTime,
            bodySnippet: extraction.contextSnippet,
            allCandidates: extraction.allCandidates,
            newRefreshToken: auth.newRefreshToken,
            messageId: msg.id,
            scannedMessages: scannedList
          };
          break; // Found OTP
        }

        // If not found, save first message as fallback context
        if (!bestResult) {
          bestResult = {
            success: false,
            email: account.email,
            otp: null,
            confidence: 'NONE',
            matchedPattern: 'none',
            subject: msg.subject,
            sender: msg.from?.address,
            senderName: msg.from?.name,
            receivedAt: msg.receivedDateTime,
            bodySnippet: null,
            allCandidates: [],
            newRefreshToken: auth.newRefreshToken,
            messageId: msg.id,
            error: 'No OTP found in scanned email(s)',
            scannedMessages: scannedList
          };
        }
      }

      if (bestResult) {
        bestResult.scannedMessages = scannedList;
      }

      return bestResult;
    } catch (err) {
      return {
        success: false,
        email: account.email,
        otp: null,
        confidence: 'NONE',
        error: err.message || String(err),
        subject: null,
        sender: null,
        receivedAt: null,
        newRefreshToken: null
      };
    }
  }

  /**
   * Polls the mailbox until an OTP email arrives or timeout is reached.
   *
   * @param {string|Object} accountInput
   * @param {Object} [options]
   * @param {number} [options.waitTimeoutMs=60000] - Max time to wait in ms
   * @param {number} [options.pollIntervalMs=3000] - Time between checks in ms
   * @param {string} [options.since] - ISO timestamp to only check new emails
   * @param {string} [options.search] - Sender or keyword filter
   * @returns {Promise<Object>}
   */
  async waitForOtp(accountInput, options = {}) {
    const account = typeof accountInput === 'string' ? parseAccountLine(accountInput) : accountInput;
    const waitTimeoutMs = options.waitTimeoutMs || DEFAULTS.WAIT_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs || DEFAULTS.POLL_INTERVAL_MS;
    const startTime = Date.now();
    const sinceTime = options.since || new Date(startTime - 60000).toISOString();

    logger.info(`[${account.email}] Polling for incoming OTP (Timeout: ${waitTimeoutMs / 1000}s)...`);

    while (Date.now() - startTime < waitTimeoutMs) {
      const result = await this.getOtpForAccount(account, {
        top: options.top || 1,
        folder: options.folder || 'inbox',
        since: sinceTime,
        search: options.search
      });

      if (result.success && result.otp) {
        logger.otp(account.email, result.otp, result);
        return result;
      }

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      logger.debug(`[${account.email}] No OTP yet (${elapsedSec}s elapsed). Retrying in ${pollIntervalMs / 1000}s...`);

      await sleep(pollIntervalMs);
    }

    return {
      success: false,
      email: account.email,
      otp: null,
      confidence: 'NONE',
      error: `Timed out after ${waitTimeoutMs / 1000}s waiting for OTP`,
      subject: null,
      sender: null,
      receivedAt: null
    };
  }

  /**
   * Batch processes a list of accounts with concurrency control.
   *
   * @param {Array<Object|string>} accounts - Array of account objects or raw strings
   * @param {Object} [options]
   * @param {number} [options.concurrency=5] - Number of concurrent accounts
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Array<Object>>}
   */
  async processAccounts(accounts, options = {}) {
    const concurrency = options.concurrency || DEFAULTS.CONCURRENCY;

    const worker = async (account) => {
      const res = await this.getOtpForAccount(account, options);
      if (res.success && res.otp) {
        logger.otp(res.email, res.otp, res);
      } else {
        logger.warn(`[${res.email}] ${res.error || 'No OTP retrieved'}`);
      }
      return res;
    };

    return runWithConcurrency(accounts, concurrency, worker, {
      onProgress: options.onProgress
    });
  }

  /**
   * Reads, parses, and processes an entire accounts text file.
   *
   * @param {string} filePath - Path to file
   * @param {Object} [options]
   * @returns {Promise<{ summary: Object, results: Array<Object>, parseErrors: Array<Object> }>}
   */
  async processFile(filePath, options = {}) {
    logger.info(`Reading accounts file: ${filePath}`);
    const { accounts, errors: parseErrors } = await parseAccountFile(filePath);

    if (parseErrors.length > 0) {
      logger.warn(`Found ${parseErrors.length} malformed lines in ${filePath}`);
    }

    logger.info(`Processing ${accounts.length} valid accounts with concurrency = ${options.concurrency || DEFAULTS.CONCURRENCY}...`);

    const results = await this.processAccounts(accounts, options);

    const successful = results.filter((r) => r.success && r.otp).length;
    const failed = results.length - successful;

    return {
      summary: {
        totalAccounts: accounts.length,
        successfulOtps: successful,
        failedOrNoOtp: failed,
        parseErrorsCount: parseErrors.length
      },
      results,
      parseErrors
    };
  }
}

// Re-exports
export {
  AuthService,
  MailService,
  extractOtp,
  cleanHtml,
  decodeHtmlEntities,
  parseAccountLine,
  parseAccountFile,
  runWithConcurrency,
  logger,
  DEFAULTS
};
