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

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function readField(source, name) {
  const value = firstValue(source?.[name]);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * GET nhận dữ liệu trên URL, POST nhận JSON body.
 * Cả hai đều trả về mã OTP trong trường `otp`.
 */
async function extractOtp(req, res) {
  try {
    const source = req.method === 'GET' ? req.query : req.body;
    const rawInput = readField(source, 'rawInput');
    const email = readField(source, 'email') || readField(req.params, 'email');
    const refreshToken = readField(source, 'refreshToken') || readField(req.params, 'refreshToken');
    const clientId = readField(source, 'clientId') || readField(req.params, 'clientId');
    const top = readField(source, 'top') || '5';
    const waitSeconds = readField(source, 'waitSeconds') || '0';
    const folder = readField(source, 'folder') || 'inbox';

    let account = null;

    if (rawInput) {
      account = parseAccountLine(rawInput);
    } else if (email && refreshToken && clientId) {
      account = { email, refreshToken, clientId };
    } else {
      return res.status(400).json({
        success: false,
        otp: null,
        error: 'Vui lòng truyền chuỗi tài khoản qua ?rawInput=EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID hoặc đủ ?email=&refreshToken=&clientId=.'
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
    const message = err.message || 'Lỗi xử lý trích xuất OTP từ Microsoft';
    const status = /Invalid format|Invalid or missing|Missing OAuth2|Expected string/i.test(message) ? 400 : 500;
    return res.status(status).json({
      success: false,
      otp: null,
      error: message
    });
  }
}

app.get('/api/extract-otp', extractOtp);
app.get('/api/extract-otp/:email/:refreshToken/:clientId', extractOtp);
app.post('/api/extract-otp', extractOtp);

app.listen(PORT, () => {
  console.log(`\n🚀 [Outlook OTP Web GUI] Đang chạy tại: http://localhost:${PORT}`);
  console.log(`💡 Mở trình duyệt và truy cập: http://localhost:${PORT}\n`);
});
