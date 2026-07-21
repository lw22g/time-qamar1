const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory sessions store
// Maps session_token -> { userId, username, role, name, expiresAt }
const sessions = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Device Authorization Middleware
const deviceCheckMiddleware = (req, res, next) => {
  const deviceToken = req.cookies.device_token;
  const isAuthorized = db.isDeviceAuthorized(deviceToken);

  // Define paths that do not require device authorization
  const publicPaths = [
    '/unauthorized.html',
    '/css/style.css',
    '/js/auth.js',
    '/api/device/authorize',
    '/api/device/status'
  ];

  const isPublicPath = publicPaths.some(p => req.path === p || req.path.startsWith('/css/') || req.path === '/favicon.ico');

  if (isAuthorized) {
    db.updateDeviceLastUsed(deviceToken);
    req.isDeviceAuthorized = true;
    return next();
  }

  if (isPublicPath) {
    return next();
  }

  // Not authorized
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'device_unauthorized', message: 'هذا الجهاز غير مصرح له بالدخول للنظام.' });
  }

  // Redirect page requests to unauthorized page
  return res.redirect('/unauthorized.html');
};

app.use(deviceCheckMiddleware);

// Session Verification Middleware
const sessionCheckMiddleware = (req, res, next) => {
  const sessionToken = req.cookies.session_token;
  const session = sessions[sessionToken];

  if (!session || new Date() > new Date(session.expiresAt)) {
    if (sessionToken) delete sessions[sessionToken]; // clean expired
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'unauthorized', message: 'يرجى تسجيل الدخول أولاً.' });
    }
    return res.redirect('/');
  }

  req.session = session;
  next();
};

// Admin Only Middleware
const adminOnlyMiddleware = (req, res, next) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', message: 'غير مصرح! هذه الصلاحية للمدير فقط.' });
  }
  next();
};

// --- API ROUTES ---

