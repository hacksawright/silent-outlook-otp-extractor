/**
 * Microsoft Graph API Mail Service
 * Directly retrieves inbox messages without browser interaction
 */

import { ENDPOINTS, DEFAULTS } from '../config/constants.js';
import { withRetry } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

export class MailService {
  /**
   * @param {Object} [config]
   * @param {string} [config.graphEndpoint]
   * @param {number} [config.timeoutMs]
   */
  constructor(config = {}) {
    this.graphEndpoint = config.graphEndpoint || ENDPOINTS.GRAPH_BASE_URL;
    this.timeoutMs = config.timeoutMs || DEFAULTS.REQUEST_TIMEOUT_MS;
  }

  /**
   * Fetches latest messages from the specified mail folder.
   *
   * @param {Object} params
   * @param {string} params.accessToken - Valid OAuth2 Bearer token
   * @param {number} [params.top=1] - Number of messages to retrieve
   * @param {string} [params.folder='inbox'] - Target folder name (e.g. 'inbox', 'junkemail')
   * @param {string} [params.since] - ISO 8601 timestamp string; only fetch emails received after this time
   * @param {string} [params.search] - Optional search filter
   * @returns {Promise<Array<Object>>} List of messages
   */
  async getLatestMessages({ accessToken, top = 1, folder = 'inbox', since = null, search = null }) {
    if (!accessToken) {
      throw new Error('Graph API Error: accessToken is required');
    }

    const queryParams = new URLSearchParams({
      $top: String(top),
      $select: 'id,subject,body,receivedDateTime,from,isRead',
      $orderby: 'receivedDateTime desc'
    });

    if (since) {
      queryParams.set('$filter', `receivedDateTime ge ${since}`);
    }

    if (search) {
      queryParams.set('$search', `"${search}"`);
    }

    const url = `${this.graphEndpoint}/me/mailFolders/${folder}/messages?${queryParams.toString()}`;
    logger.debug(`Fetching messages from Graph API: ${url}`);

    const result = await withRetry(
      async (attempt) => {
        if (attempt > 0) {
          logger.debug(`Retry attempt ${attempt} for mail retrieval...`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json'
            },
            signal: controller.signal
          });

          const data = await response.json().catch(() => null);

          if (!response.ok) {
            const errorObj = new Error(
              data?.error?.message ||
                `Graph API request failed with HTTP ${response.status}: ${response.statusText}`
            );
            errorObj.status = response.status;
            errorObj.graphCode = data?.error?.code;

            const retryAfter = response.headers.get('Retry-After');
            if (retryAfter) {
              errorObj.retryAfterSeconds = parseInt(retryAfter, 10);
            }

            throw errorObj;
          }

          if (!data || !Array.isArray(data.value)) {
            return [];
          }

          return data.value.map((msg) => ({
            id: msg.id,
            subject: msg.subject || '',
            receivedDateTime: msg.receivedDateTime,
            from: {
              name: msg.from?.emailAddress?.name || '',
              address: msg.from?.emailAddress?.address || ''
            },
            body: {
              contentType: msg.body?.contentType?.toLowerCase() || 'html',
              content: msg.body?.content || ''
            },
            isRead: Boolean(msg.isRead)
          }));
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries: DEFAULTS.MAX_RETRIES,
        initialDelayMs: DEFAULTS.INITIAL_RETRY_DELAY_MS
      }
    );

    return result;
  }
}
