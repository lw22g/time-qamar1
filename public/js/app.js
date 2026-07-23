// Toast Notification Helper
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

// Helper to format minutes into HH:MM string (e.g., "07:40")
function formatMinutesText(totalMins) {
  if (!totalMins || totalMins <= 0) return '00:00';
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatTimeString(str, defaultVal = '08:00') {
  if (!str) return defaultVal;
  if (typeof str === 'string' && str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }
  return str;
}

// Global Theme Switcher
function initTheme() {
  const savedTheme = localStorage.getItem('app_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButtonText(savedTheme);

  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('app_theme', newTheme);
      updateThemeButtonText(newTheme);
    });
  }
}

function updateThemeButtonText(theme) {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (!toggleBtn) return;
  if (theme === 'light') {
    toggleBtn.innerHTML = '🌙 المظهر الداكن';
  } else {
    toggleBtn.innerHTML = '☀️ المظهر الفاتح';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
});

// Universal API Dispatcher for Client Web Application
async function sendApiRequest(action, payload = {}) {
  const deviceToken = localStorage.getItem('device_token');
  if (deviceToken && !payload.device_token && !payload.token) {
    payload.device_token = deviceToken;
  }

  const hasFirebase = (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId && typeof fbLogin === 'function');
  const hasGoogleScript = (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.trim() !== '');

  // Helper to query Google Apps Script Webhook
  async function callGoogleScript() {
    if (!hasGoogleScript) return null;
    const activeUser = JSON.parse(sessionStorage.getItem('time_user') || 'null');
    if (activeUser) {
      if (!payload.userId) payload.userId = activeUser.id;
      if (!payload.current_user) payload.current_user = activeUser;
    }
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (fetchErr) {
      console.warn('Google Script fetch warning:', fetchErr);
    }
    return null;
  }

  // 1. Firebase Integration with Google Sheets Auto-Import & Backup
  if (hasFirebase) {
    var resData = null;
    switch (action) {
      case 'get_me': {
        const activeUser = JSON.parse(sessionStorage.getItem('time_user') || 'null');
        if (activeUser && activeUser.role) {
          resData = { success: true, role: activeUser.role, name: activeUser.name, user: activeUser };
        } else {
          resData = { success: false, message: 'غير مسجل الدخول' };
        }
        break;
      }

      case 'login':
        resData = await fbLogin(payload.username, payload.password);
        if ((!resData || !resData.success) && hasGoogleScript) {
          const gsRes = await callGoogleScript();
          if (gsRes && (gsRes.success || gsRes.role)) {
            if (gsRes.user && typeof fbCreateEmployee === 'function') {
              fbCreateEmployee({
                id: gsRes.user.id || gsRes.user.ID,
                name: gsRes.user.name || gsRes.user.Name,
                username: payload.username,
                password: payload.password,
                shift_start: gsRes.user.shift_start || gsRes.user.ShiftStart || '08:00',
                shift_end: gsRes.user.shift_end || gsRes.user.ShiftEnd || '17:00'
              }).catch(function() {});
            }
            return { ok: true, ...gsRes };
          }
        }
        break;

      case 'device_status':
        resData = await fbCheckDeviceStatus();
        break;

      case 'my_logs':
        resData = await fbGetMyLogs(payload.userId);
        if ((!resData || resData.length === 0) && hasGoogleScript) {
          const gsRes = await callGoogleScript();
          if (gsRes && Array.isArray(gsRes) && gsRes.length > 0) return gsRes;
          if (gsRes && Array.isArray(gsRes.data) && gsRes.data.length > 0) return gsRes.data;
        }
        break;

      case 'my_notifications':
        resData = await fbGetMyNotifications(payload.userId);
        if ((!resData || resData.length === 0) && hasGoogleScript) {
          const gsRes = await callGoogleScript();
          if (gsRes && Array.isArray(gsRes) && gsRes.length > 0) return gsRes;
          if (gsRes && Array.isArray(gsRes.data) && gsRes.data.length > 0) return gsRes.data;
        }
        break;

      case 'admin_employees':
        resData = await fbGetAdminEmployees();
        if ((!resData || resData.length === 0) && hasGoogleScript) {
          const gsRes = await callGoogleScript();
          if (gsRes) {
            const list = Array.isArray(gsRes) ? gsRes : (gsRes.users || gsRes.employees || []);
            if (list && list.length > 0) {
              list.forEach(emp => {
                if (typeof fbCreateEmployee === 'function') {
                  fbCreateEmployee({
                    id: emp.id || emp.ID,
                    name: emp.name || emp.Name,
                    username: emp.username || emp.Username,
                    password: emp.password || emp.Password || '123456',
                    shift_start: emp.shift_start || emp.ShiftStart || '08:00',
                    shift_end: emp.shift_end || emp.ShiftEnd || '17:00'
                  }).catch(function() {});
                }
              });
              return list;
            }
          }
        }
        break;

      case 'admin_attendance':
        resData = await fbGetAdminAttendance();
        if ((!resData || resData.length === 0) && hasGoogleScript) {
          const gsRes = await callGoogleScript();
          if (gsRes) {
            const list = Array.isArray(gsRes) ? gsRes : (gsRes.attendance || gsRes.logs || []);
            if (list && list.length > 0) return list;
          }
        }
        break;

      case 'admin_notifications_list':
        resData = await fbGetAdminNotifications();
        if ((!resData || resData.length === 0) && hasGoogleScript) {
          const gsRes = await callGoogleScript();
          if (gsRes) {
            const list = Array.isArray(gsRes) ? gsRes : (gsRes.notifications || []);
            if (list && list.length > 0) return list;
          }
        }
        break;

      case 'admin_devices':
        resData = await fbGetAuthorizedDevices();
        if ((!resData || resData.length === 0) && hasGoogleScript) {
          const gsRes = await callGoogleScript();
          if (gsRes) {
            const list = Array.isArray(gsRes) ? gsRes : (gsRes.devices || []);
            if (list && list.length > 0) return list;
          }
        }
        break;

      case 'authorize_device':
        resData = await fbAuthorizeDevice(payload.name, payload.password);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'check_in':
        resData = await fbCheckIn(payload.userId);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'check_out':
        resData = await fbCheckOut(payload.userId);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'create_employee':
        resData = await fbCreateEmployee(payload);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'update_employee':
        resData = await fbUpdateEmployee(payload);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'delete_employee':
        resData = await fbDeleteEmployee(payload.id);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'send_notification':
        resData = await fbSendNotification(payload);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'revoke_device':
        resData = await fbRevokeDevice(payload.token);
        if (hasGoogleScript) callGoogleScript();
        break;

      case 'change_admin_password':
        resData = await fbChangeAdminCredentials(payload);
        if (hasGoogleScript) callGoogleScript();
        break;

      default:
        break;
    }

    if (resData !== null && resData !== undefined) {
      if (Array.isArray(resData)) return resData;
      return { ok: resData.success !== false, ...resData };
    }
  }

  // 2. Fallback to Google Apps Script Webhook
  if (hasGoogleScript) {
    const gsRes = await callGoogleScript();
    if (gsRes !== null) {
      if (Array.isArray(gsRes)) return gsRes;
      return { ok: gsRes.success !== false, ...gsRes };
    }
  }

  return { ok: false, success: false, message: 'تعذر الاتصال بقواعد البيانات السحابية.' };
}

