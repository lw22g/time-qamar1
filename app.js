/**
 * ==============================================================================
 * Employee Attendance & Departure System - Frontend Application Logic
 * ==============================================================================
 * 
 * ⚠️ PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL BELOW:
 */
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyPvWvQyE0zEwyKmXU-vWgAEOUMsU423bdT91_Qqi26Odp9SXuJbM9ZDXEhcc9Lq1Tdmw/exec";

// Application State
const state = {
  deviceId: null,
  deviceStatus: 'PENDING', // PENDING, APPROVED, REJECTED
  currentUser: null,       // { role: 'ADMIN'|'EMPLOYEE', ... }
  employees: [],
  attendanceLogs: [],
  pendingDevices: [],
  notifications: []
};

// Initialization on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initDevice();
  setupEventListeners();
  checkSession();
});

/**
 * 1. LIVE CLOCK
 */
function initClock() {
  const clockEl = document.getElementById('clock-display');
  const dateBadgeEl = document.getElementById('today-date-badge');

  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('ar-EG', { hour12: false });
    }
    if (dateBadgeEl) {
      dateBadgeEl.textContent = now.toISOString().split('T')[0];
    }
  }

  update();
  setInterval(update, 1000);
}

/**
 * 2. LOADING SPINNER & PROGRESS BAR CONTROL
 */
function showLoading() {
  const bar = document.getElementById('global-progress-bar');
  const overlay = document.getElementById('loading-overlay');
  if (bar) {
    bar.classList.remove('opacity-0', '-translate-y-full');
    bar.classList.add('opacity-100', 'translate-y-0');
  }
  if (overlay) {
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.remove('opacity-0'), 10);
  }
}

function hideLoading() {
  const bar = document.getElementById('global-progress-bar');
  const overlay = document.getElementById('loading-overlay');
  if (bar) {
    bar.classList.remove('opacity-100', 'translate-y-0');
    bar.classList.add('opacity-0', '-translate-y-full');
  }
  if (overlay) {
    overlay.classList.add('opacity-0');
    setTimeout(() => overlay.classList.add('hidden'), 200);
  }
}

/**
 * 3. DEVICE REGISTRATION & UUID MANAGEMENT
 */
function initDevice() {
  let deviceId = localStorage.getItem('ATTENDANCE_DEVICE_UUID');
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem('ATTENDANCE_DEVICE_UUID', deviceId);
  }
  state.deviceId = deviceId;

  const uuidDisplay = document.getElementById('device-uuid-display');
  if (uuidDisplay) uuidDisplay.value = deviceId;

  verifyDeviceStatus();
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'DEV-' + 'xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function verifyDeviceStatus() {
  const deviceName = detectDeviceName();
  const res = await callApi('checkDeviceStatus', { deviceId: state.deviceId, deviceName });

  if (res && res.success) {
    state.deviceStatus = res.status;
    if (res.status === 'APPROVED') {
      updateConnectionStatusBadge(true);
      if (state.currentUser) {
        routeUserDashboard();
      } else {
        showScreen('login-screen');
      }
    } else {
      showScreen('pending-device-screen');
    }
  } else {
    // If API unconfigured, default to DEMO mode for instant preview
    state.deviceStatus = 'APPROVED';
    updateConnectionStatusBadge(false);
    if (!state.currentUser) {
      showScreen('login-screen');
    }
  }
}

function detectDeviceName() {
  const ua = navigator.userAgent;
  let deviceName = 'Browser Device';
  if (/mobile/i.test(ua)) deviceName = 'Mobile Device';
  if (/iPad|Tablet/i.test(ua)) deviceName = 'Tablet Device';
  if (/Windows/i.test(ua)) deviceName = 'Windows PC';
  if (/Macintosh/i.test(ua)) deviceName = 'Mac Computer';
  return deviceName;
}

/**
 * 4. BACKEND API COMMUNICATION WITH LOADING INDICATOR
 */
async function callApi(action, payload = {}) {
  showLoading();

  // If URL is default placeholder, fallback to Mock Data for local preview
  if (!WEB_APP_URL || WEB_APP_URL.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
    console.warn(`[Demo Mode] WEB_APP_URL not set. Running fallback for action: ${action}`);
    const mockRes = await mockApiHandler(action, payload);
    hideLoading();
    return mockRes;
  }

  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8' // Crucial to avoid GAS CORS preflight issues
      },
      body: JSON.stringify({ action, payload })
    });

    const data = await response.json();
    hideLoading();
    return data;
  } catch (error) {
    console.error('API Call Error:', error);
    showToast('تعذر الاتصال بالخادم، تم التبديل لوضع المعاينة المحلي', 'warning');
    const mockRes = await mockApiHandler(action, payload);
    hideLoading();
    return mockRes;
  }
}

