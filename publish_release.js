const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function getGitToken() {
  try {
    const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
    const line = out.split('\n').find(l => l.startsWith('password='));
    return line ? line.slice(9).trim() : null;
  } catch (e) {
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
  }
}

async function uploadAsset(token, repo, releaseId, filePath, assetName) {
  const stat = fs.statSync(filePath);
  console.log(`Uploading ${assetName} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)...`);

  return new Promise((resolve, reject) => {
    const url = new URL(`https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'InfinityDentalClinic-Releaser',
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size
      }
    };

    let uploaded = 0;
    let lastLog = 0;

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[OK] Successfully uploaded ${assetName}`);
          resolve(JSON.parse(body));
        } else {
          console.error(`[FAIL] ${assetName} HTTP ${res.statusCode}:`, body);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);

    const fileStream = fs.createReadStream(filePath);
    fileStream.on('data', (chunk) => {
      uploaded += chunk.length;
      const now = Date.now();
      if (now - lastLog > 3000 || uploaded === stat.size) {
        lastLog = now;
        console.log(`  -> ${(uploaded / (1024 * 1024)).toFixed(1)} / ${(stat.size / (1024 * 1024)).toFixed(1)} MB (${Math.round(uploaded / stat.size * 100)}%)`);
      }
    });

    fileStream.pipe(req);
  });
}