// Check Device Authorization & Active Session
async function checkActiveSession() {
  try {
    const devStatus = await sendApiRequest('device_status');
    if (devStatus && devStatus.authorized === false) {
      if (!window.location.pathname.includes('unauthorized.html')) {
        window.location.href = 'unauthorized.html';
        return;
      }
    }

    const activeUser = JSON.parse(sessionStorage.getItem('time_user') || 'null');
    const path = window.location.pathname;
    if (activeUser && activeUser.role) {
      if (activeUser.role === 'admin') {
        if (!path.includes('admin.html')) window.location.href = 'admin.html';
      } else {
        if (!path.includes('employee.html')) window.location.href = 'employee.html';
      }
    } else {
      if (path.includes('admin.html') || path.includes('employee.html')) {
        window.location.href = 'index.html';
      }
    }
  } catch (err) {
    console.error('Device/Session check error:', err);
  }
}

// Logout handler
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      sessionStorage.removeItem('time_user');
      window.location.href = 'index.html';
    } catch (err) {
      showToast('خطأ أثناء تسجيل الخروج.', 'danger');
    }
  });
}

// Login form handler
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const data = await sendApiRequest('login', { username, password });

      if (data.success && data.role) {
        sessionStorage.setItem('time_user', JSON.stringify({
          id: data.user ? data.user.id : (data.role === 'admin' ? 'admin' : username),
          name: data.name || (data.user ? data.user.name : 'المستخدم'),
          username: username,
          role: data.role
        }));

        showToast('تم تسجيل الدخول بنجاح.', 'success');
        setTimeout(() => {
          if (data.role === 'admin') {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'employee.html';
          }
        }, 1000);
      } else {
        showToast(data.message || 'فشل تسجيل الدخول.', 'danger');
      }
    } catch (err) {
      showToast('خطأ في الاتصال بالخادم.', 'danger');
    }
  });
}


