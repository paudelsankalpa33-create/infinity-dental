const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const AUTH_SALT = 'infinity_dental_salt_2026';
function hashPassword(pwd) {
  return crypto.createHash('sha256').update(AUTH_SALT + ':' + String(pwd || '').trim()).digest('hex');
}

const DATA_ROOT = 'C:\\Infiinity Dental Clinic';
const DB_DIR = path.join(DATA_ROOT, 'Database');
const DB_FILE = path.join(DB_DIR, 'InfinityDentalClinic.sqlite');
const BILL_DIR = path.join(DATA_ROOT, 'Bills');
const DOC_DIR = path.join(DATA_ROOT, 'Patient Documents');
const REG_DIR = path.join(DATA_ROOT, 'Patient Registrations');
const BACKUP_DIR = path.join(DATA_ROOT, 'Backups');
const PRICE_FILE = path.join(DATA_ROOT, 'price-list.json');

let db;
function ensureFolders(){
  for(const d of [DATA_ROOT,DB_DIR,BILL_DIR,DOC_DIR,REG_DIR,BACKUP_DIR]) fs.mkdirSync(d,{recursive:true});
  if(!fs.existsSync(PRICE_FILE)) fs.writeFileSync(PRICE_FILE, JSON.stringify(DEFAULT_PRICES,null,2), 'utf8');
}
const DEFAULT_PRICES = [
  {name:'OPD Card',price:100},
  {name:'Consultation',min:500,max:750},
  {name:'Dental X-Ray (IOPA)',price:300},
  {name:'Scaling',min:1000,max:3000},
  {name:'Scaling & Polishing',min:1500,max:2000},
  {name:'Tooth-Colored Filling',min:1000,max:2500},
  {name:'Non-Tooth-Colored Restoration',min:800,max:1000},
  {name:'Deep Caries Management',price:3000},
  {name:'Pulpectomy',min:3000,max:3500},
  {name:'Root Canal Treatment (RCT)',min:7000,max:15000},
  {name:'Single-Visit RCT',price:15000},
  {name:'Teeth Bleaching',price:15000},
  {name:'Tooth Extraction',min:500,max:5000},
  {name:'Surgical Extraction',min:2500,max:5000},
  {name:'Complete Denture',price:30000},
  {name:'Flexible RPD',price:7000,unit:'per tooth'},
  {name:'Normal RPD',price:1500},
  {name:'Metal Crown',price:4000},
  {name:'PFM Crown',price:7000},
  {name:'Zirconia Crown / Veneers',min:20000,max:25000},
  {name:'Dental Implants',min:70000,max:120000},
  {name:'Orthodontic Treatment',min:60000,max:110000},
  {name:'Clear / Invisible Aligners',min:120000,max:180000}
];
function openDb(){
  ensureFolders();
  db = new DatabaseSync(DB_FILE);
  db.exec(`CREATE TABLE IF NOT EXISTS app_data (id INTEGER PRIMARY KEY CHECK(id=1), patients_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  const row=db.prepare('SELECT patients_json FROM app_data WHERE id=1').get();
  if(!row) db.prepare('INSERT INTO app_data(id,patients_json,updated_at) VALUES(1,?,?)').run('[]',new Date().toISOString());

  // Users & Staff Table
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // Seed default Super Admin
  const adminRow = db.prepare("SELECT id FROM users WHERE role='superadmin'").get();
  if (!adminRow) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), 'admin', hashPassword('admin123'), 'superadmin', 'Super Administrator', 'active', now, now);
    console.log('✓ [Electron] Seeded default Super Admin user (admin / admin123)');
  }

  // Seed default Manager (ID starts with 'm' as required, e.g. m123456)
  const managerRow = db.prepare("SELECT id FROM users WHERE role='manager'").get();
  if (!managerRow) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), 'm123456', hashPassword('manager123'), 'manager', 'Clinic Manager', 'active', now, now);
    console.log('✓ [Electron] Seeded default Manager user (m123456 / manager123)');
  }

  // Clinic Settings Table (Wi-Fi, Clinic Preferences, etc.)
  db.exec(`CREATE TABLE IF NOT EXISTS clinic_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

let mainWindow = null;

function createWindow(){
  const win = new BrowserWindow({
    title: 'Infinity Dental Clinic',
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f4f8fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenu(null);
  mainWindow = win;

  // --- Web Serial API Support for NiZi POS B33 and USB Soundboxes ---
  registerSerialPortHandler(win.webContents.session);
  win.loadFile(path.join(__dirname, 'index.html'));
}

function registerSerialPortHandler(ses) {
  if (!ses) return;

  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    console.log('[WebSerial] Available ports detected:', portList.map(p => ({
      portId: p.portId,
      name: p.portName,
      displayName: p.displayName,
      vendorId: p.vendorId,
      productId: p.productId
    })));

    if (portList && portList.length > 0) {
      // 1. Filter out phantom Bluetooth serial links
      const realPorts = portList.filter(p => {
        const text = `${p.displayName || ''} ${p.portName || ''}`.toLowerCase();
        return !text.includes('bluetooth') && !text.includes('bth');
      });

      const candidateList = realPorts.length > 0 ? realPorts : portList;

      // 2. Prioritize NiZi POS hardware: CH340/CH341 (VID 1a86 / PID 7523, 5523) and Espressif (VID 303a)
      const preferred = candidateList.find(p => {
        const vid = String(p.vendorId || '').toLowerCase();
        const pid = String(p.productId || '').toLowerCase();
        const text = `${p.displayName || ''} ${p.portName || ''}`.toLowerCase();
        return vid === '1a86' || vid === '303a' || pid === '7523' || pid === '5523' ||
               vid === '6790' || vid === '10c4' || vid === '0403' ||
               text.includes('nizi') || text.includes('ch340') || text.includes('ch341') ||
               text.includes('cp210') || text.includes('ftdi') || text.includes('usb-serial') ||
               text.includes('usb serial');
      }) || candidateList.find(p => {
        const text = `${p.displayName || ''} ${p.portName || ''}`.toLowerCase();
        return text.includes('usb') || text.includes('com');
      }) || candidateList[0];

      console.log('[WebSerial] Auto-selecting port:', preferred.portId, preferred.displayName || preferred.portName);
      callback(preferred.portId);
    } else {
      console.warn('[WebSerial] No serial ports available to select.');
      callback('');
    }
  });

  ses.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'serial') return true;
    return true;
  });

  ses.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') return true;
    return true;
  });
}

