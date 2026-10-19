/**
 * Microsoft Azure OAuth2 Authentication Service
 * Handles token refreshes via the OAuth2 v2.0 token endpoint
 */

import { ENDPOINTS, DEFAULTS } from '../config/constants.js';
import { withRetry } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

export class AuthService {
  /**
   * @param {Object} [config]
   * @param {string} [config.tokenEndpoint]
   * @param {number} [config.timeoutMs]
   */
  constructor(config = {}) {
    this.tokenEndpoint = config.tokenEndpoint || ENDPOINTS.TOKEN_URL;
    this.timeoutMs = config.timeoutMs || DEFAULTS.REQUEST_TIMEOUT_MS;
  }

  /**
   * Refreshes the OAuth2 access token using the account's refresh_token.
   *
   * @param {Object} params
   * @param {string} params.clientId - Azure AD / MSA Client ID (App ID)
   * @param {string} params.refreshToken - OAuth2 Refresh Token
   * @param {string} [params.scope] - Optional scope override
   * @returns {Promise<{
   *   accessToken: string,
   *   newRefreshToken: string,
   *   expiresIn: number,
   *   scope: string,
   *   tokenType: string
   * }>}
   */
  async refreshAccessToken({ clientId, refreshToken, scope }) {
    if (!clientId) {
      throw new Error('OAuth2 Refresh Error: clientId is required');
    }
    if (!refreshToken) {
      throw new Error('OAuth2 Refresh Error: refreshToken is required');
    }

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    if (scope) {
      bodyParams.append('scope', scope);
    }

    logger.debug(`Refreshing token via ${this.tokenEndpoint} (Client ID: ${clientId})`);

    const result = await withRetry(
      async (attempt) => {
        if (attempt > 0) {
          logger.debug(`Retry attempt ${attempt} for token refresh...`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(this.tokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: bodyParams.toString(),
            signal: controller.signal
          });

          const data = await response.json().catch(() => null);

          if (!response.ok) {
            const errorObj = new Error(
              data?.error_description ||
                data?.error ||
                `OAuth2 token request failed with HTTP ${response.status}: ${response.statusText}`
            );
            errorObj.status = response.status;
            errorObj.oauthError = data?.error;
            errorObj.oauthDescription = data?.error_description;

            // Extract Retry-After header if present
            const retryAfter = response.headers.get('Retry-After');
            if (retryAfter) {
              errorObj.retryAfterSeconds = parseInt(retryAfter, 10);
            }

            throw errorObj;
          }

          if (!data || !data.access_token) {
            throw new Error('OAuth2 response did not contain an access_token');
          }

          return {
            accessToken: data.access_token,
            newRefreshToken: data.refresh_token || refreshToken,
            expiresIn: data.expires_in,
            scope: data.scope,
            tokenType: data.token_type || 'Bearer'
          };
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