function updateConnectionStatusBadge(isLive) {
  const badge = document.getElementById('connection-status-badge');
  const text = document.getElementById('connection-text');
  if (!badge || !text) return;

  if (isLive && WEB_APP_URL && !WEB_APP_URL.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200';
    text.textContent = 'متصل بالخادم (Live)';
  } else {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200';
    text.textContent = 'معاينة محلية (Demo Mode)';
  }
}

/**
 * 5. EVENT LISTENERS & SCREEN ROUTING
 */
function setupEventListeners() {
  // Copy UUID
  document.getElementById('copy-uuid-btn')?.addEventListener('click', () => {
    const input = document.getElementById('device-uuid-display');
    if (input) {
      input.select();
      navigator.clipboard.writeText(input.value);
      showToast('تم نسخ معرف الجهاز بنجاح', 'success');
    }
  });

  // Check Approval Button
  document.getElementById('check-approval-btn')?.addEventListener('click', () => {
    showToast('جاري التحديث والتحقق...', 'info');
    verifyDeviceStatus();
  });

  // Request Email OTP Button
  document.getElementById('send-otp-btn')?.addEventListener('click', async () => {
    showToast('جاري إرسال رمز التفعيل إلى البريد الإلكتروني...', 'info');
    const deviceName = detectDeviceName();
    const res = await callApi('sendDeviceOtp', { deviceId: state.deviceId, deviceName });

    if (res && res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(res.message || 'فشل إرسال الرمز', 'danger');
    }
  });

  // Verify Email OTP Button
  document.getElementById('verify-otp-btn')?.addEventListener('click', async () => {
    const codeInput = document.getElementById('otp-code-input');
    const otpCode = codeInput ? codeInput.value.trim() : '';

    if (!otpCode || otpCode.length !== 6) {
      showToast('يرجى إدخال الرمز المكون من 6 أرقام', 'warning');
      return;
    }

    const res = await callApi('verifyDeviceOtp', { deviceId: state.deviceId, otpCode });

    if (res && res.success) {
      showToast(res.message, 'success');
      state.deviceStatus = 'APPROVED';
      verifyDeviceStatus();
    } else {
      showToast(res.message || 'رمز غير صحيح', 'danger');
    }
  });

  // Login Tabs Toggle
  document.querySelectorAll('.login-tabs .tab-btn, .flex .tab-btn[data-target*="login"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const parent = btn.parentElement;
      parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetForm = btn.getAttribute('data-target');
      document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
      document.getElementById(targetForm)?.classList.remove('hidden');
    });
  });

  // Employee Login Form Submit
  document.getElementById('emp-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (state.deviceStatus !== 'APPROVED') {
      showToast('عذراً! هذا الجهاز غير معتمد للوصول إلى النظام. يرجى تزويد مدير النظام بمعرف الجهاز لتفعيله.', 'danger');
      showScreen('pending-device-screen');
      return;
    }

    const u = document.getElementById('emp-username').value.trim();
    const p = document.getElementById('emp-password').value.trim();
    
    const res = await callApi('employeeLogin', { username: u, password: p, deviceId: state.deviceId });
    if (res && res.success) {
      state.currentUser = res.employee;
      state.currentUser.role = 'EMPLOYEE';
      saveSession();
      showToast(`مرحباً بك، ${res.employee.name}`, 'success');
      loadEmployeeDashboard();
    } else {
      showToast(res.message || 'خطأ في بيانات الدخول', 'danger');
    }
  });

  // Admin Login Form Submit
  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('admin-username').value.trim();
    const p = document.getElementById('admin-password').value.trim();

    const res = await callApi('adminLogin', { username: u, password: p });
    if (res && res.success) {
      state.currentUser = {
        role: 'ADMIN',
        username: res.username,
        name: res.displayName || 'مدير النظام'
      };
      saveSession();
      showToast(`أهلاً بك يا ${res.displayName}`, 'success');
      loadAdminDashboard();
    } else {
      showToast(res.message || 'خطأ في بيانات دخول المدير', 'danger');
    }
  });

  // Logout Button
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    state.currentUser = null;
    sessionStorage.removeItem('ATTENDANCE_USER_SESSION');
    showScreen('login-screen');
    updateUserBadge();
    showToast('تم تسجيل الخروج بنجاح', 'info');
  });

  // Employee Check-in ("حضور")
  document.getElementById('btn-checkin')?.addEventListener('click', async () => {
    if (!state.currentUser) return;
    const delayReason = document.getElementById('delay-reason-input').value.trim();

    // Optimistic UI response (<10ms instant visual feedback)
    const btnCheckin = document.getElementById('btn-checkin');
    const btnCheckout = document.getElementById('btn-checkout');
    const todayStatusText = document.getElementById('emp-today-status');

    btnCheckin.disabled = true;
    btnCheckout.disabled = false;
    todayStatusText.textContent = `جاري الحفظ... (حضور)`;
    todayStatusText.className = 'text-xs font-bold text-emerald-600 animate-pulse';

    const res = await callApi('checkIn', {
      employeeId: state.currentUser.id,
      employeeName: state.currentUser.name,
      delayReason: delayReason
    });

    if (res && res.success) {
      showToast(res.message, 'success');
      loadEmployeeDashboard();
    } else {
      showToast(res.message || 'فشل تسجيل الحضور', 'danger');
      loadEmployeeDashboard();
    }
  });

  // Employee Check-out ("انصراف")
  document.getElementById('btn-checkout')?.addEventListener('click', async () => {
    if (!state.currentUser) return;

    // Optimistic UI response (<10ms instant visual feedback)
    const btnCheckin = document.getElementById('btn-checkin');
    const btnCheckout = document.getElementById('btn-checkout');
    const todayStatusText = document.getElementById('emp-today-status');

    btnCheckin.disabled = true;
    btnCheckout.disabled = true;
    todayStatusText.textContent = `جاري الحفظ... (انصراف)`;
    todayStatusText.className = 'text-xs font-bold text-sky-600 animate-pulse';

    const res = await callApi('checkOut', {
      employeeId: state.currentUser.id,
      shiftStart: state.currentUser.shiftStart,
      shiftEnd: state.currentUser.shiftEnd
    });

    if (res && res.success) {
      showToast(res.message, 'success');
      loadEmployeeDashboard();
    } else {
      showToast(res.message || 'فشل تسجيل الانصراف', 'danger');
      loadEmployeeDashboard();
    }
  });

  // Refresh Buttons
  document.getElementById('refresh-emp-notifs')?.addEventListener('click', () => {
    if (state.currentUser) loadEmployeeNotifications(state.currentUser.id);
  });
  document.getElementById('refresh-emp-history')?.addEventListener('click', loadEmployeeDashboard);

  // Admin Navigation Tabs
  document.querySelectorAll('.admin-tabs .tab-btn, .flex .tab-btn[data-target*="admin-tab"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.parentElement;
      parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-target');
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(targetTab)?.classList.remove('hidden');

      if (targetTab === 'admin-tab-attendance') loadAdminAttendanceLogs();
      if (targetTab === 'admin-tab-employees') loadAdminEmployees();
      if (targetTab === 'admin-tab-devices') loadAdminDevices();
    });
  });

  // Refresh Admin Views
  document.getElementById('refresh-admin-attendance')?.addEventListener('click', loadAdminAttendanceLogs);
  document.getElementById('refresh-devices-btn')?.addEventListener('click', loadAdminDevices);

  // Filter Attendance Logs by Selected Employee or Search Text
  function applyAdminAttendanceFilter() {
    const filterSelect = document.getElementById('admin-employee-filter-select');
    const searchInput = document.getElementById('attendance-search-input');

    const selectedId = filterSelect ? filterSelect.value : 'ALL';
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filtered = state.attendanceLogs;

    if (selectedId !== 'ALL') {
      filtered = filtered.filter(l => l.employeeId === selectedId);
    }

    if (term) {
      filtered = filtered.filter(l => 
        (l.employeeName && l.employeeName.toLowerCase().includes(term)) || 
        (l.date && l.date.includes(term)) ||
        (l.employeeId && l.employeeId.toLowerCase().includes(term))
      );
    }

    renderAdminAttendanceTable(filtered);
  }

  document.getElementById('admin-employee-filter-select')?.addEventListener('change', applyAdminAttendanceFilter);
  document.getElementById('attendance-search-input')?.addEventListener('input', applyAdminAttendanceFilter);

  // Modal Open/Close Controls
  document.getElementById('open-add-employee-modal')?.addEventListener('click', () => {
    document.getElementById('emp-modal-title').innerHTML = '<i class="fa-solid fa-user-plus ml-1"></i> إضافة موظف جديد';
    document.getElementById('employee-form').reset();
    document.getElementById('emp-form-id').value = '';
    showModal('employee-modal');
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      hideModal(modalId);
    });
  });

  // Save / Update Employee Form Submit
  document.getElementById('employee-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('emp-form-id').value;
    const name = document.getElementById('emp-form-name').value.trim();
    const username = document.getElementById('emp-form-username').value.trim();
    const password = document.getElementById('emp-form-password').value.trim();
    const shiftStart = document.getElementById('emp-form-shift-start').value;
    const shiftEnd = document.getElementById('emp-form-shift-end').value;

    const payload = { id, name, username, password, shiftStart, shiftEnd };
    const action = id ? 'updateEmployee' : 'addEmployee';

    const res = await callApi(action, payload);
    if (res && res.success) {
      showToast(res.message, 'success');
      hideModal('employee-modal');
      loadAdminEmployees();
    } else {
      showToast(res.message || 'فشل حفظ الموظف', 'danger');
    }
  });

  // Send Notification Form Submit
  document.getElementById('send-notification-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const employeeId = document.getElementById('notif-employee-select').value;
    const type = document.getElementById('notif-type-select').value;
    const title = document.getElementById('notif-title-input').value.trim();
    const message = document.getElementById('notif-message-input').value.trim();
    const amount = document.getElementById('notif-amount-input').value || 0;

    const res = await callApi('sendNotification', { employeeId, type, title, message, amount });
    if (res && res.success) {
      showToast(res.message, 'success');
      document.getElementById('send-notification-form').reset();
    } else {
      showToast(res.message || 'فشل إرسال الإشعار', 'danger');
    }
  });

  // Open Employee Settings Modal
  document.getElementById('open-emp-settings-btn')?.addEventListener('click', () => {
    if (!state.currentUser) return;
    const inputUser = document.getElementById('emp-setting-new-username');
    if (inputUser) inputUser.value = state.currentUser.username || '';
    document.getElementById('emp-setting-current-password').value = '';
    document.getElementById('emp-setting-new-password').value = '';
    showModal('emp-settings-modal');
  });

  // Employee Settings Form Submit
  document.getElementById('emp-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser || state.currentUser.role !== 'EMPLOYEE') return;

    const newUsername = document.getElementById('emp-setting-new-username').value.trim();
    const currentPassword = document.getElementById('emp-setting-current-password').value.trim();
    const newPassword = document.getElementById('emp-setting-new-password').value.trim();

    if (!newUsername || !currentPassword || !newPassword) {
      showToast('يرجى ملء جميع البيانات المطلوبة', 'warning');
      return;
    }

    const res = await callApi('updateEmployeeCredentials', {
      employeeId: state.currentUser.id,
      currentPassword: currentPassword,
      newUsername: newUsername,
      newPassword: newPassword
    });

    if (res && res.success) {
      showToast(res.message, 'success');
      state.currentUser.username = newUsername;
      saveSession();
      hideModal('emp-settings-modal');
      document.getElementById('emp-settings-form').reset();
    } else {
      showToast(res.message || 'فشل تحديث الحساب', 'danger');
    }
  });

  // Admin Account Settings Form Submit
  document.getElementById('admin-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('setting-display-name').value.trim();
    const currentUsername = document.getElementById('setting-current-username').value.trim();
    const currentPassword = document.getElementById('setting-current-password').value.trim();
    const newUsername = document.getElementById('setting-new-username').value.trim();
    const newPassword = document.getElementById('setting-new-password').value.trim();

    const res = await callApi('updateAdminSettings', {
      currentUsername, currentPassword, newUsername, newPassword, displayName
    });

    if (res && res.success) {
      showToast(res.message, 'success');
      if (displayName && state.currentUser) {
        state.currentUser.name = displayName;
        updateUserBadge();
      }
    } else {
      showToast(res.message || 'فشل تحديث الإعدادات', 'danger');
    }
  });
}

