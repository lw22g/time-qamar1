// ==============================================================================
// Supabase Client Integration Layer for Qamar Al-Khaleej Attendance System
// ==============================================================================

var _supabaseClient = null;

function getSupabase() {
  if (!_supabaseClient) {
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase URL or Key not set in public/js/config.js');
      return null;
    }
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }
  return _supabaseClient;
}

function formatMinsText(totalMins) {
  if (!totalMins || totalMins <= 0) return "00:00";
  var hours = Math.floor(totalMins / 60);
  var mins = totalMins % 60;
  return String(hours).padStart(2, '0') + ":" + String(mins).padStart(2, '0');
}

// 1. Login Authentication
async function dbLogin(username, password) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'يرجى إدخال SUPABASE_URL و SUPABASE_ANON_KEY في ملف config.js' };

  var cleanUsername = (username || '').trim().toLowerCase();
  var cleanPassword = (password || '').trim();

  // Check Admin Credentials from settings table
  var { data: settingsData } = await sb.from('settings').select('*');
  var settings = {};
  if (settingsData) {
    settingsData.forEach(row => settings[row.key] = row.value);
  }

  var adminUser = (settings.admin_username || 'admin').toLowerCase();
  var adminPass = settings.admin_password || 'admin';
  var adminName = settings.admin_name || 'المدير العام';

  if (cleanUsername === adminUser && cleanPassword === adminPass) {
    return {
      success: true,
      role: 'admin',
      name: adminName,
      user: { id: 'admin', name: adminName, username: adminUser, role: 'admin' }
    };
  }

  // Check Users table for Employee login
  var { data: users, error } = await sb.from('users').select('*').eq('username', cleanUsername);
  if (error) return { success: false, message: error.message };

  if (users && users.length > 0) {
    var found = users[0];
    if (found.password === cleanPassword) {
      found.role = 'employee';
      return { success: true, role: 'employee', name: found.name, user: found };
    }
  }

  return { success: false, message: 'اسم المستخدم أو رمز المرور غير صحيح.' };
}

// 2. Devices Status & Authorization
async function dbCheckDeviceStatus() {
  var sb = getSupabase();
  if (!sb) return { authorized: true, deviceCount: 1, maxDevices: 3 };

  var { data: devices } = await sb.from('devices').select('*');
  var count = devices ? devices.length : 0;
  return { authorized: true, deviceCount: count, maxDevices: 3 };
}

async function dbAuthorizeDevice(name, password) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };

  var { data: settingsData } = await sb.from('settings').select('*');
  var adminPass = 'admin';
  if (settingsData) {
    var p = settingsData.find(s => s.key === 'admin_password');
    if (p) adminPass = p.value;
  }

  if (password !== adminPass) {
    return { success: false, message: 'رمز مرور المدير غير صحيح.' };
  }

  var token = crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36));
  var { error } = await sb.from('devices').insert([{
    token: token,
    name: name || 'حاسوب مفعّل',
    authorized_at: new Date().toISOString(),
    last_used: new Date().toISOString()
  }]);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم تفويض الجهاز بنجاح.' };
}

// 3. Attendance Check-In / Check-Out
async function dbCheckIn(userId) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };
  if (!userId || userId === 'admin') return { success: false, message: 'حساب المدير لا يقوم بتسجيل الحضور.' };

  var { data: users } = await sb.from('users').select('*').eq('id', userId);
  if (!users || users.length === 0) return { success: false, message: 'الموظف غير موجود.' };
  var user = users[0];

  // Check active attendance
  var { data: active } = await sb.from('attendance').select('*').eq('user_id', userId).is('check_out', null);
  if (active && active.length > 0) {
    return { success: false, message: 'لقد قمت بتسجيل الحضور بالفعل ولا يزال الدوام نشطاً.' };
  }

  var now = new Date();
  var dateStr = now.toISOString().split('T')[0];
  var shiftStart = user.shift_start || '08:00';
  var parts = shiftStart.split(':');
  var officialStart = new Date(now);
  officialStart.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);

  var latenessMins = 0;
  if (now > officialStart) {
    latenessMins = Math.floor((now - officialStart) / (1000 * 60));
  }

  var { error } = await sb.from('attendance').insert([{
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
    lateness_text: formatMinsText(latenessMins),
    overtime_minutes: 0,
    overtime_text: '00:00'
  }]);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم تسجيل حضورك بنجاح. يومك سعيد!' };
}

