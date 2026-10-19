# Dịch vụ lấy mã OTP Outlook bằng OAuth2, không cần trình duyệt

Dịch vụ Node.js gọn và công cụ dòng lệnh để lấy mã xác minh OTP từ hộp thư Microsoft Outlook / Hotmail. Hệ thống không mở giao diện trình duyệt, không dùng Puppeteer, chỉ gọi REST API.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng chính](#tính-năng-chính)
- [Kiến trúc và luồng xử lý](#kiến-trúc-và-luồng-xử-lý)
- [Định dạng đầu vào](#định-dạng-đầu-vào)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt](#cài-đặt)
- [Giao diện web](#giao-diện-web)
- [Dòng lệnh](#dòng-lệnh)
- [Dùng như thư viện](#dùng-như-thư-viện)
- [Máy tách mã OTP](#máy-tách-mã-otp)
- [Refresh token xoay vòng](#refresh-token-xoay-vòng)
- [Chạy kiểm thử](#chạy-kiểm-thử)
- [Mã lỗi Microsoft](#mã-lỗi-microsoft)
- [Giấy phép](#giấy-phép)

Giải thích đầy đủ về cơ chế, thuật ngữ, cách chấm độ tin cậy và lý do từng thành phần tồn tại nằm trong [BAO_CAO.md](BAO_CAO.md).

---

## Tổng quan

Các hệ thống tự động làm việc với nhiều tài khoản Outlook / Hotmail thường phải mở trình duyệt ẩn (Puppeteer, Selenium, Playwright). Cách đó tốn bộ nhớ, dễ vướng CAPTCHA ở trang đăng nhập, và dễ đổ giữa chừng.

Công cụ này bỏ hẳn trình duyệt. Nó làm ba việc bằng HTTP thuần:

1. **Microsoft Identity Platform (OAuth 2.0):** đổi refresh token lấy access token có quyền gọi Graph API.
2. **Microsoft Graph API (`v1.0`):** đọc các thư mới nhất trong một thư mục hộp thư.
3. **Máy tách OTP:** tìm mã 4 đến 8 chữ số trong tiêu đề, câu ngữ cảnh và thẻ HTML được nhấn mạnh, đồng thời loại ngày tháng, địa chỉ IP, mã bưu điện và năm bản quyền.

Ba trường bắt buộc để chạy là email, refresh token và client ID. Mật khẩu và email khôi phục được đọc từ dòng đầu vào để giữ nguyên định dạng tài khoản, nhưng không được gửi lên Microsoft trong luồng lấy OTP.

---

## Tính năng chính

- **Nhẹ:** dùng `fetch` sẵn có của Node.js 18 trở lên. Phần dòng lệnh chỉ thêm `commander` và `picocolors`. Giao diện web thêm `express`.
- **Không giao diện trình duyệt:** xác thực OAuth2 và đọc thư đều là lệnh HTTP.
- **Xử lý song song có giới hạn:** pool worker, chỉnh bằng `-c 5`, `-c 20`, để chạy nhiều tài khoản mà không mở quá nhiều kết nối cùng lúc.
- **Thử lại khi lỗi tạm thời:** lỗi mạng hoặc HTTP 429 được thử lại, có chờ tăng dần và tôn trọng header `Retry-After`.
- **Lọc nhiễu:** không nhận ngày (`10/8/2026`), địa chỉ IP (`13.140.177.110`) hay mã bưu điện (`98052`) làm OTP.
- **Giữ refresh token còn hạn:** Microsoft thường trả refresh token mới sau mỗi lần đổi token. Kết quả có trường `newRefreshToken` để ghi đè token cũ.
- **Chế độ chờ:** `--wait 60` thăm hộp thư nhiều lần khi mã OTP vừa được một trang web khác gửi đi và chưa tới ngay.
- **Nhiều kiểu xuất:** log có màu, bảng tóm tắt, `--json` để đưa vào script, và xuất CSV.

---

## Kiến trúc và luồng xử lý

```text
[ Dòng tài khoản ]
EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID|RECOVERY_EMAIL
         │
         ▼
 1. Tách trường, cắt khoảng trắng, bỏ dòng trống và dòng chú thích
         │
         ▼
 2. Microsoft Identity Platform — OAuth 2.0
    POST https://login.microsoftonline.com/common/oauth2/v2.0/token
    grant_type=refresh_token, client_id, refresh_token
         │
         ├──► access_token mới + refresh_token xoay vòng
         ▼
 3. Microsoft Graph API v1.0
    GET https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=1
    Authorization: Bearer {access_token}
         │
         ├──► tiêu đề, thân HTML hoặc chữ, thời điểm, người gửi
         ▼
 4. Máy tách OTP, theo thứ tự ưu tiên
    ├── Tiêu đề: mã có tiền tố (G-123456) và câu chứa mã
    ├── Thẻ HTML nhấn mạnh (<strong>123456</strong>, <h1>)
    ├── Câu ngữ cảnh trong thân thư ("verification code is: 123456")
    └── Loại ngày, IP, mã bưu điện, năm bản quyền
         │
         ▼
[ Kết quả: success, email, otp, confidence, subject, sender, newRefreshToken ]
```

Với nhiều thư, hệ thống đi từ thư mới nhất. Thư đầu tiên tách được mã thì dừng.

---

## Định dạng đầu vào

Chuỗi các trường cách nhau bằng `|`, đưa từ file hoặc trực tiếp qua dòng lệnh / API:

```text
EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID|RECOVERY_EMAIL
```

### Các biến thể

- **Đủ 5 trường:** `email|password|refreshToken|clientId|recoveryEmail`
- **4 trường, không có email khôi phục:** `email|password|refreshToken|clientId`
- **Tối thiểu 3 trường:** `email|refreshToken|clientId`
- **Bỏ qua:** dòng trống, dòng bắt đầu bằng `#` hoặc `//`

Dòng mẫu, dùng giá trị giả:

```text
user@outlook.com|mat-khau-mau|M.C530_REFRESH_TOKEN_MAU|9e5f94bc-e8a4-4e73-b8be-63364c29d753|recovery@example.com
```

`password` và `recoveryEmail` không tham gia lời gọi OAuth hay Graph. Khi refresh token hết hạn hoặc bị thu hồi, công cụ này không tự đăng nhập lại bằng mật khẩu.

---

## Cấu trúc thư mục

```text
silent-outlook-otp-extractor/
├── bin/
│   └── cli.js                  # Giao diện dòng lệnh
├── public/                     # Giao diện web (HTML, CSS, JS)
├── server.js                   # Máy chủ Express cho giao diện web
├── src/
│   ├── config/
│   │   └── constants.js        # Địa chỉ Graph/OAuth2, mặc định, regex
│   ├── services/
│   │   ├── authService.js      # Đổi refresh token, thử lại khi lỗi
│   │   └── mailService.js      # Đọc thư qua Microsoft Graph
│   ├── utils/
│   │   ├── accountParser.js    # Tách dòng tài khoản, đọc file
│   │   ├── htmlCleaner.js      # Gỡ HTML, giải mã ký tự đặc biệt
│   │   ├── logger.js           # Log màu và bảng kết quả
│   │   ├── otpExtractor.js     # Chấm điểm và tách OTP
│   │   └── rateLimiter.js      # Giới hạn song song và chờ tăng dần
│   └── index.js                # OutlookOtpService
├── examples/
│   ├── accounts.example.txt
│   ├── programmatic-usage.js
│   └── watch-otp.js
├── tests/
│   ├── accountParser.test.js
│   ├── htmlCleaner.test.js
│   ├── otpExtractor.test.js
│   └── service.test.js
├── BAO_CAO.md                  # Báo cáo cơ chế hoạt động
├── package.json
└── README.md
```

---

## Cài đặt

Cần **Node.js 18 trở lên**:

```bash
git clone https://github.com/your-org/silent-outlook-otp-extractor.git
cd silent-outlook-otp-extractor
npm install
```

Để dùng lệnh `outlook-otp` ở mọi thư mục:

```bash
npm link
```

---

## Giao diện web

Dùng khi cần lấy OTP cho từng tài khoản và chọn số thư sẽ quét:

```bash
npm run ui
```

Hoặc:

```bash
node ./bin/cli.js --ui
```

Máy chủ lắng nghe tại `http://localhost:3000` (đổi cổng bằng biến môi trường `PORT`).

- Dán cả dòng tài khoản. Trang tự tách email, client ID và refresh token.
- Chọn số thư mới nhất cần quét: 1, 3, 5, 10, hoặc một số khác. API giới hạn từ 1 đến 20.
- Sao chép mã OTP một lần bấm.
- Lịch sử các mã đã lấy trong phiên làm việc hiện trên trang.
- Nếu Microsoft trả refresh token mới, ô token trên trang được cập nhật.

---

## Dòng lệnh

### 1. Đọc tài khoản từ file

```bash
node ./bin/cli.js --file ./examples/accounts.example.txt --top 5
```

### 2. Một dòng tài khoản

```bash
node ./bin/cli.js --input "user@outlook.com|password|REFRESH_TOKEN|CLIENT_ID|recovery@mail.com" --top 5
```

### 3. Nhiều tài khoản cùng lúc

Mười tài khoản xử lý song song:

```bash
node ./bin/cli.js --file accounts.txt --concurrency 10
```

### 4. Chờ thư OTP mới

Chờ tối đa 60 giây, mỗi 3 giây kiểm tra một lần:

```bash
node ./bin/cli.js --file accounts.txt --wait 60 --interval 3
```

### 5. Xuất JSON hoặc CSV

```bash
node ./bin/cli.js --file accounts.txt --output results.json
node ./bin/cli.js --file accounts.txt --output results.csv
```

### 6. JSON thuần ra stdout

```bash
node ./bin/cli.js --file accounts.txt --json
```

### Bảng tham số

| Cờ | Viết tắt | Ý nghĩa | Mặc định |
|----|----------|---------|----------|
| `--file <đường dẫn>` | `-f` | File `.txt` chứa các dòng tài khoản | `accounts.txt` |
| `--input <chuỗi>` | `-i` | Một dòng tài khoản | không có |
| `--output <đường dẫn>` | `-o` | File kết quả `.json` hoặc `.csv` | không có |
| `--concurrency <số>` | `-c` | Số tài khoản xử lý cùng lúc | `5` |
| `--wait <giây>` | `-w` | Thời gian chờ thư mới (`0` = lấy ngay) | `0` |
| `--interval <giây>` | | Khoảng cách giữa hai lần kiểm tra khi chờ | `3` |
| `--top <số>` | | Số thư mới nhất sẽ quét | `1` |
| `--folder <tên>` | | Thư mục (`inbox`, `junkemail`, …) | `inbox` |
| `--json` | | Chỉ in JSON, tắt log thường | tắt |
| `--verbose` | `-v` | In log gỡ lỗi và chi tiết mạng | tắt |

---

## Dùng như thư viện

`OutlookOtpService` import được từ dự án:

```javascript
import { OutlookOtpService, parseAccountLine } from 'silent-outlook-otp-extractor';

const service = new OutlookOtpService({
  requestTimeoutMs: 15000
});

const accountLine = 'user@outlook.com|pass|REFRESH_TOKEN|CLIENT_ID|rec@mail.com';
const result = await service.getOtpForAccount(accountLine);

if (result.success) {
  console.log(`Mã OTP: ${result.otp} (tin cậy: ${result.confidence})`);
  console.log(`Tiêu đề: ${result.subject}`);
  console.log(`Người gửi: ${result.sender}`);
  console.log(`Refresh token mới: ${result.newRefreshToken}`);
} else {
  console.error(`Không lấy được OTP: ${result.error}`);
}

// Chờ thư mới tối đa 45 giây, mỗi 3 giây kiểm tra một lần
const waitResult = await service.waitForOtp(accountLine, {
  waitTimeoutMs: 45000,
  pollIntervalMs: 3000
});

const accounts = [
  parseAccountLine('acc1@outlook.com|p1|token1|client1'),
  parseAccountLine('acc2@outlook.com|p2|token2|client2')
];

const batchResults = await service.processAccounts(accounts, {
  concurrency: 5,
  onProgress: ({ completed, total, result }) => {
    console.log(`Tiến độ: ${completed}/${total} -> ${result?.email}`);
  }
});
```

### Cấu trúc kết quả

```json
{
  "success": true,
  "email": "user@outlook.com",
  "otp": "492019",
  "confidence": "HIGH",
  "matchedPattern": "contextual_body",
  "subject": "Your verification code",
  "sender": "security@service.com",
  "senderName": "Service Security",
  "receivedAt": "2026-10-19T10:15:30Z",
  "bodySnippet": "Your verification code is: 492019 to sign in",
  "allCandidates": ["492019"],
  "newRefreshToken": "M.C530_...",
  "messageId": "AQMkADAwATM..."
}
```

`confidence` nhận một trong ba giá trị: `HIGH`, `MEDIUM`, `NONE`. Đây là nhãn do luật tách mã gán, không phải phần trăm đo trên một bộ thư mẫu. Cách gán nhãn được mô tả trong [BAO_CAO.md](BAO_CAO.md).

---

## Máy tách mã OTP

Máy đi lần lượt các bậc. Bậc khớp trước thì trả mã ngay, mức `HIGH`:

1. **Tiêu đề**
   - Mã có tiền tố: `G-123456`, `M-98214`.
   - Câu chứa mã: `Your code is 649201`, hoặc mã đứng đầu câu `928174 is your verification code`.
2. **Thẻ HTML nhấn mạnh**
   - `<strong>123456</strong>`, `<h1>748291</h1>`, `<span ...>382910</span>`.
3. **Câu ngữ cảnh trong thân thư**
   - `verification code is:`, `one-time passcode:`, `confirmation code:`, `security code:`, `código de verificación:`.
4. **Quét số tổng quát, chỉ khi các bậc trên không ra mã**
   - Mỗi cụm 4–8 chữ số được chấm điểm theo từ khóa xung quanh.
   - Từ 5 điểm: `HIGH`. Đúng 4 điểm: `MEDIUM`. Dưới 4 điểm: bỏ.

Bộ lọc nhiễu:

- **Ngày:** số dính `/` hoặc nằm cạnh ngữ cảnh giờ (`10/8/2026 8:52 AM`).
- **Địa chỉ IP:** số nằm trong dãy chấm (`13.140.177.110`).
- **Mã bưu điện:** 5 chữ số đứng sau mã bang hoặc từ chỉ địa chỉ (`WA 98052`).
- **Năm:** 4 chữ số từ 1950 đến 2040, trừ khi đứng ngay sau một cụm từ OTP rõ ràng.
- **Số lặp:** `000000`, `111111` và các dãy một chữ số dài hơn 4 ký tự.

---

## Refresh token xoay vòng

Mỗi lần xin access token, Microsoft thường trả một refresh token mới và có thể làm token vừa gửi hết hiệu lực. Hiện tượng này gọi là xoay vòng token.

Công cụ ghi token mới vào `result.newRefreshToken`. Dịch vụ chạy lâu cần ghi đè token cũ trong file hoặc cơ sở dữ liệu bằng giá trị này. Nếu Microsoft không trả token mới, hệ thống giữ token đang dùng.

Access token sống ngắn (trường `expires_in`, thường khoảng một giờ). Hết hạn thì Graph trả HTTP 401, và lần gọi sau phải đổi refresh token lấy access token khác.

---

## Chạy kiểm thử

Bộ test dùng `node:test` sẵn của Node.js:

```bash
npm test
```

Phạm vi:

- **`accountParser.test.js`:** dòng 3, 4, 5 trường, cắt khoảng trắng, dòng chú thích, email không hợp lệ.
- **`htmlCleaner.test.js`:** gỡ style/script, giải mã thực thể HTML (`&nbsp;`, `&#39;`), xuống dòng theo khối.
- **`otpExtractor.test.js`:** mã 4–8 số, tiền tố, mã đầu tiêu đề, thẻ HTML, loại ngày và mã bưu điện.
- **`service.test.js`:** luồng đầy đủ với xác thực giả lập, hộp thư trống.

---

## Mã lỗi Microsoft

| Lỗi / mã | Nghĩa | Cách xử lý |
|----------|--------|------------|
| `invalid_grant` / `AADSTS700084` | Refresh token hết hạn, bị thu hồi, hoặc mật khẩu đã đổi | Lấy refresh token mới bằng một lần đăng nhập lại. Công cụ này không tự làm bước đó |
| `invalid_client` / `AADSTS700016` | Không có ứng dụng với `clientId` này | Kiểm tra client ID đúng ứng dụng đã cấp token |
| HTTP 429 | Graph giới hạn tần suất | Tự thử lại, chờ theo `Retry-After` hoặc chờ tăng dần |
| HTTP 401 | Access token không hợp lệ hoặc hết hạn | Xin access token mới từ refresh token |
| HTTP 5xx | Sự cố phía Microsoft | Tự thử lại tối đa 3 lần |

---

## Giấy phép

MIT. Dùng cho mục đích thương mại và cá nhân.