function showScreen(screenId) {
  document.querySelectorAll('.view-screen').forEach(s => s.classList.add('hidden'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.remove('hidden');
  updateUserBadge();
}

function updateUserBadge() {
  const badge = document.getElementById('user-profile-badge');
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-role-badge');

  if (!badge) return;

  if (state.currentUser) {
    badge.classList.remove('hidden');
    nameEl.textContent = state.currentUser.name || state.currentUser.username;
    roleEl.textContent = state.currentUser.role === 'ADMIN' ? 'المدير' : 'موظف';
  } else {
    badge.classList.add('hidden');
  }
}

function routeUserDashboard() {
  if (state.currentUser.role === 'ADMIN') {
    loadAdminDashboard();
  } else {
    loadEmployeeDashboard();
  }
}

/**
 * 6. EMPLOYEE DASHBOARD WORKFLOW
 */
async function loadEmployeeDashboard() {
  showScreen('employee-dashboard');
  
  const emp = state.currentUser;
  document.getElementById('emp-shift-times').textContent = `${emp.shiftStart || '08:00'} - ${emp.shiftEnd || '16:00'}`;

  // Fetch Attendance History & Check Today's status
  const logsRes = await callApi('getAttendanceLogs', { employeeId: emp.id });
  const logs = (logsRes && logsRes.logs) ? logsRes.logs : [];
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = logs.find(l => l.date === todayStr);

  const btnCheckin = document.getElementById('btn-checkin');
  const btnCheckout = document.getElementById('btn-checkout');
  const todayStatusText = document.getElementById('emp-today-status');

  if (!todayLog) {
    btnCheckin.disabled = false;
    btnCheckout.disabled = true;
    todayStatusText.textContent = 'لم يتم تسجيل الحضور اليوم';
    todayStatusText.className = 'text-xs font-bold text-amber-600';
  } else if (todayLog.checkInTime && !todayLog.checkOutTime) {
    btnCheckin.disabled = true;
    btnCheckout.disabled = false;
    todayStatusText.textContent = `تم تسجيل الحضور الساعة (${todayLog.checkInTime})`;
    todayStatusText.className = 'text-xs font-bold text-emerald-600';
  } else {
    btnCheckin.disabled = true;
    btnCheckout.disabled = true;
    todayStatusText.textContent = `مكتمل - انصراف الساعة (${todayLog.checkOutTime})`;
    todayStatusText.className = 'text-xs font-bold text-sky-600';
  }

  renderEmployeeHistoryTable(logs);
  loadEmployeeNotifications(emp.id);
}

function formatTimeString(val) {
  if (!val) return '-';
  const str = String(val).trim();

  // If already clean HH:mm or HH:mm:ss
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    return str;
  }

  // Parse ISO/GMT string like "1899-12-30T03:04:49.000Z"
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }
  } catch (e) {}

  return str;
}

