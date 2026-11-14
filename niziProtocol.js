/**
 * Official NiZi POS B30/B33 Hardware Serial Communication Protocol
 * Extracted directly from official Yarsa Tech / NiZi developer files:
 *  - D:\dental software\nizi b33\B30Sdk.py
 *  - D:\dental software\nizi b33\dynamic_qr_commands.html
 * 
 * Hardware Architecture:
 *  - USB-to-UART Bridge: WCH CH341 / CH340 (VID 0x1A86, PID 0x7523 / 0x5523)
 *  - Baud Rate: 115200 bps
 *  - Framing: 8 Data Bits, No Parity (None), 1 Stop Bit (8-N-1)
 *  - Flow Control: None, DTR=False, RTS=False
 *  - Command Framing: Plain text UTF-8 ASCII delimited by "**" and terminated by newline "\n"
 */

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
 * 1. Dynamic QR Display Command:
 * Format: QR**Rs. <amount>**<message>**<payload>\n
 * Displays 2D QR code on LCD screen with amount and status title.
 */
function buildQrPacket(amount, message = 'SCAN TO PAY', payload = '') {
  let amtStr = '0.00';
  if (amount != null && !isNaN(Number(amount))) {
    amtStr = Number(amount).toFixed(2);
  }
  const str = `QR**Rs. ${amtStr}**${message}**${payload}\n`;
  return packetToHex(str);
}

/**
 * 2. Payment Success Announcement (Screen + Voice Chime):
 * Format: PASS**<title>**<message>\n
 * Triggers physical speaker audio voice broadcast ("Rs. 1500 received") and switches screen to green success badge.
 */
function buildSuccessPacket(title = 'SUCCESS!', message = 'Payment successful') {
  const str = `PASS**${title}**${message}\n`;
  return packetToHex(str);
}

/**
 * 3. Waiting / Loading Screen:
 * Format: WAIT**Rs. <amount>**<message>\n
 */
function buildWaitPacket(amount, message = 'Please wait...') {
  let amtStr = '0.00';
  if (amount != null && !isNaN(Number(amount))) {
    amtStr = Number(amount).toFixed(2);
  }
  const str = `WAIT**Rs. ${amtStr}**${message}\n`;
  return packetToHex(str);
}

/**
 * 4. Payment Failure Screen:
 * Format: FAIL**Rs. <amount>**<message>\n
 */
function buildFailPacket(amount, message = 'Payment Failed') {
  let amtStr = '0.00';
  if (amount != null && !isNaN(Number(amount))) {
    amtStr = Number(amount).toFixed(2);
  }
  const str = `FAIL**Rs. ${amtStr}**${message}\n`;
  return packetToHex(str);
}

/**
 * 5. Standby / Welcome Screen (Logo Display):
 * Format: IDLE\n
 */
function buildIdlePacket() {
  return packetToHex('IDLE\n');
}

/**
 * 6. Free Wi-Fi QR on Screen:
 * Uses official QR framing: QR**FREE WI-FI**<SSID>**<WIFI_ZXING_PAYLOAD>\n
 */
function buildWifiQrPacket(ssid, payload) {
  const str = `QR**FREE WI-FI**${ssid || 'Scan to Connect'}**${payload}\n`;
  return packetToHex(str);
}

/**
 * 7. Text Display:
 * Format: TEXT**<title>**<subtitle>**<message>\n
 */
function buildTextPacket(title, subtitle, message) {
  const str = `TEXT**${title || ''}**${subtitle || ''}**${message || ''}\n`;
  return packetToHex(str);
}

/**
 * 8. Status & Diagnostics:
 * Format: WARN**<title>**<message>\n
 * Format: INFO**<title>**<message>\n
 */
function buildWarnPacket(title, message) {
  return packetToHex(`WARN**${title || ''}**${message || ''}\n`);
}

function buildInfoPacket(title, message) {
  return packetToHex(`INFO**${title || ''}**${message || ''}\n`);
}

/**
 * 9. Device Hardware Controls:
 * - WAKE: wakes up CPU and display
 * - RESET: sleeps / resets device
 * - CLEAR: clears real-time display and restores static image
 * - FORMAT: formats device memory
 * - VOLUME: sets speaker level (0-100)
 * - BRIGHTNESS: sets LCD brightness (0-100)
 * - SCREENTIME: screen on timer (30-300 seconds)
 */
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
  NIZI_CONFIG,
  packetToHex,
  buildQrPacket,
  buildSuccessPacket,
  buildWaitPacket,
  buildFailPacket,
  buildIdlePacket,
  buildWifiQrPacket,
  buildTextPacket,
  buildWarnPacket,
  buildInfoPacket,
  buildWakePacket,
  buildResetPacket,
  buildClearPacket,
  buildFormatPacket,
  buildVolumePacket,
  buildBrightnessPacket,
  buildScreenTimePacket
};

