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

// Initialize theme immediately
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
});

// Universal API Dispatcher supporting Google Sheets Webhook and Node Backend
async function sendApiRequest(action, payload = {}, pathUrl = '', method = 'GET') {
  if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
    const activeUser = JSON.parse(sessionStorage.getItem('time_user') || 'null');
    if (activeUser) {
      payload.userId = activeUser.id;
      payload.current_user = activeUser;
    }
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    const data = await res.json();
    return { ok: true, ...data };
  } else {
    const isPost = method === 'POST' || (payload && Object.keys(payload).length > 0 && method !== 'GET');
    const options = {
      method: method !== 'GET' ? method : (isPost ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json' }
    };
    if (isPost) options.body = JSON.stringify(payload);
    
    const res = await fetch(pathUrl, options);
    const data = await res.json();
    return { ok: res.ok, ...data };
  }
}

// Check session and redirect if logged in (for login page)
async function checkActiveSession() {
  try {
    if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
      const activeUser = JSON.parse(sessionStorage.getItem('time_user') || 'null');
      if (activeUser) {
        if (activeUser.role === 'admin') {
          window.location.href = '/admin.html';
        } else {
          window.location.href = '/employee.html';
        }
      }
      return;
    }
    const data = await sendApiRequest('get_me', {}, '/api/auth/me');
    if (data.ok && data.role) {
      if (data.role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/employee.html';
      }
    }
  } catch (err) {
    console.error('Session check failed:', err);
  }
}

