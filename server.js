const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { DatabaseSync } = require('node:sqlite');
const WebSocket = require('ws');
const nizi = require('./niziProtocol');
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
      referenceLabel: String(remarks || 'Dental Treatment').trim().slice(0, 25),
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
    try {
      db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -64000;
        PRAGMA temp_store = MEMORY;
      `);
    } catch (pragmaErr) {
      console.warn('[SQLite PRAGMA]', pragmaErr.message);
    }
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


    // --- LAB, PURCHASES & STOCKS DATABASE TABLES ---

    // 1. Lab Works Cases Table (Linked to patients OPD number)
    db.exec(`CREATE TABLE IF NOT EXISTS lab_cases (
      id TEXT PRIMARY KEY,
      opd_number TEXT NOT NULL,
      lab TEXT NOT NULL,
      work_type TEXT NOT NULL,
      tooth TEXT,
      shade TEXT,
      sent_date TEXT,
      expected_date_bs TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      instructions TEXT,
      charge REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    // 2. Lab Payments Table
    db.exec(`CREATE TABLE IF NOT EXISTS lab_payments (
      id TEXT PRIMARY KEY,
      lab TEXT NOT NULL,
      month_bs TEXT,
      date_bs TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL
    )`);

    // 3. Suppliers Table
    db.exec(`CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      contact TEXT,
      phone TEXT NOT NULL,
      alt_phone TEXT,
      email TEXT,
      address TEXT,
      pan TEXT,
      credit_days INTEGER DEFAULT 0,
      opening_balance REAL DEFAULT 0,
      categories TEXT,
      delivery_persons TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    // 4. Purchase Invoices Table
    db.exec(`CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      supplier TEXT NOT NULL,
      invoice_no TEXT NOT NULL,
      date_bs TEXT NOT NULL,
      due_date_bs TEXT,
      paid REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'Unpaid / Credit',
      delivery_name TEXT,
      delivery_phone TEXT,
      discount REAL DEFAULT 0,
      receipt_status TEXT DEFAULT 'Pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    // 5. Purchase Invoice Items Table
    db.exec(`CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      category TEXT,
      quantity REAL NOT NULL,
      unit TEXT,
      unit_cost REAL NOT NULL,
      line_total REAL NOT NULL
    )`);

    // 6. Stock Items Table (with location, batch, expiry, min stock)
    db.exec(`CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      batch TEXT,
      location TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      expiry TEXT NOT NULL,
      min_quantity REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    // 7. Stock Movements Audit Log Table
    db.exec(`CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      item_name TEXT NOT NULL,
      location TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      before_qty REAL NOT NULL,
      after_qty REAL NOT NULL,
      note TEXT,
      unit TEXT,
      created_at TEXT NOT NULL
    )`);

    // Seed default Admin Delete PIN if not present
    const pinRow = db.prepare("SELECT value FROM clinic_settings WHERE key='admin_delete_pin'").get();
    if (!pinRow) {
      db.prepare("INSERT INTO clinic_settings (key, value, updated_at) VALUES ('admin_delete_pin', ?, ?)").run('1234', new Date().toISOString());
    }

    // Seed initial stock items if empty
    const stockCount = db.prepare('SELECT COUNT(*) as count FROM stock_items').get().count;
    if (stockCount === 0) {
      const now = new Date().toISOString();
      const seedStock = [
        { id: '1', name: 'Composite Resin', batch: 'CR-26A', loc: 'Main Store', qty: 5, unit: 'syringes', exp: '2027-04-30', min: 3 },
        { id: '2', name: 'Local Anaesthetic', batch: 'LA-114', loc: 'Surgery Room', qty: 18, unit: 'cartridges', exp: '2026-12-15', min: 10 },
        { id: '3', name: 'Nitrile Gloves (M)', batch: 'NG-052', loc: 'Main Store', qty: 2, unit: 'boxes', exp: '2028-01-01', min: 4 },
        { id: '4', name: 'Bonding Agent', batch: 'BA-09', loc: 'OPD Cabinet', qty: 6, unit: 'bottles', exp: '2027-08-20', min: 2 },
        { id: '5', name: 'Sterilization Pouches', batch: 'SP-31', loc: 'Sterilization Room', qty: 12, unit: 'packs', exp: '2029-01-01', min: 5 }
      ];
      const insertStock = db.prepare(`INSERT INTO stock_items (id, name, batch, location, quantity, unit, expiry, min_quantity, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
      for (const s of seedStock) {
        insertStock.run(s.id, s.name, s.batch, s.loc, s.qty, s.unit, s.exp, s.min, now, now);
      }
      console.log('✓ Seeded initial Stock items');
    }

    // Seed initial suppliers if empty
    const supCount = db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count;
    if (supCount === 0) {
      const now = new Date().toISOString();
      const seedSup = [
        { id: '1', name: 'Dental Mart', contact: 'Ramesh', phone: '9841234567', cats: JSON.stringify(['Dental materials']), del: JSON.stringify([{n:'Bikash',p:'9841987654'}]), credit: 30, open: 0 },
        { id: '2', name: 'Med Supplies', contact: 'Sunita', phone: '9851234568', cats: JSON.stringify(['Medicines', 'Consumables']), del: JSON.stringify([{n:'Prakash',p:'9851987655'}]), credit: 15, open: 0 },
        { id: '3', name: 'Ortho Traders', contact: '', phone: '9861234569', cats: JSON.stringify(['Orthodontic materials']), del: JSON.stringify([]), credit: 0, open: 0 }
      ];
      const insertSup = db.prepare(`INSERT INTO suppliers (id, name, contact, phone, alt_phone, email, address, pan, credit_days, opening_balance, categories, delivery_persons, active, created_at, updated_at) VALUES (?, ?, ?, ?, '', '', '', '', ?, ?, ?, ?, 1, ?, ?)`);
      for (const s of seedSup) {
        insertSup.run(s.id, s.name, s.contact, s.phone, s.credit, s.open, s.cats, s.del, now, now);
      }
      console.log('✓ Seeded initial Suppliers');
    }

    // Seed initial purchases if empty
    const purCount = db.prepare('SELECT COUNT(*) as count FROM purchase_invoices').get().count;
    if (purCount === 0) {
      const now = new Date().toISOString();
      const p1Id = '1';
      db.prepare(`INSERT INTO purchase_invoices (id, supplier, invoice_no, date_bs, due_date_bs, paid, payment_method, delivery_name, delivery_phone, discount, receipt_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        p1Id, 'Dental Mart', 'DM-2081', '2083-07-12', '2083-08-11', 18500, 'Cash', 'Bikash', '9841987654', 0, 'Received', now, now
      );
      db.prepare(`INSERT INTO purchase_items (id, invoice_id, item_name, category, quantity, unit, unit_cost, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pi-1', p1Id, 'Composite Resin', 'Dental materials', 5, 'Syringe', 2200, 11000
      );
      db.prepare(`INSERT INTO purchase_items (id, invoice_id, item_name, category, quantity, unit, unit_cost, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pi-2', p1Id, 'Bonding Agent', 'Dental materials', 3, 'Bottle', 2500, 7500
      );

      const p2Id = '2';
      db.prepare(`INSERT INTO purchase_invoices (id, supplier, invoice_no, date_bs, due_date_bs, paid, payment_method, delivery_name, delivery_phone, discount, receipt_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        p2Id, 'Med Supplies', 'MS-441', '2083-07-10', '2083-07-25', 3000, 'Cash', 'Prakash', '9851987655', 0, 'Partial', now, now
      );
      db.prepare(`INSERT INTO purchase_items (id, invoice_id, item_name, category, quantity, unit, unit_cost, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pi-3', p2Id, 'Nitrile Gloves (M)', 'Consumables', 4, 'Box', 1200, 4800
      );
      db.prepare(`INSERT INTO purchase_items (id, invoice_id, item_name, category, quantity, unit, unit_cost, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'pi-4', p2Id, 'Local Anaesthetic', 'Medicines', 12, 'Cartridge', 200, 2400
      );
      console.log('✓ Seeded initial Purchases');
    }

    // Seed initial lab cases and historical payments if empty
    const labCount = db.prepare('SELECT COUNT(*) as count FROM lab_cases').get().count;
    if (labCount === 0) {
      const now = new Date().toISOString();
      const seedLab = [
        { id: '1', opd: 'OPD-1001', lab: 'Smile Lab', work: 'Zirconia crown', tooth: '16', shade: 'A2', sent: '2026-11-11', exp: '2083-07-18', st: 'Ongoing', charge: 6500 },
        { id: '2', opd: 'OPD-1002', lab: 'Dental Craft', work: 'RPD', tooth: '36–37', shade: '', sent: '2026-11-08', exp: '2083-07-17', st: 'To Be Received', charge: 7500 },
        { id: '3', opd: 'OPD-1003', lab: 'Smile Lab', work: 'Denture repair', tooth: '', shade: '', sent: '2026-11-09', exp: '2083-07-14', st: 'Received', charge: 1500 },
        { id: '4', opd: 'OPD-1121', lab: 'Smile Lab', work: 'Zirconia crown', tooth: '25', shade: 'A3', sent: '2026-11-14', exp: '2083-07-27', st: 'Ongoing', charge: 6500 },
        { id: '5', opd: 'OPD-1124', lab: 'Dental Craft', work: 'Night guard', tooth: '', shade: '', sent: '2026-11-14', exp: '2083-07-26', st: 'Ongoing', charge: 3500 },
        { id: '6', opd: 'OPD-1126', lab: 'Precision Dental Lab', work: 'Implant crown', tooth: '36', shade: 'A2', sent: '2026-11-06', exp: '2083-07-16', st: 'To Be Fitted', charge: 12000 }
      ];
      const insertLab = db.prepare(`INSERT INTO lab_cases (id, opd_number, lab, work_type, tooth, shade, sent_date, expected_date_bs, status, instructions, charge, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`);
      for (const l of seedLab) {
        insertLab.run(l.id, l.opd, l.lab, l.work, l.tooth, l.shade, l.sent, l.exp, l.st, l.charge, now, now);
      }

      // Seed payments for monthly accounting
      const seedPayments = [
        ['Smile Lab', '04', '2083-04-20', 'Cash', 10000],
        ['Dental Craft', '04', '2083-04-25', 'Bank Transfer', 5000],
        ['Precision Dental Lab', '04', '2083-04-28', 'Cash', 5000],
        ['Smile Lab', '05', '2083-05-15', 'Cash', 15000],
        ['Dental Craft', '05', '2083-05-20', 'Bank Transfer', 10000],
        ['Precision Dental Lab', '05', '2083-05-25', 'Cash', 10000],
        ['Smile Lab', '06', '2083-06-18', 'Cash', 12000],
        ['Dental Craft', '06', '2083-06-22', 'Bank Transfer', 8000],
        ['Precision Dental Lab', '06', '2083-06-26', 'Cash', 10000],
        ['Smile Lab', '07', '2083-07-10', 'Cash', 12000],
        ['Dental Craft', '07', '2083-07-12', 'Bank Transfer', 6000],
        ['Precision Dental Lab', '07', '2083-07-15', 'Cash', 10000]
      ];
      const insertPay = db.prepare(`INSERT INTO lab_payments (id, lab, month_bs, date_bs, method, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (let pi = 0; pi < seedPayments.length; pi++) {
        const p = seedPayments[pi];
        insertPay.run('pay-' + (pi + 1), p[0], p[1], p[2], p[3], p[4], now);
      }
      console.log('✓ Seeded initial Lab cases & payments');
    }

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

      // Configure modem signals (DTR=False, RTS=False) per B30Sdk.py / dynamic_qr_commands.html
      port.set({ dtr: false, rts: false }, (sigErr) => {
        if (!sigErr) {
          console.log(`[Soundbox Serial] Handshake signals configured: DTR=false, RTS=false`);
        }
      });

      // Send initial wake and logo command packet to initialize LCD screen
      sendSoundboxSerialCommand({ command: 'wake' });
      setTimeout(() => {
        sendSoundboxSerialCommand({ command: 'idle' });
      }, 500);

      resolve(soundboxStatus);
    });

    port.on('data', (chunk) => {
      const text = chunk.toString().trim();
      const hex = chunk.toString('hex').match(/.{1,2}/g).join(' ').toUpperCase();
      if (text || hex) {
        console.log(`[Soundbox Serial Rx on ${portName}]:`, text || `(raw hex: ${hex})`);
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

// Transmit commands directly to physical soundbox over serial (115200 baud) using official NiZi B30/B33 protocol
function sendSoundboxSerialCommand(cmd) {
  if (!activeSoundboxPort || !activeSoundboxPort.isOpen) return false;
  try {
    let packet = null;

    if (cmd.command === 'show_qr' || cmd.command === 'qr') {
      // 1. Official Dynamic QR: QR**Rs. <amount>**<message>**<payload>\n
      const msg = cmd.message || 'SCAN TO PAY';
      packet = nizi.buildQrPacket(cmd.amount, msg, cmd.payload || '');
    } else if (cmd.command === 'success' || cmd.command === 'payment_success') {
      // 2. Official Payment Voice Announcement: PASS**<title>**<message>\n
      // Triggers physical soundbox voice broadcast ("Rs. 1500 received") and success screen
      const title = cmd.title || 'SUCCESS!';
      const msg = cmd.message || (cmd.amount ? `Rs. ${cmd.amount} received` : 'Payment successful');
      packet = nizi.buildSuccessPacket(title, msg);
    } else if (cmd.command === 'show_wifi') {
      // 3. Official Guest Wi-Fi QR on Screen: QR**FREE WI-FI**<SSID>**<payload>\n
      packet = nizi.buildWifiQrPacket(cmd.ssid || 'Clinic Guest Wi-Fi', cmd.payload || '');
    } else if (cmd.command === 'idle' || cmd.command === 'display_logo') {
      // 4. Standby / Welcome Screen: IDLE\n
      packet = nizi.buildIdlePacket();
    } else if (cmd.command === 'waiting' || cmd.command === 'loading') {
      // 5. Waiting Screen: WAIT**Rs. <amount>**<message>\n
      packet = nizi.buildWaitPacket(cmd.amount, cmd.message || 'Please wait...');
    } else if (cmd.command === 'failure' || cmd.command === 'fail') {
      // 6. Payment Failure: FAIL**Rs. <amount>**<message>\n
      packet = nizi.buildFailPacket(cmd.amount, cmd.message || 'Payment Failed');
    } else if (cmd.command === 'text') {
      // 7. Text Display: TEXT**<title>**<subtitle>**<message>\n
      packet = nizi.buildTextPacket(cmd.title, cmd.subtitle, cmd.message);
    } else if (cmd.command === 'wake') {
      packet = nizi.buildWakePacket();
    } else if (cmd.command === 'reset') {
      packet = nizi.buildResetPacket();
    } else if (cmd.command === 'clear') {
      packet = nizi.buildClearPacket();
    } else if (cmd.command === 'volume') {
      packet = nizi.buildVolumePacket(cmd.volume || 100);
    } else {
      packet = nizi.packetToHex(cmd.raw || (cmd.command ? `${cmd.command}\n` : 'IDLE\n'));
    }

    if (packet) {
      activeSoundboxPort.write(packet.buffer);
      console.log(`[NiZi Serial Tx on ${soundboxStatus.port}] Official Protocol:`, JSON.stringify(packet.raw.trim()), `[Hex: ${packet.hex}]`);
    }

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


  // =========================================================================
  // 16. NETWORK INFO & WI-FI PHONE QR ENDPOINT
  // =========================================================================
  if (pathname === '/api/network-info' && req.method === 'GET') {
    try {
      const interfaces = os.networkInterfaces();
      const addresses = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            addresses.push({ interface: name, address: iface.address });
          }
        }
      }
      // Prioritize Wi-Fi or Ethernet LAN IPv4
      const primaryIp = addresses.find(a => /wi-?fi|wlan/i.test(a.interface))?.address || addresses.find(a => !/virtual|vethernet|vmware|vbox|host-only/i.test(a.interface) && !a.address.startsWith('192.168.56.'))?.address || addresses[0]?.address || '127.0.0.1';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        port: PORT,
        primaryIp,
        addresses,
        phoneUrl: `http://${primaryIp}:${PORT}?phone=stock`
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Phone Route Shortcut
  if ((pathname === '/phone' || pathname === '/stock-phone') && req.method === 'GET') {
    res.writeHead(302, { 'Location': '/?phone=stock' });
    res.end();
    return;
  }

  // =========================================================================
  // 17. ADMIN PIN VERIFICATION (DELETE ACTIONS)
  // =========================================================================
  if (pathname === '/api/admin/verify-pin' && req.method === 'POST') {
    try {
      const { pin } = await parseJsonBody(req);
      const cleanPin = String(pin || '').trim();
      let storedPin = '1234';
      try {
        const row = db.prepare("SELECT value FROM clinic_settings WHERE key='admin_delete_pin'").get();
        if (row && row.value) storedPin = row.value.trim();
      } catch (_) {}

      // Accepts either dedicated admin PIN or superadmin password 'admin123'
      if (cleanPin === storedPin || cleanPin === 'admin123') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, authorized: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, authorized: false, error: 'Incorrect Admin PIN' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // =========================================================================
  // 18. PATIENT LOOKUP (FOR LAB ASSIGNMENTS OPD LINKING)
  // =========================================================================
  if (pathname === '/api/patients/lookup' && req.method === 'GET') {
    try {
      const queryParams = url.searchParams;
      const opdQuery = String(queryParams.get('opd') || queryParams.get('q') || '').trim().toUpperCase();
      const row = db.prepare('SELECT patients_json FROM app_data WHERE id=1').get();
      const patients = JSON.parse(row?.patients_json || '[]');

      if (!opdQuery) {
        // Return patient summary list for auto-complete datalists
        const list = patients.map(p => ({
          opd: 'OPD-' + p.OPDNumber,
          opdNumber: p.OPDNumber,
          name: p.FullName || p.Name,
          phone: p.Contact || p.Phone,
          age: p.Age,
          gender: p.Gender
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, patients: list }));
        return;
      }

      const numMatch = opdQuery.replace(/^OPD-?/i, '');
      const patient = patients.find(p =>
        String(p.OPDNumber) === numMatch ||
        ('OPD-' + p.OPDNumber).toUpperCase() === opdQuery ||
        String(p.FullName || '').toUpperCase().includes(opdQuery)
      );

      if (patient) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          patient: {
            opd: 'OPD-' + patient.OPDNumber,
            opdNumber: patient.OPDNumber,
            name: patient.FullName || patient.Name,
            phone: patient.Contact || patient.Phone,
            age: patient.Age,
            gender: patient.Gender,
            address: patient.Address
          }
        }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Patient not found' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // =========================================================================
  // 19. LAB WORKS REST APIS
  // =========================================================================
  // List all lab cases
  if (pathname === '/api/lab/cases' && req.method === 'GET') {
    try {
      const cases = db.prepare('SELECT * FROM lab_cases ORDER BY created_at DESC').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, cases }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Create new lab case
  if (pathname === '/api/lab/cases' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const id = String(body.id || Date.now());
      const now = new Date().toISOString();
      const opdNumber = String(body.opd_number || body.opd || '').trim();
      const lab = String(body.lab || '').trim();
      const workType = String(body.work_type || body.work || '').trim();
      const tooth = String(body.tooth || '').trim();
      const shade = String(body.shade || '').trim();
      const sentDate = String(body.sent_date || body.sent || '').trim();
      const expectedDateBs = String(body.expected_date_bs || body.exp || '').trim();
      const status = String(body.status || body.st || 'Pending').trim();
      const instructions = String(body.instructions || body.ins || '').trim();
      const charge = Number(body.charge || 0);

      db.prepare(`
        INSERT INTO lab_cases (id, opd_number, lab, work_type, tooth, shade, sent_date, expected_date_bs, status, instructions, charge, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, opdNumber, lab, workType, tooth, shade, sentDate, expectedDateBs, status, instructions, charge, now, now);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id, message: 'Lab case created successfully' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Advance lab case workflow: Pending -> Ongoing -> To Be Received -> Received -> To Be Fitted -> Fitted
  if (pathname.startsWith('/api/lab/cases/') && pathname.endsWith('/advance') && req.method === 'PUT') {
    try {
      const id = pathname.replace('/api/lab/cases/', '').replace('/advance', '').trim();
      const current = db.prepare('SELECT * FROM lab_cases WHERE id = ?').get(id);
      if (!current) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Lab case not found' }));
        return;
      }

      const WF = ['Pending', 'Ongoing', 'To Be Received', 'Received', 'To Be Fitted', 'Fitted'];
      const curIdx = WF.indexOf(current.status);
      if (curIdx < WF.length - 1) {
        const nextStatus = WF[curIdx + 1];
        let sentDate = current.sent_date;
        if (nextStatus === 'Ongoing' && !sentDate) {
          sentDate = new Date().toISOString().split('T')[0];
        }
        const now = new Date().toISOString();
        db.prepare('UPDATE lab_cases SET status = ?, sent_date = ?, updated_at = ? WHERE id = ?').run(nextStatus, sentDate, now, id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: nextStatus, sent_date: sentDate }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: current.status, message: 'Already fitted/completed' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Delete lab case
  if (pathname.startsWith('/api/lab/cases/') && req.method === 'DELETE') {
    try {
      const id = pathname.replace('/api/lab/cases/', '').trim();
      db.prepare('DELETE FROM lab_cases WHERE id = ?').run(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Lab case deleted' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Monthly Lab Accounts Summary (Due from previous month + Charge of this month - Paid)
  if (pathname === '/api/lab/accounts' && req.method === 'GET') {
    try {
      const queryParams = url.searchParams;
      const monthBs = queryParams.get('month') || '07';
      const LABS = { 'Smile Lab': 8000, 'Dental Craft': 0, 'Precision Dental Lab': 5000 };
      const MS = ['04', '05', '06', '07'];

      const cases = db.prepare('SELECT * FROM lab_cases').all();
      const payments = db.prepare('SELECT * FROM lab_payments').all();

      const calcAccount = (m, labName, openBal) => {
        let due = openBal;
        for (const k of MS) {
          const ch = cases
            .filter(c => c.lab === labName && (c.expected_date_bs || '').includes('-' + k + '-'))
            .reduce((sum, c) => sum + (c.charge || 0), 0);
          const pd = payments
            .filter(p => p.lab === labName && (p.month_bs === k || (p.date_bs || '').includes('-' + k + '-')))
            .reduce((sum, p) => sum + (p.amount || 0), 0);
          if (k === m) {
            return { due, ch, pd, out: due + ch - pd };
          }
          due += ch - pd;
        }
        return { due, ch: 0, pd: 0, out: due };
      };

      const summaries = Object.keys(LABS).map(labName => {
        const acct = calcAccount(monthBs, labName, LABS[labName]);
        const labCases = cases.filter(c => c.lab === labName && (c.expected_date_bs || '').includes('-' + monthBs + '-'));
        const labPays = payments.filter(p => p.lab === labName && (p.month_bs === monthBs || (p.date_bs || '').includes('-' + monthBs + '-')));
        return {
          lab: labName,
          due: acct.due,
          charge: acct.ch,
          paid: acct.pd,
          outstanding: acct.out,
          cases: labCases,
          payments: labPays
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, month: monthBs, summaries }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Lab Payments: GET and POST
  if (pathname === '/api/lab/payments' && req.method === 'GET') {
    try {
      const rows = db.prepare('SELECT * FROM lab_payments ORDER BY date_bs DESC, created_at DESC').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payments: rows }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/lab/payments' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const id = String(body.id || 'pay-' + Date.now());
      const lab = String(body.lab || '').trim();
      const monthBs = String(body.month_bs || '').trim();
      const dateBs = String(body.date_bs || '').trim();
      const method = String(body.method || 'Cash').trim();
      const amount = Number(body.amount || 0);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO lab_payments (id, lab, month_bs, date_bs, method, amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, lab, monthBs, dateBs, method, amount, now);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id, message: 'Lab payment recorded successfully' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // =========================================================================
  // 20. SUPPLIERS REST APIS
  // =========================================================================
  if (pathname === '/api/suppliers' && req.method === 'GET') {
    try {
      const rows = db.prepare('SELECT * FROM suppliers ORDER BY active DESC, name ASC').all();
      const suppliers = rows.map(r => ({
        ...r,
        categories: JSON.parse(r.categories || '[]'),
        delivery_persons: JSON.parse(r.delivery_persons || '[]')
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, suppliers }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/suppliers' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const id = String(body.id || Date.now());
      const name = String(body.name || '').trim();
      const contact = String(body.contact || '').trim();
      const phone = String(body.phone || '').trim();
      const altPhone = String(body.alt_phone || '').trim();
      const email = String(body.email || '').trim();
      const address = String(body.address || '').trim();
      const pan = String(body.pan || '').trim();
      const creditDays = Number(body.credit_days || 0);
      const openingBalance = Number(body.opening_balance || 0);
      const categories = JSON.stringify(Array.isArray(body.categories) ? body.categories : []);
      const deliveryPersons = JSON.stringify(Array.isArray(body.delivery_persons) ? body.delivery_persons : []);
      const now = new Date().toISOString();

      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Supplier name is required' }));
        return;
      }

      db.prepare(`
        INSERT INTO suppliers (id, name, contact, phone, alt_phone, email, address, pan, credit_days, opening_balance, categories, delivery_persons, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, name, contact, phone, altPhone, email, address, pan, creditDays, openingBalance, categories, deliveryPersons, now, now);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id, message: 'Supplier created successfully' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/suppliers/') && pathname.endsWith('/toggle') && req.method === 'PUT') {
    try {
      const id = pathname.replace('/api/suppliers/', '').replace('/toggle', '').trim();
      const sup = db.prepare('SELECT active FROM suppliers WHERE id = ?').get(id);
      if (!sup) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Supplier not found' }));
        return;
      }
      const newActive = sup.active ? 0 : 1;
      const now = new Date().toISOString();
      db.prepare('UPDATE suppliers SET active = ?, updated_at = ? WHERE id = ?').run(newActive, now, id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, active: newActive }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/suppliers/') && req.method === 'DELETE') {
    try {
      const id = pathname.replace('/api/suppliers/', '').trim();
      const sup = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(id);
      if (!sup) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Supplier not found' }));
        return;
      }
      const invCount = db.prepare('SELECT COUNT(*) as count FROM purchase_invoices WHERE supplier = ?').get(sup.name).count;
      if (invCount > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Cannot delete supplier "${sup.name}": ${invCount} invoice(s) exist. Please delete those invoices first or deactivate the supplier.` }));
        return;
      }
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Supplier deleted successfully' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // =========================================================================
  // 21. PURCHASES REST APIS
  // =========================================================================
  if (pathname === '/api/purchases' && req.method === 'GET') {
    try {
      const invoices = db.prepare('SELECT * FROM purchase_invoices ORDER BY date_bs DESC, created_at DESC').all();
      const allItems = db.prepare('SELECT * FROM purchase_items').all();
      const purchases = invoices.map(inv => {
        const items = allItems.filter(i => i.invoice_id === inv.id);
        const subtotal = items.reduce((s, it) => s + (it.line_total || (it.quantity * it.unit_cost)), 0);
        const total = Math.max(0, subtotal - (inv.discount || 0));
        return {
          ...inv,
          items,
          subtotal,
          total,
          balance: Math.max(0, total - (inv.paid || 0))
        };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, purchases }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/purchases' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const id = String(body.id || Date.now());
      const supplier = String(body.supplier || body.sup || '').trim();
      const invoiceNo = String(body.invoice_no || body.inv || '').trim();
      const dateBs = String(body.date_bs || body.date || '').trim();
      const dueBs = String(body.due_date_bs || body.due || '').trim();
      const paid = Number(body.paid || 0);
      const paymentMethod = String(body.payment_method || body.pm || 'Unpaid / Credit').trim();
      const deliveryName = String(body.delivery_name || body.dn || '').trim();
      const deliveryPhone = String(body.delivery_phone || body.dp || '').trim();
      const discount = Number(body.discount || body.disc || 0);
      const receiptStatus = String(body.receipt_status || body.rec || 'Pending').trim();
      const items = Array.isArray(body.items) ? body.items : [];
      const now = new Date().toISOString();

      if (!supplier || !invoiceNo || !dateBs) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Supplier, Invoice number, and Date (BS) are required.' }));
        return;
      }

      // Check unique invoice for supplier
      const existing = db.prepare('SELECT id FROM purchase_invoices WHERE LOWER(supplier) = LOWER(?) AND LOWER(invoice_no) = LOWER(?)').get(supplier, invoiceNo);
      if (existing) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Invoice "${invoiceNo}" already exists for supplier "${supplier}".` }));
        return;
      }

      db.prepare(`
        INSERT INTO purchase_invoices (id, supplier, invoice_no, date_bs, due_date_bs, paid, payment_method, delivery_name, delivery_phone, discount, receipt_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, supplier, invoiceNo, dateBs, dueBs, paid, paymentMethod, deliveryName, deliveryPhone, discount, receiptStatus, now, now);

      const insertItem = db.prepare(`
        INSERT INTO purchase_items (id, invoice_id, item_name, category, quantity, unit, unit_cost, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const itId = 'pi-' + id + '-' + (i + 1);
        const q = Number(it.quantity || it.q || 0);
        const c = Number(it.unit_cost || it.c || 0);
        insertItem.run(itId, id, it.name || it.item_name || it.n, it.category || it.cat || 'Dental materials', q, it.unit || it.u || 'Piece', c, q * c);
      }

      // If delivery person entered, remember on supplier record
      if (deliveryName) {
        const sup = db.prepare('SELECT * FROM suppliers WHERE name = ?').get(supplier);
        if (sup) {
          const dels = JSON.parse(sup.delivery_persons || '[]');
          if (!dels.some(d => (d.n || '').toLowerCase() === deliveryName.toLowerCase())) {
            dels.push({ n: deliveryName, p: deliveryPhone });
            db.prepare('UPDATE suppliers SET delivery_persons = ? WHERE id = ?').run(JSON.stringify(dels), sup.id);
          }
        }
      }

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id, message: 'Purchase invoice saved. Stock is increased only after confirmation of goods receipt.' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Delete purchase invoice
  if (pathname.startsWith('/api/purchases/') && req.method === 'DELETE') {
    try {
      const id = pathname.replace('/api/purchases/', '').trim();
      db.prepare('DELETE FROM purchase_items WHERE invoice_id = ?').run(id);
      db.prepare('DELETE FROM purchase_invoices WHERE id = ?').run(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Purchase invoice deleted successfully' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // =========================================================================
  // 22. STOCK & INVENTORY REST APIS
  // =========================================================================
  if (pathname === '/api/stock/items' && req.method === 'GET') {
    try {
      const items = db.prepare('SELECT * FROM stock_items WHERE active = 1 ORDER BY name ASC').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, items }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/stock/items' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const id = String(body.id || Date.now());
      const name = String(body.name || '').trim();
      const batch = String(body.batch || '').trim();
      const location = String(body.location || body.loc || 'Main Store').trim();
      const quantity = Number(body.quantity || body.qty || 0);
      const unit = String(body.unit || 'pieces').trim();
      const expiry = String(body.expiry || body.exp || '').trim();
      const minQuantity = Number(body.min_quantity || body.min || 0);
      const now = new Date().toISOString();

      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Item name is required' }));
        return;
      }

      db.prepare(`
        INSERT INTO stock_items (id, name, batch, location, quantity, unit, expiry, min_quantity, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, name, batch, location, quantity, unit, expiry, minQuantity, now, now);

      // Audit movement
      db.prepare(`
        INSERT INTO stock_movements (id, item_id, item_name, location, type, quantity, before_qty, after_qty, note, unit, created_at)
        VALUES (?, ?, ?, ?, 'Added', ?, 0, ?, 'New stock item registered', ?, ?)
      `).run('mov-' + Date.now(), id, name, location, quantity, quantity, unit, now);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id, message: 'Stock item added successfully' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Quick Use (-1 or custom qty)
  if (pathname.startsWith('/api/stock/items/') && pathname.endsWith('/use') && req.method === 'POST') {
    try {
      const id = pathname.replace('/api/stock/items/', '').replace('/use', '').trim();
      const body = await parseJsonBody(req);
      const qtyToUse = Math.max(1, Number(body.quantity || 1));
      const note = String(body.note || 'Quick use').trim();

      const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(id);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Stock item not found' }));
        return;
      }

      if (item.quantity < qtyToUse) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Not enough stock: only ${item.quantity} ${item.unit} available.` }));
        return;
      }

      const before = item.quantity;
      const after = before - qtyToUse;
      const now = new Date().toISOString();

      db.prepare('UPDATE stock_items SET quantity = ?, updated_at = ? WHERE id = ?').run(after, now, id);
      db.prepare(`
        INSERT INTO stock_movements (id, item_id, item_name, location, type, quantity, before_qty, after_qty, note, unit, created_at)
        VALUES (?, ?, ?, ?, 'Used', ?, ?, ?, ?, ?, ?)
      `).run('mov-' + Date.now(), id, item.name, item.location, qtyToUse, before, after, note, item.unit, now);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, quantity: after, message: `Used ${qtyToUse} ${item.unit}. Remaining: ${after} ${item.unit}` }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // General Stock Update (use, waste, add, set, remove)
  if (pathname.startsWith('/api/stock/items/') && pathname.endsWith('/update') && req.method === 'POST') {
    try {
      const id = pathname.replace('/api/stock/items/', '').replace('/update', '').trim();
      const body = await parseJsonBody(req);
      const action = String(body.action || body.type || 'use').toLowerCase();
      const qty = Math.max(0, Number(body.quantity || body.qty || 0));
      const note = String(body.note || '').trim();

      const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(id);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Stock item not found' }));
        return;
      }

      const before = item.quantity;
      let after = before;
      let typeLabel = 'Used';

      if (action === 'remove') {
        const now = new Date().toISOString();
        db.prepare('UPDATE stock_items SET active = 0, quantity = 0, updated_at = ? WHERE id = ?').run(now, id);
        db.prepare(`
          INSERT INTO stock_movements (id, item_id, item_name, location, type, quantity, before_qty, after_qty, note, unit, created_at)
          VALUES (?, ?, ?, ?, 'Removed', ?, ?, 0, ?, ?, ?)
        `).run('mov-' + Date.now(), id, item.name, item.location, before, before, note || 'Item used up - removed', item.unit, now);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, removed: true, message: `${item.name} removed from stock list.` }));
        return;
      }

      if (action === 'use') {
        if (before < qty) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Not enough stock: only ${before} ${item.unit} available.` }));
          return;
        }
        after = before - qty;
        typeLabel = 'Used';
      } else if (action === 'waste') {
        if (before < qty) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Not enough stock: only ${before} ${item.unit} available.` }));
          return;
        }
        after = before - qty;
        typeLabel = 'Wasted';
      } else if (action === 'add') {
        after = before + qty;
        typeLabel = 'Added';
      } else if (action === 'set') {
        after = qty;
        typeLabel = 'Count set';
      }

      const now = new Date().toISOString();
      db.prepare('UPDATE stock_items SET quantity = ?, updated_at = ? WHERE id = ?').run(after, now, id);
      db.prepare(`
        INSERT INTO stock_movements (id, item_id, item_name, location, type, quantity, before_qty, after_qty, note, unit, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('mov-' + Date.now(), id, item.name, item.location, typeLabel, qty, before, after, note, item.unit, now);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, quantity: after, message: `Updated: ${item.name} is now ${after} ${item.unit}` }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Delete Stock Item (Admin)
  if (pathname.startsWith('/api/stock/items/') && req.method === 'DELETE') {
    try {
      const id = pathname.replace('/api/stock/items/', '').trim();
      const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(id);
      if (item) {
        const now = new Date().toISOString();
        db.prepare('UPDATE stock_items SET active = 0, updated_at = ? WHERE id = ?').run(now, id);
        db.prepare(`
          INSERT INTO stock_movements (id, item_id, item_name, location, type, quantity, before_qty, after_qty, note, unit, created_at)
          VALUES (?, ?, ?, ?, 'Deleted', ?, ?, 0, 'Deleted by admin', ?, ?)
        `).run('mov-' + Date.now(), id, item.name, item.location, item.quantity, item.quantity, item.unit, now);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Stock item deleted' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Stock Movements Audit Log
  if (pathname === '/api/stock/movements' && req.method === 'GET') {
    try {
      const movements = db.prepare('SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 200').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, movements }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Reset stock to initial sample data
  if (pathname === '/api/stock/reset' && req.method === 'POST') {
    try {
      db.prepare('DELETE FROM stock_items').run();
      db.prepare('DELETE FROM stock_movements').run();
      const now = new Date().toISOString();
      const seedStock = [
        { id: '1', name: 'Composite Resin', batch: 'CR-26A', loc: 'Main Store', qty: 5, unit: 'syringes', exp: '2027-04-30', min: 3 },
        { id: '2', name: 'Local Anaesthetic', batch: 'LA-114', loc: 'Surgery Room', qty: 18, unit: 'cartridges', exp: '2026-12-15', min: 10 },
        { id: '3', name: 'Nitrile Gloves (M)', batch: 'NG-052', loc: 'Main Store', qty: 2, unit: 'boxes', exp: '2028-01-01', min: 4 },
        { id: '4', name: 'Bonding Agent', batch: 'BA-09', loc: 'OPD Cabinet', qty: 6, unit: 'bottles', exp: '2027-08-20', min: 2 },
        { id: '5', name: 'Sterilization Pouches', batch: 'SP-31', loc: 'Sterilization Room', qty: 12, unit: 'packs', exp: '2029-01-01', min: 5 }
      ];
      const insertStock = db.prepare(`INSERT INTO stock_items (id, name, batch, location, quantity, unit, expiry, min_quantity, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
      for (const s of seedStock) {
        insertStock.run(s.id, s.name, s.batch, s.loc, s.qty, s.unit, s.exp, s.min, now, now);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Stock reset to sample data' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
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
server.listen(PORT, '0.0.0.0', () => {
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
