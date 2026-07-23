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

// Helper for cookies
function getCookie(name) {
  var value = "; " + document.cookie;
  var parts = value.split("; " + name + "=");
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

// API Dispatcher supporting Supabase Cloud, Google Sheets Webhook, and Node Backend
async function sendApiRequest(action, payload = {}, pathUrl = '') {
  const deviceToken = localStorage.getItem('device_token') || getCookie('device_token');
  if (deviceToken && !payload.device_token && !payload.token) {
    payload.device_token = deviceToken;
  }

  const hasFirebase = (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId && typeof fbCheckDeviceStatus === 'function');
  const hasGoogleScript = (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.trim() !== '');

  if (hasFirebase) {
    if (action === 'device_status') {
      var status = await fbCheckDeviceStatus();
      if (status && status.authorized) return status;
      if (hasGoogleScript) {
        try {
          const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload })
          });
          return await res.json();
        } catch (e) {}
      }
      return status;
    }
    if (action === 'authorize_device') {
      var resFB = await fbAuthorizeDevice(payload.name, payload.password);
      if (hasGoogleScript) {
        fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, payload })
        }).catch(function(e) {});
      }
      return resFB;
    }
  }

  if (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && SUPABASE_URL.includes('.supabase.co') && !SUPABASE_URL.includes('YOUR_SUPABASE')) {
    if (action === 'device_status') return await dbCheckDeviceStatus();
    if (action === 'authorize_device') return await dbAuthorizeDevice(payload.name, payload.password);
  }

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
    const deviceToken = localStorage.getItem('device_token') || getCookie('device_token');
    const data = await sendApiRequest('device_status', { device_token: deviceToken }, '/api/device/status');

    if (data.authorized) {
      window.location.href = '/';
      return;
    }

    if (statusInfo) {
      statusInfo.innerHTML = `الأجهزة المفعّلة حالياً: <strong style="color: var(--primary);">${data.deviceCount} من أصل ${data.maxDevices}</strong>`;
    }

    if (data.deviceCount >= data.maxDevices) {
      if (maxReached) maxReached.style.display = 'block';
      if (authForm) authForm.style.display = 'none';
    } else {
      if (maxReached) maxReached.style.display = 'none';
      if (authForm) authForm.style.display = 'block';
    }
  } catch (err) {
    if (statusInfo) statusInfo.innerText = 'خطأ في الاتصال بالخادم. يرجى إعادة المحاولة.';
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
        if (data.token) {
          localStorage.setItem('device_token', data.token);
          document.cookie = `device_token=${data.token}; path=/; max-age=315360000; SameSite=Lax`;
        }
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