function renderEmployeeHistoryTable(logs) {
  const tbody = document.getElementById('emp-history-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">لا يوجد سجلات حضور سابقة</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-4 font-semibold text-slate-900">${log.date}</td>
      <td class="py-3 px-4"><span class="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-semibold">${formatTimeString(log.checkInTime)}</span></td>
      <td class="py-3 px-4"><span class="px-2 py-1 bg-amber-50 text-amber-700 rounded-md font-semibold">${formatTimeString(log.checkOutTime)}</span></td>
      <td class="py-3 px-4">${log.delayReason ? `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">${log.delayReason}</span>` : '-'}</td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 ${log.deficitMinutes > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'} rounded-md">${log.deficitMinutes} دقيقة</span></td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 ${log.overtimeMinutes > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'} rounded-md">${log.overtimeMinutes} دقيقة</span></td>
      <td class="py-3 px-4"><span class="px-2 py-1 ${log.status === 'مكتمل' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} rounded-md font-medium">${log.status}</span></td>
    </tr>
  `).join('');
}

async function loadEmployeeNotifications(employeeId) {
  const res = await callApi('getEmployeeNotifications', { employeeId });
  const notifs = (res && res.notifications) ? res.notifications : [];

  const listEl = document.getElementById('emp-notifications-list');
  if (!listEl) return;

  if (notifs.length === 0) {
    listEl.innerHTML = `<div class="text-center py-6 text-xs text-slate-400">لا توجد تنبيهات حالياً</div>`;
    return;
  }

  listEl.innerHTML = notifs.map(n => `
    <div class="p-3 rounded-2xl border ${n.type === 'REWARD' ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : n.type === 'WARNING' ? 'bg-rose-50/50 border-rose-200 text-rose-900' : 'bg-sky-50/50 border-sky-200 text-sky-900'} flex gap-3 items-start">
      <div class="text-lg mt-0.5">
        <i class="fa-solid ${n.type === 'REWARD' ? 'fa-award text-emerald-600' : n.type === 'WARNING' ? 'fa-triangle-exclamation text-rose-600' : 'fa-bell text-sky-600'}"></i>
      </div>
      <div>
        <h5 class="text-xs font-bold mb-1">${n.title} ${n.amount > 0 ? `<span class="px-1.5 py-0.5 bg-emerald-600 text-white rounded-full text-[10px] ml-1">+${n.amount} $</span>` : ''}</h5>
        <p class="text-xs text-slate-600 leading-relaxed">${n.message}</p>
        <span class="text-[10px] text-slate-400 block mt-1"><i class="fa-regular fa-calendar ml-1"></i> ${n.date}</span>
      </div>
    </div>
  `).join('');
}

/**
 * 7. ADMIN DASHBOARD WORKFLOW
 */
async function loadAdminDashboard() {
  showScreen('admin-dashboard');
  
  // Render cached data immediately for zero latency
  if (state.attendanceLogs.length > 0) {
    renderAdminAttendanceTable(state.attendanceLogs);
    renderEmployeesTable(state.employees);
    renderDevicesTable(state.pendingDevices);
    updateAdminStats();
  }

  // Single-roundtrip high-speed fetch from Google Apps Script
  const res = await callApi('getDashboardData');
  if (res && res.success) {
    state.attendanceLogs = res.logs || [];
    state.employees = res.employees || [];
    state.pendingDevices = res.devices || [];

    renderAdminAttendanceTable(state.attendanceLogs);
    renderEmployeesTable(state.employees);
    renderDevicesTable(state.pendingDevices);
    updateAdminStats();
  }
}

async function loadAdminAttendanceLogs() {
  const res = await callApi('getAttendanceLogs');
  state.attendanceLogs = (res && res.logs) ? res.logs : [];
  renderAdminAttendanceTable(state.attendanceLogs);
  updateAdminStats();
}

function renderAdminAttendanceTable(logs) {
  const tbody = document.getElementById('admin-attendance-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-slate-400">لا توجد سجلات حضور حتى الآن</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-4 font-bold text-slate-900">${log.employeeName}</td>
      <td class="py-3 px-4">${log.date}</td>
      <td class="py-3 px-4"><span class="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-semibold">${formatTimeString(log.checkInTime)}</span></td>
      <td class="py-3 px-4"><span class="px-2 py-1 bg-amber-50 text-amber-700 rounded-md font-semibold">${formatTimeString(log.checkOutTime)}</span></td>
      <td class="py-3 px-4">${log.delayReason ? `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">${log.delayReason}</span>` : '-'}</td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 ${log.deficitMinutes > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'} rounded-md">${log.deficitMinutes} دقيقة</span></td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 ${log.overtimeMinutes > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'} rounded-md">${log.overtimeMinutes} دقيقة</span></td>
      <td class="py-3 px-4"><span class="px-2 py-1 ${log.status === 'مكتمل' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} rounded-md font-medium">${log.status}</span></td>
    </tr>
  `).join('');
}

async function loadAdminEmployees() {
  const res = await callApi('getEmployees');
  state.employees = (res && res.employees) ? res.employees : [];
  renderEmployeesTable(state.employees);
}

function renderEmployeesTable(employees) {
  const tbody = document.getElementById('admin-employees-tbody');
  const selectEl = document.getElementById('notif-employee-select');
  const filterSelectEl = document.getElementById('admin-employee-filter-select');

  if (selectEl) {
    selectEl.innerHTML = `<option value="ALL">جميع الموظفين</option>` +
      employees.map(e => `<option value="${e.id}">${e.name} (${e.username})</option>`).join('');
  }

  if (filterSelectEl) {
    const curVal = filterSelectEl.value || 'ALL';
    filterSelectEl.innerHTML = `<option value="ALL">📋 جميع الموظفين</option>` +
      employees.map(e => `<option value="${e.id}">👤 ${e.name} (${e.id})</option>`).join('');
    filterSelectEl.value = curVal;
  }

  if (!tbody) return;

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">لا يوجد موظفون مسجلون</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(e => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-4"><code class="px-1.5 py-0.5 bg-slate-100 rounded text-brand-700">${e.id}</code></td>
      <td class="py-3 px-4 font-bold text-slate-900">${e.name}</td>
      <td class="py-3 px-4">${e.username}</td>
      <td class="py-3 px-4"><code class="text-slate-500">${e.password}</code></td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded">${e.shiftStart}</span></td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded">${e.shiftEnd}</span></td>
      <td class="py-3 px-4 flex gap-2">
        <button onclick="editEmployee('${e.id}')" class="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition-colors" title="تعديل"><i class="fa-solid fa-pen-to-square"></i></button>
        <button onclick="deleteEmployeePrompt('${e.id}')" class="w-7 h-7 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition-colors" title="حذف"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');

  document.getElementById('stat-total-employees').textContent = employees.length;
}

window.editEmployee = function(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  document.getElementById('emp-modal-title').innerHTML = '<i class="fa-solid fa-user-pen ml-1"></i> تعديل بيانات الموظف';
  document.getElementById('emp-form-id').value = emp.id;
  document.getElementById('emp-form-name').value = emp.name;
  document.getElementById('emp-form-username').value = emp.username;
  document.getElementById('emp-form-password').value = emp.password;
  document.getElementById('emp-form-shift-start').value = emp.shiftStart || '08:00';
  document.getElementById('emp-form-shift-end').value = emp.shiftEnd || '16:00';

  showModal('employee-modal');
};

window.deleteEmployeePrompt = async function(empId) {
  if (confirm('هل أنت تأكد من حذف هذا الموظف؟')) {
    const res = await callApi('deleteEmployee', { employeeId: empId });
    if (res && res.success) {
      showToast(res.message, 'success');
      loadAdminEmployees();
    } else {
      showToast(res.message || 'فشل حذف الموظف', 'danger');
    }
  }
};

async function loadAdminDevices() {
  const res = await callApi('getPendingDevices');
  state.pendingDevices = (res && res.devices) ? res.devices : [];
  renderDevicesTable(state.pendingDevices);
}

function renderDevicesTable(devices) {
  const tbody = document.getElementById('admin-devices-tbody');
  const badgeCount = document.getElementById('pending-count-badge');
  
  const pendingCount = (devices || []).filter(d => d.status === 'PENDING').length;
  document.getElementById('stat-pending-devices').textContent = pendingCount;

  if (badgeCount) {
    if (pendingCount > 0) {
      badgeCount.textContent = pendingCount;
      badgeCount.classList.remove('hidden');
    } else {
      badgeCount.classList.add('hidden');
    }
  }

  if (!tbody) return;

  if (!devices || devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400">لا توجد أجهزة مسجلة للنظام حتى الآن</td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-4"><code class="text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded font-mono">${d.deviceId}</code></td>
      <td class="py-3 px-4 font-medium">${d.deviceName}</td>
      <td class="py-3 px-4 text-slate-500">${new Date(d.registeredAt).toLocaleDateString('ar-EG')}</td>
      <td class="py-3 px-4">
        <span class="px-2 py-1 rounded-md text-xs font-semibold ${d.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : d.status === 'PENDING' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}">
          ${d.status === 'APPROVED' ? 'معتمد' : d.status === 'PENDING' ? 'قيد الانتظار' : 'مرفوض'}
        </span>
      </td>
      <td class="py-3 px-4">
        ${d.status !== 'APPROVED' ? `
          <button onclick="approveDeviceAction('${d.deviceId}')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
            <i class="fa-solid fa-check"></i> اعتماد
          </button>
        ` : `
          <button onclick="rejectDeviceAction('${d.deviceId}')" class="px-3 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
            <i class="fa-solid fa-xmark"></i> إلغاء الاعتماد
          </button>
        `}
      </td>
    </tr>
  `).join('');
}

window.approveDeviceAction = async function(deviceId) {
  const res = await callApi('approveDevice', { deviceId });
  if (res && res.success) {
    showToast('تمت موافقة واعتماد الجهاز بنجاح', 'success');
    if (deviceId === state.deviceId) {
      state.deviceStatus = 'APPROVED';
    }
    loadAdminDevices();
  }
};

window.rejectDeviceAction = async function(deviceId) {
  const res = await callApi('rejectDevice', { deviceId });
  if (res && res.success) {
    showToast('تم إلغاء اعتماد الجهاز', 'warning');
    if (deviceId === state.deviceId) {
      state.deviceStatus = 'REJECTED';
    }
    loadAdminDevices();
  }
};

function updateAdminStats() {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLogs = state.attendanceLogs.filter(l => l.date === todayStr);

  document.getElementById('stat-today-checkins').textContent = todayLogs.length;

  const totalDeficit = state.attendanceLogs.reduce((acc, curr) => acc + (parseInt(curr.deficitMinutes) || 0), 0);
  document.getElementById('stat-total-deficit').textContent = `${totalDeficit} دقيقة`;
}

/**
 * 8. SESSION & MODAL HELPERS
 */
function saveSession() {
  if (state.currentUser) {
    sessionStorage.setItem('ATTENDANCE_USER_SESSION', JSON.stringify(state.currentUser));
  }
}

function checkSession() {
  const session = sessionStorage.getItem('ATTENDANCE_USER_SESSION');
  if (session) {
    try {
      state.currentUser = JSON.parse(session);
      updateUserBadge();
    } catch(e) {}
  }
}

function showModal(modalId) {
  document.getElementById(modalId)?.classList.remove('hidden');
}

function hideModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'danger' ? 'fa-circle-xmark' : 'fa-triangle-exclamation'}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * 9. DEMO MOCK API HANDLER
 */
