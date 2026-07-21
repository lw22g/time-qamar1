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

// Check Device Status on Page Load (Unauthorized Page)
async function checkDeviceStatus() {
  const statusInfo = document.getElementById('status-info');
  const authForm = document.getElementById('auth-device-form');
  const maxReached = document.getElementById('max-reached-message');

  try {
    const res = await fetch('/api/device/status');
    const data = await res.json();

    if (data.authorized) {
      // If already authorized, redirect to login page
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
      const res = await fetch('/api/device/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
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