async function dbCheckOut(userId) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };
  if (!userId || userId === 'admin') return { success: false, message: 'حساب المدير لا يقوم بتسجيل الانصراف.' };

  var { data: activeLogs } = await sb.from('attendance').select('*').eq('user_id', userId).is('check_out', null).order('check_in', { ascending: false });
  if (!activeLogs || activeLogs.length === 0) {
    return { success: false, message: 'لا يوجد تسجيل حضور نشط لتسجيل الانصراف منه.' };
  }

  var current = activeLogs[0];
  var now = new Date();
  var checkInTime = new Date(current.check_in);
  var diffMs = Math.max(0, now - checkInTime);
  var totalMins = Math.floor(diffMs / (1000 * 60));
  var hoursFloat = Math.round((totalMins / 60) * 100) / 100;

  var shiftEnd = current.shift_end || '17:00';
  var parts = shiftEnd.split(':');
  var officialEnd = new Date(now);
  officialEnd.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);

  var overtimeMins = 0;
  if (now > officialEnd) {
    overtimeMins = Math.floor((now - officialEnd) / (1000 * 60));
  }

  var { error } = await sb.from('attendance').update({
    check_out: now.toISOString(),
    hours: hoursFloat,
    hours_formatted: formatMinsText(totalMins),
    overtime_minutes: overtimeMins,
    overtime_text: formatMinsText(overtimeMins)
  }).eq('id', current.id);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم تسجيل انصرافك بنجاح. عدد ساعات العمل: ' + hoursFloat + ' ساعة.' };
}

// 4. Logs & Notifications Retrieval
async function dbGetMyLogs(userId) {
  var sb = getSupabase();
  if (!sb || !userId) return [];
  var { data } = await sb.from('attendance').select('*').eq('user_id', userId).order('check_in', { ascending: false });
  return data || [];
}

async function dbGetMyNotifications(userId) {
  var sb = getSupabase();
  if (!sb || !userId) return [];
  var { data } = await sb.from('attendance').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  var { data: notifs } = await sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return notifs || [];
}

// 5. Admin Employee & Attendance Operations
async function dbGetAdminEmployees() {
  var sb = getSupabase();
  if (!sb) return [];
  var { data } = await sb.from('users').select('*').order('name', { ascending: true });
  return data || [];
}

async function dbCreateEmployee(payload) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };

  var cleanUsername = (payload.username || '').trim().toLowerCase();
  var { data: existing } = await sb.from('users').select('*').eq('username', cleanUsername);
  if (existing && existing.length > 0) {
    return { success: false, message: 'اسم المستخدم مسجل بالفعل لموظف آخر.' };
  }

  var { error } = await sb.from('users').insert([{
    name: payload.name.trim(),
    username: cleanUsername,
    password: payload.password.trim(),
    shift_start: payload.shift_start || '08:00',
    shift_end: payload.shift_end || '17:00',
    role: 'employee'
  }]);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم إضافة الموظف بنجاح.' };
}

async function dbUpdateEmployee(payload) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };

  var updateObj = {
    name: payload.name.trim(),
    username: payload.username.trim().toLowerCase(),
    shift_start: payload.shift_start || '08:00',
    shift_end: payload.shift_end || '17:00'
  };

  if (payload.password && payload.password.trim()) {
    updateObj.password = payload.password.trim();
  }

  var { error } = await sb.from('users').update(updateObj).eq('id', payload.id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم تعديل بيانات الموظف بنجاح.' };
}

async function dbDeleteEmployee(id) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };

  var { error } = await sb.from('users').delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم حذف الموظف بنجاح.' };
}

async function dbGetAdminAttendance() {
  var sb = getSupabase();
  if (!sb) return [];
  var { data } = await sb.from('attendance').select('*').order('check_in', { ascending: false });
  return data || [];
}

async function dbSendNotification(payload) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };

  var { data: users } = await sb.from('users').select('*').eq('id', payload.userId);
  if (!users || users.length === 0) return { success: false, message: 'الموظف غير موجود.' };

  var { error } = await sb.from('notifications').insert([{
    user_id: payload.userId,
    user_name: users[0].name,
    type: payload.type,
    message: payload.message.trim(),
    amount: payload.type === 'reward' && payload.amount ? parseFloat(payload.amount) : null
  }]);

  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم إرسال الإشعار بنجاح.' };
}

async function dbGetAdminNotifications() {
  var sb = getSupabase();
  if (!sb) return [];
  var { data } = await sb.from('notifications').select('*').order('created_at', { ascending: false });
  return data || [];
}

async function dbGetAuthorizedDevices() {
  var sb = getSupabase();
  if (!sb) return [];
  var { data } = await sb.from('devices').select('*').order('authorized_at', { ascending: false });
  return data || [];
}

async function dbRevokeDevice(token) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };

  var { error } = await sb.from('devices').delete().eq('token', token);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'تم إلغاء تصريح الجهاز بنجاح.' };
}

async function dbChangeAdminCredentials(payload) {
  var sb = getSupabase();
  if (!sb) return { success: false, message: 'الخدمة غير متصلة.' };

  await sb.from('settings').upsert([
    { key: 'admin_name', value: payload.name.trim() },
    { key: 'admin_username', value: payload.username.trim() },
    { key: 'admin_password', value: payload.password.trim() }
  ]);

  return { success: true, message: 'تم تعديل بيانات حساب المدير بنجاح.' };
}
