// Toast Notification helper
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast-el');
  const toastText = document.getElementById('toast-text');
  if (!toast || !toastText) return;

  toastText.innerText = message;
  toast.className = `toast active ${type}`;

  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// API Dispatcher supporting Google Sheets Webhook and Node Backend
async function sendApiRequest(action, payload = {}, pathUrl = '') {
  if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    return await res.json();
  } else {
    const res = await fetch(pathUrl, {
      method: payload && Object.keys(payload).length > 0 ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined
    });
    return await res.json();
  }
}

// Check Device Status on Page Load (Unauthorized Page)
async function checkDeviceStatus() {
  const statusInfo = document.getElementById('status-info');
  const authForm = document.getElementById('auth-device-form');
  const maxReached = document.getElementById('max-reached-message');

  try {
    const data = await sendApiRequest('device_status', {}, '/api/device/status');

    if (data.authorized) {
      window.location.href = '/';
      return;
    }

    statusInfo.innerHTML = `الأجهزة المفعّلة حالياً: <strong style="color: var(--primary);">${data.deviceCount} من أصل ${data.maxDevices}</strong>`;

    if (data.deviceCount >= data.maxDevices) {
      maxReached.style.display = 'block';
      authForm.style.display = 'none';
    } else {
      maxReached.style.display = 'none';
      authForm.style.display = 'block';
    }
  } catch (err) {
    statusInfo.innerText = 'خطأ في الاتصال بالخادم. يرجى إعادة المحاولة.';
    console.error(err);
  }
}

// Authorize Device Event Handler
const authDeviceForm = document.getElementById('auth-device-form');
if (authDeviceForm) {
  authDeviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('device-name').value;
    const password = document.getElementById('admin-password').value;

    try {
      const data = await sendApiRequest('authorize_device', { name, password }, '/api/device/authorize');

      if (data.success) {
        showToast(data.message, 'success');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        showToast(data.message || 'فشل تفويض الجهاز.', 'danger');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالخادم.', 'danger');
      console.error(err);
    }
  });
}
