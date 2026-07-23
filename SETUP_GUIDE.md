# 🚀 Step-by-Step Google Apps Script Backend Deployment Guide

Follow these simple steps to connect your **Employee Attendance and Departure System** frontend to Google Sheets via Google Apps Script (GAS).

---

## Step 1: Create a New Google Sheet
1. Open [Google Sheets](https://sheets.google.com) in your web browser.
2. Click **Blank spreadsheet** (`جدول بيانات فارغ`).
3. Name the Google Sheet: `Employee Attendance System DB` (or any name you prefer).

---

## Step 2: Open Google Apps Script Editor
1. In the top menu bar of your Google Sheet, click **Extensions** (`إضافات`) > **Apps Script**.
2. A new tab will open with the Google Apps Script IDE.
3. Rename the project at the top to `AttendanceSystemBackend`.

---

## Step 3: Paste the Backend Code
1. Delete any existing code inside the `Code.gs` editor window.
2. Open the [gas_code.gs](file:///c:/Users/mega/Desktop/New%20folder/time/gas_code.gs) file from this repository.
3. Copy all of the code and paste it directly into `Code.gs`.
4. Click the **Save** icon 💾 (or press `Ctrl + S`).

---

## Step 4: Run Initial Setup (Creates Tables & Default Accounts)
1. At the top of the Apps Script editor, locate the function dropdown menu (next to `Debug` / `Run`).
2. Select `initialSetup` from the dropdown list.
3. Click **Run** (`تشغيل`).
4. **Grant Permissions**:
   - Google will prompt: *"Authorization required"*.
   - Click **Review permissions**.
   - Choose your Google Account.
   - Click **Advanced** (`خيارات متقدمة`) at the bottom left.
   - Click **Go to AttendanceSystemBackend (unsafe)** (`الانتقال إلى AttendanceSystemBackend`).
   - Click **Allow** (`سماح`).
5. Check the execution log at the bottom. You should see: `System setup completed successfully!`.
6. Switch back to your Google Sheet tab — you will see that 5 sheets were automatically created:
   - `AdminSettings` (Default Login: `admin` / Password: `admin123`)
   - `Devices`
   - `Employees` (Default Sample: username `ahmed` / password `emp123`)
   - `Attendance`
   - `Notifications`

---

## Step 5: Deploy as a Web App
1. At the top right of the Apps Script page, click **Deploy** (`نشر`) > **New deployment** (`نشر جديد`).
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app** (`تطبيق ويب`).
3. Fill in the deployment configuration:
   - **Description**: `Attendance System API v1`
   - **Execute as**: Select **Me** (`أنا - account@gmail.com`)
   - **Who has access**: Select **Anyone** (`أي شخص`) ⚠️ *Crucial step for cross-origin access!*
4. Click **Deploy**.
5. Once deployment completes, copy the **Web App URL** (looks like: `https://script.google.com/macros/s/AKfycbx.../exec`).

---

## Step 6: Connect Backend to Frontend (`app.js`)
1. Open [app.js](file:///c:/Users/mega/Desktop/New%20folder/time/app.js) in your text editor.
2. Locate line 1:
   ```javascript
   const WEB_APP_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
3. Replace `"YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE"` with your copied Web App URL:
   ```javascript
   const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx.../exec";
   ```
4. Save `app.js`.

---

## Step 7: Host on GitHub Pages (Optional / Production)
1. Commit and push all files (`index.html`, `style.css`, `app.js`) to a GitHub repository.
2. Go to Repository **Settings** > **Pages**.
3. Select `main` branch and `/ (root)` folder, then click **Save**.
4. Your website is now live on GitHub Pages and linked to Google Sheets!

---

### 🛡️ Default Access Credentials:
- **Admin**: Username: `admin` | Password: `admin123`
- **Sample Employee**: Username: `ahmed` | Password: `emp123`
- **Device Authorization**: When opening the app for the first time, your browser device will show "Pending Approval". Log in as Admin to approve the device under the "أجهزة النظام" tab!
