# Báo cáo cơ chế hoạt động: silent-outlook-otp-extractor

Tài liệu này mô tả cách hệ thống lấy mã OTP từ hộp thư Outlook, các thuật ngữ đi kèm, dữ liệu đầu vào, thứ tự từng bước, cách gán độ tin cậy, và lý do refresh token phải được cập nhật sau mỗi lần dùng.

---

## 1. Hệ thống làm gì

Đầu vào là một dòng mô tả tài khoản. Dịch vụ đổi refresh token thành access token, đọc vài thư mới nhất qua Microsoft Graph, rồi dùng bộ luật chữ để tách mã OTP khỏi các con số khác trong thư.

Có ba cách chạy cùng một lõi:

- Dòng lệnh (`bin/cli.js`), xử lý một dòng hoặc cả file.
- Thư viện `OutlookOtpService` trong `src/index.js`, gọi từ code Node.js khác.
- Giao diện web (`server.js` + `public/`), lắng nghe `http://localhost:3000`.

Hệ thống không mở Outlook trên trình duyệt. Xác thực và đọc thư đều là lệnh HTTP.

---

## 2. Ba lớp cơ chế

### 2.1. OAuth 2.0 — giấy phép đọc thư

OAuth 2.0 là chuẩn ủy quyền: ứng dụng không giữ phiên đăng nhập mãi, mà giữ một giấy phép để xin quyền hạn chế. Ở đây quyền cần thiết là đọc thư.

Microsoft Identity Platform là dịch vụ danh tính của Microsoft. Cùng một địa chỉ token phục vụ cả hộp thư cá nhân (Outlook, Hotmail) và tài khoản tổ chức. Địa chỉ dùng trong mã:

`POST https://login.microsoftonline.com/common/oauth2/v2.0/token`

Hai loại giấy phép:

| Tên | Vai trò | Thời hạn |
|-----|---------|----------|
| Access token (thẻ truy cập) | Gắn vào header `Authorization: Bearer ...` khi gọi Graph | Ngắn, thường khoảng 1 giờ (`expires_in`) |
| Refresh token (thẻ làm mới) | Đem đi đổi lấy access token mới, không cần người dùng đăng nhập lại | Dài hơn, nhưng Microsoft có thể đổi hoặc thu hồi sau mỗi lần dùng |

Bearer nghĩa là máy chủ tin người đang cầm thẻ. Ai có access token thì gọi API được cho đến khi thẻ hết hạn, nên thẻ này không được lưu như một bí mật lâu dài.

Client ID là mã ứng dụng đã đăng ký với Microsoft. Refresh token gắn với đúng ứng dụng đó. Gửi token của ứng dụng A kèm client ID của ứng dụng B thì Microsoft từ chối (`invalid_client`, mã `AADSTS700016`).

Tham số `grant_type=refresh_token` khai báo cách xin token: đổi thẻ cũ lấy thẻ mới. Hai tham số đi kèm là `client_id` và `refresh_token`.

Quyền (scope) mà token loại này thường mang theo:

- `Mail.Read` — được đọc thư của chủ tài khoản.
- `offline_access` — được cấp refresh token để dùng khi người dùng không đang mở phiên đăng nhập.

### 2.2. Microsoft Graph API — đọc hộp thư

Graph là cổng HTTP thống nhất của Microsoft cho thư, lịch, tệp. Mỗi việc là một địa chỉ cố định, kiểu REST.

Lệnh đọc thư:

`GET https://graph.microsoft.com/v1.0/me/mailFolders/{thư mục}/messages`

`/me` nghĩa là “chính người mà token này đại diện”. Email trong dòng đầu vào không được gửi lên để chứng minh danh tính. Email chỉ dùng để ghi nhãn kết quả và để kiểm tra định dạng lúc tách dòng.

Mỗi thư được chọn các trường: mã thư, tiêu đề, thân thư, thời điểm nhận, người gửi, cờ đã đọc. Danh sách sắp theo thời gian nhận, mới nhất trước. Số thư lấy ra do `--top` quyết định (mặc định dòng lệnh là 1; giao diện web thường gửi 5; API web giới hạn 1–20).

### 2.3. Máy tách OTP — luật chữ, không phải mô hình học

Thư trả về là tiêu đề cộng thân HTML hoặc chữ thường. Máy trong `src/utils/otpExtractor.js` không được huấn luyện trên một bộ thư mẫu. Nó áp các công thức tìm chuỗi (regex) theo thứ tự ưu tiên, rồi loại các số trông giống OTP nhưng là ngày, IP, mã bưu điện hoặc năm.

Regex là cách viết một khuôn mẫu: “một chữ cái, dấu gạch, rồi 4 đến 8 chữ số”. Máy quét văn bản và lấy phần khớp khuôn đó.

