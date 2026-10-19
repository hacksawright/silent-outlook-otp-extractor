/**
 * Concurrency limiter and exponential backoff retry utilities
 */

/**
 * Pauses execution for a given number of milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function with exponential backoff retries.
 *
 * @param {Function} fn - Async operation to execute
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.initialDelayMs=1000]
 * @param {number} [options.backoffFactor=2]
 * @param {Function} [options.shouldRetry] - Optional predicate (error) => boolean
 * @returns {Promise<any>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    backoffFactor = 2,
    shouldRetry = (err) => isTransientError(err)
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      if (attempt > maxRetries || !shouldRetry(err)) {
        throw err;
      }

      // Check if error response has a Retry-After header
      if (err.retryAfterSeconds) {
        delay = err.retryAfterSeconds * 1000;
      }

      // Add jitter to avoid thundering herd problem
      const jitter = Math.random() * 200;
      await sleep(delay + jitter);
      delay *= backoffFactor;
    }
  }
}

/**
 * Determines whether an error is transient and can be retried
 * @param {Error|any} err
 * @returns {boolean}
 */
export function isTransientError(err) {
  if (!err) return false;

  // Rate limited
  if (err.status === 429) return true;

  // Server error (500, 502, 503, 504)
  if (err.status >= 500 && err.status < 600) return true;

  // Network connection drops
  const networkCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'];
  if (err.code && networkCodes.includes(err.code)) return true;

  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;

  return false;
}

/**
 * Runs an array of items through an async worker with a concurrency cap.
 *
 * @template T, R
 * @param {T[]} items - Array of input items
 * @param {number} concurrency - Max concurrent workers
 * @param {(item: T, index: number) => Promise<R>} worker - Worker task function
 * @param {Object} [options]
 * @param {(progress: { completed: number, total: number, item: T, result?: R, error?: Error }) => void} [options.onProgress]
 * @returns {Promise<R[]>}
 */
export async function runWithConcurrency(items, concurrency, worker, options = {}) {
  const { onProgress } = options;
  const results = new Array(items.length);
  let currentIndex = 0;
  let completedCount = 0;

  const total = items.length;
  if (total === 0) return [];

  const actualConcurrency = Math.max(1, Math.min(concurrency, total));

  async function runner() {
    while (currentIndex < total) {
      const index = currentIndex++;
      const item = items[index];

      try {
        const result = await worker(item, index);
        results[index] = result;
        completedCount++;
        if (onProgress) {
          onProgress({ completed: completedCount, total, item, result });
        }
      } catch (error) {
        results[index] = { error, item };
        completedCount++;
        if (onProgress) {
          onProgress({ completed: completedCount, total, item, error });
        }
      }
    }
  }

  const workers = Array.from({ length: actualConcurrency }, () => runner());
  await Promise.all(workers);

  return results;
}
