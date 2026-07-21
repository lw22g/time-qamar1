const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data.json');
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxNokcyxCL2DbA4jpDu1ljDMLorWVaAIxnFVaicG_flFkLaJ3BLOBYofc44EluJCyV3qQ/exec';

// Helper to format minutes into HH:MM string (e.g., "07:40")
function formatMinutes(totalMins) {
  if (!totalMins || totalMins <= 0) return '00:00';
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// Initialize database file with defaults if not exists
function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    const defaultData = {
      settings: {
        admin_name: 'المدير العام',
        admin_username: 'admin',
        admin_password: 'admin',
        webhook_url: WEBHOOK_URL
      },
      users: [],
      attendance: [],
      notifications: [],
      authorized_devices: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

// Read database
function readDB() {
  initDB();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database file:', err);
    return {
      settings: { admin_name: 'المدير العام', admin_username: 'admin', admin_password: 'admin', webhook_url: WEBHOOK_URL },
      users: [],
      attendance: [],
      notifications: [],
      authorized_devices: []
    };
  }
}

// Write database
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing to database file:', err);
    return false;
  }
}

// Helper to generate unique IDs
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

// Push action to Google Sheets asynchronously
function pushToGoogleSheets(action, payload) {
  try {
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    }).catch(err => console.error('Google Sheets Push Error:', err.message));
  } catch (err) {
    console.error('Google Sheets Push Exception:', err.message);
  }
}

// Fetch all data from Google Sheets to sync local DB
async function syncWithGoogleSheets() {
  try {
    console.log('🔄 جاري تزامُن البيانات من Google Sheets...');
    const res = await fetch(WEBHOOK_URL);
    if (res.ok) {
      const gsData = await res.json();
      if (gsData && typeof gsData === 'object') {
        const local = readDB();
        if (gsData.settings && gsData.settings.admin_username) {
          local.settings = { ...local.settings, ...gsData.settings };
        }
        if (Array.isArray(gsData.users)) local.users = gsData.users;
        if (Array.isArray(gsData.attendance)) local.attendance = gsData.attendance;
        if (Array.isArray(gsData.notifications)) local.notifications = gsData.notifications;
        if (Array.isArray(gsData.authorized_devices)) local.authorized_devices = gsData.authorized_devices;
        writeDB(local);
        console.log('✅ تم تزامُن البيانات من Google Sheets بنجاح!');
      }
    }
  } catch (err) {
    console.error('⚠️ يتعذر الاتصال بـ Google Sheets حالياً، الاعتماد على النسخة المحلية:', err.message);
  }
}

// Initial Sync on Module Load
syncWithGoogleSheets();