---

## 3. Vì sao cách này chạy được

Refresh token đã là kết quả của một lần đăng nhập thành công từ trước, kèm quyền đọc thư. Bước chạy hàng ngày chỉ còn hai lệnh HTTP: đổi token, rồi đọc thư. Không có cửa sổ trình duyệt, không có Puppeteer, và không đụng CAPTCHA của trang đăng nhập.

CAPTCHA là bài kiểm tra trang web dùng để phân biệt người và chương trình tự động, thường xuất hiện khi một công cụ gõ email và mật khẩu vào form đăng nhập. Luồng này không đi qua form đó.

Khi gặp lỗi tạm thời, `src/utils/rateLimiter.js` thử lại tối đa 3 lần:

- HTTP 429: Microsoft báo gửi quá nhanh.
- HTTP 500–504: sự cố phía máy chủ.
- Mạng đứt, hết thời gian chờ, hoặc bị từ chối kết nối.

Thời gian chờ bắt đầu ở 1 giây rồi nhân đôi mỗi lần (1 giây, 2 giây, 4 giây), cộng thêm một khoảng ngẫu nhiên dưới 200 mili giây để nhiều tài khoản không bắn lại cùng một thời điểm. Nếu phản hồi có header `Retry-After`, hệ thống chờ đúng số giây Microsoft yêu cầu.

Mỗi lệnh HTTP có thời gian chờ riêng, mặc định 15 giây.

---

## 4. Đầu vào

Một dòng, các trường cách nhau bằng dấu `|`:

```text
EMAIL|PASSWORD|REFRESH_TOKEN|CLIENT_ID|RECOVERY_EMAIL
```

Ba dạng hợp lệ, xử lý trong `src/utils/accountParser.js`:

| Số trường | Cách hiểu |
|-----------|-----------|
| 5 trở lên | email, mật khẩu, refresh token, client ID, email khôi phục |
| 4 | email, mật khẩu, refresh token, client ID |
| 3 | email, refresh token, client ID |

Dòng trống và dòng bắt đầu bằng `#` hoặc `//` bị bỏ. Email phải có dạng có `@` và dấu chấm. Refresh token và client ID không được rỗng.

### Trường nào thực sự được dùng

`getOtpForAccount` chỉ từ chối chạy khi thiếu email, refresh token hoặc client ID. Lời gọi OAuth chỉ gửi `client_id` và `refresh_token`. Lời gọi Graph chỉ gửi access token vừa nhận.

Mật khẩu và email khôi phục được tách ra và nằm trong object tài khoản, rồi không đi tiếp. Chúng có trong chuỗi vì định dạng lưu tài khoản thường đủ bộ như vậy, và vì khi refresh token chết thì muốn cấp token mới phải đăng nhập lại — việc này nằm ngoài công cụ. Công cụ không có bước gõ mật khẩu.

### Vì sao không đủ nếu chỉ có email và mật khẩu

Đọc Graph cần access token. Access token của lần chạy này được đổi từ refresh token. Refresh token chỉ có hiệu lực với đúng client ID đã cấp nó.

Email trong dòng không phải chìa khóa đăng nhập của luồng này: Graph xác định chủ hộp thư bằng token, qua đường `/me`. Mật khẩu không xuất hiện trong `authService.js` hay `mailService.js`.

Microsoft cũng không còn cho ứng dụng phổ thông tự gửi email kèm mật khẩu để lấy token của hộp thư cá nhân. Vì vậy “email + mật khẩu” không phải đầu vào mà đoạn mã hiện tại biết cách dùng.

---

## 5. Các bước khi xử lý một tài khoản

1. Cắt khoảng trắng, tách theo `|`, kiểm tra email.
2. `POST` tới địa chỉ token với `grant_type=refresh_token`, `client_id`, `refresh_token`.
3. Nhận `access_token`, `expires_in`, loại thẻ (thường là `Bearer`), và thường là một `refresh_token` mới. Không có token mới thì giữ token vừa gửi.
4. `GET` thư trong thư mục chỉ định (mặc định `inbox`), mới nhất trước. Có thể chỉ lấy thư nhận sau một mốc thời gian.
5. Hộp thư không có thư khớp thì trả `success: false`, `confidence: "NONE"`, vẫn kèm `newRefreshToken` nếu bước đổi token đã thành công.
6. Với từng thư, từ mới đến cũ, gọi máy tách OTP. Thư đầu tiên cho ra mã thì dừng. Hệ thống không so điểm giữa các thư. Thư mới hơn thắng dù thư cũ hơn có câu OTP rõ hơn.
7. Không thư nào có mã thì trả thư mới nhất làm ngữ cảnh, `otp: null`, lỗi “No OTP found in scanned email(s)”.
8. Lỗi mạng, token, hoặc Graph nằm trong `error`. Trường hợp này `newRefreshToken` là `null`, vì không có token mới để lưu.

