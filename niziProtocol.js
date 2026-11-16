/**
 * Official NiZi POS B30/B33 Hardware Serial & Local HTTP Bridge Communication Protocol
 * Exact logic synchronized from:
 *  - D:\dental software\nizi b33\Infinity_NiziPOS_B33_HTML_v3_Key_Configured.html
 *  - D:\dental software\nizi b33\B30Sdk.py
 *  - D:\dental software\nizi b33\dynamic_qr_commands.html
 */

const NIZI_BRIDGE_CONFIG = {
  baseUrl: 'http://127.0.0.1:9121',
  apiKey: 'Z8uVovI2eftp65dO9JoxEstKcWggSlTAza4erAQhELmSC761rVtp5IIzaXOxWNw0ycPCICYCnJBCVPCzvdT8fbJvWIWm69fhHveZesIiDEIeI0BkdSspMPimWYNWs25D',
  defaultPort: 'COM4'
};

const NIZI_CONFIG = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: false,
  dtr: false,
  rts: false,
  ch341: {
    vid: '1a86',
    pids: ['7523', '5523']
  }
};

/**
 * Utility: Clean string for NiZi command framing (replace delimiter ** and linebreaks)
 */
function cleanMessage(s) {
  return String(s || '').replace(/\*\*/g, ' ').replace(/[\r\n]/g, ' ').trim();
}

/**
 * Utility: Ensure valid amount string (e.g. "150.00")
 */
function formatAmount(amt) {
  if (amt == null || amt === '') return '0.00';
  const num = Number(amt);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

/**
 * Convert string command into a UTF-8 Buffer and format hex representation
 */
function packetToHex(packetStr) {
  const buf = Buffer.from(packetStr, 'utf-8');
  return {
    raw: packetStr,
    buffer: buf,
    byteLength: buf.length,
    hex: buf.toString('hex').match(/.{1,2}/g).join(' ').toUpperCase()
  };
}

/**
 * Exact B33 Command String Builders (Match Infinity_NiziPOS_B33_HTML_v3_Key_Configured.html)
 */
function buildIdleCommand() {
  return 'IDLE';
}

function buildWelcomeTextCommand(message = 'Thank you for visiting') {
  const m = cleanMessage(message) || 'Infinity Dental';
  return `TEXT**Infinity Dental**Welcome**${m}`;
}

function buildQrCommand(amount, payload = '') {
  const a = 'Rs. ' + formatAmount(amount);
  return `QR**${a}**Scan to pay**${payload}`;
}

function buildWaitCommand(amount) {
  const a = 'Rs. ' + formatAmount(amount);
  return `WAIT**${a}**Please wait`;
}

function buildSuccessCommand(amount) {
  const a = 'Rs. ' + formatAmount(amount);
  return `PASS**${a}**Payment successful`;
}

function buildFailCommand(amount) {
  const a = 'Rs. ' + formatAmount(amount);
  return `FAIL**${a}**Payment failed`;
}

function buildInfoCommand(message = 'Please visit reception') {
  const m = cleanMessage(message) || 'Please visit reception';
  return `INFO**Infinity Dental**${m}`;
}

function buildWarnCommand(message = 'Please wait') {
  const m = cleanMessage(message) || 'Please wait';
  return `WARN**Device Not Ready**${m}`;
}

function buildWifiCommand(ssid, payload = '') {
  return `QR**Guest Wi-Fi**Scan to Connect**${payload}`;
}

/**
 * Serial Packet Formatters (append \n for direct COM port UART)
 */
function buildIdlePacket() {
  return packetToHex(buildIdleCommand() + '\n');
}

function buildTextPacket(title, subtitle, message) {
  const m = cleanMessage(message || subtitle || title);
  return packetToHex(`TEXT**${cleanMessage(title) || 'Infinity Dental'}**${cleanMessage(subtitle) || 'Welcome'}**${m}\n`);
}

function buildQrPacket(amount, message = 'Scan to pay', payload = '') {
  const a = 'Rs. ' + formatAmount(amount);
  return packetToHex(`QR**${a}**${cleanMessage(message) || 'Scan to pay'}**${payload}\n`);
}

function buildSuccessPacket(amount = '0.00', message = 'Payment successful') {
  const a = (String(amount).startsWith('Rs.') || isNaN(Number(amount))) ? amount : ('Rs. ' + formatAmount(amount));
  return packetToHex(`PASS**${a}**${cleanMessage(message) || 'Payment successful'}\n`);
}

function buildWaitPacket(amount = '0.00') {
  const a = 'Rs. ' + formatAmount(amount);
  return packetToHex(`WAIT**${a}**Please wait\n`);
}

function buildFailPacket(amount = '0.00') {
  const a = 'Rs. ' + formatAmount(amount);
  return packetToHex(`FAIL**${a}**Payment failed\n`);
}

function buildWarnPacket(title, message) {
  return packetToHex(`WARN**${cleanMessage(title) || 'Device Not Ready'}**${cleanMessage(message) || 'Please wait'}\n`);
}

function buildInfoPacket(title, message) {
  return packetToHex(`INFO**${cleanMessage(title) || 'Infinity Dental'}**${cleanMessage(message) || 'Please visit reception'}\n`);
}

function buildWifiQrPacket(ssid, payload) {
  return packetToHex(`QR**Guest Wi-Fi**Scan to Connect**${payload}\n`);
}

function buildWakePacket() {
  return packetToHex('WAKE\n');
}

function buildResetPacket() {
  return packetToHex('RESET\n');
}

function buildClearPacket() {
  return packetToHex('CLEAR\n');
}

function buildFormatPacket() {
  return packetToHex('FORMAT\n');
}

function buildVolumePacket(volume = 100) {
  const v = Math.max(0, Math.min(100, parseInt(volume, 10) || 100));
  return packetToHex(`VOLUME**${v}\n`);
}

function buildBrightnessPacket(brightness = 100) {
  const b = Math.max(0, Math.min(100, parseInt(brightness, 10) || 100));
  return packetToHex(`BRIGHTNESS**${b}\n`);
}

function buildScreenTimePacket(seconds = 300) {
  const s = Math.max(30, Math.min(300, parseInt(seconds, 10) || 300));
  return packetToHex(`SCREENTIME**${s}\n`);
}

module.exports = {
  NIZI_BRIDGE_CONFIG,
  NIZI_CONFIG,
  cleanMessage,
  formatAmount,
  packetToHex,
  // String commands (for HTTP bridge POST /api/command)
  buildIdleCommand,
  buildWelcomeTextCommand,
  buildQrCommand,
  buildWaitCommand,
  buildSuccessCommand,
  buildFailCommand,
  buildInfoCommand,
  buildWarnCommand,
  buildWifiCommand,
  // Serial packets (for direct COM port UART)
  buildIdlePacket,
  buildTextPacket,
  buildQrPacket,
  buildSuccessPacket,
  buildWaitPacket,
  buildFailPacket,
  buildWarnPacket,
  buildInfoPacket,
  buildWifiQrPacket,
  buildWakePacket,
  buildResetPacket,
  buildClearPacket,
  buildFormatPacket,
  buildVolumePacket,
  buildBrightnessPacket,
  buildScreenTimePacket
};