// Logout handler
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
        sessionStorage.removeItem('time_user');
        window.location.href = '/';
        return;
      }
      const data = await sendApiRequest('logout', {}, '/api/auth/logout', 'POST');
      if (data.ok) {
        window.location.href = '/';
      }
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
      const data = await sendApiRequest('login', { username, password }, '/api/auth/login', 'POST');

      if (data.success || data.ok) {
        if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
          sessionStorage.setItem('time_user', JSON.stringify({
            id: data.user ? data.user.id : (data.role === 'admin' ? 'admin' : username),
            name: data.name || (data.user ? data.user.name : 'المستخدم'),
            username: username,
            role: data.role
          }));
        }
        showToast('تم تسجيل الدخول بنجاح.', 'success');
        setTimeout(() => {
          if (data.role === 'admin') {
            window.location.href = '/admin.html';
          } else {
            window.location.href = '/employee.html';
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

function initEmployeeDashboard() {
  runDigitalClock();
  loadEmployeeInfo();

  const checkinBtn = document.getElementById('checkin-btn');
  const checkoutBtn = document.getElementById('checkout-btn');

  if (checkinBtn) {
    checkinBtn.addEventListener('click', async () => {
      try {
        const data = await sendApiRequest('check_in', {}, '/api/attendance/check-in', 'POST');
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
        const data = await sendApiRequest('check_out', {}, '/api/attendance/check-out', 'POST');
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
    dateEl.innerText = now.toLocaleDateString('ar-EG-u-nu-latn', options);
  };
  
  update();
  clockInterval = setInterval(update, 1000);
}

async function loadEmployeeInfo() {
  try {
    let user = null;
    if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
      user = JSON.parse(sessionStorage.getItem('time_user') || 'null');
      if (!user) {
        window.location.href = '/';
        return;
      }
    } else {
      const resData = await sendApiRequest('get_me', {}, '/api/auth/me');
      if (!resData.ok) {
        window.location.href = '/';
        return;
      }
      user = resData;
    }
    
    document.getElementById('user-display-name').innerText = `أهلاً بك، ${user.name}`;

    const logsData = await sendApiRequest('my_logs', { userId: user.id }, '/api/attendance/my-logs');
    const logs = Array.isArray(logsData) ? logsData : (logsData.logs || []);
    renderEmployeeAttendanceHistory(logs);

    const notifData = await sendApiRequest('my_notifications', { userId: user.id }, '/api/notifications/my-notifications');
    const notifications = Array.isArray(notifData) ? notifData : (notifData.notifications || []);
    renderEmployeeNotifications(notifications);

  } catch (err) {
    console.error('Error loading employee info:', err);
  }
}

function renderEmployeeAttendanceHistory(logs) {
  const tbody = document.getElementById('attendance-history-body');
  const statDays = document.getElementById('stat-days-count');
  const statHours = document.getElementById('stat-total-hours');
  const statusBadge = document.getElementById('attendance-status-badge');
  const checkinBtn = document.getElementById('checkin-btn');
  const checkoutBtn = document.getElementById('checkout-btn');

  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">لا توجد أي سجلات حضور سابقة.</td></tr>`;
    statDays.innerText = '0';
    statHours.innerText = '0';
    statusBadge.innerText = 'لم تسجل الحضور اليوم';
    statusBadge.className = 'badge badge-warning';
    checkinBtn.disabled = false;
    checkoutBtn.disabled = true;
    return;
  }

  // Calculate stats for this month
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const thisMonthLogs = logs.filter(l => {
    const d = new Date(l.check_in);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  statDays.innerText = thisMonthLogs.length.toString();
  const totalMins = thisMonthLogs.reduce((sum, l) => {
    if (l.check_in && l.check_out) {
      return sum + Math.floor((new Date(l.check_out) - new Date(l.check_in)) / (1000 * 60));
    }
    return sum + Math.round((l.hours || 0) * 60);
  }, 0);
  statHours.innerText = formatMinutesText(totalMins);

  // Check today's status
  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayLog = logs.find(l => l.date === todayStr);

  if (!todayLog) {
    statusBadge.innerText = 'خارج العمل (لم تسجل الحضور اليوم)';
    statusBadge.className = 'badge badge-warning';
    checkinBtn.disabled = false;
    checkoutBtn.disabled = true;
  } else if (todayLog.check_in && !todayLog.check_out) {
    const timeStr = new Date(todayLog.check_in).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false });
    statusBadge.innerText = `حاضر - قيد العمل منذ (${timeStr})`;
    statusBadge.className = 'badge badge-success';
    checkinBtn.disabled = true;
    checkoutBtn.disabled = false;
  } else {
    statusBadge.innerText = 'انصرفت (تم تسجيل الخروج اليوم)';
    statusBadge.className = 'badge badge-info';
    checkinBtn.disabled = true;
    checkoutBtn.disabled = true;
  }

  // Render Table
  tbody.innerHTML = '';
  logs.forEach(log => {
    const dateObj = new Date(log.check_in);
    const dateText = dateObj.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'numeric' });
    const checkInTimeText = dateObj.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false });
    const checkOutTimeText = log.check_out 
      ? new Date(log.check_out).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false }) 
      : 'قيد العمل';
    let hoursText = '-';
    if (log.hours_formatted) {
      hoursText = log.hours_formatted;
    } else if (log.check_in && log.check_out) {
      const mins = Math.floor((new Date(log.check_out) - new Date(log.check_in)) / (1000 * 60));
      hoursText = formatMinutesText(mins);
    } else if (log.hours !== null) {
      hoursText = formatMinutesText(Math.round(log.hours * 60));
    }
    
    // Lateness formatting
    let latenessSpan = '<span style="color:var(--text-muted);">-</span>';
    if (log.lateness_minutes > 0) {
      latenessSpan = `<span class="badge badge-danger">تأخير: ${log.lateness_text || formatMinutesText(log.lateness_minutes)}</span>`;
    }

    // Overtime formatting
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
    container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 20px;">لا توجد أي إشعارات أو مكافآت.</div>`;
    return;
  }

  container.innerHTML = '';
  notifications.forEach(n => {
    const dateObj = new Date(n.created_at);
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
      <div class="notification-header">
        <span class="notification-title">${typeBadge}</span>
        ${amountText}
      </div>
      <div class="notification-body">${n.message}</div>
      <div class="meta">
        <span>${dateText}</span>
      </div>
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

function initAdminDashboard() {
  loadAdminHeaderInfo();
  loadAdminStats();
  loadAllEmployees();
  loadAllLogs();
  loadDevices();
  loadAdminAccountSettings();

  // Search input handler for logs
  const searchInput = document.getElementById('log-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyLogFilters();
    });
  }

  // Employee Filter Dropdown handler
  const filterSelect = document.getElementById('employee-filter-select');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      selectedEmployeeId = e.target.value;
      applyLogFilters();
    });
  }

  // Employee Form submit handler
  const employeeForm = document.getElementById('employee-form');
  if (employeeForm) {
    employeeForm.addEventListener('submit', handleEmployeeFormSubmit);
  }

  // Send Notification form submit handler
  const notifForm = document.getElementById('send-notification-form');
  if (notifForm) {
    notifForm.addEventListener('submit', handleSendNotification);
  }

  // Admin Settings Form submit
  const settingsForm = document.getElementById('admin-settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', handleAdminSettingsSubmit);
  }
}

