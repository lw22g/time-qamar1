// ==============================================================================
// Firebase Client Integration Layer with Google Sheets Auto-Sync & Fallback
// ==============================================================================

var _firebaseDb = null;

function getFirebaseDb() {
  if (!_firebaseDb) {
    if (typeof firebaseConfig === 'undefined' || !firebaseConfig || !firebaseConfig.projectId) {
      console.warn('Firebase configuration (firebaseConfig) missing in public/js/config.js');
      return null;
    }
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      _firebaseDb = firebase.firestore();
    } else {
      console.warn('Firebase SDK not loaded.');
      return null;
    }
  }
  return _firebaseDb;
}

function formatMinsTextFB(totalMins) {
  if (!totalMins || totalMins <= 0) return "00:00";
  var hours = Math.floor(totalMins / 60);
  var mins = totalMins % 60;
  return String(hours).padStart(2, '0') + ":" + String(mins).padStart(2, '0');
}

function syncToGoogleSheetsFB(action, payload) {
  if (typeof GOOGLE_SCRIPT_URL !== 'undefined' && GOOGLE_SCRIPT_URL) {
    try {
      fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, payload: payload })
      }).catch(function(e) { console.warn('Google Sheets background sync notice:', e); });
    } catch (e) {
      console.warn('Google Sheets sync notice:', e);
    }
  }
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// 1. Login Authentication
async function fbLogin(username, password) {
  var db = getFirebaseDb();
  if (!db) return null;

  var cleanUsername = (username || '').trim().toLowerCase();
  var cleanPassword = (password || '').trim();

  // Check Admin Credentials from settings collection
  var adminSettingsDoc = await db.collection('settings').doc('admin_settings').get();
  var settings = adminSettingsDoc.exists ? adminSettingsDoc.data() : {};

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

  // Check users collection for Employee login
  var usersSnap = await db.collection('users').where('username', '==', cleanUsername).get();
  if (!usersSnap.empty) {
    var foundDoc = usersSnap.docs[0];
    var found = { id: foundDoc.id, ...foundDoc.data() };
    if (found.password === cleanPassword) {
      found.role = 'employee';
      return { success: true, role: 'employee', name: found.name, user: found };
    }
  }

  return { success: false, message: 'اسم المستخدم أو رمز المرور غير صحيح.' };
}

// 2. Devices Status & Authorization
async function fbCheckDeviceStatus() {
  var db = getFirebaseDb();
  if (!db) return { authorized: true, deviceCount: 1, maxDevices: 3 };

  var token = localStorage.getItem('device_token');
  var devicesSnap = await db.collection('devices').get();
  var count = devicesSnap.size;

  if (count === 0) {
    return { authorized: true, deviceCount: 0, maxDevices: 3 };
  }

  if (token) {
    var devDoc = await db.collection('devices').doc(token).get();
    if (devDoc.exists) {
      return { authorized: true, deviceCount: count, maxDevices: 3 };
    }
  }

  return { authorized: false, deviceCount: count, maxDevices: 3 };
}

async function fbAuthorizeDevice(name, password) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };

  var adminSettingsDoc = await db.collection('settings').doc('admin_settings').get();
  var adminPass = 'admin';
  if (adminSettingsDoc.exists && adminSettingsDoc.data().admin_password) {
    adminPass = adminSettingsDoc.data().admin_password;
  }

  if (password !== adminPass) {
    return { success: false, message: 'رمز مرور المدير غير صحيح.' };
  }

  var countSnap = await db.collection('devices').get();
  if (countSnap.size >= 3) {
    return { success: false, message: 'تم الوصول للحد الأقصى للأجهزة المصرح بها (3 أجهزة).' };
  }

  var token = generateUUID();
  var payload = {
    token: token,
    name: name || 'حاسوب مفعّل',
    authorized_at: new Date().toISOString(),
    last_used: new Date().toISOString()
  };

  await db.collection('devices').doc(token).set(payload);
  localStorage.setItem('device_token', token);

  syncToGoogleSheetsFB('authorize_device', { name, password, token });
  return { success: true, token: token, message: 'تم تفويض الجهاز بنجاح.' };
}

// 3. Attendance Check-In / Check-Out
async function fbCheckIn(userId) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };
  if (!userId || userId === 'admin') return { success: false, message: 'حساب المدير لا يقوم بتسجيل الحضور.' };

  var userDoc = await db.collection('users').doc(userId).get();
  var user = null;

  if (userDoc.exists) {
    user = { id: userDoc.id, ...userDoc.data() };
  } else {
    var userQuery = await db.collection('users').where('username', '==', userId).get();
    if (!userQuery.empty) user = { id: userQuery.docs[0].id, ...userQuery.docs[0].data() };
  }

  if (!user) return { success: false, message: 'الموظف غير موجود.' };

  var activeSnap = await db.collection('attendance')
    .where('user_id', '==', user.id)
    .where('check_out', '==', null)
    .get();

  if (!activeSnap.empty) {
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

  var docId = generateUUID();
  var payload = {
    id: docId,
    user_id: user.id,
    user_name: user.name,
    date: dateStr,
    check_in: now.toISOString(),
    check_out: null,
    hours: null,
    hours_formatted: null,
    shift_start: shiftStart,
    shift_end: user.shift_end || '17:00',
    lateness_minutes: latenessMins,
    lateness_text: formatMinsTextFB(latenessMins),
    overtime_minutes: 0,
    overtime_text: '00:00'
  };

  await db.collection('attendance').doc(docId).set(payload);

  syncToGoogleSheetsFB('check_in', { userId: user.id });
  return { success: true, message: 'تم تسجيل حضورك بنجاح. يومك سعيد!' };
}