const db = {
  formatMinutes,
  syncWithGoogleSheets,

  // Admin settings
  getAdmin() {
    const data = readDB();
    return data.settings;
  },

  updateAdmin(name, username, password, webhookUrl = null) {
    const data = readDB();
    if (name) data.settings.admin_name = name.trim();
    if (username) data.settings.admin_username = username.trim();
    if (password) data.settings.admin_password = password.trim();
    if (webhookUrl && webhookUrl.trim()) data.settings.webhook_url = webhookUrl.trim();
    writeDB(data);

    pushToGoogleSheets('update_admin', {
      name: data.settings.admin_name,
      username: data.settings.admin_username,
      password: data.settings.admin_password
    });
    return true;
  },

  // User management
  getUsers() {
    const data = readDB();
    return data.users.map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      shift_start: u.shift_start || '08:00',
      shift_end: u.shift_end || '17:00'
    }));
  },

  getUserById(id) {
    const data = readDB();
    return data.users.find(u => u.id === id);
  },

  getUserByUsername(username) {
    const data = readDB();
    return data.users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
  },

  createUser(name, username, password, shiftStart = '08:00', shiftEnd = '17:00') {
    const data = readDB();
    const cleanUsername = username.trim().toLowerCase();
    
    if (cleanUsername === data.settings.admin_username.toLowerCase()) {
      throw new Error('اسم المستخدم هذا محجوز للمدير.');
    }
    if (data.users.some(u => u.username.toLowerCase() === cleanUsername)) {
      throw new Error('اسم المستخدم مسجل بالفعل لموظف آخر.');
    }

    const newUser = {
      id: generateId(),
      name: name.trim(),
      username: username.trim(),
      password: password.trim(),
      shift_start: shiftStart || '08:00',
      shift_end: shiftEnd || '17:00',
      created_at: new Date().toISOString()
    };

    data.users.push(newUser);
    writeDB(data);
    pushToGoogleSheets('create_user', newUser);
    return newUser;
  },

  updateUser(id, name, username, password, shiftStart = '08:00', shiftEnd = '17:00') {
    const data = readDB();
    const index = data.users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('الموظف غير موجود.');

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername === data.settings.admin_username.toLowerCase()) {
      throw new Error('اسم المستخدم هذا محجوز للمدير.');
    }
    if (data.users.some((u, idx) => idx !== index && u.username.toLowerCase() === cleanUsername)) {
      throw new Error('اسم المستخدم مسجل بالفعل لموظف آخر.');
    }

    data.users[index].name = name.trim();
    data.users[index].username = username.trim();
    if (password && password.trim()) {
      data.users[index].password = password.trim();
    }
    data.users[index].shift_start = shiftStart || '08:00';
    data.users[index].shift_end = shiftEnd || '17:00';

    writeDB(data);
    pushToGoogleSheets('update_user', data.users[index]);
    return data.users[index];
  },

  deleteUser(id) {
    const data = readDB();
    const initialLen = data.users.length;
    data.users = data.users.filter(u => u.id !== id);
    if (data.users.length < initialLen) {
      writeDB(data);
      pushToGoogleSheets('delete_user', { id });
      return true;
    }
    return false;
  },

  // Attendance management
  checkIn(userId) {
    const data = readDB();
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('الموظف غير موجود.');

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const existingActive = data.attendance.find(a => a.user_id === userId && !a.check_out);
    if (existingActive) {
      throw new Error('لقد قمت بتسجيل الحضور بالفعل ولا يزال الدوام نشطاً.');
    }

    const shiftStart = user.shift_start || '08:00';
    const [sHours, sMins] = shiftStart.split(':').map(Number);
    const officialStartToday = new Date(now);
    officialStartToday.setHours(sHours, sMins, 0, 0);

    let latenessMins = 0;
    if (now > officialStartToday) {
      latenessMins = Math.floor((now - officialStartToday) / (1000 * 60));
    }

    const newAttendance = {
      id: generateId(),
      user_id: userId,
      user_name: user.name,
      date: dateStr,
      check_in: now.toISOString(),
      check_out: null,
      hours: null,
      hours_formatted: null,
      shift_start: shiftStart,
      shift_end: user.shift_end || '17:00',
      lateness_minutes: latenessMins,
      lateness_text: formatMinutes(latenessMins),
      overtime_minutes: 0,
      overtime_text: '00:00'
    };

    data.attendance.push(newAttendance);
    writeDB(data);
    pushToGoogleSheets('check_in', newAttendance);
    return newAttendance;
  },

  checkOut(userId) {
    const data = readDB();
    const activeIndex = data.attendance.reduce((latestIdx, curr, idx) => {
      if (curr.user_id === userId && !curr.check_out) {
        if (latestIdx === -1 || new Date(curr.check_in) > new Date(data.attendance[latestIdx].check_in)) {
          return idx;
        }
      }
      return latestIdx;
    }, -1);

    if (activeIndex === -1) {
      throw new Error('لا يوجد تسجيل حضور نشط لتسجيل الانصراف منه.');
    }

    const now = new Date();
    const attendanceRecord = data.attendance[activeIndex];
    const user = data.users.find(u => u.id === userId);

    const checkInTime = new Date(attendanceRecord.check_in);
    const diffMs = Math.max(0, now - checkInTime);
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const hoursFormatted = formatMinutes(totalMins);
    const hoursFloat = Math.round((totalMins / 60) * 100) / 100;

    const shiftEnd = (user && user.shift_end) || attendanceRecord.shift_end || '17:00';
    const [eHours, eMins] = shiftEnd.split(':').map(Number);
    const officialEndToday = new Date(now);
    officialEndToday.setHours(eHours, eMins, 0, 0);

    let overtimeMins = 0;
    if (now > officialEndToday) {
      overtimeMins = Math.floor((now - officialEndToday) / (1000 * 60));
    }

    attendanceRecord.check_out = now.toISOString();
    attendanceRecord.hours = hoursFloat;
    attendanceRecord.hours_formatted = hoursFormatted;
    attendanceRecord.overtime_minutes = overtimeMins;
    attendanceRecord.overtime_text = formatMinutes(overtimeMins);

    writeDB(data);
    pushToGoogleSheets('check_out', attendanceRecord);
    return attendanceRecord;
  },

  getAttendanceLogs(userId = null) {
    const data = readDB();
    let logs = data.attendance;
    if (userId) {
      logs = logs.filter(a => a.user_id === userId);
    }
    return logs.sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
  },

  // Notifications management
  sendNotification(userId, type, message, amount = null) {
    const data = readDB();
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new Error('الموظف غير موجود لإرسال الإشعار.');

    const newNotification = {
      id: generateId(),
      user_id: userId,
      user_name: user.name,
      type: type,
      message: message.trim(),
      amount: type === 'reward' && amount ? parseFloat(amount) : null,
      created_at: new Date().toISOString(),
      read: false
    };

    data.notifications.push(newNotification);
    writeDB(data);
    pushToGoogleSheets('send_notification', newNotification);
    return newNotification;
  },

  getNotifications(userId = null) {
    const data = readDB();
    let list = data.notifications;
    if (userId) {
      list = list.filter(n => n.user_id === userId);
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  markNotificationsAsRead(userId) {
    const data = readDB();
    let updated = false;
    data.notifications.forEach(n => {
      if (n.user_id === userId && !n.read) {
        n.read = true;
        updated = true;
      }
    });
    if (updated) {
      writeDB(data);
      pushToGoogleSheets('mark_notifications_read', { userId });
    }
    return updated;
  },

  // Device management
  getAuthorizedDevices() {
    const data = readDB();
    return data.authorized_devices;
  },

  isDeviceAuthorized(token) {
    if (!token) return false;
    const data = readDB();
    return data.authorized_devices.some(d => d.token === token);
  },

  authorizeDevice(token, name) {
    const data = readDB();
    if (data.authorized_devices.length >= 3) {
      throw new Error('تم الوصول للحد الأقصى للأجهزة المصرح بها (3 أجهزة). يرجى إلغاء تصريح أحد الأجهزة أولاً.');
    }
    
    if (data.authorized_devices.some(d => d.token === token)) {
      return true;
    }

    const dev = {
      token: token,
      name: name.trim() || `جهاز ${data.authorized_devices.length + 1}`,
      authorized_at: new Date().toISOString(),
      last_used: new Date().toISOString()
    };

    data.authorized_devices.push(dev);
    writeDB(data);
    pushToGoogleSheets('authorize_device', dev);
    return true;
  },

  updateDeviceLastUsed(token) {
    const data = readDB();
    const device = data.authorized_devices.find(d => d.token === token);
    if (device) {
      device.last_used = new Date().toISOString();
      writeDB(data);
      pushToGoogleSheets('update_device_last_used', { token });
    }
  },

  revokeDevice(token) {
    const data = readDB();
    const initialLength = data.authorized_devices.length;
    data.authorized_devices = data.authorized_devices.filter(d => d.token !== token);
    if (data.authorized_devices.length < initialLength) {
      writeDB(data);
      pushToGoogleSheets('revoke_device', { token });
      return true;
    }
    return false;
  }
};

module.exports = db;