### Chế độ chờ

`waitForOtp` lặp các bước trên cho đến khi có mã hoặc hết giờ (mặc định 60 giây, mỗi 3 giây một lần). Mốc thời gian lọc thư là một phút trước lúc bắt đầu chờ, để bỏ thư OTP cũ đã nằm sẵn trong hộp thư. Mỗi vòng lặp đều đổi token lại.

### Chế độ nhiều tài khoản

`runWithConcurrency` mở một số worker cố định (mặc định 5, chỉnh bằng `--concurrency`). Mỗi worker lấy tài khoản kế tiếp trong hàng, chạy xong một tài khoản rồi mới lấy tài khoản khác. Kết quả giữ đúng thứ tự đầu vào.

`processFile` đọc file từng dòng, gom dòng lỗi riêng, rồi trả `summary`: tổng tài khoản hợp lệ, số tài khoản có OTP, số không có hoặc lỗi, và số dòng không tách được. “Có OTP” ở đây nghĩa là máy trả được một mã, không nghĩa là mã đó đã được đối chiếu với mã thật trên trang web đã gửi thư.

---

## 6. Cách một thư được tách mã

OTP trong công cụ này là một cụm 4 đến 8 chữ số. Cụm toàn một chữ số và dài hơn 4 ký tự (`000000`, `111111`) bị loại trước.

Máy không gom mọi số rồi chọn số đẹp nhất. Nó đi theo bậc. Bậc khớp thì trả về ngay, mức `HIGH`, và các bậc sau không chạy.

| Thứ tự | Nguồn | Khuôn | `matchedPattern` |
|--------|--------|------|------------------|
| 1 | Tiêu đề | Tiền tố kiểu `G-123456` | `prefixed_subject` |
| 2 | Tiêu đề | Câu kiểu “verification code is 123456” | `contextual_subject` |
| 3 | Tiêu đề | Mã đứng đầu câu: “123456 is your verification code” | `leading_subject_code` |
| 4 | HTML thô | Số nằm trong `strong`, `b`, `h1`–`h6`, `span` | `html_highlight` |
| 5 | Thân thư đã gỡ thẻ | Cùng kiểu tiền tố | `prefixed_body` |
| 6 | Thân thư đã gỡ thẻ | Câu ngữ cảnh sát mã | `contextual_body` |
| 7 | Tiêu đề + thân | Mọi cụm 4–8 số, chấm điểm từ khóa xung quanh | `scored_context` |

Các cụm ngữ cảnh ở bậc 2 và 6 gồm: verification code, security code, one-time passcode/password/code, confirmation code, authentication code, passcode, secret code, pin, otp, code, và “código de verificación”.

Bậc 4 chạy trên HTML gốc vì cần thấy thẻ in đậm hoặc cỡ chữ lớn. Các bậc thân thư chạy trên bản đã gỡ thẻ, để câu chữ không bị vỡ bởi HTML.

### Bậc chấm điểm

Chỉ chạy khi sáu bậc trên không ra mã. Với mỗi cụm số, máy lấy khoảng 60 ký tự hai bên:

- Cụm mạnh cộng 4 điểm nếu có mặt: “verification code”, “security code”, “confirm your”, “one-time”, “passcode”, “enter the code”, “use this code”, “your code is”, “otp”.
- Từ khóa yếu cộng 1 điểm: code, otp, verification, verify, security, confirm, confirmation, passcode, password, pin, one-time, auth, login, signin, sign-in.
- Dưới 4 điểm thì bỏ cụm đó.
- Trong các cụm còn lại, điểm cao nhất thắng.
- Từ 5 điểm trở lên: `HIGH`. Đúng 4 điểm: `MEDIUM`.

Nhiều cụm cùng đạt ngưỡng thì `allCandidates` liệt kê chúng. Mã được chọn vẫn là cụm điểm cao nhất.

### Lớp loại nhiễu

Áp lên số tìm được, trước khi chấp nhận:

| Dấu hiệu | Ví dụ | Cách xử lý |
|----------|--------|------------|
| Ký tự ngay trước hoặc ngay sau là `/` | `10/8/2026` | Coi là ngày, bỏ |
| Nằm giữa các dấu chấm có chữ số hai bên | `13.140.177.110` | Coi là IP hoặc số thập phân, bỏ |
| Kẹp giữa hai dấu `-` | mảnh trong một mã định danh | Bỏ |
| Cửa sổ gần số có từ ngày giờ (`date`, `time`, `gmt`, `utc`, `am`, `pm`) và có `/` hoặc `:` | `8:52 AM` | Bỏ, trừ khi số đã khớp một câu OTP trực tiếp |
| 5 chữ số đứng sau mã bang hoặc từ địa chỉ | `WA 98052` | Coi là mã bưu điện, bỏ ở bước chấm điểm |
| Đúng 4 chữ số, giá trị từ 1950 đến 2040 | `2026` | Coi là năm, bỏ, trừ khi đứng trong câu OTP trực tiếp |

Khi số đã nằm ngay sau một cụm OTP rõ (“verification code is: 2024”), bộ lọc năm và mã bưu điện được nới. Các dấu `/`, dấu chấm của IP, và dấu `-` hai bên vẫn bị loại.

Không tìm được mã thì `confidence` là `NONE`, `otp` là `null`.

---

## 7. Độ tin cậy được tính trên cái gì

Không có phép đo phần trăm. Không có bộ thư mẫu nào trong dự án để tính “đúng bao nhiêu phần trăm”. Trường `confidence` là nhãn do luật gán:

| Nhãn | Điều kiện trong mã |
|------|---------------------|
| `HIGH` | Khớp bậc 1 đến 6, hoặc bậc chấm điểm đạt từ 5 điểm |
| `MEDIUM` | Chỉ ở bậc chấm điểm, và điểm đúng bằng 4 |
| `NONE` | Không có thư, không thấy mã, hết giờ chờ, hoặc lỗi |

Giao diện web, khi nhận `HIGH`, ghi dòng “Độ chính xác cao (99.9%)”. Câu này được gán sẵn trong `public/app.js`. Con số 99.9% không được tính từ dữ liệu.

`summary.successfulOtps` khi chạy file đếm số tài khoản mà máy trả về một mã. Nó không đối chiếu mã đó với mã người dùng thực sự cần nhập.

Muốn biết mã thắng nhờ luật nào, xem `matchedPattern` và `bodySnippet`.

---

## 8. Vì sao token phải thay đổi

Có hai thẻ, hết hạn theo hai lý do khác nhau.

Access token được thiết kế sống ngắn. Hết `expires_in`, Graph trả HTTP 401. Lần chạy sau phải xin thẻ mới. Trong mã hiện tại, mỗi lần `getOtpForAccount` đều đổi refresh token lấy access token mới, không giữ access token giữa các lần gọi.

Refresh token của Microsoft thường xoay vòng: lần đổi token thành công có thể trả một refresh token khác, và token vừa gửi không dùng lại được. Giữ token cũ trong file thì lần sau gặp `invalid_grant` / `AADSTS700084` (hết hạn, bị thu hồi, hoặc mật khẩu tài khoản đã đổi).

Vì vậy mỗi kết quả có `newRefreshToken`. Bên gọi phải ghi đè token cũ nếu muốn lần sau còn vào được. Đổi token không liên quan đến việc mã OTP trong thư thay đổi. OTP là nội dung thư. Token là giấy phép để đọc thư đó lần nữa.

---

## 9. Những gì hệ thống cố ý không làm

- Không gõ mật khẩu, không mở trang đăng nhập, không giải CAPTCHA.
- Không tự lấy refresh token mới khi token hiện tại đã chết. Trường hợp đó cần một lần đăng nhập lại bên ngoài công cụ.
- Không chứng minh mã tách được là mã mà một trang web cụ thể vừa gửi. Nó trả mã đầu tiên, theo thứ tự ưu tiên, trong các thư mới nhất.
- Không chấm một xác suất thống kê. Nhãn `HIGH` / `MEDIUM` phản ánh bậc luật nào đã khớp.

---

## 10. Sơ đồ một lần chạy thành công

```text
Dòng tài khoản
    │
    ▼
Tách trường ── thiếu email / refresh token / client ID ──► dừng, báo lỗi định dạng
    │
    ▼
Đổi refresh token
    │
    ├── invalid_grant / invalid_client / lỗi mạng hết lần thử ──► success: false
    │
    ▼
Đọc N thư mới nhất
    │
    ├── không có thư ──► NONE, vẫn trả newRefreshToken
    │
    ▼
Từng thư, mới nhất trước
    │
    ├── khớp bậc ưu tiên ──► HIGH, dừng
    ├── không khớp, nhưng cụm số đạt ≥ 5 điểm ──► HIGH, dừng
    ├── cụm số đúng 4 điểm ──► MEDIUM, dừng
    └── hết thư mà không có mã ──► NONE
    │
    ▼
Người gọi lưu newRefreshToken cho lần sau
```