/* ==========================================================
   EMPLOYEE DASHBOARD LOGIC
   ========================================================== */

let clockInterval = null;

async function initEmployeeDashboard() {
  await checkActiveSession();
  runDigitalClock();
  loadEmployeeInfo();

  const checkinBtn = document.getElementById('checkin-btn');
  const checkoutBtn = document.getElementById('checkout-btn');

  if (checkinBtn) {
    checkinBtn.addEventListener('click', async () => {
      try {
        const data = await sendApiRequest('check_in');
        if (data.success || data.ok) {
          showToast(data.message, 'success');
          loadEmployeeInfo();
        } else {
          showToast(data.message || 'فشل تسجيل الحضور.', 'danger');
        }
      } catch (err) {
        showToast('خطأ في الاتصال بالخادم.', 'danger');
      }
    });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
      try {
        const data = await sendApiRequest('check_out');
        if (data.success || data.ok) {
          showToast(data.message, 'success');
          loadEmployeeInfo();
        } else {
          showToast(data.message || 'فشل تسجيل الانصراف.', 'danger');
        }
      } catch (err) {
        showToast('خطأ في الاتصال بالخادم.', 'danger');
      }
    });
  }
}

function runDigitalClock() {
  const clockEl = document.getElementById('digital-clock');
  const dateEl = document.getElementById('current-date');
  if (!clockEl) return;

  const update = () => {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('ar-EG-u-nu-latn', { hour12: false });
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (dateEl) dateEl.innerText = now.toLocaleDateString('ar-EG-u-nu-latn', options);
  };
  
  update();
  clockInterval = setInterval(update, 1000);
}

async function loadEmployeeInfo() {
  try {
    const user = JSON.parse(sessionStorage.getItem('time_user') || 'null');
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    if (user.role === 'admin') {
      window.location.href = 'admin.html';
      return;
    }
    
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.innerText = `أهلاً بك، ${user.name}`;

    const logsData = await sendApiRequest('my_logs', { userId: user.id });
    const logs = Array.isArray(logsData) ? logsData : (logsData.logs || []);
    renderEmployeeAttendanceHistory(logs);

    const notifData = await sendApiRequest('my_notifications', { userId: user.id });
    const notifications = Array.isArray(notifData) ? notifData : (notifData.notifications || []);
    renderEmployeeNotifications(notifications);

  } catch (err) {
    console.error('Error loading employee info:', err);
  }
}

