import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractOtp } from '../src/utils/otpExtractor.js';

describe('otpExtractor Unit Tests', () => {
  test('should extract contextual OTP from body (6 digits)', () => {
    const body = `
      Hello!
      Your verification code is: 482910.
      This code will expire in 10 minutes.
    `;
    const res = extractOtp({ subject: 'Security Notice', body, contentType: 'text' });
    assert.equal(res.success, true);
    assert.equal(res.otp, '482910');
    assert.equal(res.confidence, 'HIGH');
  });

  test('should extract Google-prefixed code (G-123456)', () => {
    const res = extractOtp({
      subject: 'Your Google verification code is G-849201',
      body: 'G-849201 is your Google verification code.',
      contentType: 'text'
    });
    assert.equal(res.success, true);
    assert.equal(res.otp, 'G-849201');
    assert.equal(res.confidence, 'HIGH');
  });

  test('should extract OTP from HTML highlighted tag (strong)', () => {
    const html = `
      <html>
        <body>
          <p>Please enter the following security code:</p>
          <div style="padding: 20px;">
            <strong style="font-size: 24px; letter-spacing: 5px;">928174</strong>
          </div>
        </body>
      </html>
    `;
    const res = extractOtp({ subject: 'Your sign in code', body: html, contentType: 'html' });
    assert.equal(res.success, true);
    assert.equal(res.otp, '928174');
    assert.equal(res.confidence, 'HIGH');
    assert.equal(res.matchedPattern, 'html_highlight');
  });

  test('should extract leading code from subject line', () => {
    const res = extractOtp({
      subject: '739102 is your Discord verification code',
      body: 'Hey there, verify your Discord account now.',
      contentType: 'text'
    });
    assert.equal(res.success, true);
    assert.equal(res.otp, '739102');
    assert.equal(res.confidence, 'HIGH');
    assert.equal(res.source, 'subject');
  });

  test('should extract 4-digit PIN code', () => {
    const res = extractOtp({
      subject: 'Your account confirmation',
      body: 'Your one-time passcode is 4920. Do not share this with anyone.',
      contentType: 'text'
    });
    assert.equal(res.success, true);
    assert.equal(res.otp, '4920');
    assert.equal(res.confidence, 'HIGH');
  });

  test('should extract 8-digit backup/security code', () => {
    const res = extractOtp({
      subject: 'GitHub authentication code',
      body: 'Use authentication code 84920192 to authenticate.',
      contentType: 'text'
    });
    assert.equal(res.success, true);
    assert.equal(res.otp, '84920192');
    assert.equal(res.confidence, 'HIGH');
  });

  test('should reject false positives (date, zip code, copyright year)', () => {
    const notificationHtml = `
      <p>We detected unusual sign-in activity to your Microsoft account.</p>
      <p>Date: 10/8/2026 8:52 AM (GMT)</p>
      <p>IP Address: 13.140.177.110</p>
      <p>Redmond, WA 98052</p>
      <p>© 2026 Microsoft Corporation</p>
    `;
    const res = extractOtp({
      subject: 'Microsoft account unusual sign-in activity',
      body: notificationHtml,
      contentType: 'html'
    });
    assert.equal(res.success, false);
    assert.equal(res.otp, null);
    assert.equal(res.confidence, 'NONE');
  });

  test('should reject repeated border numbers (0000000)', () => {
    const res = extractOtp({
      subject: 'Receipt',
      body: 'Order #0000000 processed.',
      contentType: 'text'
    });
    assert.equal(res.success, false);
    assert.equal(res.otp, null);
  });
});
