const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
  // Electron requires explicit session handling for navigator.serial
  win.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    console.log('[WebSerial] Available ports detected:', portList.map(p => ({
      portId: p.portId,
      name: p.portName,
      displayName: p.displayName,
      vendorId: p.vendorId,
      productId: p.productId
    })));

    if (portList && portList.length > 0) {
      // Prioritize NiZi POS device or known USB-Serial chips (CH340, CP210x, FTDI, STM32)
      const preferred = portList.find(p => {
        const text = `${p.displayName || ''} ${p.portName || ''}`.toLowerCase();
        return text.includes('nizi') || text.includes('ch340') || text.includes('cp210') || text.includes('ftdi') || text.includes('usb');
      }) || portList[0];

      console.log('[WebSerial] Auto-selecting port:', preferred.portId, preferred.displayName || preferred.portName);
      callback(preferred.portId);
    } else {
      console.warn('[WebSerial] No serial ports available to select.');
      callback('');
    }
  });

  win.webContents.session.on('serial-port-added', (event, port) => {
    console.log('[WebSerial] Port added/plugged in:', port);
    if (!win.isDestroyed()) {
      win.webContents.send('serial:device-changed', { action: 'added', port });
    }
  });

  win.webContents.session.on('serial-port-removed', (event, port) => {
    console.log('[WebSerial] Port removed/unplugged:', port);
    if (!win.isDestroyed()) {
      win.webContents.send('serial:device-changed', { action: 'removed', port });
    }
  });

  win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'serial') return true;
    return false;
  });

  win.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') return true;
    return false;
  });

  win.loadFile(path.join(__dirname, 'index.html'));
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

ipcMain.handle('app:check-update', async (_event, repoSlug) => {
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
});

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

app.whenReady().then(()=>{
  openDb();
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(db)db.close();if(process.platform!=='darwin')app.quit()});

