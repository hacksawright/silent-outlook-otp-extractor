/**
 * Frontend logic for Silent Outlook OTP Extractor Web Dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const rawInput = document.getElementById('rawInput');
  const btnFillSample = document.getElementById('btnFillSample');
  const parsedChips = document.getElementById('parsedChips');
  const chipEmail = document.getElementById('chipEmail');
  const chipClientId = document.getElementById('chipClientId');

  const topCount = document.getElementById('topCount');
  const presetPills = document.querySelectorAll('.preset-pill');

  const enableWait = document.getElementById('enableWait');
  const waitConfig = document.getElementById('waitConfig');
  const waitSeconds = document.getElementById('waitSeconds');

  const btnSubmit = document.getElementById('btnSubmit');
  const btnSubmitText = document.getElementById('btnSubmitText');

  const loadingSection = document.getElementById('loadingSection');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingSubtitle = document.getElementById('loadingSubtitle');

  const resultSection = document.getElementById('resultSection');
  const errorSection = document.getElementById('errorSection');

  const otpCode = document.getElementById('otpCode');
  const btnCopyOtp = document.getElementById('btnCopyOtp');
  const btnCopyText = document.getElementById('btnCopyText');

  const confidenceBadge = document.getElementById('confidenceBadge');
  const resultTimestamp = document.getElementById('resultTimestamp');
  const resSubject = document.getElementById('resSubject');
  const resSender = document.getElementById('resSender');
  const resReceivedAt = document.getElementById('resReceivedAt');
  const resSnippet = document.getElementById('resSnippet');

  const scannedSection = document.getElementById('scannedSection');
  const toggleScanned = document.getElementById('toggleScanned');
  const scannedList = document.getElementById('scannedList');
  const scannedCount = document.getElementById('scannedCount');

  const newRefreshToken = document.getElementById('newRefreshToken');
  const btnCopyToken = document.getElementById('btnCopyToken');

  const errorMessage = document.getElementById('errorMessage');

  const historyBody = document.getElementById('historyBody');
  const historyCount = document.getElementById('historyCount');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const toastContainer = document.getElementById('toastContainer');

  // Load History from localStorage
  let historyItems = JSON.parse(localStorage.getItem('outlook_otp_history') || '[]');
  renderHistory();

  // 1. Real-time auto-parse input
  rawInput.addEventListener('input', () => {
    updateParsedChips(rawInput.value);
  });

  // 2. Preset Pill Buttons
  presetPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      presetPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      topCount.value = pill.dataset.top;
    });
  });

  topCount.addEventListener('input', () => {
    const val = topCount.value;
    presetPills.forEach((p) => {
      p.classList.toggle('active', p.dataset.top === val);
    });
  });

  // 3. Toggle Polling / Wait Config
  enableWait.addEventListener('change', () => {
    waitConfig.style.display = enableWait.checked ? 'flex' : 'none';
  });

  // 4. Fill Sample Account Button
  btnFillSample.addEventListener('click', () => {
    rawInput.value =
      'jackimccoy9755@outlook.com|Q1uxrJIabRWz|M.C557_BAY.0.U.MsaArtifacts.-CgYvbUr9hzpuc*9*yqcKrHIX*0e1MIykdbvGkO0UcjUdeF2dypkDEsRud4cSkHDTtqf9V7WN3SZo4p41rSPVGCB6QXAJzJs5YzboPLl4gZfXPatFkNfetLzaWBRwxeXkV1QBj9huYH!wM24GI9!sos3ycpkEu6VllqtY8!YNNEDOTptXT2kt107HgFhF4E0uXF7L78u8fJQvwjIggiU7xxzrIDorbZRpKvIdYTCu05fgqoFcxcsZPZXy2DLZjLqA24CfYFlzc738IJAyuA8EGMTUaQ6tyb1P*P*1PqKY30hoGuv0i7FllwtGMWFVDwxaxV2lunvJSrJs63UvwkndFoxYBHktYS3wh81IhzOR1SffDuJ2J*kGTP83DC8p4dD58GhOPQ45G!iWTKxuyd3YfWs6ED3mxexiQW!bUAPL3YdPrH02xt98UBj8*RIjYsJ!z4ZgsgyjVcwfQ550iwvfFqo$|9e5f94bc-e8a4-4e73-b8be-63364c29d753|jackimccoy97554zwm@fviainboxes.com';
    updateParsedChips(rawInput.value);
    showToast('Đã dán tài khoản mẫu!', 'success');
  });

  // 5. Scanned Accordion Toggle
  toggleScanned.addEventListener('click', () => {
    const isOpen = scannedList.style.display === 'flex';
    scannedList.style.display = isOpen ? 'none' : 'flex';
    toggleScanned.classList.toggle('open', !isOpen);
  });

  // 6. Copy OTP Code Button
  btnCopyOtp.addEventListener('click', () => {
    const code = otpCode.textContent.trim();
    if (code && code !== '------') {
      copyToClipboard(code);
      btnCopyText.textContent = 'Đã chép!';
      btnCopyOtp.style.background = '#10b981';
      btnCopyOtp.style.color = '#070a13';
      showToast(`Đã sao chép mã ${code}`, 'success');

      setTimeout(() => {
        btnCopyText.textContent = 'Copy';
        btnCopyOtp.style.background = '';
        btnCopyOtp.style.color = '';
      }, 2000);
    }
  });

  // 7. Copy Rolling Refresh Token
  btnCopyToken.addEventListener('click', () => {
    const token = newRefreshToken.value;
    if (token) {
      copyToClipboard(token);
      showToast('Đã sao chép Refresh Token mới!', 'success');
    }
  });

  // 8. Clear History
  btnClearHistory.addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn xóa lịch sử trích xuất?')) {
      historyItems = [];
      localStorage.removeItem('outlook_otp_history');
      renderHistory();
      showToast('Đã xóa toàn bộ lịch sử!', 'success');
    }
  });

  // 9. Form Submission (Extract OTP)
  btnSubmit.addEventListener('click', async () => {
    const line = rawInput.value.trim();
    if (!line) {
      showToast('Vui lòng nhập chuỗi tài khoản Microsoft', 'error');
      rawInput.focus();
      return;
    }

    const top = parseInt(topCount.value, 10) || 5;
    const isWait = enableWait.checked;
    const wait = isWait ? parseInt(waitSeconds.value, 10) || 45 : 0;

    // UI state: loading
    btnSubmit.disabled = true;
    btnSubmitText.textContent = 'Đang xử lý...';
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    loadingSection.style.display = 'block';

    loadingTitle.textContent = 'Đang kết nối Microsoft Azure OAuth2...';
    loadingSubtitle.textContent = 'Trao đổi refresh token lấy access token...';

    const loadingStages = [
      { t: 1500, title: 'Đang mở hộp thư Microsoft Graph API...', sub: `Quét Top ${top} email mới nhất trong Inbox...` },
      { t: 3000, title: 'Đang phân tích cấu trúc thư & giải mã...', sub: 'Động cơ heuristic đang tìm kiếm mã OTP 4-8 chữ số...' }
    ];

    const timeouts = loadingStages.map((stage) =>
      setTimeout(() => {
        loadingTitle.textContent = stage.title;
        loadingSubtitle.textContent = stage.sub;
      }, stage.t)
    );

    try {
      const response = await fetch('/api/extract-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: line,
          top,
          waitSeconds: wait
        })
      });

      timeouts.forEach(clearTimeout);
      const data = await response.json();

      loadingSection.style.display = 'none';
      btnSubmit.disabled = false;
      btnSubmitText.textContent = 'Trích Xuất Mã OTP Ngay';

      if (data.success && data.otp) {
        // SUCCESS
        otpCode.textContent = data.otp;
        confidenceBadge.textContent =
          data.confidence === 'HIGH' ? 'Độ chính xác cao (99.9%)' : `Độ tin cậy: ${data.confidence}`;

        resultTimestamp.textContent = new Date().toLocaleTimeString();
        resSubject.textContent = data.subject || '(Không có tiêu đề)';
        resSender.textContent = `${data.senderName || ''} <${data.sender || 'Không rõ'}>`;
        resReceivedAt.textContent = data.receivedAt ? new Date(data.receivedAt).toLocaleString() : 'Vừa xong';
        resSnippet.textContent = data.bodySnippet || data.subject || 'Không có đoạn trích';

        // Scanned messages accordion
        if (data.scannedMessages && data.scannedMessages.length > 0) {
          scannedSection.style.display = 'block';
          scannedCount.textContent = data.scannedMessages.length;
          scannedList.innerHTML = data.scannedMessages
            .map((msg) => {
              const isMatch = msg.id === data.messageId;
              const dateStr = msg.receivedDateTime ? new Date(msg.receivedDateTime).toLocaleTimeString() : '';
              return `
              <div class="scanned-email-item ${isMatch ? 'has-otp' : ''}">
                <div>
                  <span class="item-title">${escapeHtml(msg.subject)}</span>
                  ${isMatch ? '<span style="color:#10b981; font-weight:700; margin-left:0.5rem;">[Chứa OTP]</span>' : ''}
                  <div style="color:#94a3b8; font-size:0.75rem;">${escapeHtml(msg.sender || '')}</div>
                </div>
                <span class="item-date">${dateStr}</span>
              </div>
            `;
            })
            .join('');
        } else {
          scannedSection.style.display = 'none';
        }

        // Rolling Refresh Token
        if (data.newRefreshToken) {
          newRefreshToken.value = data.newRefreshToken;
        }

        resultSection.style.display = 'block';
        showToast(`Tìm thấy mã OTP: ${data.otp}`, 'success');

        // Add to history
        addToHistory({
          email: data.email,
          otp: data.otp,
          confidence: data.confidence,
          subject: data.subject,
          timestamp: new Date().toLocaleTimeString()
        });
      } else {
        // NO OTP / ERROR
        errorSection.style.display = 'flex';
        errorMessage.textContent = data.error || 'Hộp thư không có mã OTP nào trong số các thư gần nhất.';
        showToast('Không tìm thấy mã OTP!', 'error');
      }
    } catch (err) {
      timeouts.forEach(clearTimeout);
      loadingSection.style.display = 'none';
      btnSubmit.disabled = false;
      btnSubmitText.textContent = 'Trích Xuất Mã OTP Ngay';

      errorSection.style.display = 'flex';
      errorMessage.textContent = err.message || 'Lỗi mạng khi kết nối tới máy chủ trích xuất';
      showToast('Lỗi kết nối máy chủ!', 'error');
    }
  });

  // Helper Functions
  function updateParsedChips(val) {
    if (!val || !val.includes('|')) {
      parsedChips.style.display = 'none';
      return;
    }
    const parts = val.split('|').map((p) => p.trim());
    if (parts.length >= 3) {
      const email = parts[0];
      const clientId = parts.length >= 4 ? parts[3] : parts[2];
      chipEmail.textContent = email;
      chipClientId.textContent = clientId ? clientId.slice(0, 14) + '...' : '-';
      parsedChips.style.display = 'flex';
    } else {
      parsedChips.style.display = 'none';
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✔' : '✖'}</span>
      <span>${escapeHtml(msg)}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  function addToHistory(item) {
    historyItems.unshift(item);
    if (historyItems.length > 20) historyItems.pop();
    localStorage.setItem('outlook_otp_history', JSON.stringify(historyItems));
    renderHistory();
  }

  function renderHistory() {
    historyCount.textContent = `${historyItems.length} mã`;
    if (historyItems.length === 0) {
      historyBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="6">Chưa có lịch sử trích xuất nào trong phiên này.</td>
        </tr>
      `;
      return;
    }

    historyBody.innerHTML = historyItems
      .map(
        (item) => `
        <tr>
          <td style="color:#64748b; font-family:var(--font-mono); font-size:0.78rem;">${item.timestamp}</td>
          <td style="font-weight:600; font-family:var(--font-mono); font-size:0.8rem;">${escapeHtml(item.email)}</td>
          <td><span class="history-otp-pill">${escapeHtml(item.otp)}</span></td>
          <td><span style="font-size:0.75rem; color:#38bdf8;">${escapeHtml(item.confidence || 'HIGH')}</span></td>
          <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.subject || '-')}</td>
          <td>
            <button type="button" class="btn-text" onclick="navigator.clipboard.writeText('${item.otp}'); alert('Đã chép mã: ${item.otp}');">
              Copy
            </button>
          </td>
        </tr>
      `
      )
      .join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
