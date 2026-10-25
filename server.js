const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { DatabaseSync } = require('node:sqlite');

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
  merchantCategoryCode: 5541,
  storeLabel: 'Store1',
  terminalLabel: 'Terminal1',
  basicAuthUser: 'infinitydentnqr',
  basicAuthPass: 'Abcd@123',
  userAuth: 'INFINITYDENTNQR@999',
  apiKey: 'sfHFLRZYJPCtKkdjUQH9ugMJ1ttULcyCQ1dTGXWbJSI=',
  generateQrUrl: 'https://devopennpi.connectips.com/qr/generateQR',
  websocketUrl: 'wss://devws.nepalpay.com.np/nqrws',
  npiUserDoc: 'NEPALPAY_QR',
  npiPassDoc: 'NeP@l#838'
};

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
    console.log('✓ SQLite Database initialized successfully at:', activeDbPath);
  } catch (e) {
    console.error('Fatal SQLite initialization error:', e);
  }
}

// Certificates for NPI
let privateKeyPem = null;
let certPem = null;
try {
  const keyPath = path.join(ROOT_DIR, 'certs', 'npi_key.pem');
  const certPath = path.join(ROOT_DIR, 'certs', 'npi_cert.pem');
  if (fs.existsSync(keyPath)) privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  if (fs.existsSync(certPath)) certPem = fs.readFileSync(certPath, 'utf8');
  if (privateKeyPem) console.log('✓ NPI RSA Private Key and Certificate loaded from certs/');
} catch (e) {
  console.warn('Could not load NPI certificates:', e.message);
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
  // Sub-tag 00: Globally Unique Identifier ("np.nchl.www")
  // Sub-tag 01: Acquirer ID (00002501)
  // Sub-tag 02: Merchant Code (2501F6MCTZZ)
  const tag26Val = tlv('00', 'np.nchl.www') + tlv('01', NPI_CONFIG.acquirerId) + tlv('02', NPI_CONFIG.merchantId);

  // Tag 62: Additional Data Template
  // Sub-tag 01: Bill Number
  // Sub-tag 07: Terminal Label
  // Sub-tag 08: Store Label
  // Sub-tag 05: Reference Label
  const tag62Val = tlv('01', billNumber || 'B001') +
                   tlv('07', terminalLabel || NPI_CONFIG.terminalLabel) +
                   tlv('08', storeLabel || NPI_CONFIG.storeLabel) +
                   tlv('05', remarks || 'DentalBill');

  const formattedAmount = Number(amount || 0).toFixed(2);

  let raw = tlv('00', '01') + // Format indicator
            tlv('01', '12') + // 12 = Dynamic QR (contains specific amount)
            tlv('26', tag26Val) +
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

// In-Memory Transactions & SSE Clients
const pendingTransactions = new Map();
const sseClients = new Set();

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

// Forward commands to local NiZi Agent if active
async function forwardToNiZiAgent(commandPayload) {
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
      res.on('end', () => resolve({ ok: true, response: b }));
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'NiZi agent timed out' }); });
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

  // 6. Generate Dynamic NepalPay QR
  if (pathname === '/api/nepalpay/generate-qr' && req.method === 'POST') {
    try {
      const { amount, billNumber, remarks, patientName, patientContact, opdNumber } = await parseJsonBody(req);
      const parsedAmount = Number(amount) || 0;
      if (parsedAmount <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Amount must be greater than 0' }));
        return;
      }

      const validationTraceId = 'TRC' + Date.now() + Math.floor(Math.random() * 1000);
      const safeBillNo = billNumber || ('B-' + Date.now());

      // 1. Generate compliant EMVCo / NepalQR string
      const qrString = generateNepalPayQrPayload({
        amount: parsedAmount,
        billNumber: safeBillNo,
        remarks: remarks || `Dental ${patientName || ''}`.trim(),
        terminalLabel: NPI_CONFIG.terminalLabel,
        storeLabel: NPI_CONFIG.storeLabel
      });

      // 2. Sign token if private key is present
      let tokenSignature = '';
      if (privateKeyPem) {
        try {
          const signString = `${validationTraceId},${safeBillNo},${NPI_CONFIG.acquirerId},${NPI_CONFIG.merchantId},${NPI_CONFIG.merchantCategoryCode},${parsedAmount.toFixed(2)},0.00,524,${NPI_CONFIG.merchantName},${safeBillNo},${NPI_CONFIG.terminalLabel}`;
          const signer = crypto.createSign('RSA-SHA256');
          signer.update(signString);
          tokenSignature = signer.sign(privateKeyPem, 'base64');
        } catch (signErr) {
          console.warn('Signing token warning:', signErr.message);
        }
      }

      // Record transaction
      const txnRecord = {
        validationTraceId,
        billNumber: safeBillNo,
        amount: parsedAmount,
        patientName,
        patientContact,
        opdNumber,
        status: 'PENDING',
        qrString,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      };
      pendingTransactions.set(validationTraceId, txnRecord);

      // Notify NiZi POS device and broadcast event
      const niziCommand = {
        command: 'show_qr',
        payload: qrString,
        amount: parsedAmount,
        currency: 'NPR',
        billNumber: safeBillNo,
        title: 'Infinity Dental'
      };
      forwardToNiZiAgent(niziCommand).catch(() => {});
      broadcastSse({
        type: 'qr_generated',
        traceId: validationTraceId,
        amount: parsedAmount,
        billNumber: safeBillNo,
        qrString,
        niziCommand
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        validationTraceId,
        billNumber: safeBillNo,
        amount: parsedAmount,
        qrString,
        tokenSignature,
        expiresAt: txnRecord.expiresAt,
        merchantName: NPI_CONFIG.merchantName,
        merchantId: NPI_CONFIG.merchantId
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 7. Check Payment Status
  if (pathname.startsWith('/api/nepalpay/status/') && req.method === 'GET') {
    const traceId = pathname.replace('/api/nepalpay/status/', '');
    const txn = pendingTransactions.get(traceId);
    if (!txn) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, status: 'NOT_FOUND' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, transaction: txn }));
    return;
  }

  // 8. Simulate / Confirm Payment Received
  if (pathname === '/api/nepalpay/simulate-payment' && req.method === 'POST') {
    try {
      const { validationTraceId, txnId } = await parseJsonBody(req);
      const txn = pendingTransactions.get(validationTraceId);
      const finalTxnId = txnId || ('TXN-' + Date.now());

      if (txn) {
        txn.status = 'SUCCESS';
        txn.txnId = finalTxnId;
        txn.paidAt = new Date().toISOString();
      }

      // Tell NiZi POS to display Success & announce payment
      const niziSuccessCmd = {
        command: 'success',
        amount: txn?.amount || 0,
        currency: 'NPR',
        payload: `Payment of ${txn?.amount || 0} rupees received successfully`,
        txnId: finalTxnId
      };
      forwardToNiZiAgent(niziSuccessCmd).catch(() => {});

      // Broadcast to connected web clients
      broadcastSse({
        type: 'payment_received',
        traceId: validationTraceId,
        txnId: finalTxnId,
        amount: txn?.amount,
        billNumber: txn?.billNumber,
        paidAt: new Date().toISOString()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        status: 'SUCCESS',
        txnId: finalTxnId,
        amount: txn?.amount,
        billNumber: txn?.billNumber
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
      broadcastSse({ type: 'nizi_command', command: cmd });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, forwarded: result.ok, niziResponse: result }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Default: Serve Static Frontend
  serveStatic(req, res, pathname);
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
});
