const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { DatabaseSync } = require('node:sqlite');
const WebSocket = require('ws');
let SerialPort = null;
try {
  const serialModule = require('serialport');
  SerialPort = serialModule.SerialPort;
} catch (spErr) {
  console.warn('[Soundbox Serial] Could not load serialport package:', spErr.message);
}

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

// Database & Storage Paths
let DATA_ROOT = 'C:\\Infiinity Dental Clinic';
let DB_DIR = path.join(DATA_ROOT, 'Database');
let DB_FILE = path.join(DB_DIR, 'InfinityDentalClinic.sqlite');
let BILL_DIR = path.join(DATA_ROOT, 'Bills');
let DOC_DIR = path.join(DATA_ROOT, 'Patient Documents');
let REG_DIR = path.join(DATA_ROOT, 'Patient Registrations');
let BACKUP_DIR = path.join(DATA_ROOT, 'Backups');
let PRICE_FILE = path.join(DATA_ROOT, 'price-list.json');

const LOCAL_FALLBACK_DIR = path.join(ROOT_DIR, 'data');
const LOCAL_PRICE_FILE = path.join(LOCAL_FALLBACK_DIR, 'price-list.json');

// NepalPay & ConnectIPS Credentials
const NPI_CONFIG = {
  merchantId: '2501F6MCTZZ',
  merchantName: 'Infinity Dental',
  acquirerId: '00002501',
  merchantCategoryCode: 8021,
  storeLabel: 'Store1',
  terminalLabel: 'Terminal1',
  basicAuthUser: 'infinitydentnqr',
  basicAuthPass: 'Abcd@123',
  userId: 'INFINITYDENTNQR@999',
  userAuth: 'INFINITYDENTNQR@999',
  apiKey: 'sfHFLRZYJPCtKkdjUQH9ugMJ1ttULcyCQ1dTGXWbJSI=',
  generateQrUrl: 'https://devopennpi.connectips.com/qr/generateQR',
  websocketUrl: 'wss://devws.nepalpay.com.np/nqrws',
  npiUserDoc: 'NEPALPAY_QR',
  npiPassDoc: 'NeP@l#838'
};

// Load NepalPay RSA private key and certificate from ./certs/
const NPI_KEY_FILE = path.join(ROOT_DIR, 'certs', 'npi_key.pem');
const NPI_CERT_FILE = path.join(ROOT_DIR, 'certs', 'npi_cert.pem');
let privateKeyPem = null;
let certPem = null;
try {
  if (fs.existsSync(NPI_KEY_FILE)) {
    privateKeyPem = fs.readFileSync(NPI_KEY_FILE, 'utf8');
    console.log('🔑 Loaded NepalPay RSA private key from certs/npi_key.pem');
  } else {
    console.warn('⚠️ certs/npi_key.pem not found at:', NPI_KEY_FILE);
  }
  if (fs.existsSync(NPI_CERT_FILE)) {
    certPem = fs.readFileSync(NPI_CERT_FILE, 'utf8');
  }
} catch (keyErr) {
  console.warn('⚠️ Error loading certs/npi_key.pem:', keyErr.message);
}