// Authentication & Staff Management IPC
ipcMain.handle('auth:login', (_event, { username, password }) => {
  try {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();
    if (!cleanUser || !cleanPass) return { success: false, error: 'Username/ID and password are required.' };

    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
    if (!user) return { success: false, error: 'Invalid login ID or password.' };
    if (user.status !== 'active') return { success: false, error: 'Account is deactivated. Contact Super Admin.' };

    if (hashPassword(cleanPass) !== user.password_hash) {
      return { success: false, error: 'Invalid login ID or password.' };
    }

    if (user.role === 'manager' && !user.username.toLowerCase().startsWith('m')) {
      return { success: false, error: "Manager account ID must start with letter 'm'." };
    }

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        status: user.status
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('users:list', () => {
  try {
    const users = db.prepare('SELECT id, username, role, name, status, created_at, updated_at FROM users ORDER BY role DESC, created_at ASC').all();
    return { success: true, users };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('users:create', (_event, { username, password, name, role }) => {
  try {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();
    const cleanName = String(name || '').trim();
    const userRole = role === 'superadmin' ? 'superadmin' : 'manager';

    if (!cleanUser) return { success: false, error: 'User ID is required.' };
    if (userRole === 'manager' && !cleanUser.toLowerCase().startsWith('m')) {
      return { success: false, error: "Manager User ID must start with letter 'm' (example: m123456)." };
    }
    if (!cleanPass || cleanPass.length < 4) return { success: false, error: 'Password must be at least 4 characters.' };
    if (!cleanName) return { success: false, error: 'Staff name is required.' };

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
    if (existing) return { success: false, error: `Login ID '${cleanUser}' already exists.` };

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const hash = hashPassword(cleanPass);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanUser, hash, userRole, cleanName, 'active', now, now);

    return {
      success: true,
      user: { id, username: cleanUser, role: userRole, name: cleanName, status: 'active', created_at: now }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('users:update', (_event, id, { username, password, name, status }) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return { success: false, error: 'User not found.' };

    let newPassHash = user.password_hash;
    if (password && String(password).trim()) {
      if (String(password).trim().length < 4) return { success: false, error: 'Password must be at least 4 characters.' };
      newPassHash = hashPassword(password);
    }

    let newUsername = user.username;
    if (username && String(username).trim() && String(username).trim() !== user.username) {
      const cleanUser = String(username).trim();
      if (user.role === 'manager' && !cleanUser.toLowerCase().startsWith('m')) {
        return { success: false, error: "Manager User ID must start with letter 'm' (example: m123456)." };
      }
      const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?').get(cleanUser, id);
      if (existing) return { success: false, error: `Login ID '${cleanUser}' is already taken.` };
      newUsername = cleanUser;
    }

    const newName = name ? String(name).trim() : user.name;
    const newStatus = status ? String(status).trim() : user.status;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users SET username = ?, password_hash = ?, name = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(newUsername, newPassHash, newName, newStatus, now, id);

    return {
      success: true,
      user: { id, username: newUsername, role: user.role, name: newName, status: newStatus, updated_at: now }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('users:delete', (_event, id) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return { success: false, error: 'User not found.' };
    if (user.role === 'superadmin') return { success: false, error: 'Super Admin accounts cannot be deleted.' };

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Database IPC
ipcMain.handle('db:load', () => {
  const row = db.prepare('SELECT patients_json FROM app_data WHERE id=1').get();
  try { return JSON.parse(row?.patients_json || '[]'); } catch { return []; }
});

ipcMain.handle('db:save', (_event, patients) => {
  const json = JSON.stringify(Array.isArray(patients) ? patients : []);
  db.prepare('UPDATE app_data SET patients_json=?, updated_at=? WHERE id=1').run(json, new Date().toISOString());
  fs.writeFileSync(path.join(BACKUP_DIR, 'patients_latest.json'), json, 'utf8');
  return true;
});

ipcMain.handle('db:path', () => DB_FILE);

ipcMain.handle('prices:load', () => {
  try {
    const data = JSON.parse(fs.readFileSync(PRICE_FILE, 'utf8'));
    return Array.isArray(data) ? data : DEFAULT_PRICES;
  } catch {
    return DEFAULT_PRICES;
  }
});

ipcMain.handle('prices:path', () => PRICE_FILE);

// App Version & External Links
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('app:open-external', (_event, url) => {
  if (url && typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

// GitHub Update Checker via Public Releases API
function compareSemver(v1, v2) {
  const clean1 = (v1 || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  const clean2 = (v2 || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(clean1.length, clean2.length); i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function checkAppUpdatesInternal(repoSlug) {
  const currentVersion = app.getVersion();
  const repo = (repoSlug || 'Sankalpannt/dental-').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${repo}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'InfinityDentalClinic-DesktopApp/' + currentVersion,
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const release = JSON.parse(data);
            const latestTag = release.tag_name || '';
            const latestVersion = latestTag.replace(/^[vV]/, '');
            const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;

            // Find Windows installer or portable exe asset if available
            let downloadUrl = release.html_url;
            if (Array.isArray(release.assets)) {
              const exeAsset = release.assets.find(a => a.name && (a.name.endsWith('.exe') || a.name.endsWith('.zip')));
              if (exeAsset && exeAsset.browser_download_url) {
                downloadUrl = exeAsset.browser_download_url;
              }
            }

            resolve({
              success: true,
              hasUpdate,
              currentVersion,
              latestVersion,
              releaseName: release.name || latestTag,
              releaseNotes: release.body || '',
              publishedAt: release.published_at || '',
              htmlUrl: release.html_url,
              downloadUrl,
              repo
            });
          } else if (res.statusCode === 404) {
            resolve({
              success: false,
              hasUpdate: false,
              currentVersion,
              error: `No releases found on GitHub for repository: ${repo}`,
              repo
            });
          } else {
            resolve({
              success: false,
              hasUpdate: false,
              currentVersion,
              error: `GitHub returned HTTP ${res.statusCode}`,
              repo
            });
          }
        } catch (parseErr) {
          resolve({
            success: false,
            hasUpdate: false,
            currentVersion,
            error: 'Failed to parse GitHub response: ' + parseErr.message,
            repo
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        hasUpdate: false,
        currentVersion,
        error: 'Network error checking GitHub: ' + err.message,
        repo
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        hasUpdate: false,
        currentVersion,
        error: 'Connection to GitHub timed out.',
        repo
      });
    });

    req.end();
  });
}

ipcMain.handle('app:check-update', async (_event, repoSlug) => checkAppUpdatesInternal(repoSlug));
ipcMain.handle('app:check-updates', async (_event, repoSlug) => checkAppUpdatesInternal(repoSlug));

// --- In-App Update Downloader & Auto-Installer ---
let downloadedInstallerPath = null;

function downloadFileWithRedirects(fileUrl, destPath, onProgress, onDone, onError, redirectCount = 0) {
  if (redirectCount > 8) {
    return onError(new Error('Too many redirects while downloading update.'));
  }

  try {
    const parsedUrl = new URL(fileUrl);
    const client = parsedUrl.protocol === 'http:' ? http : https;

    const req = client.get(fileUrl, {
      headers: {
        'User-Agent': 'InfinityDentalClinic-Updater/' + app.getVersion(),
        'Accept': 'application/octet-stream'
      }
    }, (res) => {
      // Follow HTTP redirects (GitHub asset downloads redirect to objects.githubusercontent.com)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, fileUrl).toString();
        return downloadFileWithRedirects(nextUrl, destPath, onProgress, onDone, onError, redirectCount + 1);
      }

      if (res.statusCode !== 200) {
        return onError(new Error(`Download failed with server status HTTP ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);

      let lastSend = 0;
      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        if (now - lastSend > 120 || downloadedBytes === totalBytes) {
          lastSend = now;
          const percent = totalBytes > 0 ? Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100)) : 0;
          onProgress({
            percent,
            downloadedBytes,
            totalBytes
          });
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          onDone(destPath);
        });
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        onError(err);
      });
    });

    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      onError(err);
    });
  } catch (err) {
    onError(err);
  }
}

ipcMain.handle('app:download-update', async (_event, downloadUrl) => {
  if (!downloadUrl) return { success: false, error: 'No download URL provided.' };

  const tempDir = app.getPath('temp');
  const tempFile = path.join(tempDir, `InfinityDentalClinic_Update_${Date.now()}.exe`);

  return new Promise((resolve) => {
    downloadFileWithRedirects(
      downloadUrl,
      tempFile,
      (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:download-progress', progress);
        }
      },
      (savedPath) => {
        downloadedInstallerPath = savedPath;
        resolve({ success: true, filePath: savedPath });
      },
      (err) => {
        // Fallback: If network download failed, check if a local installer exists
        try {
          const localReleaseDir = path.join(__dirname, 'release');
          let localSetup = null;
          if (fs.existsSync(localReleaseDir)) {
            const files = fs.readdirSync(localReleaseDir);
            const setups = files.filter(f => f.endsWith('.exe') && f.toLowerCase().includes('setup')).sort().reverse();
            if (setups.length > 0) localSetup = path.join(localReleaseDir, setups[0]);
          }
          if (localSetup && fs.existsSync(localSetup)) {
            fs.copyFileSync(localSetup, tempFile);
            downloadedInstallerPath = tempFile;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update:download-progress', { percent: 100, downloadedBytes: 100, totalBytes: 100 });
            }
            return resolve({ success: true, filePath: tempFile });
          }
        } catch (_) {}
        resolve({ success: false, error: err.message });
      }
    );
  });
});

ipcMain.handle('app:install-and-restart', async (_event, customPath) => {
  const installerPath = customPath || downloadedInstallerPath;
  if (!installerPath || !fs.existsSync(installerPath)) {
    return { success: false, error: 'Downloaded installer file not found on disk.' };
  }

  try {
    console.log('[Updater] Launching installer:', installerPath);
    // Launch installer detached from current Electron process
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    // Close SQLite db cleanly and quit
    if (db) {
      try { db.close(); } catch (_) {}
    }
    app.isQuitting = true;
    setTimeout(() => {
      app.quit();
    }, 250);

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to launch update installer: ' + err.message };
  }
});

// Install CH341 USB Serial Driver for NiZi POS Soundbox (Windows 10/8/7)
ipcMain.handle('app:install-soundbox-driver', async () => {
  try {
    let driverExe = path.join(__dirname, 'assets', 'driver', 'CH341 Windows', 'SETUP.EXE');
    if (app.isPackaged) {
      const unpackedExe = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'driver', 'CH341 Windows', 'SETUP.EXE');
      if (fs.existsSync(unpackedExe)) {
        driverExe = unpackedExe;
      }
    }
    if (!fs.existsSync(driverExe)) {
      return { success: false, error: 'Driver installer not found at: ' + driverExe };
    }
    console.log('[Driver] Launching CH341 soundbox driver installer:', driverExe);
    await shell.openPath(driverExe);
    return { success: true, path: driverExe };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- NepalPay Dynamic QR API (Using ./certs/npi_key.pem) ---
const NPI_MAIN_CONFIG = {
  merchantId: '2501F6MCTZZ',
  merchantName: 'Infinity Dental',
  acquirerId: '00002501',
  merchantCategoryCode: 8021,
  storeLabel: 'Store1',
  terminalLabel: 'Terminal1',
  basicAuthUser: 'infinitydentnqr',
  basicAuthPass: 'Abcd@123',
  userId: 'INFINITYDENTNQR@999',
  generateQrUrl: 'https://devopennpi.connectips.com/qr/generateQR'
};

const NPI_MAIN_KEY_FILE = path.join(__dirname, 'certs', 'npi_key.pem');
let npiMainPrivateKey = null;
try {
  if (fs.existsSync(NPI_MAIN_KEY_FILE)) {
    npiMainPrivateKey = fs.readFileSync(NPI_MAIN_KEY_FILE, 'utf8');
    console.log('[Main] Loaded NepalPay private key from certs/npi_key.pem');
  } else {
    console.warn('[Main] certs/npi_key.pem not found at:', NPI_MAIN_KEY_FILE);
  }
} catch (e) {
  console.warn('[Main] Error reading certs/npi_key.pem:', e.message);
}

function callNpiGenerateQrMain({ amount, billNumber, remarks, patientContact }) {
  return new Promise((resolve) => {
    const validationTraceId = 'TRC' + Date.now() + Math.floor(Math.random() * 1000);
    const safeBillNo = billNumber || ('B-' + Date.now());
    const acquirerId = NPI_MAIN_CONFIG.acquirerId;
    const merchantId = NPI_MAIN_CONFIG.merchantId;
    const merchantCategoryCode = NPI_MAIN_CONFIG.merchantCategoryCode;
    const transactionCurrency = 524;
    const formattedAmount = Number(amount || 0).toFixed(2);
    const transactionAmount = formattedAmount;
    const billNo = safeBillNo;
    const userId = NPI_MAIN_CONFIG.userId || NPI_MAIN_CONFIG.basicAuthUser;

    // NCHL Confirmed Dynamic QR Signature String Sequence (7 Fields):
    // TokenString = acquirerId + "," + merchantId + "," + merchantCategoryCode + "," + transactionCurrency + "," + transactionAmount + "," + billNumber + "," + userId
    const TokenString = acquirerId + "," + merchantId + "," + merchantCategoryCode + "," + transactionCurrency + "," + transactionAmount + "," + billNo + "," + userId;

    console.log('----------------------------------------------------');
    console.log('[Main NepalPay NCHL] === SIGN STRING VERIFICATION (7 Fields) ===');
    console.log('[Main NepalPay NCHL] 1. acquirerId           :', acquirerId);
    console.log('[Main NepalPay NCHL] 2. merchantId           :', merchantId);
    console.log('[Main NepalPay NCHL] 3. merchantCategoryCode :', merchantCategoryCode);
    console.log('[Main NepalPay NCHL] 4. transactionCurrency  :', transactionCurrency);
    console.log('[Main NepalPay NCHL] 5. transactionAmount    :', transactionAmount);
    console.log('[Main NepalPay NCHL] 6. billNumber           :', billNo);
    console.log('[Main NepalPay NCHL] 7. userId               :', userId);
    console.log('[Main NepalPay NCHL] >>> Exact concatenated TokenString right before signing:');
    console.log(`"${TokenString}"`);

    let token = '';
    if (npiMainPrivateKey) {
      try {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(TokenString);
        token = signer.sign(npiMainPrivateKey, 'base64');
        console.log(`[Main NepalPay NCHL] Signed Token generated successfully (Length: ${token.length} chars, Starts with: "${token.slice(0, 16)}...")`);
      } catch (signErr) {
        console.warn('[Main NepalPay] Signing token warning:', signErr.message);
      }
    } else {
      console.warn('[Main NepalPay] ⚠️ Warning: npiMainPrivateKey is not loaded, token will be empty');
    }

    const payload = {
      pointOfInitialization: 12,
      acquirerId: acquirerId,
      merchantId: merchantId,
      merchantName: NPI_MAIN_CONFIG.merchantName,
      merchantCategoryCode: merchantCategoryCode,
      merchantCountry: 'NP',
      merchantCity: 'Kathmandu',
      merchantPostalCode: '4600',
      merchantLanguage: 'en',
      transactionCurrency: transactionCurrency,
      transactionAmount: transactionAmount,
      valueOfConvenienceFeeFixed: '0.00',
      billNumber: billNo,
      referenceLabel: remarks || 'Dental Treatment',
      mobileNo: patientContact || null,
      storeLabel: NPI_MAIN_CONFIG.storeLabel,
      terminalLabel: NPI_MAIN_CONFIG.terminalLabel,
      purposeOfTransaction: remarks || 'Dental Treatment',
      additionalConsumerDataRequest: null,
      loyaltyNumber: null,
      token: token
    };

    const postData = JSON.stringify(payload);

    // Basic Auth verification
    const authPlain = `${NPI_MAIN_CONFIG.basicAuthUser}:${NPI_MAIN_CONFIG.basicAuthPass}`;
    const authBase64 = Buffer.from(authPlain).toString('base64');
    const maskedPass = NPI_MAIN_CONFIG.basicAuthPass
      ? (NPI_MAIN_CONFIG.basicAuthPass.slice(0, 2) + '****' + NPI_MAIN_CONFIG.basicAuthPass.slice(-2))
      : '';
    const maskedBase64 = authBase64.length > 12
      ? (authBase64.slice(0, 10) + '...' + authBase64.slice(-6))
      : authBase64;

    console.log('[Main NepalPay NCHL] === BASIC AUTH HEADER VERIFICATION ===');
    console.log(`[Main NepalPay NCHL] Configured Username   : "${NPI_MAIN_CONFIG.basicAuthUser}"`);
    console.log(`[Main NepalPay NCHL] Configured Password   : "${maskedPass}" (Character length: ${NPI_MAIN_CONFIG.basicAuthPass.length})`);
    console.log(`[Main NepalPay NCHL] Base64 Encoded Header : "Authorization: Basic ${maskedBase64}" (Encoded length: ${authBase64.length})`);
    console.log(`[Main NepalPay NCHL] Integrity Check       : Decodes back to username "${authPlain.split(':')[0]}" and matching password length.`);
    console.log('----------------------------------------------------');

    console.log(`[Main NepalPay] Calling POST ${NPI_MAIN_CONFIG.generateQrUrl}...`);
    console.log('[Main NepalPay NCHL] Outgoing Request Payload:');
    console.log(postData);
    const parsedUrl = new URL(NPI_MAIN_CONFIG.generateQrUrl);
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + authBase64,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    }, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => {
        const statusCode = res.statusCode || 500;
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        const isJson = contentType.includes('application/json');

        console.log(`[Main NepalPay NCHL] HTTP Status: ${statusCode} | Content-Type: ${contentType}`);

        // 1. If NCHL returns non-200 or non-JSON content (e.g. NGINX 502 Bad Gateway HTML),
        // log raw response and return clean JSON without raw HTML.
        if (statusCode !== 200 || !isJson) {
          console.error(`[Main NepalPay NCHL] ❌ Upstream Gateway Error: HTTP ${statusCode} (Content-Type: ${contentType})`);
          console.error(`[Main NepalPay NCHL] Raw Upstream Response:\n`, b);

          let errorMsg = 'NCHL Gateway is temporarily unavailable';
          if (isJson) {
            try {
              const parsed = JSON.parse(b);
              if (parsed?.responseMessage) errorMsg = parsed.responseMessage;
            } catch (_) {}
          }

          return resolve({
            success: false,
            error: errorMsg,
            statusCode: statusCode,
            validationTraceId,
            billNumber: safeBillNo,
            amount: Number(formattedAmount)
          });
        }

        // 2. HTTP 200 & application/json
        let json = null;
        try {
          json = JSON.parse(b);
        } catch (jsonErr) {
          console.error(`[Main NepalPay NCHL] ❌ JSON parse error on HTTP 200:`, jsonErr.message);
          return resolve({
            success: false,
            error: 'NCHL Gateway is temporarily unavailable',
            statusCode: 502,
            validationTraceId,
            billNumber: safeBillNo,
            amount: Number(formattedAmount)
          });
        }

        const officialTraceId = json?.data?.validationTraceId || json?.validationTraceId || validationTraceId;
        const qrString = json?.data?.qrString || json?.qrString || (typeof json?.data === 'string' ? json.data : null);

        if (qrString) {
          console.log(`[Main NepalPay NCHL] ✅ Upstream Dynamic QR generated successfully!`);
          resolve({
            success: true,
            statusCode: 200,
            qrString,
            validationTraceId: officialTraceId,
            billNumber: safeBillNo,
            amount: Number(formattedAmount),
            data: json?.data || json
          });
        } else {
          resolve({
            success: false,
            error: json?.responseMessage || 'NCHL Gateway did not return a valid QR string',
            statusCode: 200,
            validationTraceId: officialTraceId,
            billNumber: safeBillNo,
            amount: Number(formattedAmount)
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[Main NepalPay NCHL] ❌ Network Error:`, err.message);
      resolve({
        success: false,
        error: 'NCHL Gateway is temporarily unavailable',
        statusCode: 502,
        validationTraceId,
        billNumber: safeBillNo,
        amount: Number(formattedAmount)
      });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`[Main NepalPay NCHL] ❌ Request timed out`);
      resolve({
        success: false,
        error: 'NCHL Gateway is temporarily unavailable',
        statusCode: 504,
        validationTraceId,
        billNumber: safeBillNo,
        amount: Number(formattedAmount)
      });
    });

    req.write(postData);
    req.end();
  });
}

ipcMain.handle('nepalpay:generate-qr', async (_event, { amount, billNumber, remarks, patientName, patientContact }) => {
  const parsedAmount = Number(amount) || 0;
  if (parsedAmount <= 0) return { success: false, error: 'Amount must be greater than 0' };

  // Call NCHL NEPALPAY Dynamic QR API with npi_key.pem signed token
  const nchlResult = await callNpiGenerateQrMain({
    amount: parsedAmount,
    billNumber,
    remarks: remarks || `Dental ${patientName || ''}`.trim(),
    patientContact
  });

  if (nchlResult.success && nchlResult.qrString) {
    return {
      success: true,
      validationTraceId: nchlResult.validationTraceId,
      billNumber: nchlResult.billNumber,
      amount: parsedAmount,
      patientName,
      qrString: nchlResult.qrString,
      merchantName: NPI_MAIN_CONFIG.merchantName,
      merchantId: NPI_MAIN_CONFIG.merchantId
    };
  }

  const httpCode = (nchlResult.statusCode && nchlResult.statusCode >= 400) ? nchlResult.statusCode : 502;
  return {
    success: false,
    statusCode: httpCode,
    error: nchlResult.error || 'NCHL Gateway is temporarily unavailable',
    validationTraceId: nchlResult.validationTraceId,
    billNumber: nchlResult.billNumber,
    amount: parsedAmount
  };
});

// Function to check transaction status strictly via validationTraceId on NCHL gateway
function callNpiCheckTxnStatusMain({ validationTraceId, billNumber }) {
  return new Promise(async (resolve) => {
    const acquirerId = NPI_MAIN_CONFIG.acquirerId;
    const merchantId = NPI_MAIN_CONFIG.merchantId;
    const userId = NPI_MAIN_CONFIG.userId || 'INFINITYDENTNQR@999';

    const authPlain = `${NPI_MAIN_CONFIG.basicAuthUser}:${NPI_MAIN_CONFIG.basicAuthPass}`;
    const authBase64 = Buffer.from(authPlain).toString('base64');

    if (!validationTraceId || validationTraceId.startsWith('TRC')) {
      return resolve({ isPaid: false, status: 'PENDING' });
    }

    const tokenStr = `${acquirerId},${merchantId},${validationTraceId},${userId}`;
    let token = '';
    if (npiMainPrivateKey) {
      try {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(tokenStr);
        token = signer.sign(npiMainPrivateKey, 'base64');
      } catch (err) {
        console.warn('[Main NCHL Status] Signing error:', err.message);
      }
    }

    const postData = JSON.stringify({
      acquirerId,
      merchantId,
      validationTraceId,
      token
    });

    const req = https.request({
      hostname: 'devopennpi.connectips.com',
      port: 443,
      path: '/nQR/v1/merchanttxnreport',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + authBase64,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    }, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(b);
          if (res.statusCode === 200 && Array.isArray(json.responseBody)) {
            const match = json.responseBody.find(r => 
              (r.validationTraceId === validationTraceId || !r.validationTraceId) &&
              (r.debitStatus === '000' || r.creditStatus === '000' || r.creditStatus === 'DEFER')
            );
            if (match) {
              return resolve({
                isPaid: true,
                status: 'SUCCESS',
                responseCode: '000',
                txnId: match.nQrTxnId || match.instructionId || ('TXN-' + Date.now()),
                instructionId: match.instructionId,
                amount: match.amount,
                billNumber: match.merchantBillNo || billNumber,
                payerName: match.payerName,
                payerMobile: match.payerMobileNumber,
                debitStatus: match.debitStatus,
                creditStatus: match.creditStatus,
                raw: match
              });
            }
          }
        } catch (_) {}
        resolve({ isPaid: false, status: 'PENDING' });
      });
    });

    req.on('error', (err) => resolve({ isPaid: false, status: 'PENDING', error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ isPaid: false, status: 'PENDING', error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}

ipcMain.handle('nepalpay:check-status', async (_event, query) => {
  try {
    const result = await callNpiCheckTxnStatusMain(query || {});
    return {
      success: true,
      status: result.status,
      responseCode: result.isPaid ? '000' : '999',
      txnId: result.txnId,
      amount: result.amount,
      billNumber: result.billNumber,
      payerName: result.payerName,
      nchlData: result.raw
    };
  } catch (err) {
    return { success: false, status: 'PENDING', error: err.message };
  }
});

ipcMain.handle('nepalpay:simulate-payment', (_event, traceId) => {
  return {
    success: true,
    validationTraceId: traceId,
    txnId: 'TXN-NPI-' + Date.now(),
    status: 'SUCCESS'
  };
});

// --- Clinic Guest Wi-Fi & NiZi Screen Display IPC ---
ipcMain.handle('wifi:get', () => {
  try {
    const row = db.prepare("SELECT value FROM clinic_settings WHERE key = 'wifi_config'").get();
    if (row && row.value) {
      return { success: true, wifi: JSON.parse(row.value) };
    }
    return {
      success: true,
      wifi: { ssid: 'Infinity Dental Guest', password: '', security: 'WPA', hidden: false }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('wifi:save', (_event, config) => {
  try {
    const cleanConfig = {
      ssid: String(config.ssid || 'Infinity Dental Guest').trim(),
      password: String(config.password || '').trim(),
      security: String(config.security || 'WPA').trim().toUpperCase(),
      hidden: Boolean(config.hidden)
    };
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO clinic_settings (key, value, updated_at)
      VALUES ('wifi_config', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(JSON.stringify(cleanConfig), now);
    return { success: true, wifi: cleanConfig };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(async ()=>{
  registerSerialPortHandler(session.defaultSession);
  openDb();
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});

  // Automatically trigger a live test request to capture live gateway logs & trace ID for NCHL support
  console.log('\n======================================================');
  console.log('⚡ [NCHL Live Gateway Test] Initiating NEPALPAY Dynamic QR test request on boot...');
  console.log('======================================================');
  try {
    const testResult = await callNpiGenerateQrMain({
      amount: 1500,
      billNumber: 'TEST-' + Date.now(),
      remarks: 'NCHL Gateway Verification Test',
      patientContact: '9800000000'
    });
    console.log('======================================================');
    console.log(`⚡ [NCHL Live Gateway Test Result] HTTP Status       : ${testResult.statusCode}`);
    console.log(`⚡ [NCHL Live Gateway Test Result] Validation Trace ID: ${testResult.validationTraceId}`);
    console.log(`⚡ [NCHL Live Gateway Test Result] Bill Number        : ${testResult.billNumber}`);
    console.log(`⚡ [NCHL Live Gateway Test Result] Raw Gateway Body   :`, testResult.body);
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ [NCHL Live Gateway Test Error]:', err);
  }
});
app.on('window-all-closed',()=>{if(db)db.close();if(process.platform!=='darwin')app.quit()});


