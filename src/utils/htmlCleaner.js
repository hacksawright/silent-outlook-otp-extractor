/**
 * Utilities for cleaning and normalizing HTML email bodies to readable text
 */

/**
 * Decodes standard and numeric HTML entities
 * @param {string} text
 * @returns {string}
 */
export function decodeHtmlEntities(text) {
  if (!text) return '';

  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&mdash;': '—',
    '&ndash;': '–'
  };

  let decoded = text.replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos|copy|reg|trade|mdash|ndash);/gi, (match) => {
    return entities[match.toLowerCase()] || match;
  });

  // Decode decimal entities like &#8220;
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10));
    } catch {
      return _;
    }
  });

  // Decode hex entities like &#x201C;
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  return decoded;
}

/**
 * Strips HTML tags, styles, scripts, and comments while preserving spacing
 * @param {string} html
 * @returns {string}
 */
export function cleanHtml(html) {
  if (!html) return '';

  let text = html;

  // 1. Remove style and script tags and their content
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ');

  // 2. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Replace block element boundaries with newlines/spaces to prevent words sticking together
  text = text.replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<(td|th)[^>]*>/gi, ' ');

  // 4. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 5. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 6. Normalize whitespace: collapse multiple horizontal spaces to single space
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text;
}