function renderEmployeeAttendanceHistory(logs) {
  const tbody = document.getElementById('employee-logs-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">لا توجد حركات حضور مسجلة لك بعد.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  logs.forEach(log => {
    const dateText = log.date || (log.check_in ? log.check_in.split('T')[0] : '-');
    const checkInTimeText = formatTimeString(log.check_in, '08:00');
    const checkOutTimeText = log.check_out ? formatTimeString(log.check_out, '17:00') : '<span class="badge badge-warning">دوام نشط</span>';
    const hoursText = log.hours ? `${log.hours} ساعة` : '-';
    
    let latenessSpan = '<span style="color:var(--text-muted);">-</span>';
    if (log.lateness_minutes > 0) {
      latenessSpan = `<span class="badge badge-danger">تأخير: ${log.lateness_text || formatMinutesText(log.lateness_minutes)}</span>`;
    }

    let overtimeSpan = '<span style="color:var(--text-muted);">-</span>';
    if (log.overtime_minutes > 0) {
      overtimeSpan = `<span class="badge badge-info">إضافي: ${log.overtime_text || formatMinutesText(log.overtime_minutes)}</span>`;
    }

    let statusSpan = '';
    if (!log.check_out) {
      statusSpan = '<span class="badge badge-success">حاضر الآن</span>';
    } else {
      statusSpan = '<span class="badge badge-info">مكتمل</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dateText}</td>
      <td>${checkInTimeText}</td>
      <td>${latenessSpan}</td>
      <td>${checkOutTimeText}</td>
      <td>${overtimeSpan}</td>
      <td>${hoursText}</td>
      <td>${statusSpan}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderEmployeeNotifications(notifications) {
  const container = document.getElementById('notifications-list');
  const countEl = document.getElementById('notification-count');
  if (!container) return;

  const unread = notifications.filter(n => !n.read).length;
  if (unread > 0 && countEl) {
    countEl.innerText = unread;
    countEl.style.display = 'inline-flex';
  } else if (countEl) {
    countEl.style.display = 'none';
  }

  if (notifications.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">لا توجد أي إشعارات أو مكافآت.</div>`;
    return;
  }

  container.innerHTML = '';
  notifications.forEach(n => {
    const dateObj = new Date(n.created_at || Date.now());
    const dateText = dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = `notification-item ${n.type === 'reward' ? 'reward' : 'warning'}`;
    
    let typeBadge = '';
    let amountText = '';
    
    if (n.type === 'reward') {
      typeBadge = '<span class="badge badge-success">🎁 جائزة / مكافأة</span>';
      if (n.amount) {
        amountText = `<span style="font-weight:700; color:var(--success); font-size:16px;">+${n.amount}$</span>`;
      }
    } else {
      typeBadge = '<span class="badge badge-danger">⚠️ تنبيه / إنذار</span>';
    }

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span>${typeBadge}</span>
        ${amountText}
      </div>
      <div style="font-size:14px;">${n.message}</div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">${dateText}</div>
    `;
    container.appendChild(div);
  });
}


/* ==========================================================
   ADMIN DASHBOARD LOGIC
   ========================================================== */

let allLogsCached = [];
let allEmployeesCached = [];
let selectedEmployeeId = '';

async function initAdminDashboard() {
  await checkActiveSession();
  loadAdminHeaderInfo();
  loadAdminStats();
  loadAllEmployees();
  loadAllLogs();
  loadDevices();
  loadAdminAccountSettings();

  const searchInput = document.getElementById('log-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyLogFilters();
    });
  }

  const filterSelect = document.getElementById('employee-filter-select');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      selectedEmployeeId = e.target.value;
      applyLogFilters();
    });
  }

  const employeeForm = document.getElementById('employee-form');
  if (employeeForm) {
    employeeForm.addEventListener('submit', handleEmployeeFormSubmit);
  }

  const notifForm = document.getElementById('send-notification-form');
  if (notifForm) {
    notifForm.addEventListener('submit', handleSendNotification);
  }

  const settingsForm = document.getElementById('admin-settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', handleAdminSettingsSubmit);
  }
}

async function loadAdminHeaderInfo() {
  try {
    const user = JSON.parse(sessionStorage.getItem('time_user') || 'null');
    if (!user || user.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }
    if (user && user.name) {
      const nameEl = document.getElementById('admin-display-name');
      if (nameEl) nameEl.innerText = `${user.name} (المدير العام)`;
    }
  } catch (err) {
    console.error(err);
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  const activePane = document.getElementById(tabId);
  if (activePane) activePane.classList.add('active');
  
  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => {
    const attr = btn.getAttribute('onclick');
    return attr && attr.includes(tabId);
  });
  if (activeBtn) activeBtn.classList.add('active');
}

async function loadAdminStats() {
  try {
    const empData = await sendApiRequest('admin_employees');
    let employees = [];
    if (Array.isArray(empData)) employees = empData;
    else if (empData && Array.isArray(empData.employees)) employees = empData.employees;
    else if (empData && Array.isArray(empData.users)) employees = empData.users;
    
    const empCountEl = document.getElementById('admin-stat-employees');
    if (empCountEl) empCountEl.innerText = employees.length;

    const logsData = await sendApiRequest('admin_attendance');
    let logs = [];
    if (Array.isArray(logsData)) logs = logsData;
    else if (logsData && Array.isArray(logsData.logs)) logs = logsData.logs;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(l => l.date === todayStr || (l.check_in && String(l.check_in).startsWith(todayStr)));
    const presentCount = todayLogs.filter(l => l.check_in && !l.check_out).length;
    const presentEl = document.getElementById('admin-stat-present');
    if (presentEl) presentEl.innerText = presentCount;

    const devStatus = await sendApiRequest('device_status');
    const devEl = document.getElementById('admin-stat-devices');
    if (devEl) {
      const count = (devStatus && devStatus.deviceCount !== undefined) ? devStatus.deviceCount : 1;
      const max = (devStatus && devStatus.maxDevices !== undefined) ? devStatus.maxDevices : 3;
      devEl.innerText = `${count} / ${max}`;
    }

  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadAllEmployees() {
  try {
    const resData = await sendApiRequest('admin_employees');
    if (!resData) return;

    if (Array.isArray(resData)) {
      allEmployeesCached = resData;
    } else if (resData.employees && Array.isArray(resData.employees)) {
      allEmployeesCached = resData.employees;
    } else if (resData.users && Array.isArray(resData.users)) {
      allEmployeesCached = resData.users;
    } else {
      allEmployeesCached = [];
    }

    const tbody = document.getElementById('employees-table-body');
    if (tbody) {
      if (allEmployeesCached.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">لا يوجد أي موظفين مسجلين حالياً.</td></tr>`;
      } else {
        tbody.innerHTML = '';
        allEmployeesCached.forEach(emp => {
          const shiftStart = formatTimeString(emp.shift_start, '08:00');
          const shiftEnd = formatTimeString(emp.shift_end, '17:00');
          const tr = document.createElement('tr');

          const tdInfo = document.createElement('td');
          tdInfo.style.fontWeight = '600';
          tdInfo.innerHTML = `${emp.name || 'موظف'}<div style="font-size:11px; color:var(--text-muted);">دوام رسمي: ${shiftStart} - ${shiftEnd}</div>`;

          const tdUser = document.createElement('td');
          tdUser.innerHTML = `<code>${emp.username || ''}</code>`;

          const tdEdit = document.createElement('td');
          const editBtn = document.createElement('button');
          editBtn.className = 'btn btn-secondary btn-sm';
          editBtn.innerText = '✏️ تعديل';
          editBtn.onclick = () => openEmployeeModal(emp.id, emp.name, emp.username, shiftStart, shiftEnd);
          tdEdit.appendChild(editBtn);

          const tdDel = document.createElement('td');
          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn-danger btn-sm';
          delBtn.innerText = '🗑️ حذف';
          delBtn.onclick = () => handleDeleteEmployee(emp.id, emp.name);
          tdDel.appendChild(delBtn);

          tr.appendChild(tdInfo);
          tr.appendChild(tdUser);
          tr.appendChild(tdEdit);
          tr.appendChild(tdDel);
          tbody.appendChild(tr);
        });
      }
    }

    populateEmployeeDropdowns();

  } catch (err) {
    console.error('Error loading employees:', err);
  }
}

function populateEmployeeDropdowns() {
  const filterSelect = document.getElementById('employee-filter-select');
  const notifSelect = document.getElementById('notif-employee-select');

  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">جميع الموظفين</option>';
    allEmployeesCached.forEach(emp => {
      filterSelect.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
    });
  }

  if (notifSelect) {
    notifSelect.innerHTML = '<option value="">اختر الموظف...</option>';
    allEmployeesCached.forEach(emp => {
      notifSelect.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.username})</option>`;
    });
  }
}

async function loadAllLogs() {
  try {
    const resData = await sendApiRequest('admin_attendance');
    if (Array.isArray(resData)) {
      allLogsCached = resData;
    } else if (resData && Array.isArray(resData.attendance)) {
      allLogsCached = resData.attendance;
    } else {
      allLogsCached = [];
    }

    applyLogFilters();
  } catch (err) {
    console.error('Error loading all logs:', err);
  }
}

function applyLogFilters() {
  const searchInput = document.getElementById('log-search-input');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let filtered = allLogsCached.filter(log => {
    const matchesUser = !selectedEmployeeId || String(log.user_id) === String(selectedEmployeeId);
    const nameMatch = (log.user_name || '').toLowerCase().includes(searchTerm);
    const dateMatch = (log.date || '').includes(searchTerm);
    return matchesUser && (nameMatch || dateMatch);
  });

  renderAdminAttendanceTable(filtered);
}

function renderAdminAttendanceTable(logs) {
  const tbody = document.getElementById('admin-logs-table-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">لا توجد حركات حضور مطابقة.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  logs.forEach(log => {
    const dateText = log.date || (log.check_in ? log.check_in.split('T')[0] : '-');
    const checkInTimeText = formatTimeString(log.check_in, '08:00');
    const checkOutTimeText = log.check_out ? formatTimeString(log.check_out, '17:00') : '<span class="badge badge-warning">نشط</span>';
    const hoursText = log.hours ? `${log.hours} ساعة` : '-';
    
    let latenessSpan = '<span style="color:var(--text-muted);">-</span>';
    if (log.lateness_minutes > 0) {
      latenessSpan = `<span class="badge badge-danger">تأخير: ${log.lateness_text || formatMinutesText(log.lateness_minutes)}</span>`;
    }

    let overtimeSpan = '<span style="color:var(--text-muted);">-</span>';
    if (log.overtime_minutes > 0) {
      overtimeSpan = `<span class="badge badge-info">إضافي: ${log.overtime_text || formatMinutesText(log.overtime_minutes)}</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${log.user_name || 'موظف'}</td>
      <td>${dateText}</td>
      <td>${checkInTimeText}</td>
      <td>${latenessSpan}</td>
      <td>${checkOutTimeText}</td>
      <td>${overtimeSpan}</td>
      <td>${hoursText}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Modal Handlers
function openEmployeeModal(id = '', name = '', username = '', shiftStart = '08:00', shiftEnd = '17:00') {
  const modal = document.getElementById('employee-modal');
  const title = document.getElementById('modal-title');
  const empId = document.getElementById('emp-id');
  const empName = document.getElementById('emp-name');
  const empUser = document.getElementById('emp-username');
  const empPass = document.getElementById('emp-password');
  const empStart = document.getElementById('emp-shift-start');
  const empEnd = document.getElementById('emp-shift-end');

  if (!modal) return;

  empId.value = id;
  empName.value = name;
  empUser.value = username;
  empPass.value = '';
  empStart.value = shiftStart;
  empEnd.value = shiftEnd;

  if (id) {
    title.innerText = 'تعديل بيانات الموظف';
    empPass.placeholder = 'اتركه فارغاً للحفاظ على كلمة المرور السابقة';
  } else {
    title.innerText = 'إضافة موظف جديد';
    empPass.placeholder = 'أدخل كلمة مرور الحساب';
  }

  modal.classList.add('active');
}

function closeEmployeeModal() {
  const modal = document.getElementById('employee-modal');
  if (modal) modal.classList.remove('active');
}

async function handleEmployeeFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('emp-id').value;
  const name = document.getElementById('emp-name').value;
  const username = document.getElementById('emp-username').value;
  const password = document.getElementById('emp-password').value;
  const shift_start = document.getElementById('emp-shift-start').value;
  const shift_end = document.getElementById('emp-shift-end').value;

  const action = id ? 'update_employee' : 'create_employee';
  const payload = { id, name, username, password, shift_start, shift_end };

  try {
    const data = await sendApiRequest(action, payload);
    if (data.success || data.ok) {
      showToast(data.message || 'تم حفظ بيانات الموظف بنجاح.', 'success');
      closeEmployeeModal();
      loadAllEmployees();
    } else {
      showToast(data.message || 'فشل في تنفيذ العملية.', 'danger');
    }
  } catch (err) {
    showToast('خطأ أثناء حفظ البيانات.', 'danger');
  }
}

async function handleDeleteEmployee(id, name) {
  if (!confirm(`هل أنت تأكد من رغبتك في حذف الموظف "${name}"؟`)) return;

  try {
    const data = await sendApiRequest('delete_employee', { id });
    if (data.success || data.ok) {
      showToast(data.message || 'تم حذف الموظف بنجاح.', 'success');
      loadAllEmployees();
    } else {
      showToast(data.message || 'فشل في حذف الموظف.', 'danger');
    }
  } catch (err) {
    showToast('خطأ أثناء عملية الحذف.', 'danger');
  }
}

async function handleSendNotification(e) {
  e.preventDefault();
  const userId = document.getElementById('notif-employee-select').value;
  const type = document.getElementById('notif-type').value;
  const message = document.getElementById('notif-message').value;
  const amount = document.getElementById('notif-amount').value;

  if (!userId) {
    showToast('يرجى اختيار الموظف أولاً.', 'danger');
    return;
  }

  try {
    const data = await sendApiRequest('send_notification', { userId, type, message, amount });
    if (data.success || data.ok) {
      showToast(data.message || 'تم إرسال الإشعار بنجاح.', 'success');
      document.getElementById('send-notification-form').reset();
    } else {
      showToast(data.message || 'فشل إرسال الإشعار.', 'danger');
    }
  } catch (err) {
    showToast('خطأ أثناء إرسال الإشعار.', 'danger');
  }
}

async function loadDevices() {
  try {
    const resData = await sendApiRequest('admin_devices');
    const tbody = document.getElementById('devices-table-body');
    if (!tbody) return;

    let devices = Array.isArray(resData) ? resData : (resData.devices || []);
    if (devices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">لا يوجد أجهزة مصرح بها مسجلة بعد.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    devices.forEach(dev => {
      const authDate = new Date(dev.authorized_at || Date.now()).toLocaleDateString('ar-EG');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${dev.name || 'حاسوب شركة'}</td>
        <td><code>${dev.token || ''}</code></td>
        <td>${authDate}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="handleRevokeDevice('${dev.token}')">إلغاء التفويض</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Error loading devices:', err);
  }
}

async function handleRevokeDevice(token) {
  if (!confirm('هل أنت تأكد من إلغاء تفويض هذا الجهاز؟')) return;

  try {
    const data = await sendApiRequest('revoke_device', { token });
    if (data.success || data.ok) {
      showToast(data.message || 'تم إلغاء تفويض الجهاز بنجاح.', 'success');
      loadDevices();
      loadAdminStats();
    } else {
      showToast(data.message || 'فشل إلغاء التفعيل.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم.', 'danger');
  }
}

async function loadAdminAccountSettings() {
  const user = JSON.parse(sessionStorage.getItem('time_user') || 'null');
  if (user) {
    const nameInput = document.getElementById('admin-setting-name');
    const userInput = document.getElementById('admin-setting-username');
    if (nameInput) nameInput.value = user.name || 'المدير العام';
    if (userInput) userInput.value = user.username || 'admin';
  }
}

async function handleAdminSettingsSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('admin-setting-name').value;
  const username = document.getElementById('admin-setting-username').value;
  const password = document.getElementById('admin-setting-password').value;

  if (!password) {
    showToast('يرجى إدخال كلمة المرور الجديدة للحساب.', 'danger');
    return;
  }

  try {
    const data = await sendApiRequest('change_admin_password', { name, username, password });
    if (data.success || data.ok) {
      showToast('تم تعديل بيانات حساب المدير بنجاح.', 'success');
      sessionStorage.setItem('time_user', JSON.stringify({ id: 'admin', name, username, role: 'admin' }));
      loadAdminHeaderInfo();
      document.getElementById('admin-setting-password').value = '';
    } else {
      showToast(data.message || 'فشل التعديل.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في إرسال البيانات.', 'danger');
  }
}
