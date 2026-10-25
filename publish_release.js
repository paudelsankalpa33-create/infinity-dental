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
  const repo = 'paudelsankalpa33-create/dental-';

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
  const setupFile = path.join(releaseDir, `Infinity Dental Clinic Setup ${version}.exe`);
  const portableFile = path.join(releaseDir, `Infinity Dental Clinic ${version}.exe`);

  if (!fs.existsSync(setupFile)) {
    console.log(`Installer binary not found at: ${setupFile}`);
    console.log('Building Windows distribution (npm run dist)...');
    execSync('npm run dist', { stdio: 'inherit', cwd: __dirname });
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
        body: `## Infinity Dental Clinic Update ${tag}\r\n\r\nOfficial client release. In-app updater compatible.\r\nPatient database in C:\\Infiinity Dental Clinic is preserved.`,
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
  const portableAssetName = `Infinity.Dental.Clinic.Standalone.Portable.${version}.exe`;

  // 1. Upload Setup installer
  const hasSetup = existingAssets.some(a => a.name === setupAssetName);
  if (!hasSetup && fs.existsSync(setupFile)) {
    await uploadAsset(token, repo, release.id, setupFile, setupAssetName);
  } else if (hasSetup) {
    console.log(`Setup asset ${setupAssetName} already present.`);
  }

  // 2. Upload Portable exe
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