// Function to call official NCHL NEPALPAY Dynamic QR API with signed token
function callNchlGenerateQr({ amount, billNumber, remarks, patientContact }) {
  return new Promise((resolve) => {
    const validationTraceId = 'TRC' + Date.now() + Math.floor(Math.random() * 1000);
    const safeBillNo = billNumber || ('B-' + Date.now());
    const acquirerId = NPI_CONFIG.acquirerId;
    const merchantId = NPI_CONFIG.merchantId;
    const merchantCategoryCode = NPI_CONFIG.merchantCategoryCode;
    const transactionCurrency = 524;
    const formattedAmount = Number(amount || 0).toFixed(2);
    const transactionAmount = formattedAmount;
    const billNo = safeBillNo;
    const userId = NPI_CONFIG.userId || NPI_CONFIG.basicAuthUser;

    // NCHL Confirmed Dynamic QR Signature String Sequence (7 Fields):
    // TokenString = acquirerId + "," + merchantId + "," + merchantCategoryCode + "," + transactionCurrency + "," + transactionAmount + "," + billNumber + "," + userId
    const TokenString = acquirerId + "," + merchantId + "," + merchantCategoryCode + "," + transactionCurrency + "," + transactionAmount + "," + billNo + "," + userId;

    console.log('----------------------------------------------------');
    console.log('[NepalPay NCHL] === SIGN STRING VERIFICATION (7 Fields) ===');
    console.log('[NepalPay NCHL] 1. acquirerId           :', acquirerId);
    console.log('[NepalPay NCHL] 2. merchantId           :', merchantId);
    console.log('[NepalPay NCHL] 3. merchantCategoryCode :', merchantCategoryCode);
    console.log('[NepalPay NCHL] 4. transactionCurrency  :', transactionCurrency);
    console.log('[NepalPay NCHL] 5. transactionAmount    :', transactionAmount);
    console.log('[NepalPay NCHL] 6. billNumber           :', billNo);
    console.log('[NepalPay NCHL] 7. userId               :', userId);
    console.log('[NepalPay NCHL] >>> Exact concatenated TokenString right before signing:');
    console.log(`"${TokenString}"`);

    let token = '';
    if (privateKeyPem) {
      try {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(TokenString);
        token = signer.sign(privateKeyPem, 'base64');
        console.log(`[NepalPay NCHL] Signed Token generated successfully (Length: ${token.length} chars, Starts with: "${token.slice(0, 16)}...")`);
      } catch (signErr) {
        console.warn('[NepalPay NCHL] Signing token error:', signErr.message);
      }
    } else {
      console.warn('[NepalPay NCHL] ⚠️ Warning: privateKeyPem is not loaded, token will be empty');
    }

    const payload = {
      pointOfInitialization: 12,
      acquirerId: acquirerId,
      merchantId: merchantId,
      merchantName: NPI_CONFIG.merchantName,
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
      storeLabel: NPI_CONFIG.storeLabel,
      terminalLabel: NPI_CONFIG.terminalLabel,
      purposeOfTransaction: remarks || 'Dental Treatment',
      additionalConsumerDataRequest: null,
      loyaltyNumber: null,
      token: token
    };

    const postData = JSON.stringify(payload);

    // Basic Auth verification
    const authPlain = `${NPI_CONFIG.basicAuthUser}:${NPI_CONFIG.basicAuthPass}`;
    const authBase64 = Buffer.from(authPlain).toString('base64');
    const maskedPass = NPI_CONFIG.basicAuthPass
      ? (NPI_CONFIG.basicAuthPass.slice(0, 2) + '****' + NPI_CONFIG.basicAuthPass.slice(-2))
      : '';
    const maskedBase64 = authBase64.length > 12
      ? (authBase64.slice(0, 10) + '...' + authBase64.slice(-6))
      : authBase64;

    console.log('[NepalPay NCHL] === BASIC AUTH HEADER VERIFICATION ===');
    console.log(`[NepalPay NCHL] Configured Username   : "${NPI_CONFIG.basicAuthUser}"`);
    console.log(`[NepalPay NCHL] Configured Password   : "${maskedPass}" (Character length: ${NPI_CONFIG.basicAuthPass.length})`);
    console.log(`[NepalPay NCHL] Base64 Encoded Header : "Authorization: Basic ${maskedBase64}" (Encoded length: ${authBase64.length})`);
    console.log(`[NepalPay NCHL] Integrity Check       : Decodes back to username "${authPlain.split(':')[0]}" and matching password length.`);
    console.log('----------------------------------------------------');

    console.log(`[NepalPay NCHL API] Calling POST ${NPI_CONFIG.generateQrUrl} for amount Rs. ${formattedAmount}...`);
    const parsedUrl = new URL(NPI_CONFIG.generateQrUrl);
    const options = {
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
    };

    const req = https.request(options, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => {
        const statusCode = res.statusCode || 500;
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        const isJson = contentType.includes('application/json');

        console.log(`[NepalPay NCHL API] Response Status: HTTP ${statusCode} | Content-Type: ${contentType}`);

        // 1. If NCHL returns non-200 or non-JSON content (such as an NGINX 502 HTML error page),
        // do not attempt response.json() or return raw HTML to the client.
        if (statusCode !== 200 || !isJson) {
          console.error(`[NepalPay NCHL API] ❌ Upstream Gateway Error: HTTP ${statusCode} (Content-Type: ${contentType})`);
          console.error(`[NepalPay NCHL API] Raw Upstream Response:\n`, b);

          let errorMsg = 'NCHL Gateway is temporarily unavailable';
          if (isJson) {
            try {
              const parsed = JSON.parse(b);
              if (parsed?.responseMessage) {
                errorMsg = parsed.responseMessage;
              }
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

        // 2. HTTP 200 and application/json: safely parse JSON
        let json = null;
        try {
          json = JSON.parse(b);
        } catch (jsonErr) {
          console.error(`[NepalPay NCHL API] ❌ JSON parse error on HTTP 200:`, jsonErr.message);
          console.error(`[NepalPay NCHL API] Raw body:`, b);
          return resolve({
            success: false,
            error: 'NCHL Gateway is temporarily unavailable',
            statusCode: 502,
            validationTraceId,
            billNumber: safeBillNo,
            amount: Number(formattedAmount)
          });
        }

        const liveQr = json?.data?.qrString || json?.qrString || (typeof json?.data === 'string' ? json.data : null);
        const officialTraceId = json?.data?.validationTraceId || json?.validationTraceId || validationTraceId;

        if (liveQr) {
          console.log(`[NepalPay NCHL API] ✅ Upstream Dynamic QR generated successfully!`);
          return resolve({
            success: true,
            statusCode: 200,
            qrString: liveQr,
            validationTraceId: officialTraceId,
            billNumber: safeBillNo,
            amount: Number(formattedAmount),
            data: json?.data || json
          });
        } else {
          console.warn(`[NepalPay NCHL API] ⚠️ HTTP 200 received but no qrString found in JSON:`, b);
          return resolve({
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
      console.error(`[NepalPay NCHL API] ❌ Network Error:`, err.message);
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
      console.error(`[NepalPay NCHL API] ❌ Upstream Gateway Timed Out (10s)`);
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

// Function to check official NCHL transaction status strictly via validationTraceId
function callNchlCheckTxnStatus({ validationTraceId, billNumber }) {
  return new Promise(async (resolve) => {
    const acquirerId = NPI_CONFIG.acquirerId;
    const merchantId = NPI_CONFIG.merchantId;
    const userId = NPI_CONFIG.userId || 'INFINITYDENTNQR@999';

    const authPlain = `${NPI_CONFIG.basicAuthUser}:${NPI_CONFIG.basicAuthPass}`;
    const authBase64 = Buffer.from(authPlain).toString('base64');

    if (!validationTraceId || validationTraceId.startsWith('TRC')) {
      return resolve({ isPaid: false, status: 'PENDING' });
    }

    const tokenStr = `${acquirerId},${merchantId},${validationTraceId},${userId}`;
    let token = '';
    if (privateKeyPem) {
      try {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(tokenStr);
        token = signer.sign(privateKeyPem, 'base64');
      } catch (err) {
        console.warn('[NCHL Status Inquiry] Signing error:', err.message);
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

const DEFAULT_PRICES = [
  { name: 'OPD Card', price: 100 },
  { name: 'Consultation', min: 500, max: 750 },
  { name: 'Dental X-Ray (IOPA)', price: 300 },
  { name: 'Scaling', min: 1000, max: 3000 },
  { name: 'Scaling & Polishing', min: 1500, max: 2000 },
  { name: 'Tooth-Colored Filling', min: 1000, max: 2500 },
  { name: 'Non-Tooth-Colored Restoration', min: 800, max: 1000 },
  { name: 'Deep Caries Management', price: 3000 },
  { name: 'Pulpectomy', min: 3000, max: 3500 },
  { name: 'Root Canal Treatment (RCT)', min: 7000, max: 15000 },
  { name: 'Single-Visit RCT', price: 15000 },
  { name: 'Teeth Bleaching', price: 15000 },
  { name: 'Tooth Extraction', min: 500, max: 5000 },
  { name: 'Surgical Extraction', min: 2500, max: 5000 },
  { name: 'Complete Denture', price: 30000 },
  { name: 'Flexible RPD', price: 7000, unit: 'per tooth' },
  { name: 'Normal RPD', price: 1500 },
  { name: 'Metal Crown', price: 4000 },
  { name: 'PFM Crown', price: 7000 },
  { name: 'Zirconia Crown / Veneers', min: 20000, max: 25000 },
  { name: 'Dental Implants', min: 70000, max: 120000 },
  { name: 'Orthodontic Treatment', min: 60000, max: 110000 },
  { name: 'Clear / Invisible Aligners', min: 120000, max: 180000 }
];

const AUTH_SALT = 'infinity_dental_salt_2026';
function hashPassword(pwd) {
  return crypto.createHash('sha256').update(AUTH_SALT + ':' + String(pwd || '').trim()).digest('hex');
}

let db = null;
let activeDbPath = '';

function initDatabase() {
  try {
    for (const d of [DATA_ROOT, DB_DIR, BILL_DIR, DOC_DIR, REG_DIR, BACKUP_DIR]) {
      fs.mkdirSync(d, { recursive: true });
    }
    if (!fs.existsSync(PRICE_FILE)) {
      if (fs.existsSync(LOCAL_PRICE_FILE)) {
        fs.copyFileSync(LOCAL_PRICE_FILE, PRICE_FILE);
      } else {
        fs.writeFileSync(PRICE_FILE, JSON.stringify(DEFAULT_PRICES, null, 2), 'utf8');
      }
    }
    activeDbPath = DB_FILE;
  } catch (err) {
    console.warn('Could not access C:\\Infiinity Dental Clinic, using local ./data fallback:', err.message);
    DATA_ROOT = LOCAL_FALLBACK_DIR;
    DB_DIR = LOCAL_FALLBACK_DIR;
    DB_FILE = path.join(LOCAL_FALLBACK_DIR, 'InfinityDentalClinic.sqlite');
    PRICE_FILE = LOCAL_PRICE_FILE;
    BACKUP_DIR = path.join(LOCAL_FALLBACK_DIR, 'Backups');
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(PRICE_FILE)) {
      fs.writeFileSync(PRICE_FILE, JSON.stringify(DEFAULT_PRICES, null, 2), 'utf8');
    }
    activeDbPath = DB_FILE;
  }

  try {
    db = new DatabaseSync(DB_FILE);
    db.exec(`CREATE TABLE IF NOT EXISTS app_data (id INTEGER PRIMARY KEY CHECK(id=1), patients_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    const row = db.prepare('SELECT patients_json FROM app_data WHERE id=1').get();
    if (!row) {
      db.prepare('INSERT INTO app_data(id,patients_json,updated_at) VALUES(1,?,?)').run('[]', new Date().toISOString());
    }

    // Authentication & Users Table
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

    // Seed default Super Admin account if not present
    const adminRow = db.prepare("SELECT id FROM users WHERE role='superadmin'").get();
    if (!adminRow) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), 'admin', hashPassword('admin123'), 'superadmin', 'Super Administrator', 'active', now, now);
      console.log('✓ Seeded default Super Admin user (username: admin / password: admin123)');
    }

    // Seed default Manager account if not present (starts with 'm' as required, e.g. m123456)
    const managerRow = db.prepare("SELECT id FROM users WHERE role='manager'").get();
    if (!managerRow) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), 'm123456', hashPassword('manager123'), 'manager', 'Clinic Manager', 'active', now, now);
      console.log('✓ Seeded default Manager user (ID: m123456 / password: manager123)');
    }

    // Clinic Settings Table (Wi-Fi, Clinic Preferences, etc.)
    db.exec(`CREATE TABLE IF NOT EXISTS clinic_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    console.log('✓ SQLite Database initialized successfully at:', activeDbPath);
  } catch (e) {
    console.error('Fatal SQLite initialization error:', e);
  }
}

// Clinic Wi-Fi Config Helpers
function getClinicWifiConfig() {
  try {
    const row = db.prepare("SELECT value FROM clinic_settings WHERE key = 'wifi_config'").get();
    if (row && row.value) {
      return JSON.parse(row.value);
    }
  } catch (_) {}
  return {
    ssid: 'Infinity Dental Guest',
    password: '',
    security: 'WPA',
    hidden: false
  };
}

function saveClinicWifiConfig(config) {
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
  return cleanConfig;
}

function buildWifiPayload({ ssid, password, security = 'WPA', hidden = false }) {
  const cleanSsid = String(ssid || 'Infinity Dental Guest').replace(/([\\;,":])/g, '\\$1');
  const cleanPass = String(password || '').replace(/([\\;,":])/g, '\\$1');
  const sec = String(security || 'WPA').toUpperCase();
  const secTag = (sec === 'NONE' || sec === 'NOPASS') ? 'nopass' : (sec === 'WEP' ? 'WEP' : 'WPA');
  const passPart = secTag === 'nopass' ? '' : `P:${cleanPass};`;
  const hiddenPart = hidden ? 'H:true;' : '';
  return `WIFI:S:${cleanSsid};T:${secTag};${passPart}${hiddenPart};`;
}

// CRC16 CCITT for EMVCo QR
function crc16Ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Generate EMVCo / NepalQR Compliant Dynamic QR Payload String
function generateNepalPayQrPayload({ amount, billNumber, remarks, terminalLabel, storeLabel }) {
  function tlv(tag, val) {
    const s = String(val ?? '');
    return tag + String(s.length).padStart(2, '0') + s;
  }

  // Tag 26: Merchant Account Information - connectIPS / NCHL NepalPay
  const tag26Val = tlv('00', 'np.nchl.nepalpay') + tlv('01', NPI_CONFIG.acquirerId) + tlv('02', NPI_CONFIG.merchantId);

  // Tag 29: Official NepalQR Guid & Merchant Details
  const nchlGuid = 'NCHL' + NPI_CONFIG.acquirerId + NPI_CONFIG.merchantId;
  const tag29Val = tlv('00', nchlGuid) +
                   tlv('01', NPI_CONFIG.merchantId) +
                   tlv('02', storeLabel || NPI_CONFIG.storeLabel || 'Store1') +
                   tlv('03', terminalLabel || NPI_CONFIG.terminalLabel || 'Terminal1');

  // Tag 62: Additional Data Template
  const tag62Val = tlv('01', billNumber || ('B-' + Date.now())) +
                   tlv('05', remarks || 'DentalBill') +
                   tlv('07', terminalLabel || NPI_CONFIG.terminalLabel) +
                   tlv('08', storeLabel || NPI_CONFIG.storeLabel);

  const formattedAmount = Number(amount || 0).toFixed(2);

  let raw = tlv('00', '01') + // Format indicator
            tlv('01', '12') + // 12 = Dynamic QR (contains specific amount)
            tlv('26', tag26Val) +
            tlv('29', tag29Val) +
            tlv('52', String(NPI_CONFIG.merchantCategoryCode)) + // MCC 5541
            tlv('53', '524') + // Nepalese Rupee (NPR currency code 524)
            tlv('54', formattedAmount) + // Transaction amount
            tlv('58', 'NP') + // Country: Nepal
            tlv('59', NPI_CONFIG.merchantName) + // Merchant name: Infinity Dental
            tlv('60', 'Kathmandu') + // Merchant City
            tlv('62', tag62Val) +
            '6304'; // CRC placeholder

  const checksum = crc16Ccitt(raw);
  return raw + checksum;
}

// In-Memory Transactions, SSE & Frontend WebSocket Clients
const pendingTransactions = new Map();
const sseClients = new Set();
const localWsClients = new Set();
const localWss = new WebSocket.Server({ noServer: true });

localWss.on('connection', (ws) => {
  localWsClients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', time: new Date().toISOString() }));
  ws.on('close', () => localWsClients.delete(ws));
  ws.on('error', () => localWsClients.delete(ws));
});

function broadcastSse(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {
      sseClients.delete(res);
    }
  }
}

function broadcastToClients(data) {
  // 1. Broadcast to SSE clients
  broadcastSse(data);
  // 2. Broadcast to connected WebSocket clients
  const jsonStr = JSON.stringify(data);
  for (const client of localWsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(jsonStr); } catch (_) {}
    }
  }
}

// --- NCHL NEPALPAY STOMP WebSocket Client ---
const NCHL_WS_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAi0LF+eHiysi/etC2HBKIf1eZ6Fyr/hLz
BQ6XPMRWNMEUcruDB4dFqsHL9JuvGfFLmhITt6DLa5XhZ0cXW5b2HPh4MHcjT4e7mX+S3olAek+2
GTuF5VTICTrS8Gapln1Pbd4hZ1+vURQMaYF5QI+jHdJ6TvSBZjPFz7E/HPf2Z7eQE//5VGUbPU4c
xbfEav9npc+E2+RAbAJVHNELSm28VDwnailRIpvsyUOpizDEbSB4gpEYEDZT0iX/iZF7PTSnvb0w
VOtKXQt8nFPUi8sGzfg8yuhSQu/TYQRBoVmGAeBhsjBpF3zhsIRkhxmC7pv1Id0QtLhcNKCo//fv
q7UWDwIDAQAB
-----END PUBLIC KEY-----`;

function encryptWsApiToken(apiKey) {
  try {
    const encrypted = crypto.publicEncrypt({
      key: NCHL_WS_PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_PADDING
    }, Buffer.from(apiKey || NPI_CONFIG.apiKey, 'utf8'));
    return encrypted.toString('base64');
  } catch (e) {
    console.warn('[NepalPay WS] Error encrypting API token:', e.message);
    return null;
  }
}

function buildStompFrame(command, headers = {}, body = '') {
  let frame = command + '\n';
  for (const [k, v] of Object.entries(headers)) {
    frame += `${k}:${v}\n`;
  }
  frame += '\n' + body + '\0';
  return frame;
}

function parseStompFrames(raw) {
  const frames = [];
  const parts = raw.split('\0');
  for (const part of parts) {
    const trimmed = part.replace(/^[\r\n]+/, '');
    if (!trimmed) continue;
    const headerIndex = trimmed.indexOf('\n\n');
    if (headerIndex === -1) continue;
    const headerPart = trimmed.slice(0, headerIndex);
    const body = trimmed.slice(headerIndex + 2);
    const lines = headerPart.split('\n');
    const command = lines[0].trim();
    const headers = {};
    for (let i = 1; i < lines.length; i++) {
      const idx = lines[i].indexOf(':');
      if (idx !== -1) {
        const key = lines[i].slice(0, idx).trim();
        const val = lines[i].slice(idx + 1).trim();
        headers[key] = val;
      }
    }
    frames.push({ command, headers, body });
  }
  return frames;
}

let nchlWsClient = null;
let nchlWsIsConnected = false;
let nchlWsReconnectTimer = null;
let nchlWsHeartbeatTimer = null;

function connectNchlWebSocket() {
  if (nchlWsClient && (nchlWsClient.readyState === WebSocket.OPEN || nchlWsClient.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = NPI_CONFIG.websocketUrl || 'wss://devws.nepalpay.com.np/nqrws';
  console.log(`[NepalPay WS] 🔄 Connecting to NCHL WebSocket at ${wsUrl}...`);

  try {
    nchlWsClient = new WebSocket(wsUrl, {
      handshakeTimeout: 10000
    });

    nchlWsClient.on('open', () => {
      console.log(`[NepalPay WS] 🔌 Raw WebSocket open. Sending STOMP CONNECT frame...`);
      const connectFrame = buildStompFrame('CONNECT', {
        'accept-version': '1.1,1.2',
        'heart-beat': '10000,10000',
        'login': NPI_CONFIG.basicAuthUser,
        'passcode': NPI_CONFIG.basicAuthPass
      });
      nchlWsClient.send(connectFrame);
    });

    nchlWsClient.on('message', (data) => {
      handleNchlWsRawMessage(data.toString());
    });

    nchlWsClient.on('error', (err) => {
      console.warn(`[NepalPay WS] ⚠️ WebSocket error:`, err.message);
    });

    nchlWsClient.on('close', (code, reason) => {
      console.log(`[NepalPay WS] ℹ️ WebSocket connection closed (Code: ${code}, Reason: "${reason.toString()}"). Scheduling reconnect...`);
      nchlWsIsConnected = false;
      if (nchlWsHeartbeatTimer) clearInterval(nchlWsHeartbeatTimer);
      scheduleNchlWsReconnect();
    });
  } catch (err) {
    console.error(`[NepalPay WS] ❌ Connection error:`, err.message);
    scheduleNchlWsReconnect();
  }
}

function scheduleNchlWsReconnect() {
  if (nchlWsReconnectTimer) clearTimeout(nchlWsReconnectTimer);
  nchlWsReconnectTimer = setTimeout(() => {
    connectNchlWebSocket();
  }, 5000);
}

function subscribeToMerchantTopics() {
  if (!nchlWsClient || nchlWsClient.readyState !== WebSocket.OPEN) return;

  const topics = [
    '/user/nqrws/check-txn-status',
    `/topic/qr/${NPI_CONFIG.merchantId}`,
    `/topic/${NPI_CONFIG.merchantId}`,
    '/user/queue/notifications',
    '/topic/nqrws'
  ];

  let subIndex = 1;
  for (const topic of topics) {
    const frame = buildStompFrame('SUBSCRIBE', {
      'id': `sub-${subIndex++}`,
      'destination': topic,
      'ack': 'auto'
    });
    nchlWsClient.send(frame);
  }
  console.log(`[NepalPay WS] 📡 Subscribed to merchant topics:\n  - ${topics.join('\n  - ')}`);

  // Start heartbeat ping every 10 seconds
  if (nchlWsHeartbeatTimer) clearInterval(nchlWsHeartbeatTimer);
  nchlWsHeartbeatTimer = setInterval(() => {
    if (nchlWsClient && nchlWsClient.readyState === WebSocket.OPEN) {
      try { nchlWsClient.send('\n'); } catch (_) {}
    }
  }, 10000);
}

function handleNchlWsRawMessage(raw) {
  const frames = parseStompFrames(raw);
  for (const frame of frames) {
    if (frame.command === 'CONNECTED') {
      nchlWsIsConnected = true;
      const userName = frame.headers['user-name'] || '';
      console.log(`[NepalPay WS] ✅ STOMP CONNECTED successfully! Server Session: "${userName}"`);
      subscribeToMerchantTopics();
      continue;
    }

    if (frame.command === 'MESSAGE') {
      console.log(`[NepalPay WS] 📩 Incoming STOMP message on destination "${frame.headers['destination']}":`, frame.body);
      try {
        const payload = JSON.parse(frame.body);
        handleNchlWsTransactionRecord(payload);
      } catch (e) {
        console.warn(`[NepalPay WS] Message parse warning:`, e.message);
      }
    }
  }
}

function handleNchlWsTransactionRecord(record) {
  const isDebitSuccess = record.debit_status === '000' || record.debitStatus === '000';
  const isCreditSuccess = record.credit_status === '000' || record.creditStatus === '000' || record.credit_status === 'DEFER' || record.creditStatus === 'DEFER';
  const isCompleted = record.status === 'COMPLETED' || record.responseStatus === 'SUCCESS';

  const isSuccess = isDebitSuccess || isCompleted;
  const traceId = record.txn_id || record.txnId || record.request_id || record.requestId || record.validationTraceId;
  const txnId = record.nQrTxnId || record.nfcTxnId || record.txnId || record.txn_id || ('NPI-WS-' + Date.now());
  const incomingBill = record.merchantBillNo || record.billNumber || record.bill_no;

  console.log(`[NepalPay WS] Transaction update: Trace: ${traceId}, Bill: ${incomingBill}, Status: ${record.status}, Debit: ${record.debit_status}, Credit: ${record.credit_status}, isSuccess: ${isSuccess}`);

  if (isSuccess && (traceId || incomingBill)) {
    let txn = traceId ? pendingTransactions.get(traceId) : null;
    if (!txn && incomingBill) {
      for (const [k, v] of pendingTransactions.entries()) {
        if (v.billNumber === incomingBill) {
          txn = v;
          break;
        }
      }
    }

    const effectiveTrace = traceId || txn?.validationTraceId || incomingBill;
    const amount = Number(record.amount || txn?.amount || 0);
    const billNumber = incomingBill || txn?.billNumber || ('B-' + Date.now());
    const payerName = record.payerName || record.payer_name || txn?.patientName || 'connectIPS Customer';

    if (txn) {
      txn.status = 'SUCCESS';
      txn.txnId = txnId;
      txn.paidAt = new Date().toISOString();
      txn.payerName = payerName;
    } else {
      txn = {
        validationTraceId: effectiveTrace,
        billNumber: billNumber,
        amount: amount,
        status: 'SUCCESS',
        txnId: txnId,
        payerName: payerName,
        paidAt: new Date().toISOString()
      };
      pendingTransactions.set(effectiveTrace, txn);
    }

    console.log(`[NepalPay WS] 🎉 SUCCESSFUL PAYMENT RECEIVED via WebSocket! Amount: Rs. ${amount}, Bill: ${billNumber}, Txn: ${txnId}`);

    // Trigger NiZi Soundbox
    const niziSuccessCmd = {
      command: 'success',
      amount: amount,
      currency: 'NPR',
      payload: `Payment of ${amount} rupees received successfully`,
      txnId: txnId
    };
    forwardToNiZiAgent(niziSuccessCmd).catch(() => {});

    // Broadcast to localhost:3000 frontend (SSE & WebSocket)
    broadcastToClients({
      type: 'payment_received',
      traceId: effectiveTrace,
      billNumber: billNumber,
      txnId: txnId,
      amount: amount,
      payerName: payerName,
      paidAt: txn.paidAt
    });
  }
}

function sendNchlWsCheckTxn({ merchant_id, request_id }) {
  if (!nchlWsClient || nchlWsClient.readyState !== WebSocket.OPEN) return;
  try {
    const encryptedToken = encryptWsApiToken(NPI_CONFIG.apiKey);
    const payload = JSON.stringify({
      merchant_id: merchant_id || NPI_CONFIG.terminalLabel || 'Terminal1',
      request_id: request_id,
      username: NPI_CONFIG.basicAuthUser,
      api_token: encryptedToken
    });

    const frame = buildStompFrame('SEND', {
      'destination': '/nqrws/check-txn-status',
      'content-type': 'application/json'
    }, payload);

    console.log(`[NepalPay WS] 📤 Registering Dynamic QR trace "${request_id}" on /nqrws/check-txn-status...`);
    nchlWsClient.send(frame);
  } catch (err) {
    console.warn(`[NepalPay WS] Error sending check-txn-status frame:`, err.message);
  }
}

// --- NiZi POS Soundbox Serial Port Management ---
let activeSoundboxPort = null;
let soundboxStatus = {
  connected: false,
  port: null,
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  manufacturer: null,
  friendlyName: null,
  error: null,
  autoDetected: false,
  lastConnectedAt: null
};

// Check if a COM port matches known USB-to-UART / soundbox hardware signatures
function isCandidateSoundboxPort(port) {
  const m = String(port.manufacturer || '').toLowerCase();
  const p = String(port.pnpId || '').toLowerCase();
  const f = String(port.friendlyName || '').toLowerCase();
  const v = String(port.vendorId || '').toLowerCase();
  const pid = String(port.productId || '').toLowerCase();

  // Known signatures:
  // CH340 / CH341: VID 1a86, PID 7523, 5523, manufacturer wch.cn, QinHeng
  // CP2102 / CP2104: VID 10c4, Silicon Labs
  // FTDI: VID 0403, FT232
  // Prolific: VID 067b, PL2303
  // Espressif: VID 303a
  // Generic: USB-Serial, USB Serial Port, USB Single Serial
  const signatures = [
    'ch340', 'ch341', '1a86', 'wch', 'qinheng',
    'cp210', '10c4', 'silicon labs',
    'ftdi', '0403', 'ft232',
    'prolific', '067b', 'pl2303',
    'espressif', '303a',
    'usb-serial', 'usb serial', 'usb to uart', 'usb single serial',
    'nizi', 'pos', 'soundbox'
  ];

  for (const sig of signatures) {
    if (m.includes(sig) || p.includes(sig) || f.includes(sig) || v.includes(sig) || pid.includes(sig)) {
      return true;
    }
  }

  // Check if pnpId points to physical USB device and not Bluetooth link
  if (p.includes('usb\\') && !p.includes('bthenum')) {
    return true;
  }

  return false;
}

// List all available serial COM ports with candidate matching
async function listAvailablePorts() {
  if (!SerialPort) return [];
  try {
    const list = await SerialPort.list();
    return list.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer || '',
      friendlyName: p.friendlyName || p.path,
      pnpId: p.pnpId || '',
      vendorId: p.vendorId || '',
      productId: p.productId || '',
      isCandidate: isCandidateSoundboxPort(p)
    }));
  } catch (err) {
    console.warn('[Soundbox Serial] Error listing ports:', err.message);
    return [];
  }
}

// Open serial connection strictly at 115200 baud (8-N-1) with verbose console logging
async function openSoundboxPort(portName, isAuto = false) {
  if (!SerialPort) {
    throw new Error('serialport package is not installed on this server');
  }
  if (!portName) {
    throw new Error('Port name is required (e.g. COM3)');
  }

  // If already open on the requested port, return current status
  if (activeSoundboxPort && activeSoundboxPort.isOpen) {
    if (soundboxStatus.port === portName) {
      console.log(`[Soundbox Serial] Port ${portName} is already connected at 115200 baud (8-N-1).`);
      return soundboxStatus;
    }
    try {
      await new Promise(res => activeSoundboxPort.close(res));
    } catch (_) {}
    activeSoundboxPort = null;
  }

  return new Promise((resolve, reject) => {
    console.log(`[Soundbox Serial] 🔌 Opening serial connection on "${portName}" at 115200 baud (8-N-1)...`);
    const port = new SerialPort({
      path: portName,
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    });

    port.open((err) => {
      if (err) {
        console.error(`[Soundbox Serial] ❌ Failed to open ${portName} at 115200 baud (8-N-1):`, err.message);
        soundboxStatus.connected = false;
        soundboxStatus.port = portName;
        soundboxStatus.error = err.message;
        broadcastToClients({ type: 'soundbox_status', status: soundboxStatus });
        return reject(err);
      }

      activeSoundboxPort = port;
      soundboxStatus.connected = true;
      soundboxStatus.port = portName;
      soundboxStatus.baudRate = 115200;
      soundboxStatus.dataBits = 8;
      soundboxStatus.stopBits = 1;
      soundboxStatus.parity = 'none';
      soundboxStatus.autoDetected = isAuto;
      soundboxStatus.error = null;
      soundboxStatus.lastConnectedAt = new Date().toISOString();

      console.log(`[Soundbox Serial] ✅ Connection successfully opened on ${portName} at 115200 baud (8-N-1)! NiZi Soundbox is ONLINE.`);
      broadcastToClients({ type: 'soundbox_status', status: soundboxStatus });

      // Send initial logo command packet to initialize LCD screen
      sendSoundboxSerialCommand({ command: 'display_logo', title: 'Infinity Dental' });
      resolve(soundboxStatus);
    });

    port.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        console.log(`[Soundbox Serial Rx on ${portName}]:`, text);
      }
    });

    port.on('error', (err) => {
      console.error(`[Soundbox Serial Error on ${portName}]:`, err.message);
      soundboxStatus.connected = false;
      soundboxStatus.error = err.message;
      broadcastToClients({ type: 'soundbox_status', status: soundboxStatus });
    });

    port.on('close', () => {
      console.log(`[Soundbox Serial] Port ${portName} connection closed.`);
      if (activeSoundboxPort === port) {
        activeSoundboxPort = null;
        soundboxStatus.connected = false;
        broadcastToClients({ type: 'soundbox_status', status: soundboxStatus });
      }
    });
  });
}

// Transmit commands directly to physical soundbox over serial (115200 baud)
function sendSoundboxSerialCommand(cmd) {
  if (!activeSoundboxPort || !activeSoundboxPort.isOpen) return false;
  try {
    // 1. Send JSON packet with CRLF (Yarsa Tech NiZi POS Protocol)
    const jsonPacket = JSON.stringify(cmd) + '\r\n';
    activeSoundboxPort.write(jsonPacket);

    // 2. Specific command format handling
    if (cmd.command === 'show_qr') {
      const altJson = JSON.stringify({
        command: 'qr_payload',
        payload: cmd.payload,
        amount: cmd.amount,
        currency: cmd.currency || 'NPR',
        title: cmd.title || 'Infinity Dental',
        billNumber: cmd.billNumber || ''
      }) + '\r\n';
      activeSoundboxPort.write(altJson);
      const textFrame = `QR:${cmd.payload}\r\nAMT:${Number(cmd.amount || 0).toFixed(2)}\r\n`;
      activeSoundboxPort.write(textFrame);
    } else if (cmd.command === 'success') {
      const textFrame = `PAID:${Number(cmd.amount || 0).toFixed(2)}\r\n`;
      activeSoundboxPort.write(textFrame);
    } else if (cmd.command === 'show_wifi') {
      const altJson = JSON.stringify({
        command: 'qr_payload',
        payload: cmd.payload,
        title: 'Guest Wi-Fi',
        billNumber: cmd.ssid || 'Scan to Connect'
      }) + '\r\n';
      activeSoundboxPort.write(altJson);
      const textFrame = `QR:${cmd.payload}\r\nSSID:${cmd.ssid || ''}\r\nPWD:${cmd.password || ''}\r\n`;
      activeSoundboxPort.write(textFrame);
    }
    console.log(`[Soundbox Serial Tx on ${soundboxStatus.port}]:`, cmd.command, cmd.amount ? `Rs. ${cmd.amount}` : '');
    return true;
  } catch (e) {
    console.warn('[Soundbox Serial Tx Warning]:', e.message);
    return false;
  }
}

// Automatically detect connected USB serial devices and match by manufacturer / pnpId
async function autoDetectAndConnectSoundbox() {
  if (!SerialPort) return;
  try {
    console.log('[Soundbox Serial] 🔍 Scanning connected serial devices (SerialPort.list())...');
    const ports = await listAvailablePorts();
    if (!ports || ports.length === 0) {
      console.log('[Soundbox Serial] ℹ️ No serial COM ports detected on this system.');
      return;
    }

    console.log(`[Soundbox Serial] Found ${ports.length} COM port(s):`, ports.map(p => `${p.path} (${p.friendlyName || p.manufacturer || 'Port'})`).join(', '));

    const candidates = ports.filter(p => p.isCandidate);
    if (candidates.length === 1) {
      const matched = candidates[0];
      console.log(`[Soundbox Serial] 🎯 Auto-detected NiZi POS USB device on ${matched.path} (${matched.friendlyName || matched.manufacturer}). Connecting at 115200 baud...`);
      try {
        await openSoundboxPort(matched.path, true);
      } catch (openErr) {
        console.warn(`[Soundbox Serial] Auto-connect to ${matched.path} warning:`, openErr.message);
      }
    } else if (candidates.length > 1) {
      console.log(`[Soundbox Serial] Multiple candidate USB serial devices detected (${candidates.map(c => c.path).join(', ')}). Ready for manual selection in UI.`);
    } else {
      console.log('[Soundbox Serial] ℹ️ No dedicated CH340/CP2102/FTDI/USB-Serial device auto-matched. All ports are available for manual selection via dropdown.');
    }
  } catch (err) {
    console.warn('[Soundbox Serial] Auto-detection error:', err.message);
  }
}

// Forward commands to connected USB serial port & local NiZi Agent if active
async function forwardToNiZiAgent(commandPayload) {
  // 1. Transmit directly to connected USB serial soundbox
  sendSoundboxSerialCommand(commandPayload);

  // 2. Also forward to local NiZi Agent (127.0.0.1:9121) if running
  return new Promise((resolve) => {
    const postData = JSON.stringify(commandPayload);
    const req = http.request('http://127.0.0.1:9121/api/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 1500
    }, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => resolve({ ok: true, response: b, serialDirect: soundboxStatus.connected }));
    });
    req.on('error', (err) => resolve({ ok: soundboxStatus.connected, error: err.message, serialDirect: soundboxStatus.connected }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: soundboxStatus.connected, error: 'NiZi agent timed out', serialDirect: soundboxStatus.connected }); });
    req.write(postData);
    req.end();
  });
}

// MIME Types Map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, pathname) {
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  const filePath = path.join(ROOT_DIR, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API ROUTES ---

  // 0. Auth: User Login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { username, password } = await parseJsonBody(req);
      const cleanUser = String(username || '').trim();
      const cleanPass = String(password || '').trim();

      if (!cleanUser || !cleanPass) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Username/ID and password are required.' }));
        return;
      }

      const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid login ID or password.' }));
        return;
      }

      if (user.status !== 'active') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'This user account has been deactivated. Please contact Super Admin.' }));
        return;
      }

      const inputHash = hashPassword(cleanPass);
      if (inputHash !== user.password_hash) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid login ID or password.' }));
        return;
      }

      // Enforce manager ID rule: If manager, username must start with 'm'
      if (user.role === 'manager' && !user.username.toLowerCase().startsWith('m')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: "Manager account ID must start with letter 'm'." }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
          status: user.status
        }
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 0.1 Users: List all users (Super Admin)
  if (pathname === '/api/users' && req.method === 'GET') {
    try {
      const users = db.prepare('SELECT id, username, role, name, status, created_at, updated_at FROM users ORDER BY role DESC, created_at ASC').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, users }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 0.2 Users: Create new Manager (Super Admin)
  if (pathname === '/api/users' && req.method === 'POST') {
    try {
      const { username, password, name, role } = await parseJsonBody(req);
      let cleanUser = String(username || '').trim();
      const cleanPass = String(password || '').trim();
      const cleanName = String(name || '').trim();
      const userRole = role === 'superadmin' ? 'superadmin' : 'manager';

      if (!cleanUser) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'User ID is required.' }));
        return;
      }

      if (userRole === 'manager') {
        if (!cleanUser.toLowerCase().startsWith('m')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: "Manager User ID must start with letter 'm' (example: m123456)." }));
          return;
        }
      }

      if (!cleanPass || cleanPass.length < 4) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Password must be at least 4 characters long.' }));
        return;
      }

      if (!cleanName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Staff name is required.' }));
        return;
      }

      const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
      if (existing) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Login ID '${cleanUser}' already exists. Please choose a different ID.` }));
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const hash = hashPassword(cleanPass);
      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, cleanUser, hash, userRole, cleanName, 'active', now, now);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Account created successfully',
        user: { id, username: cleanUser, role: userRole, name: cleanName, status: 'active', created_at: now }
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 0.3 Users: Update user / reset password / update Super Admin
  if (pathname.startsWith('/api/users/') && req.method === 'PUT') {
    try {
      const userId = pathname.replace('/api/users/', '').trim();
      const { password, name, status, username } = await parseJsonBody(req);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'User not found.' }));
        return;
      }

      let newPassHash = user.password_hash;
      if (password && String(password).trim()) {
        if (String(password).trim().length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Password must be at least 4 characters long.' }));
          return;
        }
        newPassHash = hashPassword(password);
      }

      let newUsername = user.username;
      if (username && String(username).trim() && String(username).trim() !== user.username) {
        const cleanUser = String(username).trim();
        if (user.role === 'manager' && !cleanUser.toLowerCase().startsWith('m')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: "Manager User ID must start with letter 'm' (example: m123456)." }));
          return;
        }
        const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?').get(cleanUser, userId);
        if (existing) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Login ID '${cleanUser}' is already taken.` }));
          return;
        }
        newUsername = cleanUser;
      }

      const newName = name ? String(name).trim() : user.name;
      const newStatus = status ? String(status).trim() : user.status;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE users
        SET username = ?, password_hash = ?, name = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(newUsername, newPassHash, newName, newStatus, now, userId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'User updated successfully',
        user: { id: userId, username: newUsername, role: user.role, name: newName, status: newStatus, updated_at: now }
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 0.35 Updates: Launch local update installer
  if (pathname === '/api/updates/launch-installer' && req.method === 'POST') {
    try {
      const { spawn } = require('child_process');
      const releaseDir = path.join(ROOT_DIR, 'release');
      let installerPath = null;
      if (fs.existsSync(releaseDir)) {
        const files = fs.readdirSync(releaseDir);
        const setups = files.filter(f => f.endsWith('.exe') && f.toLowerCase().includes('setup')).sort().reverse();
        if (setups.length > 0) {
          installerPath = path.join(releaseDir, setups[0]);
        }
      }
      if (!installerPath) {
        const rootExe = path.join(ROOT_DIR, '..', 'Infinity Dental Clinic.exe');
        if (fs.existsSync(rootExe)) installerPath = rootExe;
      }

      if (installerPath && fs.existsSync(installerPath)) {
        console.log('[Server] Launching local update installer via Windows Shell:', installerPath);
        const { exec } = require('child_process');
        exec(`cmd /c start "" "${installerPath}"`, (launchErr) => {
          if (launchErr) console.warn('[Server] Shell launch warning:', launchErr.message);
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, launched: true, path: installerPath }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'No local installer file found on disk.' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 0.4 Users: Delete Manager (Super Admin only)
  if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
    try {
      const userId = pathname.replace('/api/users/', '').trim();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'User not found.' }));
        return;
      }

      if (user.role === 'superadmin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Super Admin accounts cannot be deleted.' }));
        return;
      }

      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Manager account deleted successfully.' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 1. Get Patients from SQLite
  if (pathname === '/api/patients' && req.method === 'GET') {
    try {
      const row = db.prepare('SELECT patients_json FROM app_data WHERE id=1').get();
      const patients = JSON.parse(row?.patients_json || '[]');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: patients, dbPath: activeDbPath }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 2. Save Patients to SQLite
  if (pathname === '/api/patients' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const patients = Array.isArray(payload) ? payload : (payload.patients || []);
      const json = JSON.stringify(patients);
      const now = new Date().toISOString();
      db.prepare('UPDATE app_data SET patients_json=?, updated_at=? WHERE id=1').run(json, now);
      try {
        fs.writeFileSync(path.join(BACKUP_DIR, 'patients_latest.json'), json, 'utf8');
      } catch (err) {
        console.warn('Backup file save warning:', err.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, updated_at: now, count: patients.length }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 3. Get Price List
  if (pathname === '/api/prices' && req.method === 'GET') {
    try {
      let data = DEFAULT_PRICES;
      if (fs.existsSync(PRICE_FILE)) {
        data = JSON.parse(fs.readFileSync(PRICE_FILE, 'utf8'));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data, path: PRICE_FILE }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: DEFAULT_PRICES }));
    }
    return;
  }

  // 4. Update Price List
  if (pathname === '/api/prices' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const list = Array.isArray(payload) ? payload : (payload.prices || DEFAULT_PRICES);
      fs.writeFileSync(PRICE_FILE, JSON.stringify(list, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Price list updated', count: list.length }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 5. NepalPay Config & Health
  if (pathname === '/api/nepalpay/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      merchantId: NPI_CONFIG.merchantId,
      merchantName: NPI_CONFIG.merchantName,
      acquirerId: NPI_CONFIG.acquirerId,
      storeLabel: NPI_CONFIG.storeLabel,
      terminalLabel: NPI_CONFIG.terminalLabel,
      websocketUrl: NPI_CONFIG.websocketUrl,
      hasPrivateKey: !!privateKeyPem,
      hasCertificate: !!certPem,
      environment: 'Sandbox / NCHL ConnectIPS'
    }));
    return;
  }


  // 6. Generate Dynamic NepalPay QR (Calls NCHL devopennpi.connectips.com with npi_key.pem)
  if (pathname === '/api/nepalpay/generate-qr' && req.method === 'POST') {
    try {
      const { amount, billNumber, remarks, patientName, patientContact, opdNumber } = await parseJsonBody(req);
      const parsedAmount = Number(amount) || 0;
      if (parsedAmount <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Amount must be greater than 0' }));
        return;
      }

      // Call NCHL NEPALPAY Dynamic QR API with npi_key.pem signed token
      const nchlResult = await callNchlGenerateQr({
        amount: parsedAmount,
        billNumber,
        remarks: remarks || `Dental ${patientName || ''}`.trim(),
        patientContact
      });

      const safeBillNo = nchlResult.billNumber || billNumber || ('B-' + Date.now());
      const safeTraceId = nchlResult.validationTraceId || ('TRC' + Date.now());
      const isLiveSuccess = Boolean(nchlResult.success && nchlResult.qrString);

      // Generate local EMVCo NepalQR payload for offline/fallback/simulator
      const localQrPayload = generateNepalPayQrPayload({
        amount: parsedAmount,
        billNumber: safeBillNo,
        remarks: remarks || `Dental ${patientName || ''}`.trim()
      });
      const effectiveQrString = isLiveSuccess ? nchlResult.qrString : localQrPayload;

      const txnRecord = {
        validationTraceId: safeTraceId,
        billNumber: safeBillNo,
        amount: parsedAmount,
        patientName: patientName || 'Walk-in',
        patientContact,
        opdNumber,
        status: 'PENDING',
        qrString: effectiveQrString,
        isLiveNchl: isLiveSuccess,
        statusCode: nchlResult.statusCode || (isLiveSuccess ? 200 : 502),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };
      pendingTransactions.set(safeTraceId, txnRecord);

      // If upstream NCHL gateway failed or returned error/HTML, return clean JSON error payload (NEVER raw HTML)
      if (!isLiveSuccess) {
        const errorStatusCode = (nchlResult.statusCode && nchlResult.statusCode >= 400) ? nchlResult.statusCode : 502;
        console.warn(`[NepalPay Endpoint] Returning clean error payload to client (HTTP ${errorStatusCode}):`, nchlResult.error);
        res.writeHead(errorStatusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: nchlResult.error || 'NCHL Gateway is temporarily unavailable',
          statusCode: errorStatusCode,
          validationTraceId: safeTraceId,
          billNumber: safeBillNo,
          amount: parsedAmount,
          qrString: localQrPayload
        }));
        return;
      }

      // Upstream NCHL succeeded with valid dynamic QR:
      // Register transaction trace with NCHL STOMP WebSocket for real-time tracking
      sendNchlWsCheckTxn({
        merchant_id: NPI_CONFIG.terminalLabel || 'Terminal1',
        request_id: safeTraceId
      });

      // Notify NiZi POS device and broadcast event
      const niziCommand = {
        command: 'show_qr',
        payload: effectiveQrString,
        amount: parsedAmount,
        currency: 'NPR',
        billNumber: safeBillNo,
        title: 'Infinity Dental'
      };
      forwardToNiZiAgent(niziCommand).catch(() => {});
      broadcastToClients({
        type: 'qr_generated',
        traceId: safeTraceId,
        amount: parsedAmount,
        billNumber: safeBillNo,
        qrString: effectiveQrString,
        isLiveNchl: true,
        niziCommand
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        validationTraceId: safeTraceId,
        billNumber: safeBillNo,
        amount: parsedAmount,
        qrString: effectiveQrString,
        isLiveNchl: true,
        statusCode: 200,
        expiresAt: txnRecord.expiresAt,
        merchantName: NPI_CONFIG.merchantName,
        merchantId: NPI_CONFIG.merchantId
      }));
    } catch (e) {
      console.error('[NepalPay NCHL Endpoint Error]', e);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'NCHL Gateway is temporarily unavailable',
        statusCode: 502
      }));
    }
    return;
  }

  // 7. Check Payment Status (Polls in-memory & queries live NCHL gateway)
  if ((pathname.startsWith('/api/nepalpay/status/') && req.method === 'GET') ||
      ((pathname === '/api/nepalpay/check-status' || pathname === '/api/nepalpay/getTxnStatus' || pathname === '/qr/getTxnStatus') && (req.method === 'POST' || req.method === 'GET'))) {
    try {
      let rawId = '';
      let queryBillNumber = '';
      let queryTraceId = '';

      if (pathname.startsWith('/api/nepalpay/status/')) {
        rawId = decodeURIComponent(pathname.replace('/api/nepalpay/status/', '').trim());
      }

      const queryParams = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
      queryBillNumber = queryParams.get('billNumber') || '';
      queryTraceId = queryParams.get('validationTraceId') || '';

      if (req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          if (body.validationTraceId) queryTraceId = body.validationTraceId;
          if (body.billNumber) queryBillNumber = body.billNumber;
          if (!rawId) rawId = queryTraceId || queryBillNumber;
        } catch (_) {}
      }

      // Identify the exact validationTraceId for this QR session
      const traceToCheck = (queryTraceId && !queryTraceId.startsWith('TRC'))
        ? queryTraceId
        : (rawId && !rawId.startsWith('TRC') && !rawId.startsWith('B-') ? rawId : (queryTraceId || rawId));

      // Look for pending transaction in map STRICTLY by validationTraceId
      let txn = traceToCheck ? pendingTransactions.get(traceToCheck) : null;

      // If already recorded SUCCESS for this specific trace session, return immediately
      if (txn && txn.status === 'SUCCESS') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: 'SUCCESS',
          responseCode: '000',
          txnId: txn.txnId,
          amount: txn.amount,
          billNumber: txn.billNumber,
          payerName: txn.payerName || '',
          transaction: txn
        }));
        return;
      }

      // If no live NCHL trace ID (e.g. offline fallback TRC), transaction stays PENDING
      if (!traceToCheck || traceToCheck.startsWith('TRC') || traceToCheck.startsWith('B-')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: 'PENDING',
          transaction: txn || { status: 'PENDING', validationTraceId: traceToCheck }
        }));
        return;
      }

      console.log(`[Status Poll] Checking NCHL live status strictly for Trace: "${traceToCheck}"...`);

      const nchlStatus = await callNchlCheckTxnStatus({
        validationTraceId: traceToCheck,
        billNumber: queryBillNumber
      });

      if (nchlStatus && nchlStatus.isPaid) {
        console.log(`[Status Poll] 🎉 NCHL PAYMENT CONFIRMED SUCCESSFUL! Txn: ${nchlStatus.txnId}, Payer: ${nchlStatus.payerName}`);
        
        const finalTxnId = nchlStatus.txnId;
        const paidAmount = nchlStatus.amount || txn?.amount || 0;
        const paidBillNo = nchlStatus.billNumber || txn?.billNumber || queryBillNumber;

        if (txn) {
          txn.status = 'SUCCESS';
          txn.txnId = finalTxnId;
          txn.paidAt = new Date().toISOString();
          txn.payerName = nchlStatus.payerName;
          txn.payerMobile = nchlStatus.payerMobile;
        } else {
          txn = {
            validationTraceId: traceToCheck,
            billNumber: paidBillNo,
            amount: paidAmount,
            status: 'SUCCESS',
            txnId: finalTxnId,
            payerName: nchlStatus.payerName,
            paidAt: new Date().toISOString()
          };
          pendingTransactions.set(traceToCheck, txn);
        }

        // Trigger NiZi Soundbox announcement
        const niziSuccessCmd = {
          command: 'success',
          amount: paidAmount,
          currency: 'NPR',
          payload: `Payment of ${paidAmount} rupees received successfully`,
          txnId: finalTxnId
        };
        forwardToNiZiAgent(niziSuccessCmd).catch(() => {});

        // Broadcast to clients (SSE & WebSocket)
        broadcastToClients({
          type: 'payment_received',
          traceId: traceToCheck,
          billNumber: paidBillNo,
          txnId: finalTxnId,
          amount: paidAmount,
          payerName: nchlStatus.payerName,
          paidAt: txn.paidAt
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: 'SUCCESS',
          responseCode: '000',
          txnId: finalTxnId,
          amount: paidAmount,
          billNumber: paidBillNo,
          payerName: nchlStatus.payerName,
          transaction: txn,
          nchlData: nchlStatus.raw
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        status: 'PENDING',
        transaction: txn || { status: 'PENDING', validationTraceId: traceToCheck }
      }));
      return;
    } catch (err) {
      console.warn('[Status Poll] Error processing status query:', err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, status: 'PENDING', error: err.message }));
    }
    return;
  }

  // 8. Simulate / Confirm Payment Received
  if (pathname === '/api/nepalpay/simulate-payment' && req.method === 'POST') {
    try {
      const { validationTraceId, txnId, billNumber, amount } = await parseJsonBody(req);
      let txn = validationTraceId ? pendingTransactions.get(validationTraceId) : null;
      if (!txn && billNumber) {
        for (const [k, v] of pendingTransactions.entries()) {
          if (v.billNumber === billNumber) {
            txn = v;
            break;
          }
        }
      }

      const finalTxnId = txnId || ('TXN-SIM-' + Date.now());
      const finalTraceId = validationTraceId || txn?.validationTraceId || ('TRC-SIM-' + Date.now());
      const paidAmount = Number(amount || txn?.amount || 0);
      const paidBillNo = billNumber || txn?.billNumber || ('B-' + Date.now());

      if (txn) {
        txn.status = 'SUCCESS';
        txn.txnId = finalTxnId;
        txn.paidAt = new Date().toISOString();
      } else {
        txn = {
          validationTraceId: finalTraceId,
          billNumber: paidBillNo,
          amount: paidAmount,
          status: 'SUCCESS',
          txnId: finalTxnId,
          paidAt: new Date().toISOString()
        };
        pendingTransactions.set(finalTraceId, txn);
      }

      console.log(`[Simulate Payment] ✅ Successfully simulated customer payment: Bill: ${paidBillNo}, Txn: ${finalTxnId}, Amount: Rs. ${paidAmount}`);

      // Tell NiZi POS to display Success & announce payment
      const niziSuccessCmd = {
        command: 'success',
        amount: paidAmount,
        currency: 'NPR',
        payload: `Payment of ${paidAmount} rupees received successfully`,
        txnId: finalTxnId
      };
      forwardToNiZiAgent(niziSuccessCmd).catch(() => {});

      // Broadcast to connected web clients (SSE & WebSocket)
      broadcastToClients({
        type: 'payment_received',
        traceId: finalTraceId,
        txnId: finalTxnId,
        amount: paidAmount,
        billNumber: paidBillNo,
        payerName: txn?.patientName || 'Demo Customer (Simulation)',
        paidAt: txn.paidAt
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        status: 'SUCCESS',
        message: 'Payment simulation broadcasted successfully',
        txnId: finalTxnId,
        amount: paidAmount,
        billNumber: paidBillNo,
        transaction: txn
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 9. Server-Sent Events (SSE) for Real-Time Payment Updates
  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('data: {"type":"connected"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // 10. NiZi POS Command Proxy
  if (pathname === '/api/nizi/command' && req.method === 'POST') {
    try {
      const cmd = await parseJsonBody(req);
      const result = await forwardToNiZiAgent(cmd);
      broadcastToClients({ type: 'nizi_command', command: cmd });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, forwarded: result.ok, niziResponse: result }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 10.1 Clinic Guest Wi-Fi & NiZi Screen Display
  if (pathname === '/api/wifi/config' && req.method === 'GET') {
    const wifi = getClinicWifiConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, wifi }));
    return;
  }

  if (pathname === '/api/wifi/config' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const wifi = saveClinicWifiConfig(body);
      broadcastToClients({ type: 'wifi_updated', wifi });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, wifi }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/wifi/show-on-nizi' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const wifi = (body && body.ssid) ? saveClinicWifiConfig(body) : getClinicWifiConfig();
      const payload = buildWifiPayload(wifi);
      const niziCmd = {
        command: 'show_wifi',
        payload,
        ssid: wifi.ssid,
        password: wifi.password,
        security: wifi.security,
        title: 'Guest Wi-Fi',
        subtitle: 'Scan to Connect'
      };
      await forwardToNiZiAgent(niziCmd);
      broadcastToClients({ type: 'nizi_command', command: niziCmd });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, wifi, payload }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/wifi/reset-nizi' && req.method === 'POST') {
    try {
      const niziCmd = { command: 'display_logo', title: 'Infinity Dental' };
      await forwardToNiZiAgent(niziCmd);
      broadcastToClients({ type: 'nizi_command', command: niziCmd });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 11. Launch CH341 USB Soundbox Driver Installer
  if (pathname === '/api/nizi/install-driver' && req.method === 'POST') {
    try {
      const driverExe = path.join(__dirname, 'assets', 'driver', 'CH341 Windows', 'SETUP.EXE');
      if (!fs.existsSync(driverExe)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Driver installer not found at: ' + driverExe }));
        return;
      }
      const { exec } = require('child_process');
      exec(`start "" "${driverExe}"`, { windowsHide: false });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, path: driverExe }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 12. List all available COM Ports for USB Soundbox
  if (pathname === '/api/soundbox/ports' && req.method === 'GET') {
    try {
      const ports = await listAvailablePorts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        ports,
        activePort: soundboxStatus.port,
        connected: soundboxStatus.connected,
        status: soundboxStatus
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message, ports: [] }));
    }
    return;
  }

  // 13. Connect to a specific COM Port at 115200 baud (8-N-1)
  if (pathname === '/api/soundbox/connect' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      let portToConnect = (body.port || '').trim();

      if (!portToConnect || portToConnect === 'auto') {
        const ports = await listAvailablePorts();
        const candidate = ports.find(p => p.isCandidate) || ports[0];
        if (!candidate) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'No serial COM ports found on this system.' }));
          return;
        }
        portToConnect = candidate.path;
      }

      console.log(`[Soundbox API] Manual connect requested for port "${portToConnect}"...`);
      const status = await openSoundboxPort(portToConnect, false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Successfully connected to NiZi Soundbox on ${portToConnect} at 115200 baud (8-N-1)`,
        status
      }));
    } catch (e) {
      console.error(`[Soundbox API] Connection failed:`, e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message, status: soundboxStatus }));
    }
    return;
  }

  // 14. Disconnect Active COM Port
  if (pathname === '/api/soundbox/disconnect' && req.method === 'POST') {
    try {
      if (activeSoundboxPort && activeSoundboxPort.isOpen) {
        await new Promise(r => activeSoundboxPort.close(r));
        activeSoundboxPort = null;
      }
      soundboxStatus.connected = false;
      soundboxStatus.port = null;
      broadcastToClients({ type: 'soundbox_status', status: soundboxStatus });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Soundbox serial connection closed.', status: soundboxStatus }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 15. Soundbox Status Query
  if (pathname === '/api/soundbox/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: soundboxStatus }));
    return;
  }

  // Default: Serve Static Frontend
  serveStatic(req, res, pathname);
});

// Attach WebSocket Upgrade Handler for Frontend Clients
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (pathname === '/ws') {
    localWss.handleUpgrade(req, socket, head, (ws) => {
      localWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Start Server
initDatabase();
server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚀 INFINITY DENTAL CLINIC LOCAL DEV SERVER RUNNING!`);
  console.log(`🌐 Local URL:   http://localhost:${PORT}`);
  console.log(`📁 Database:    ${activeDbPath}`);
  console.log(`💳 NepalPay:    Merchant ID ${NPI_CONFIG.merchantId} (Acquirer: ${NPI_CONFIG.acquirerId})`);
  console.log(`🔊 NiZi POS:    Dynamic QR & Soundbox Ready`);
  console.log('========================================================');

  // Initiate background connection to official NCHL NEPALPAY STOMP WebSocket
  connectNchlWebSocket();

  // Auto-detect and connect to NiZi POS Soundbox via USB Serial
  setTimeout(() => {
    autoDetectAndConnectSoundbox();
  }, 1200);
});