async function publishRelease() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const version = pkg.version;
  const tag = 'v' + version;
  const repo = 'paudelsankalpa33-create/infinity-dental';

  console.log('========================================================');
  console.log(`Publishing Client Release for Infinity Dental Clinic`);
  console.log(`Version: ${version} (Tag: ${tag})`);
  console.log(`Repository: https://github.com/${repo}`);
  console.log('========================================================');

  const token = getGitToken();
  if (!token) {
    console.error('Error: Could not retrieve GitHub credentials from Git Credential Manager or GH_TOKEN.');
    process.exit(1);
  }

  // Check if binaries exist
  const releaseDir = path.join(__dirname, 'release');
  const fullSetupFile = path.join(releaseDir, `Infinity Dental Clinic Setup ${version}.exe`);
  const portableFile = path.join(releaseDir, `Infinity Dental Clinic ${version}.exe`);
  const fastPatchFile = path.join(releaseDir, `Infinity.Dental.Clinic.FastPatch.${version}.exe`);

  if (!fs.existsSync(fullSetupFile) || !fs.existsSync(portableFile)) {
    console.log(`Building Windows distribution (npm run dist)...`);
    execSync('npm run dist', { stdio: 'inherit', cwd: __dirname });
  }

  // Compile FastPatch installer with NSIS
  const makensisExe = 'C:\\Users\\user\\AppData\\Local\\electron-builder\\Cache\\nsis-3.0.4.1\\nsis-3.0.4.1-1mx3n\\Bin\\makensis.exe';
  if (fs.existsSync(makensisExe)) {
    console.log(`Compiling FastPatch installer with NSIS: ${fastPatchFile}...`);
    execSync(`"${makensisExe}" build_fast_patch.nsi`, { stdio: 'inherit', cwd: __dirname });
  }

  // Ensure git commits & tag are pushed
  try {
    console.log('Pushing latest git commits and tags...');
    execSync('git push origin main --tags', { stdio: 'inherit', cwd: __dirname });
  } catch (e) {
    console.log('Git push notice:', e.message);
  }

  // Check if release already exists
  console.log(`Checking existing GitHub releases for tag ${tag}...`);
  const listRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    headers: { 'Authorization': 'token ' + token, 'User-Agent': 'InfinityDentalClinic-Releaser' }
  });
  const releases = await listRes.json();
  let release = Array.isArray(releases) ? releases.find(r => r.tag_name === tag) : null;

  const releaseNotes = `## Infinity Dental Clinic Update ${tag}

Official client release. Fast in-app updater compatible.
Patient database in C:\\Infiinity Dental Clinic is preserved.

### What's New in ${tag}:
- **Operations & Inventory Layout Fix**: Fixed premature DOM closure tag that previously pushed Purchases & Inventory, Stocks, and Staff sections into the bottom footer row. All operation pages now render right at the top of the main workspace alongside the navigation sidebar.
- **Patient Profile Add Visit & Save Fix**: Ensured the ADD VISIT & SAVE button is always active and enabled. Auto-stages general dental consultation/visit even if no procedure was pre-selected, syncs Next Appointment in one click, and opens the A5 bill immediately without native modal lockups.
- **Official Clinic Contact Numbers & Email Everywhere**: Added phone numbers **9768592344, 01-4514888** and official email **The.infinity.dental@gmail.com** across printed A5 bills, OPD stickers, PDF reports, settings, login screen, and billing header.
- **Official Clinic Website Promotion**: Added clickable clinic website promotion (**www.infinitydentalclinic.com.np**) in the navigation sidebar, login page, A5 invoice header & footer, and settings modal.
- **Billing & POS Terminal Overhaul**: Comprehensive patient checkout workspace for managers and superadmins, displaying registered patient details (OPD, contact, address, visit count, balance due), quick procedure presets, staged treatment items, mutual % and amount discount calculation, full/partial/due recording, dynamic QR/Cash/Card payments, and invoice history with 1-click A5 reprint and due balance collection.
- **Official Clinic PAN & Address**: Clinic PAN **125302054** and Address **Dhumbarahi, Kathmandu** integrated across all bills, stickers, PDF records, registration forms, and settings.
- **Strict A5 Single-Page Bill Layout**: Standardized all patient bills to fit cleanly on a single sheet of A5 paper (148mm × 210mm) with compact proportions and zero multi-page spills.
- **Official Clinic Stamp Feature in Settings**: Configure and toggle an official clinic stamp on all printed patient bills, with support for custom transparent PNG/JPG stamp uploads or the built-in circular clinic seal (INFINITY DENTAL CLINIC • DHUMBARAHI, KATHMANDU • PAN: 125302054).
- **Instant In-App Updater**: Fast 0.6MB patch with zero permission errors and automatic restart.`;

  if (!release) {
    console.log(`Creating new GitHub Release for ${tag}...`);
    const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
      method: 'POST',
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'InfinityDentalClinic-Releaser',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tag_name: tag,
        name: `Infinity Dental Clinic ${tag}`,
        body: releaseNotes,
        draft: false,
        prerelease: false
      })
    });
    release = await createRes.json();
    console.log(`Release created successfully! (ID: ${release.id})`);
  } else {
    console.log(`Release ${tag} already exists (ID: ${release.id}). Checking assets...`);
  }

  const existingAssets = release.assets || [];
  const setupAssetName = `Infinity.Dental.Clinic.Setup.${version}.exe`;
  const fastPatchAssetName = `Infinity.Dental.Clinic.FastPatch.${version}.exe`;
  const fullSetupAssetName = `Infinity.Dental.Clinic.Full.Setup.${version}.exe`;
  const portableAssetName = `Infinity.Dental.Clinic.Standalone.Portable.${version}.exe`;

  // 1. Upload Setup installer (FastPatch as primary Setup for ultra-fast, zero-error updates)
  const installerToUse = fs.existsSync(fastPatchFile) ? fastPatchFile : fullSetupFile;
  const hasSetup = existingAssets.some(a => a.name === setupAssetName);
  if (!hasSetup && fs.existsSync(installerToUse)) {
    await uploadAsset(token, repo, release.id, installerToUse, setupAssetName);
  } else if (hasSetup) {
    console.log(`Setup asset ${setupAssetName} already present.`);
  }

  // 2. Upload FastPatch asset
  const hasFastPatch = existingAssets.some(a => a.name === fastPatchAssetName);
  if (!hasFastPatch && fs.existsSync(fastPatchFile)) {
    await uploadAsset(token, repo, release.id, fastPatchFile, fastPatchAssetName);
  } else if (hasFastPatch) {
    console.log(`FastPatch asset ${fastPatchAssetName} already present.`);
  }

  // 3. Upload Full Setup installer (if different from FastPatch)
  const hasFullSetup = existingAssets.some(a => a.name === fullSetupAssetName);
  if (!hasFullSetup && fs.existsSync(fullSetupFile) && fullSetupFile !== installerToUse) {
    await uploadAsset(token, repo, release.id, fullSetupFile, fullSetupAssetName);
  } else if (hasFullSetup) {
    console.log(`Full Setup asset ${fullSetupAssetName} already present.`);
  }

  // 4. Upload Portable exe
  const hasPortable = existingAssets.some(a => a.name === portableAssetName);
  if (!hasPortable && fs.existsSync(portableFile)) {
    await uploadAsset(token, repo, release.id, portableFile, portableAssetName);
  } else if (hasPortable) {
    console.log(`Portable asset ${portableAssetName} already present.`);
  }

  console.log('========================================================');
  console.log(`🎉 RELEASE ${tag} IS LIVE ON GITHUB!`);
  console.log(`Client computers will now detect and download this update.`);
  console.log('========================================================');
}

publishRelease().catch(err => {
  console.error('Failed to publish release:', err);
  process.exit(1);
});