async function fbCheckOut(userId) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };
  if (!userId || userId === 'admin') return { success: false, message: 'حساب المدير لا يقوم بتسجيل الانصراف.' };

  var activeSnap = await db.collection('attendance')
    .where('user_id', '==', userId)
    .where('check_out', '==', null)
    .get();

  if (activeSnap.empty) {
    return { success: false, message: 'لا يوجد تسجيل حضور نشط لتسجيل الانصراف منه.' };
  }

  var currentDoc = activeSnap.docs[0];
  var current = currentDoc.data();
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

  await db.collection('attendance').doc(currentDoc.id).update({
    check_out: now.toISOString(),
    hours: hoursFloat,
    hours_formatted: formatMinsTextFB(totalMins),
    overtime_minutes: overtimeMins,
    overtime_text: formatMinsTextFB(overtimeMins)
  });

  syncToGoogleSheetsFB('check_out', { userId: userId });
  return { success: true, message: 'تم تسجيل انصرافك بنجاح. عدد ساعات العمل: ' + hoursFloat + ' ساعة.' };
}

// 4. Logs & Notifications Retrieval
async function fbGetMyLogs(userId) {
  var db = getFirebaseDb();
  if (!db || !userId) return [];

  var snap = await db.collection('attendance')
    .where('user_id', '==', userId)
    .get();

  var logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  logs.sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
  return logs;
}

async function fbGetMyNotifications(userId) {
  var db = getFirebaseDb();
  if (!db || !userId) return [];

  var snap = await db.collection('notifications')
    .where('user_id', '==', userId)
    .get();

  var notifs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  notifs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return notifs;
}

// 5. Admin Employee & Attendance Operations
async function fbGetAdminEmployees() {
  var db = getFirebaseDb();
  if (!db) return [];

  var snap = await db.collection('users').get();
  var employees = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  employees.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  return employees;
}

async function fbCreateEmployee(payload) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };

  var cleanUsername = (payload.username || '').trim().toLowerCase();
  var existingSnap = await db.collection('users').where('username', '==', cleanUsername).get();

  if (!existingSnap.empty) {
    return { success: false, message: 'اسم المستخدم مسجل بالفعل لموظف آخر.' };
  }

  var newId = payload.id || generateUUID();
  var newEmp = {
    id: newId,
    name: payload.name.trim(),
    username: cleanUsername,
    password: payload.password.trim(),
    shift_start: payload.shift_start || '08:00',
    shift_end: payload.shift_end || '17:00',
    role: 'employee',
    created_at: new Date().toISOString()
  };

  await db.collection('users').doc(newId).set(newEmp);

  syncToGoogleSheetsFB('create_employee', payload);
  return { success: true, message: 'تم إضافة الموظف بنجاح في Firebase.' };
}

async function fbUpdateEmployee(payload) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };

  var updateObj = {
    name: payload.name.trim(),
    username: payload.username.trim().toLowerCase(),
    shift_start: payload.shift_start || '08:00',
    shift_end: payload.shift_end || '17:00'
  };

  if (payload.password && payload.password.trim()) {
    updateObj.password = payload.password.trim();
  }

  await db.collection('users').doc(payload.id).update(updateObj);

  syncToGoogleSheetsFB('update_employee', payload);
  return { success: true, message: 'تم تعديل بيانات الموظف بنجاح في Firebase.' };
}

async function fbDeleteEmployee(id) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };

  await db.collection('users').doc(id).delete();

  syncToGoogleSheetsFB('delete_employee', { id: id });
  return { success: true, message: 'تم حذف الموظف بنجاح من Firebase.' };
}

async function fbGetAdminAttendance() {
  var db = getFirebaseDb();
  if (!db) return [];

  var snap = await db.collection('attendance').get();
  var logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  logs.sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
  return logs;
}

async function fbSendNotification(payload) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };

  var userDoc = await db.collection('users').doc(payload.userId).get();
  var userName = 'الموظف';
  if (userDoc.exists && userDoc.data().name) {
    userName = userDoc.data().name;
  }

  var newId = generateUUID();
  var newNotif = {
    id: newId,
    user_id: payload.userId,
    user_name: userName,
    type: payload.type,
    message: payload.message.trim(),
    amount: payload.type === 'reward' && payload.amount ? parseFloat(payload.amount) : null,
    created_at: new Date().toISOString()
  };

  await db.collection('notifications').doc(newId).set(newNotif);

  syncToGoogleSheetsFB('send_notification', payload);
  return { success: true, message: 'تم إرسال الإشعار بنجاح عبر Firebase.' };
}

async function fbGetAdminNotifications() {
  var db = getFirebaseDb();
  if (!db) return [];

  var snap = await db.collection('notifications').get();
  var notifs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  notifs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return notifs;
}

async function fbGetAuthorizedDevices() {
  var db = getFirebaseDb();
  if (!db) return [];

  var snap = await db.collection('devices').get();
  var devices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  devices.sort((a, b) => new Date(b.authorized_at || 0) - new Date(a.authorized_at || 0));
  return devices;
}

async function fbRevokeDevice(token) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };

  await db.collection('devices').doc(token).delete();

  syncToGoogleSheetsFB('revoke_device', { token: token });
  return { success: true, message: 'تم إلغاء تصريح الجهاز بنجاح من Firebase.' };
}

async function fbChangeAdminCredentials(payload) {
  var db = getFirebaseDb();
  if (!db) return { success: false, message: 'الخدمة غير متصلة بـ Firebase.' };

  await db.collection('settings').doc('admin_settings').set({
    admin_name: payload.name.trim(),
    admin_username: payload.username.trim(),
    admin_password: payload.password.trim()
  }, { merge: true });

  syncToGoogleSheetsFB('change_admin_password', payload);
  return { success: true, message: 'تم تعديل بيانات حساب المدير بنجاح في Firebase.' };
}
