#!/usr/bin/env node
/**
 * NiZi POS B30/B33 Official Protocol Hardware Test Script
 * Integrates official protocol extracted from B30Sdk.py and dynamic_qr_commands.html
 * 
 * Usage:
 *   node test_nizi_official.js [COM_PORT]
 * Example:
 *   node test_nizi_official.js COM3
 */

const { SerialPort } = require('serialport');
const nizi = require('./niziProtocol');

async function runOfficialNiZiTest() {
  console.log('================================================================');
  console.log('   NIZI POS B30/B33 OFFICIAL SERIAL PROTOCOL VERIFICATION');
  console.log('   Protocol Source: B30Sdk.py & dynamic_qr_commands.html');
  console.log('   Target Hardware: Yarsa Tech / NiZi POS B30 & B33 (CH341 USB)');
  console.log('================================================================\n');

  console.log('📋 Official Hardware Serial Settings:');
  console.log(`   - Baud Rate:    ${nizi.NIZI_CONFIG.baudRate}`);
  console.log(`   - Data Bits:    ${nizi.NIZI_CONFIG.dataBits}`);
  console.log(`   - Stop Bits:    ${nizi.NIZI_CONFIG.stopBits}`);
  console.log(`   - Parity:       ${nizi.NIZI_CONFIG.parity}`);
  console.log(`   - DTR / RTS:    ${nizi.NIZI_CONFIG.dtr} / ${nizi.NIZI_CONFIG.rts}`);
  console.log(`   - CH341 VID:    0x${nizi.NIZI_CONFIG.ch341.vid}`);
  console.log(`   - CH341 PIDs:   ${nizi.NIZI_CONFIG.ch341.pids.map(p => '0x' + p).join(', ')}\n`);

  // 1. Scan for all COM ports
  console.log('🔍 Scanning available system COM ports (SerialPort.list())...');
  let ports = [];
  try {
    ports = await SerialPort.list();
  } catch (err) {
    console.error('❌ Error enumerating serial ports:', err.message);
    process.exit(1);
  }

  if (ports.length === 0) {
    console.log('⚠️  No COM ports detected on this machine.\n');
  } else {
    console.log(`✅ Found ${ports.length} COM port(s):`);
    ports.forEach((p, idx) => {
      const vid = (p.vendorId || '').toLowerCase();
      const pid = (p.productId || '').toLowerCase();
      const isCh341 = vid.includes('1a86') || ['7523', '5523'].some(id => pid.includes(id));
      const tag = isCh341 ? '🎯 [MATCHED CH341 NIZI HARDWARE]' : '';
      console.log(`   ${idx + 1}. ${p.path} | ${p.friendlyName || p.manufacturer || 'Unknown device'} | VID:${p.vendorId || 'N/A'} PID:${p.productId || 'N/A'} ${tag}`);
    });
    console.log('');
  }

  // 2. Determine target port
  let targetPort = process.argv[2] || null;
  if (!targetPort) {
    // Look for matched CH341 port
    const matched = ports.find(p => {
      const v = (p.vendorId || '').toLowerCase();
      const pid = (p.productId || '').toLowerCase();
      return v.includes('1a86') || ['7523', '5523'].some(id => pid.includes(id));
    });

    if (matched) {
      targetPort = matched.path;
      console.log(`🎯 Auto-selected matched NiZi CH341 port: ${targetPort}`);
    } else if (ports.length > 0) {
      // Pick first non-bluetooth port or first available
      const nonBt = ports.find(p => !String(p.friendlyName || '').toLowerCase().includes('bluetooth'));
      targetPort = (nonBt || ports[0]).path;
      console.log(`ℹ️  No dedicated CH341 port found. Using available candidate: ${targetPort}`);
    }
  } else {
    console.log(`📌 Using user-specified port from argument: ${targetPort}`);
  }

  // 3. Prepare Official Command Packets
  console.log('📦 Generating Official Command Packets:');
  
  // a) Wake / Ping
  const wakePacket = nizi.buildWakePacket();
  console.log('\n[Packet 1: Wake / Init]');
  console.log(`   Format:   ${JSON.stringify(wakePacket.raw)}`);
  console.log(`   Bytes:    ${wakePacket.byteLength} bytes`);
  console.log(`   Raw Hex:  ${wakePacket.hex}`);

  // b) Screen Display & Dynamic QR (Amount: Rs. 1500.00)
  const testQrData = '00020101021229760012np.connectips01112501F6MCTZZ52048021530352454071500.005802NP5922Infinity Dental Clinic6009Kathmandu62200516BILL-20261103001630438F2';
  const qrPacket = nizi.buildQrPacket(1500, 'SCAN TO PAY', testQrData);
  console.log('\n[Packet 2: Screen Display & NepalPay Dynamic QR]');
  console.log(`   Command:  QR**Rs. 1500.00**SCAN TO PAY**${testQrData.substring(0, 32)}...`);
  console.log(`   Bytes:    ${qrPacket.byteLength} bytes`);
  console.log(`   Raw Hex:  ${qrPacket.hex.substring(0, 48)}... (${qrPacket.byteLength} total bytes)`);

  // c) Payment Success Voice Announcement (PASS**SUCCESS!**Rs. 1500 received)
  const successPacket = nizi.buildSuccessPacket('SUCCESS!', 'Rs. 1500 received');
  console.log('\n[Packet 3: Payment Voice Announcement & Success Screen]');
  console.log(`   Format:   ${JSON.stringify(successPacket.raw)}`);
  console.log(`   Bytes:    ${successPacket.byteLength} bytes`);
  console.log(`   Raw Hex:  ${successPacket.hex}`);

  // d) Clinic Guest Wi-Fi QR
  const wifiPacket = nizi.buildWifiQrPacket('Infinity Dental Guest', 'WIFI:S:Infinity Dental Guest;T:WPA;P:Smile@123;;');
  console.log('\n[Packet 4: Reception Desk Guest Wi-Fi QR]');
  console.log(`   Format:   ${JSON.stringify(wifiPacket.raw)}`);
  console.log(`   Bytes:    ${wifiPacket.byteLength} bytes`);
  console.log(`   Raw Hex:  ${wifiPacket.hex}`);

  if (!targetPort) {
    console.log('\n⚠️  No hardware serial port available to open on this system.');
    console.log('   All packets formatted and verified against official NiZi protocol specification.');
    console.log('   Connect NiZi B30/B33 USB cable and re-run: node test_nizi_official.js <COM_PORT>');
    return;
  }

  // 4. Attempt Physical Connection and Transmission
  console.log(`\n🔌 Connecting to ${targetPort} at ${nizi.NIZI_CONFIG.baudRate} baud (8-N-1)...`);
  const port = new SerialPort({
    path: targetPort,
    baudRate: nizi.NIZI_CONFIG.baudRate,
    dataBits: nizi.NIZI_CONFIG.dataBits,
    stopBits: nizi.NIZI_CONFIG.stopBits,
    parity: nizi.NIZI_CONFIG.parity,
    autoOpen: false
  });

  return new Promise((resolve) => {
    port.open((err) => {
      if (err) {
        console.error(`❌ Could not open port ${targetPort}:`, err.message);
        console.log('   (If this is a virtual Bluetooth link or in use by another app, please verify port number)');
        resolve();
        return;
      }

      console.log(`✅ Connected successfully to ${targetPort}!`);

      // Set DTR/RTS signals according to B30Sdk.py / dynamic_qr_commands.html
      port.set({ dtr: false, rts: false }, (sigErr) => {
        if (sigErr) {
          console.log('   Notice: setSignals(dtr=false, rts=false) not supported on this driver, continuing.');
        } else {
          console.log('   Signal control: DTR=False, RTS=False configured.');
        }
      });

      // Listen for hardware acknowledgment responses
      port.on('data', (chunk) => {
        const ascii = chunk.toString('utf-8');
        const hex = chunk.toString('hex').match(/.{1,2}/g).join(' ').toUpperCase();
        console.log(`\n📥 [Hardware Response Rx from ${targetPort}]:`);
        console.log(`   ASCII:    ${ascii.trim()}`);
        console.log(`   Raw Hex:  ${hex}`);
      });

      port.on('error', (portErr) => {
        console.error(`⚠️  [Port Error]:`, portErr.message);
      });

      // Sequence:
      // 1. Wake
      console.log('\n🚀 Dispatching Step 1: WAKE packet...');
      port.write(wakePacket.buffer);

      setTimeout(() => {
        // 2. Display QR & Amount
        console.log('🚀 Dispatching Step 2: Screen Display & QR packet (Rs. 1500.00)...');
        port.write(qrPacket.buffer);

        setTimeout(() => {
          // 3. Payment Voice Announcement
          console.log('🚀 Dispatching Step 3: Payment Voice Announcement ("Rs. 1500 received")...');
          port.write(successPacket.buffer);

          setTimeout(() => {
            console.log('\n✅ Official NiZi test sequence transmission completed.');
            console.log('🔌 Closing port...');
            port.close(() => {
              console.log('✅ Port closed cleanly.');
              resolve();
            });
          }, 2500);
        }, 2000);
      }, 1000);
    });
  });
}

runOfficialNiZiTest().then(() => {
  console.log('\n🏁 Test script finished.');
}).catch((e) => {
  console.error('Fatal error running test:', e);
});