// 1. Device Authorization
app.post('/api/device/authorize', (req, res) => {
  const { password, name } = req.body;
  const adminSettings = db.getAdmin();

  if (password !== adminSettings.admin_password) {
    return res.status(401).json({ success: false, message: 'رمز مرور المدير غير صحيح.' });
  }

  try {
    const newToken = crypto.randomBytes(32).toString('hex');
    db.authorizeDevice(newToken, name || `جهاز حاسوب`);
    
    // Set cookie valid for 10 years
    res.cookie('device_token', newToken, {
      maxAge: 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
      httpOnly: true,
      secure: false, // Set to true if deploying with HTTPS
      sameSite: 'lax'
    });

    res.json({ success: true, message: 'تم تفويض الجهاز بنجاح.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Device status checking
app.get('/api/device/status', (req, res) => {
  const deviceToken = req.cookies.device_token;
  const isAuthorized = db.isDeviceAuthorized(deviceToken);
  const devices = db.getAuthorizedDevices();
  
  res.json({
    authorized: isAuthorized,
    deviceCount: devices.length,
    maxDevices: 3
  });
});

// 2. Authentication Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم ورمز المرور.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const adminSettings = db.getAdmin();

  let user = null;
  let role = 'employee';

  if (cleanUsername === adminSettings.admin_username.toLowerCase()) {
    if (password === adminSettings.admin_password) {
      role = 'admin';
      user = { id: 'admin', name: adminSettings.admin_name || 'المدير العام', username: adminSettings.admin_username };
    }
  } else {
    const foundUser = db.getUserByUsername(cleanUsername);
    if (foundUser && foundUser.password === password) {
      user = foundUser;
    }
  }

  if (!user) {
    return res.status(401).json({ success: false, message: 'اسم المستخدم أو رمز المرور غير صحيح.' });
  }

  // Create session
  const sessionToken = crypto.randomBytes(32).toString('hex');
  sessions[sessionToken] = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: role,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours session
  };

  res.cookie('session_token', sessionToken, {
    maxAge: 12 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false, // true in prod
    sameSite: 'lax'
  });

  res.json({ success: true, role, name: user.name });
});

// Authentication Logout
app.post('/api/auth/logout', (req, res) => {
  const sessionToken = req.cookies.session_token;
  if (sessionToken) {
    delete sessions[sessionToken];
  }
  res.clearCookie('session_token');
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح.' });
});

// Get user info (me)
app.get('/api/auth/me', sessionCheckMiddleware, (req, res) => {
  let currentName = req.session.name;
  if (req.session.role === 'admin') {
    const adminSettings = db.getAdmin();
    currentName = adminSettings.admin_name || 'المدير العام';
  }
  res.json({
    id: req.session.userId,
    username: req.session.username,
    name: currentName,
    role: req.session.role
  });
});

// Send live events to Google Sheets Webhook if configured
function sendToGoogleSheetsWebhook(eventType, data) {
  const adminSettings = db.getAdmin();
  if (!adminSettings.webhook_url) return;

  try {
    const httpLib = adminSettings.webhook_url.startsWith('https') ? require('https') : require('http');
    const payload = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: data
    });

    const urlObj = new URL(adminSettings.webhook_url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = httpLib.request(options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        if (res.headers.location) {
          const redirectUrl = res.headers.location;
          const rUrlObj = new URL(redirectUrl);
          const rOptions = {
            hostname: rUrlObj.hostname,
            port: rUrlObj.port || (rUrlObj.protocol === 'https:' ? 443 : 80),
            path: rUrlObj.pathname + rUrlObj.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          };
          const rReq = httpLib.request(rOptions);
          rReq.write(payload);
          rReq.end();
        }
      }
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('Webhook error:', err);
  }
}

// 3. Attendance APIs
app.post('/api/attendance/check-in', sessionCheckMiddleware, (req, res) => {
  if (req.session.role === 'admin') {
    return res.status(400).json({ success: false, message: 'حساب المدير لا يقوم بتسجيل الحضور والانصراف.' });
  }

  try {
    const attendance = db.checkIn(req.session.userId);
    sendToGoogleSheetsWebhook('check_in', attendance);
    res.json({ success: true, message: 'تم تسجيل حضورك بنجاح. يومك سعيد!', data: attendance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/attendance/check-out', sessionCheckMiddleware, (req, res) => {
  if (req.session.role === 'admin') {
    return res.status(400).json({ success: false, message: 'حساب المدير لا يقوم بتسجيل الحضور والانصراف.' });
  }

  try {
    const attendance = db.checkOut(req.session.userId);
    sendToGoogleSheetsWebhook('check_out', attendance);
    res.json({ success: true, message: `تم تسجيل انصرافك بنجاح. عدد ساعات العمل اليوم: ${attendance.hours} ساعة.`, data: attendance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/attendance/my-logs', sessionCheckMiddleware, (req, res) => {
  if (req.session.role === 'admin') {
    return res.json([]);
  }
  const logs = db.getAttendanceLogs(req.session.userId);
  res.json(logs);
});

// Get employee notifications
app.get('/api/notifications/my-notifications', sessionCheckMiddleware, (req, res) => {
  if (req.session.role === 'admin') {
    return res.json([]);
  }
  const list = db.getNotifications(req.session.userId);
  // Mark read
  db.markNotificationsAsRead(req.session.userId);
  res.json(list);
});

// 4. Admin Management APIs

// Manage employees
app.get('/api/admin/employees', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  res.json(db.getUsers());
});

app.post('/api/admin/employees', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  const { name, username, password, shift_start, shift_end } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ success: false, message: 'يرجى ملء جميع الحقول المطلوبة.' });
  }
  try {
    const newUser = db.createUser(name, username, password, shift_start, shift_end);
    sendToGoogleSheetsWebhook('new_user', newUser);
    res.json({ success: true, message: 'تم إضافة الموظف بنجاح.', user: newUser });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/employees/:id', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  const { name, username, password, shift_start, shift_end } = req.body;
  const { id } = req.params;
  if (!name || !username) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال الاسم واسم المستخدم.' });
  }
  try {
    const updated = db.updateUser(id, name, username, password, shift_start, shift_end);
    res.json({ success: true, message: 'تم تعديل بيانات الموظف بنجاح.', user: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/employees/:id', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  const { id } = req.params;
  try {
    const success = db.deleteUser(id);
    if (success) {
      res.json({ success: true, message: 'تم حذف الموظف وجميع سجلاته بنجاح.' });
    } else {
      res.status(400).json({ success: false, message: 'فشل حذف الموظف. قد يكون غير موجود.' });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// View all attendance logs
app.get('/api/admin/attendance', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  res.json(db.getAttendanceLogs());
});

// Send warning/reward
app.post('/api/admin/notifications', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  const { userId, type, message, amount } = req.body;
  if (!userId || !type || !message) {
    return res.status(400).json({ success: false, message: 'يرجى تحديد الموظف، نوع الإشعار والرسالة.' });
  }
  try {
    const notification = db.sendNotification(userId, type, message, amount);
    sendToGoogleSheetsWebhook('notification', notification);
    res.json({ success: true, message: 'تم إرسال الإشعار للموظف بنجاح.', data: notification });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// View all sent notifications (admin audit logs)
app.get('/api/admin/notifications-list', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  res.json(db.getNotifications());
});


// Change admin credentials
app.post('/api/admin/change-password', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  const { name, username, password, webhook_url } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال الاسم، اسم المستخدم الجديد، ورمز المرور الجديد.' });
  }
  try {
    db.updateAdmin(name, username, password, webhook_url);
    res.json({ success: true, message: 'تم تعديل بيانات حساب المدير بنجاح.' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Manage authorized devices
app.get('/api/admin/devices', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  res.json(db.getAuthorizedDevices());
});

app.delete('/api/admin/devices/:token', sessionCheckMiddleware, adminOnlyMiddleware, (req, res) => {
  const { token } = req.params;
  try {
    const success = db.revokeDevice(token);
    if (success) {
      res.json({ success: true, message: 'تم إلغاء تصريح الجهاز بنجاح.' });
    } else {
      res.status(400).json({ success: false, message: 'لم يتم العثور على الجهاز.' });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Catch-all route to serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Catch unregistered routes to return index or login
app.get('*', (req, res) => {
  const deviceToken = req.cookies.device_token;
  if (!db.isDeviceAuthorized(deviceToken)) {
    return res.redirect('/unauthorized.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
