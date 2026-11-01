const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
  generateQrUrl: 'https://devopennpi.connectips.com/qr/generateQR'
};

const KEY_FILE = path.join(__dirname, 'certs', 'npi_key.pem');
console.log('========================================================');
console.log('   NCHL NEPALPAY DYNAMIC QR LIVE TEST (devopennpi)     ');
console.log('========================================================');
console.log(`Target URL        : ${NPI_CONFIG.generateQrUrl}`);
console.log(`Merchant ID (PAN) : ${NPI_CONFIG.merchantId}`);
console.log(`Acquirer ID       : ${NPI_CONFIG.acquirerId}`);
console.log(`MCC               : ${NPI_CONFIG.merchantCategoryCode}`);
console.log(`Basic Auth User   : ${NPI_CONFIG.basicAuthUser}`);
console.log(`User ID (Token)   : ${NPI_CONFIG.userId}`);
console.log(`Public IP Assumed : 160.250.255.215 (Whitelisted)`);

if (!fs.existsSync(KEY_FILE)) {
  console.error('❌ Private key file not found:', KEY_FILE);
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(KEY_FILE, 'utf8');
console.log('✓ Successfully loaded private key from certs/npi_key.pem');

const validationTraceId = 'TRC' + Date.now() + Math.floor(Math.random() * 1000);
const safeBillNo = 'TEST-1793189999001';
const acquirerId = NPI_CONFIG.acquirerId;
const merchantId = NPI_CONFIG.merchantId;
const merchantCategoryCode = NPI_CONFIG.merchantCategoryCode;
const transactionCurrency = 524;
const transactionAmount = (1500.00).toFixed(2);
const billNumber = safeBillNo;
const userId = 'INFINITYDENTNQR@999';

// NCHL Dynamic QR Signature String Sequence (7 Fields with INFINITYDENTNQR@999):
// TokenString = acquirerId + "," + merchantId + "," + merchantCategoryCode + "," + transactionCurrency + "," + transactionAmount + "," + billNumber + ",INFINITYDENTNQR@999"
const TokenString = acquirerId + "," + merchantId + "," + merchantCategoryCode + "," + transactionCurrency + "," + transactionAmount + "," + billNumber + "," + userId;

console.log('\n--- 1. SIGN STRING VERIFICATION ---');
console.log('NCHL Confirmed Dynamic QR Token Sequence (7 Fields):');
console.log('  1. acquirerId           :', acquirerId);
console.log('  2. merchantId           :', merchantId);
console.log('  3. merchantCategoryCode :', merchantCategoryCode);
console.log('  4. transactionCurrency  :', transactionCurrency);
console.log('  5. transactionAmount    :', transactionAmount);
console.log('  6. billNumber           :', billNumber);
console.log('  7. userId               :', userId);
console.log('TokenString:');
console.log(`"${TokenString}"`);

let token = '';
try {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(TokenString);
  token = signer.sign(privateKeyPem, 'base64');
  console.log(`✓ Token generated successfully (${token.length} chars)`);
  console.log(`Token: ${token}`);
} catch (err) {
  console.error('❌ Error signing token:', err.message);
  process.exit(1);
}

const authPlain = `${NPI_CONFIG.basicAuthUser}:${NPI_CONFIG.basicAuthPass}`;
const authBase64 = Buffer.from(authPlain).toString('base64');
console.log('\n--- 2. BASIC AUTH HEADER ---');
console.log(`Authorization: Basic ${authBase64}`);

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
  billNumber: billNumber,
  referenceLabel: 'Dental Treatment',
  mobileNo: '9800000000',
  storeLabel: NPI_CONFIG.storeLabel,
  terminalLabel: NPI_CONFIG.terminalLabel,
  purposeOfTransaction: 'Dental Treatment',
  additionalConsumerDataRequest: null,
  loyaltyNumber: null,
  token: token
};

const postData = JSON.stringify(payload);

console.log('\n--- 3. OUTGOING REQUEST PAYLOAD ---');
console.log(postData);

console.log('\n--- 4. TRANSMITTING REQUEST TO NCHL GATEWAY ---');
const parsedUrl = new URL(NPI_CONFIG.generateQrUrl);
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
  timeout: 15000
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('\n========================================================');
    console.log(`LIVE GATEWAY RESPONSE: HTTP ${res.statusCode}`);
    console.log('========================================================');
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    console.log('\nResponse Body:');
    try {
      const parsedJson = JSON.parse(body);
      console.log(JSON.stringify(parsedJson, null, 2));
    } catch (_) {
      console.log(body);
    }
    console.log('========================================================');
    console.log(`Validation Trace ID : ${validationTraceId}`);
    console.log(`Bill Number         : ${safeBillNo}`);
    console.log('========================================================');
  });
});

req.on('error', (err) => {
  console.error('\n❌ Network / Socket Error:', err.message);
});

req.on('timeout', () => {
  req.destroy();
  console.error('\n❌ Gateway Request Timed Out (15s)');
});

req.write(postData);
req.end();