const mockDb = {
  admin: { username: 'admin', password: 'admin123', displayName: 'مدير النظام' },
  employees: [
    { id: 'EMP101', name: 'أحمد محمد', username: 'ahmed', password: 'emp123', shiftStart: '08:00', shiftEnd: '16:00' },
    { id: 'EMP102', name: 'سارة محمود', username: 'sara', password: 'emp123', shiftStart: '09:00', shiftEnd: '17:00' }
  ],
  devices: [],
  attendance: [
    { id: 'ATT1', employeeId: 'EMP101', employeeName: 'أحمد محمد', date: new Date().toISOString().split('T')[0], checkInTime: '08:05:00', checkOutTime: '16:00:00', delayReason: 'زحام مرور', deficitMinutes: 5, overtimeMinutes: 0, status: 'مكتمل' }
  ],
  notifications: [
    { id: 'NOTIF1', employeeId: 'EMP101', type: 'REWARD', title: 'مكافأة الانضباط', message: 'شكراً على حضورك المتميز هذا الشهر', amount: 50, date: new Date().toISOString().split('T')[0] }
  ]
};

function mockApiHandler(action, payload) {
  return new Promise((resolve) => {
    setTimeout(() => {
      switch (action) {
        case 'checkDeviceStatus':
          resolve({ success: true, status: 'APPROVED', deviceId: payload.deviceId });
          break;
        case 'adminLogin':
          if (payload.username === mockDb.admin.username && payload.password === mockDb.admin.password) {
            resolve({ success: true, role: 'ADMIN', username: mockDb.admin.username, displayName: mockDb.admin.displayName });
          } else {
            resolve({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
          }
          break;
        case 'employeeLogin':
          const emp = mockDb.employees.find(e => e.username === payload.username && e.password === payload.password);
          if (emp) {
            resolve({ success: true, role: 'EMPLOYEE', employee: emp });
          } else {
            resolve({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
          }
          break;
        case 'getEmployees':
          resolve({ success: true, employees: mockDb.employees });
          break;
        case 'addEmployee':
          const newEmp = {
            id: 'EMP' + Math.floor(1000 + Math.random() * 9000),
            name: payload.name,
            username: payload.username,
            password: payload.password,
            shiftStart: payload.shiftStart || '08:00',
            shiftEnd: payload.shiftEnd || '16:00'
          };
          mockDb.employees.push(newEmp);
          resolve({ success: true, message: 'تمت إضافة الموظف بنجاح (المعاينة)', employeeId: newEmp.id });
          break;
        case 'updateEmployee':
          const idx = mockDb.employees.findIndex(e => e.id === payload.id);
          if (idx !== -1) {
            mockDb.employees[idx] = { ...mockDb.employees[idx], ...payload };
            resolve({ success: true, message: 'تم تحديث بيانات الموظف (المعاينة)' });
          } else {
            resolve({ success: false, message: 'الموظف غير موجود' });
          }
          break;
        case 'deleteEmployee':
          mockDb.employees = mockDb.employees.filter(e => e.id !== payload.employeeId);
          resolve({ success: true, message: 'تم حذف الموظف بنجاح (المعاينة)' });
          break;
        case 'checkIn':
          const nowStr = new Date().toLocaleTimeString('ar-EG', { hour12: false });
          const todayStr = new Date().toISOString().split('T')[0];
          mockDb.attendance.unshift({
            id: 'ATT' + Date.now(),
            employeeId: payload.employeeId,
            employeeName: payload.employeeName,
            date: todayStr,
            checkInTime: nowStr,
            checkOutTime: '',
            delayReason: payload.delayReason || '',
            deficitMinutes: 0,
            overtimeMinutes: 0,
            status: 'حاضر'
          });
          resolve({ success: true, message: 'تم تسجيل الحضور بنجاح (المعاينة)', checkInTime: nowStr });
          break;
        case 'checkOut':
          const outStr = new Date().toLocaleTimeString('ar-EG', { hour12: false });
          const todayDate = new Date().toISOString().split('T')[0];
          const rec = mockDb.attendance.find(a => a.employeeId === payload.employeeId && a.date === todayDate);
          if (rec) {
            rec.checkOutTime = outStr;
            rec.status = 'مكتمل';
            rec.deficitMinutes = 0;
            rec.overtimeMinutes = 15;
            resolve({ success: true, message: 'تم تسجيل الانصراف بنجاح (المعاينة)', checkOutTime: outStr });
          } else {
            resolve({ success: false, message: 'لم تسجل الحضور اليوم بعد!' });
          }
          break;
        case 'getAttendanceLogs':
          let logs = mockDb.attendance;
          if (payload && payload.employeeId) {
            logs = logs.filter(l => l.employeeId === payload.employeeId);
          }
          resolve({ success: true, logs });
          break;
        case 'sendNotification':
          mockDb.notifications.unshift({
            id: 'NOTIF' + Date.now(),
            employeeId: payload.employeeId,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            amount: payload.amount,
            date: new Date().toISOString().split('T')[0]
          });
          resolve({ success: true, message: 'تم إرسال الإشعار بنجاح (المعاينة)' });
          break;
        case 'getEmployeeNotifications':
          const notifs = mockDb.notifications.filter(n => n.employeeId === payload.employeeId || n.employeeId === 'ALL');
          resolve({ success: true, notifications: notifs });
          break;
        case 'updateEmployeeCredentials':
          const empToUpdate = mockDb.employees.find(e => e.id === payload.employeeId);
          if (empToUpdate) {
            if (empToUpdate.password !== payload.currentPassword) {
              resolve({ success: false, message: 'كلمة المرور الحالية غير صحيحة!' });
            } else {
              empToUpdate.username = payload.newUsername;
              empToUpdate.password = payload.newPassword;
              resolve({ success: true, message: 'تم تحديث بيانات الحساب بنجاح (المعاينة)' });
            }
          } else {
            resolve({ success: false, message: 'الموظف غير موجود' });
          }
          break;
        case 'getPendingDevices':
          resolve({ success: true, devices: mockDb.devices });
          break;
        case 'sendDeviceOtp':
          resolve({ success: true, message: 'تم إرسال رمز التفعيل (123456) بنجاح إلى البريد الإلكتروني للمعاينة' });
          break;
        case 'verifyDeviceOtp':
          if (payload.otpCode === '123456' || payload.otpCode.length === 6) {
            resolve({ success: true, message: 'تم تفعيل الجهاز واكتمال الاعتماد بنجاح!' });
          } else {
            resolve({ success: false, message: 'رمز غير صحيح' });
          }
          break;
        case 'approveDevice':
        case 'rejectDevice':
          resolve({ success: true, message: 'تم تحديث حالة الجهاز' });
          break;
        default:
          resolve({ success: true });
      }
    }, 250);
  });
}
