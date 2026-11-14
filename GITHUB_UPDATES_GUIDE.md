# GitHub Client Updates Guide - Infinity Dental Clinic
======================================================

This guide explains how to release new updates to client computers through GitHub.

---

## 1. How It Works

1. **You push a new release to GitHub**:
   - For example: tag `v1.0.1` with the compiled Windows installer (`Infinity Dental Clinic Setup 1.0.1.exe`).
2. **Client computers check for updates**:
   - **Automatic background check**: The app checks GitHub Releases automatically on startup. If a new version exists, an update banner appears across the top:
     `🚀 Software Update Available! v1.0.1 is available on GitHub. [VIEW & UPDATE]`
   - **Manual check**: The clinic receptionist or administrator can click the **🔄 Updates (v1.0.0)** button in the top header at any time.
3. **One-Click Update**:
   - In the update popup, the client can read the release notes and click **⬇ DOWNLOAD & INSTALL UPDATE**.
   - It downloads the latest installer directly from your GitHub Releases and updates the clinic app while preserving all patient data intact in `C:\Infiinity Dental Clinic`.

---

## 2. Configured GitHub Repository

Your GitHub repository is now configured in the software:
- **Repository URL**: `https://github.com/paudelsankalpa33-create/infinity-dental`
- **Owner**: `paudelsankalpa33-create`
- **Repo**: `infinity-dental`

This is set in `package.json`, `main.js`, and `app.js`. Whenever you publish a new release tag (e.g. `v1.0.9`) on `https://github.com/paudelsankalpa33-create/infinity-dental/releases`, all client PCs running this app will automatically detect it and prompt the user to update.

---

## 3. How to Publish an Update (Step-by-Step)

### Step 1: Bump the version number
Open `package.json` and change `"version"`:
```json
"version": "1.0.1"
```

### Step 2: Build the new Windows release
Run the build script:
```powershell
npm run dist
```
*(Or double click `BUILD_WINDOWS.bat`)*

This creates the installer files in the `release/` folder:
- `Infinity Dental Clinic Setup 1.0.1.exe` (NSIS Installer)
- `Infinity Dental Clinic 1.0.1.exe` (Portable version)

### Step 3: Publish to GitHub Releases

#### Option A: Using the GitHub Website (Easiest)
1. Go to your repository on GitHub: `https://github.com/YOUR_USERNAME/YOUR_REPO`.
2. Click on **Releases** > **Draft a new release**.
3. In **Choose a tag**, enter `v1.0.1` (click *Create new tag*).
4. Enter a **Release title** (e.g., `Version 1.0.1 - Bug fixes & performance update`).
5. In the description, type your release notes.
6. Drag and drop `Infinity Dental Clinic Setup 1.0.1.exe` from your local `release/` folder into the binaries/assets box.
7. Click **Publish release**.

#### Option B: Using GitHub CLI (`gh`)
```powershell
git tag v1.0.1
git push origin v1.0.1
gh release create v1.0.1 "release/Infinity Dental Clinic Setup 1.0.1.exe" --title "Version 1.0.1" --notes "NiZi POS USB auto-connect and patient picture updates"
```

#### Option C: Automatic Publish with electron-builder
Set your `GH_TOKEN` environment variable in Windows PowerShell:
```powershell
$env:GH_TOKEN="ghp_yourPersonalAccessTokenHere"
npx electron-builder --win --publish always
```

---

## 4. Patient Data Safety During Updates

All clinic data is stored completely outside the app's installation folder:
```
C:\Infiinity Dental Clinic\
    Database\
        InfinityDentalClinic.sqlite
    Bills\
    Patient Documents\
    Patient Registrations\
    Backups\
    price-list.json
```
When a client updates the application:
- **No patient records are ever lost or modified.**
- The SQLite database and price list remain completely intact.

---

## 5. Summary of Completed Improvements

1. **NiZi POS B33 Auto-Detection & Auto-Connect**:
   - Web Serial API session handlers added to `main.js` (`select-serial-port`, `setPermissionCheckHandler`, `setDevicePermissionHandler`).
   - Fixed `Failed to execute 'requestPort' on 'Serial': No port selected by the user`.
   - The app now automatically searches and connects to the USB soundbox upon launch and whenever the USB cable is plugged in (hotplug support).
2. **Patient Pictures & Dental X-Rays**:
   - The upload section now supports dental photographs, intraoral pictures, and radiographs (`.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`) as well as PDFs.
   - High-resolution Lightbox viewer with **Zoom In/Out**, **Rotate 90°**, **Print**, and **Download**.
3. **Picture & Watermark Fixes**:
   - Eliminated solid white background artifact on the dashboard watermark using transparent PNG and CSS blend modes.
   - High-contrast `.nizi-logo-badge` on the NiZi POS screen mock for crisp visibility.
   - Base64 preloaded logo to guarantee zero missing image issues in printed bills and stickers.
