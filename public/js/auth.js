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

// Global API Dispatcher for Device Authorization
async function sendApiRequest(action, payload = {}) {
  const deviceToken = localStorage.getItem('device_token');
  if (deviceToken && !payload.device_token && !payload.token) {
    payload.device_token = deviceToken;
  }

  const hasFirebase = (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId && typeof fbCheckDeviceStatus === 'function');
  const hasGoogleScript = (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.trim() !== '');

  if (hasFirebase) {
    if (action === 'device_status') {
      return await fbCheckDeviceStatus();
    }
    if (action === 'authorize_device') {
      var resFB = await fbAuthorizeDevice(payload.name, payload.password);
      if (hasGoogleScript) {
        fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, payload })
        }).catch(function() {});
      }
      return resFB;
    }
  }

  if (hasGoogleScript) {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    return await res.json();
  }

  return { authorized: true, deviceCount: 1, maxDevices: 3 };
}

// Check Device Status on Page Load (Unauthorized Page)
async function checkDeviceStatus() {
  const statusInfo = document.getElementById('status-info');
  const authForm = document.getElementById('auth-device-form');
  const maxReached = document.getElementById('max-reached-message');

  try {
    const data = await sendApiRequest('device_status');

    if (data.authorized) {
      window.location.href = 'index.html';
      return;
    }

    if (data.deviceCount >= data.maxDevices) {
      if (statusInfo) statusInfo.style.display = 'none';
      if (authForm) authForm.style.display = 'none';
      if (maxReached) maxReached.style.display = 'block';
    } else {
      if (statusInfo) {
        statusInfo.innerText = `هذا الجهاز غير مفعّل بعد. الأجهزة المصرح بها حالياً: ${data.deviceCount} من أصل ${data.maxDevices}.`;
      }
      if (authForm) authForm.style.display = 'block';
      if (maxReached) maxReached.style.display = 'none';
    }
  } catch (err) {
    console.error('Device Status Error:', err);
    if (statusInfo) statusInfo.innerText = 'خطأ في الاتصال بالسيرفر لفحص حالة الجهاز.';
  }
}

// Handle Form Submission for Device Authorization
document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('auth-device-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const deviceName = document.getElementById('device-name').value;
      const adminPassword = document.getElementById('admin-password').value;

      try {
        const data = await sendApiRequest('authorize_device', { name: deviceName, password: adminPassword });

        if (data.success || data.token) {
          if (data.token) {
            localStorage.setItem('device_token', data.token);
          }
          showToast('تم تفويض هذا الجهاز بنجاح! جاري التوجيه...', 'success');
          setTimeout(() => {
            window.location.href = 'index.html';
          }, 1500);
        } else {
          showToast(data.message || 'فشل تفويض الجهاز. تأكد من رمز مرور المدير.', 'danger');
        }
      } catch (err) {
        showToast('خطأ أثناء إرسال طلب التفويض.', 'danger');
      }
    });
  }
});
