import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHtml, decodeHtmlEntities } from '../src/utils/htmlCleaner.js';

describe('htmlCleaner Unit Tests', () => {
  test('should strip styles, scripts, and heads', () => {
    const html = `
      <html>
        <head><style>body { font-size: 14px; }</style></head>
        <body>
          <script>console.log("secret");</script>
          <p>Your code is 123456</p>
        </body>
      </html>
    `;
    const clean = cleanHtml(html);
    assert.equal(clean, 'Your code is 123456');
  });

  test('should decode common HTML entities', () => {
    const raw = 'Security&nbsp;code:&amp;&quot;&#39;&lt;&gt;';
    const decoded = decodeHtmlEntities(raw);
    assert.equal(decoded, 'Security code:&"\'<>');
  });

  test('should decode decimal and hex entities', () => {
    // 65 = 'A', 0x42 = 'B'
    const raw = '&#65;&#x42;';
    const decoded = decodeHtmlEntities(raw);
    assert.equal(decoded, 'AB');
  });

  test('should insert appropriate breaks for block elements', () => {
    const html = '<div>Line 1</div><div>Line 2</div><br><p>Line 3</p>';
    const clean = cleanHtml(html);
    assert.ok(clean.includes('Line 1'));
    assert.ok(clean.includes('Line 2'));
    assert.ok(clean.includes('Line 3'));
  });
});