async function loadAdminHeaderInfo() {
  try {
    let user = null;
    if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
      user = JSON.parse(sessionStorage.getItem('time_user') || 'null');
    } else {
      user = await sendApiRequest('get_me', {}, '/api/auth/me');
    }
    if (user && user.name) {
      const nameEl = document.getElementById('admin-display-name');
      if (nameEl) nameEl.innerText = `${user.name} (أدمن)`;
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

  document.getElementById(tabId).classList.add('active');
  
  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => 
    btn.getAttribute('onclick').includes(tabId)
  );
  if (activeBtn) activeBtn.classList.add('active');
}

async function loadAdminStats() {
  try {
    const empData = await sendApiRequest('admin_employees', {}, '/api/admin/employees');
    const employees = Array.isArray(empData) ? empData : (empData.employees || []);
    document.getElementById('admin-stat-employees').innerText = employees.length;

    const logsData = await sendApiRequest('admin_attendance', {}, '/api/admin/attendance');
    const logs = Array.isArray(logsData) ? logsData : (logsData.logs || []);
    
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayLogs = logs.filter(l => l.date === todayStr);
    const presentCount = todayLogs.filter(l => l.check_in && !l.check_out).length;
    document.getElementById('admin-stat-present').innerText = presentCount;

    const devStatus = await sendApiRequest('device_status', {}, '/api/device/status');
    document.getElementById('admin-stat-devices').innerText = `${devStatus.deviceCount || 1} / ${devStatus.maxDevices || 3}`;

  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadAllEmployees() {
  try {
    const resData = await sendApiRequest('admin_employees', {}, '/api/admin/employees');
    if (!resData.ok && !Array.isArray(resData) && typeof GOOGLE_SCRIPT_URL === 'undefined') {
      window.location.href = '/';
      return;
    }
    allEmployeesCached = Array.isArray(resData) ? resData : (resData.employees || []);
    
    // Render employee list table
    const tbody = document.getElementById('employees-table-body');
    if (tbody) {
      if (allEmployeesCached.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">لا يوجد أي موظفين مسجلين حالياً.</td></tr>`;
      } else {
        tbody.innerHTML = '';
        allEmployeesCached.forEach(emp => {
          const shiftStart = emp.shift_start || '08:00';
          const shiftEnd = emp.shift_end || '17:00';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:600;">
              ${emp.name}
              <div style="font-size:11px; color:var(--text-muted);">دوام رسمي: ${shiftStart} - ${shiftEnd}</div>
            </td>
            <td><code>${emp.username}</code></td>
            <td>
              <button onclick="openEmployeeModal('${emp.id}', '${emp.name}', '${emp.username}', '${shiftStart}', '${shiftEnd}')" class="btn btn-secondary btn-sm" style="padding: 4px 10px; font-size:12px;">✏️ تعديل</button>
            </td>
            <td>
              <button onclick="deleteEmployee('${emp.id}', '${emp.name}')" class="btn btn-danger btn-sm" style="padding: 4px 10px; font-size:12px;">🗑️ حذف</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    // Populate user select dropdown in notifications tab & filter dropdown
    const select = document.getElementById('notif-user-select');
    if (select) {
      select.innerHTML = '<option value="">-- اختر موظفاً --</option>';
      allEmployeesCached.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.innerText = emp.name;
        select.appendChild(opt);
      });
    }

    const filterSelect = document.getElementById('employee-filter-select');
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">-- كل الموظفين --</option>';
      allEmployeesCached.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.innerText = emp.name;
        if (emp.id === selectedEmployeeId) opt.selected = true;
        filterSelect.appendChild(opt);
      });
    }

  } catch (err) {
    console.error(err);
  }
}

async function loadAllLogs() {
  try {
    const resData = await sendApiRequest('admin_attendance', {}, '/api/admin/attendance');
    allLogsCached = Array.isArray(resData) ? resData : (resData.logs || []);
    applyLogFilters();
  } catch (err) {
    console.error(err);
  }
}

function applyLogFilters() {
  const query = (document.getElementById('log-search-input')?.value || '').toLowerCase().trim();
  const summaryBox = document.getElementById('employee-summary-box');

  let filtered = allLogsCached;

  // Filter by employee if selected
  if (selectedEmployeeId) {
    filtered = filtered.filter(l => l.user_id === selectedEmployeeId);
    
    // Show and update summary box
    if (summaryBox) {
      summaryBox.style.display = 'grid';
      const daysCount = filtered.length;
      const totalHours = filtered.reduce((acc, curr) => acc + (curr.hours || 0), 0);
      const totalLateness = filtered.reduce((acc, curr) => acc + (curr.lateness_minutes || 0), 0);
      const totalOvertime = filtered.reduce((acc, curr) => acc + (curr.overtime_minutes || 0), 0);

      document.getElementById('emp-sum-days').innerText = daysCount;
      document.getElementById('emp-sum-hours').innerText = `${Math.round(totalHours * 10) / 10} ساعة`;
      document.getElementById('emp-sum-lateness').innerText = formatMinutesText(totalLateness);
      document.getElementById('emp-sum-overtime').innerText = formatMinutesText(totalOvertime);
    }
  } else {
    if (summaryBox) summaryBox.style.display = 'none';
  }

  // Filter by search query (date or employee name)
  if (query) {
    filtered = filtered.filter(log => 
      log.user_name.toLowerCase().includes(query) || 
      log.date.includes(query)
    );
  }

  renderAllLogs(filtered);
}

function renderAllLogs(logs) {
  const tbody = document.getElementById('all-logs-table-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">لا توجد أي سجلات حضور في هذا النطاق.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  logs.forEach(log => {
    const dateObj = new Date(log.check_in);
    const dateText = dateObj.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'numeric' });
    const checkInTimeText = dateObj.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false });
    const checkOutTimeText = log.check_out 
      ? new Date(log.check_out).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false }) 
      : 'حاضر الآن (قيد العمل)';
    let hoursText = '-';
    if (log.hours_formatted) {
      hoursText = log.hours_formatted;
    } else if (log.check_in && log.check_out) {
      const mins = Math.floor((new Date(log.check_out) - new Date(log.check_in)) / (1000 * 60));
      hoursText = formatMinutesText(mins);
    } else if (log.hours !== null) {
      hoursText = formatMinutesText(Math.round(log.hours * 60));
    }

    // Lateness formatting
    let latenessSpan = '<span style="color:var(--text-muted);">-</span>';
    if (log.lateness_minutes > 0) {
      latenessSpan = `<span class="badge badge-danger">تأخير: ${log.lateness_text || formatMinutesText(log.lateness_minutes)}</span>`;
    }

    // Overtime formatting
    let overtimeSpan = '<span style="color:var(--text-muted);">-</span>';
    if (log.overtime_minutes > 0) {
      overtimeSpan = `<span class="badge badge-info">إضافي: ${log.overtime_text || formatMinutesText(log.overtime_minutes)}</span>`;
    }

    let statusSpan = '';
    if (!log.check_out) {
      statusSpan = '<span class="badge badge-success">نشط</span>';
    } else {
      statusSpan = '<span class="badge badge-info">انصرف</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${log.user_name}</td>
      <td>${dateText} (<code>${log.date}</code>)</td>
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

function exportLogsToCSV() {
  if (allLogsCached.length === 0) {
    showToast('لا توجد بيانات لتصديرها.', 'warning');
    return;
  }

  const logsToExport = selectedEmployeeId 
    ? allLogsCached.filter(l => l.user_id === selectedEmployeeId) 
    : allLogsCached;

  let csvContent = "\uFEFF";
  csvContent += "اسم الموظف,التاريخ,وقت الحضور,التأخير,وقت الانصراف,الوقت الإضافي,عدد الساعات,الحالة\n";

  logsToExport.forEach(log => {
    const date = log.date;
    const checkIn = new Date(log.check_in).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const lateness = log.lateness_minutes > 0 ? (log.lateness_text || formatMinutesText(log.lateness_minutes)) : "-";
    const checkOut = log.check_out 
      ? new Date(log.check_out).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) 
      : "حاضر الآن";
    const overtime = log.overtime_minutes > 0 ? (log.overtime_text || formatMinutesText(log.overtime_minutes)) : "-";
    const hours = log.hours !== null ? log.hours : "-";
    const status = log.check_out ? "انصرف" : "حاضر";

    csvContent += `"${log.user_name}","${date}","${checkIn}","${lateness}","${checkOut}","${overtime}","${hours}","${status}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `سجل_الحضور_والانصراف_${new Date().toLocaleDateString('en-CA')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Add/Edit Employee Modal handlers
function openEmployeeModal(id = '', name = '', username = '', shiftStart = '08:00', shiftEnd = '17:00') {
  const modal = document.getElementById('employee-modal');
  const title = document.getElementById('modal-title');
  const empIdInput = document.getElementById('employee-id');
  const nameInput = document.getElementById('employee-name');
  const userInput = document.getElementById('employee-username');
  const passInput = document.getElementById('employee-password');
  const passHelp = document.getElementById('password-help');
  const passLabel = document.getElementById('password-label');
  const shiftStartInput = document.getElementById('employee-shift-start');
  const shiftEndInput = document.getElementById('employee-shift-end');

  empIdInput.value = id;
  nameInput.value = name;
  userInput.value = username;
  passInput.value = '';
  shiftStartInput.value = shiftStart || '08:00';
  shiftEndInput.value = shiftEnd || '17:00';

  if (id) {
    title.innerText = 'تعديل بيانات الموظف ومواعيده';
    passInput.required = false;
    passHelp.style.display = 'block';
    passLabel.innerText = 'رمز مرور جديد (اختياري):';
  } else {
    title.innerText = 'إضافة موظف جديد';
    passInput.required = true;
    passHelp.style.display = 'none';
    passLabel.innerText = 'رمز المرور:';
  }

  modal.classList.add('active');
}

function closeEmployeeModal() {
  document.getElementById('employee-modal').classList.remove('active');
}

async function handleEmployeeFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('employee-id').value;
  const name = document.getElementById('employee-name').value;
  const username = document.getElementById('employee-username').value;
  const password = document.getElementById('employee-password').value;
  const shift_start = document.getElementById('employee-shift-start').value;
  const shift_end = document.getElementById('employee-shift-end').value;

  const action = id ? 'update_employee' : 'create_employee';
  const url = id ? `/api/admin/employees/${id}` : '/api/admin/employees';
  const method = id ? 'PUT' : 'POST';

  try {
    const data = await sendApiRequest(action, { id, name, username, password, shift_start, shift_end }, url, method);

    if (data.success || data.ok) {
      showToast(data.message || 'تم حفظ الموظف بنجاح.', 'success');
      closeEmployeeModal();
      loadAllEmployees();
      loadAdminStats();
    } else {
      showToast(data.message || 'فشل حفظ بيانات الموظف.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم.', 'danger');
  }
}

async function deleteEmployee(id, name) {
  if (!confirm(`هل أنت متأكد من حذف الموظف "${name}" نهائياً؟ سيتم حذف جميع سجلاته.`)) {
    return;
  }

  try {
    const data = await sendApiRequest('delete_employee', { id }, `/api/admin/employees/${id}`, 'DELETE');

    if (data.success || data.ok) {
      showToast(data.message || 'تم حذف الموظف بنجاح.', 'success');
      loadAllEmployees();
      loadAdminStats();
      loadAllLogs();
    } else {
      showToast(data.message || 'فشل حذف الموظف.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم.', 'danger');
  }
}

function toggleAmountField() {
  const type = document.getElementById('notif-type').value;
  const group = document.getElementById('amount-group');
  if (type === 'reward') {
    group.style.display = 'flex';
  } else {
    group.style.display = 'none';
    document.getElementById('notif-amount').value = '';
  }
}

async function handleSendNotification(e) {
  e.preventDefault();
  const userId = document.getElementById('notif-user-select').value;
  const type = document.getElementById('notif-type').value;
  const amount = document.getElementById('notif-amount').value;
  const message = document.getElementById('notif-message').value;

  try {
    const data = await sendApiRequest('send_notification', { userId, type, message, amount }, '/api/admin/notifications', 'POST');

    if (data.success || data.ok) {
      showToast(data.message || 'تم إرسال الإشعار بنجاح.', 'success');
      document.getElementById('notif-message').value = '';
      document.getElementById('notif-amount').value = '';
      loadSentNotifications();
    } else {
      showToast(data.message || 'فشل إرسال الإشعار.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم.', 'danger');
  }
}

async function loadSentNotificationsFromApi() {
  const tbody = document.getElementById('sent-notifications-table-body');
  if (!tbody) return;

  try {
    const resData = await sendApiRequest('admin_notifications_list', {}, '/api/admin/notifications-list');
    const notifications = Array.isArray(resData) ? resData : (resData.notifications || []);

    if (notifications.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">لم يتم إرسال أي مكافآت أو تنبيهات بعد.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    notifications.slice(0, 10).forEach(n => {
      const dateText = new Date(n.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
      const typeSpan = n.type === 'reward' 
        ? `<span class="badge badge-success">🎁 مكافأة (${n.amount}$)</span>` 
        : '<span class="badge badge-danger">⚠️ تنبيه</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${n.user_name}</td>
        <td>${typeSpan}</td>
        <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${n.message}">${n.message}</td>
        <td style="font-size:12px;">${dateText}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

function loadSentNotifications() {
  loadSentNotificationsFromApi();
}

async function loadDevices() {
  const tbody = document.getElementById('devices-table-body');
  if (!tbody) return;

  try {
    const resData = await sendApiRequest('admin_devices', {}, '/api/admin/devices');
    const devices = Array.isArray(resData) ? resData : (resData.devices || []);

    if (devices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">لا توجد أجهزة مصرحة حالياً.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    devices.forEach(d => {
      const authDate = new Date(d.authorized_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric', year: 'numeric' });
      const lastUsed = new Date(d.last_used).toLocaleString('ar-EG');
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">💻 ${d.name}</td>
        <td style="font-size:13px;">${authDate}</td>
        <td style="font-size:13px; color:var(--text-muted);">${lastUsed}</td>
        <td>
          <button onclick="revokeDevice('${d.token}', '${d.name}')" class="btn btn-danger btn-sm" style="padding: 4px 10px; font-size:12px;">⚠️ إلغاء الترخيص</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

async function revokeDevice(token, name) {
  if (!confirm(`تحذير: هل أنت متأكد من إلغاء ترخيص الجهاز "${name}"؟ لن يتمكن أي موظف من فتح النظام من هذا الحاسوب بعد الآن.`)) {
    return;
  }

  try {
    const data = await sendApiRequest('revoke_device', { token }, `/api/admin/devices/${token}`, 'DELETE');

    if (data.success || data.ok) {
      showToast(data.message || 'تم إلغاء تصريح الجهاز.', 'success');
      loadDevices();
      loadAdminStats();
    } else {
      showToast(data.message || 'فشل إلغاء الترخيص.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم.', 'danger');
  }
}

async function loadAdminAccountSettings() {
  const nameInput = document.getElementById('admin-name-input');
  const userInput = document.getElementById('admin-user-input');
  if (!userInput) return;

  try {
    let user = null;
    if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
      user = JSON.parse(sessionStorage.getItem('time_user') || 'null');
    } else {
      user = await sendApiRequest('get_me', {}, '/api/auth/me');
    }
    if (user) {
      if (nameInput) nameInput.value = user.name || '';
      userInput.value = user.username || 'admin';
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleAdminSettingsSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('admin-name-input').value;
  const username = document.getElementById('admin-user-input').value;
  const password = document.getElementById('admin-pass-input').value;

  try {
    const data = await sendApiRequest('change_admin_password', { name, username, password }, '/api/admin/change-password', 'POST');

    if (data.success || data.ok) {
      showToast(data.message || 'تم تحديث بيانات الحساب بنجاح.', 'success');
      document.getElementById('admin-pass-input').value = '';
      if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
        const activeUser = JSON.parse(sessionStorage.getItem('time_user') || '{}');
        activeUser.name = name;
        activeUser.username = username;
        sessionStorage.setItem('time_user', JSON.stringify(activeUser));
      }
      loadAdminHeaderInfo();
    } else {
      showToast(data.message || 'فشل تعديل البيانات.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم.', 'danger');
  }
}
