import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OutlookOtpService, parseAccountLine, logger } from './src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const service = new OutlookOtpService();

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'silent-outlook-otp-extractor', timestamp: new Date().toISOString() });
});

/**
 * Single account OTP extraction endpoint
 */
app.post('/api/extract-otp', async (req, res) => {
  try {
    const { rawInput, email, refreshToken, clientId, top = 5, waitSeconds = 0, folder = 'inbox' } = req.body;

    let account = null;

    if (rawInput && rawInput.trim()) {
      account = parseAccountLine(rawInput.trim());
    } else if (email && refreshToken && clientId) {
      account = {
        email: email.trim(),
        refreshToken: refreshToken.trim(),
        clientId: clientId.trim()
      };
    } else {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng cung cấp chuỗi tài khoản hợp lệ (EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID|RECOVERY_EMAIL) hoặc nhập đủ thông tin.'
      });
    }

    const topNumber = Math.max(1, Math.min(parseInt(top, 10) || 5, 20));
    const waitTime = Math.max(0, parseInt(waitSeconds, 10) || 0);

    let result;
    if (waitTime > 0) {
      result = await service.waitForOtp(account, {
        waitTimeoutMs: waitTime * 1000,
        pollIntervalMs: 3000,
        top: topNumber,
        folder
      });
    } else {
      result = await service.getOtpForAccount(account, {
        top: topNumber,
        folder
      });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Lỗi xử lý trích xuất OTP từ Microsoft'
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 [Outlook OTP Web GUI] Đang chạy tại: http://localhost:${PORT}`);
  console.log(`💡 Mở trình duyệt và truy cập: http://localhost:${PORT}\n`);
});
