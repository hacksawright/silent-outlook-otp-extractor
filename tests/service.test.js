import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OutlookOtpService } from '../src/index.js';

describe('OutlookOtpService Integration Tests', () => {
  test('should handle invalid accounts gracefully', async () => {
    const service = new OutlookOtpService();
    await assert.rejects(
      async () => {
        await service.getOtpForAccount({ email: 'bad@domain.com' });
      },
      {
        message: /refreshToken, and clientId are required/
      }
    );
  });

  test('should mock token refresh and email extraction flow', async () => {
    const service = new OutlookOtpService();

    // Mock authService
    service.authService.refreshAccessToken = async () => ({
      accessToken: 'mock_access_token_123',
      newRefreshToken: 'mock_refresh_token_456',
      expiresIn: 3600
    });

    // Mock mailService
    service.mailService.getLatestMessages = async () => [
      {
        id: 'msg_001',
        subject: 'Your OpenAI verification code',
        receivedDateTime: '2026-10-19T10:00:00Z',
        from: { name: 'OpenAI', address: 'noreply@openai.com' },
        body: {
          contentType: 'html',
          content: '<p>Your verification code is: <strong>591823</strong></p>'
        },
        isRead: false
      }
    ];

    const result = await service.getOtpForAccount({
      email: 'mockuser@outlook.com',
      refreshToken: 'mock_ref_token',
      clientId: 'mock_client_id'
    });

    assert.equal(result.success, true);
    assert.equal(result.email, 'mockuser@outlook.com');
    assert.equal(result.otp, '591823');
    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.sender, 'noreply@openai.com');
  });

  test('should handle empty mailbox', async () => {
    const service = new OutlookOtpService();

    service.authService.refreshAccessToken = async () => ({
      accessToken: 'mock_token',
      newRefreshToken: 'mock_ref'
    });

    service.mailService.getLatestMessages = async () => [];

    const result = await service.getOtpForAccount({
      email: 'empty@outlook.com',
      refreshToken: 'token',
      clientId: 'client'
    });

    assert.equal(result.success, false);
    assert.equal(result.otp, null);
    assert.match(result.error, /No emails found/);
  });
});
