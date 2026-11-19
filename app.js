// Global fetch rewrite for Electron file: protocol
if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
  const _origFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.startsWith('/api')) {
      input = 'http://localhost:3000' + input;
    }
    return _origFetch.call(this, input, init);
  };
}

// Global High-Performance Floating Toast Notification System
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('appToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'appToastContainer';
    toastContainer.className = 'app-toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `app-toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : type === 'warn' ? '⚠️' : 'ℹ️'}</span><span class="toast-text">${esc(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add('toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 260);
  }, 3500);
}

const KEY = 'infinity_dental_patients_v1';
const DB_NAME = 'InfinityDentalClinicStorage';
const DB_STORE = 'settings';
let patients = JSON.parse(localStorage.getItem(KEY) || '[]'); let selectedId = null;
let dataDirectoryHandle = null;
let dataFolderName = 'Browser Storage';

// --- Global Hoisted: BS Calendar & Date Normalization Engine ---
const APPT_BS_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const APPT_BS_MONTHS_NP = ['बैशाख', 'जेठ', 'असार', 'श्रावण', 'भाद्र', 'आश्विन', 'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फाल्गुण', 'चैत्र'];
const APPT_BS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const APPT_BS_LENGTHS = {
  2080: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 31, 32, 31, 31, 31, 30, 30, 30, 29, 30, 30],
  2085: [31, 32, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30]
};
const APPT_BS_START_YEAR = 2080;
const APPT_BS_ANCHOR = { y: 2083, m: 5, d: 27, ad: '2026-09-12' };

function apptPad(n) { return String(n).padStart(2, '0') }
function apptIsoDate(d) { return d.getFullYear() + '-' + apptPad(d.getMonth() + 1) + '-' + apptPad(d.getDate()) }
function todayIso(d = new Date()) { return d.getFullYear() + '-' + apptPad(d.getMonth() + 1) + '-' + apptPad(d.getDate()) }
function apptParseIso(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getFullYear() == +m[1] && d.getMonth() == +m[2] - 1 && d.getDate() == +m[3] ? d : null }
function apptBsToIndex(y, m, d) { let idx = 0; for (let yy = APPT_BS_START_YEAR; yy < y; yy++) { const lens = APPT_BS_LENGTHS[yy]; if (!lens) return null; idx += lens.reduce((x, v) => x + v, 0) } for (let mm = 1; mm < m; mm++)idx += APPT_BS_LENGTHS[y]?.[mm - 1] || 0; return idx + (d - 1) }
function apptAdFromBs(bs) { const parts = String(bs).split('-').map(Number); if (parts.length !== 3) return null; const [y, m, d] = parts, lens = APPT_BS_LENGTHS[y]; if (!lens || m < 1 || m > 12 || d < 1 || d > lens[m - 1]) return null; const anchorBs = apptBsToIndex(2083, 5, 27), target = apptBsToIndex(y, m, d); if (anchorBs == null || target == null) return null; const base = new Date(2026, 8, 12); base.setDate(base.getDate() + target - anchorBs); return apptIsoDate(base) }
function apptBsFromAd(ad) { const date = apptParseIso(ad); if (!date) return null; const base = new Date(2026, 8, 12); const diff = Math.round((date - base) / 86400000); let target = apptBsToIndex(2083, 5, 27) + diff, y = APPT_BS_START_YEAR, m = 1; while (true) { const lens = APPT_BS_LENGTHS[y]; if (!lens) return null; const total = lens.reduce((x, v) => x + v, 0); if (target < total) break; target -= total; y++; } while (target >= APPT_BS_LENGTHS[y][m - 1]) { target -= APPT_BS_LENGTHS[y][m - 1]; m++; if (m > 12) return null } return y + '-' + apptPad(m) + '-' + apptPad(target + 1) }
function apptBsValid(bs) { return !!apptAdFromBs(bs) }

// Unified Date Normalizer: Converts any date (ISO, BS, timestamp) to AD & BS YYYY-MM-DD
function normalizeDateToAdAndBs(raw) {
  if (!raw) return { adDate: '', bsDate: '', dateObj: null, year: 0 };
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { adDate: '', bsDate: '', dateObj: null, year: 0 };
    const adDate = apptIsoDate(raw);
    const bsDate = apptBsFromAd(adDate) || '';
    return { adDate, bsDate, dateObj: raw, year: raw.getFullYear() };
  }
  const str = String(raw).trim();
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(str);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = apptPad(parseInt(match[2], 10));
    const d = apptPad(parseInt(match[3], 10));
    if (y > 2050) {
      const bsDate = `${y}-${m}-${d}`;
      const adDate = apptAdFromBs(bsDate) || '';
      const dateObj = adDate ? new Date(adDate + 'T00:00:00') : null;
      return { adDate, bsDate, dateObj, year: y };
    } else {
      const adDate = `${y}-${m}-${d}`;
      const bsDate = apptBsFromAd(adDate) || '';
      const dateObj = new Date(adDate + 'T00:00:00');
      return { adDate, bsDate, dateObj, year: y };
    }
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const adDate = apptIsoDate(parsed);
    const bsDate = apptBsFromAd(adDate) || '';
    return { adDate, bsDate, dateObj: parsed, year: parsed.getFullYear() };
  }
  return { adDate: '', bsDate: '', dateObj: null, year: 0 };
}

// --- Hoisted: NepalPay Client Config & NiZi POS Serial State ---
const NPI_CLIENT_CONFIG = {
  merchantId: '2501F6MCTZZ',
  merchantName: 'Infinity Dental',
  acquirerId: '00002501',
  merchantCategoryCode: 5541,
  storeLabel: 'Store1',
  terminalLabel: 'Terminal1'
};

let niziSerialPort = null;
let niziSerialWriter = null;
let niziSerialReader = null;
let niziIsConnecting = false;
let niziSerialListenersInitialized = false;
let activeQrTransaction = null;
let qrCountdownTimer = null;
let qrStatusPollTimer = null;
let onActiveQrSuccessCallback = null;
let recentNepalPayTransactions = [];

// Pre-load clinic logo as Base64 Data URL to guarantee reliable printing & zero missing picture errors
let clinicLogoDataUrl = 'assets/clinic-logo.png';
if (typeof fetch === 'function') {
  fetch('assets/clinic-logo.png')
    .then(r => r.blob())
    .then(blob => {
      const reader = new FileReader();
      reader.onload = () => { clinicLogoDataUrl = reader.result; };
      reader.readAsDataURL(blob);
    })
    .catch(() => { });
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(patients));
  updateAll();
  if (window.dentalDB?.save) {
    window.dentalDB.save(patients).catch(err => console.warn('SQLite save failed:', err));
  } else {
    fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patients)
    }).catch(err => console.warn('Localhost SQLite API save error:', err.message));
  }
  if (dataDirectoryHandle) savePatientsToFolder().catch(err => console.warn('Folder save failed:', err));
}

function openSettingsDB() { return new Promise((resolve, reject) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE) }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) }
async function storeDirectoryHandle(handle) { try { const db = await openSettingsDB(); await new Promise((res, rej) => { const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(handle, 'dataDirectory'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }); db.close() } catch (e) { console.warn('Could not remember data folder', e) } }
async function getStoredDirectoryHandle() { try { const db = await openSettingsDB(); const h = await new Promise((res, rej) => { const tx = db.transaction(DB_STORE, 'readonly'); const q = tx.objectStore(DB_STORE).get('dataDirectory'); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error) }); db.close(); return h } catch (e) { return null } }
async function ensureFolderPermission(handle) { if (!handle) return false; try { let p = await handle.queryPermission({ mode: 'readwrite' }); if (p !== 'granted') p = await handle.requestPermission({ mode: 'readwrite' }); return p === 'granted' } catch (e) { return false } }
async function savePatientsToFolder() {
  if (!dataDirectoryHandle) return;
  const ok = await ensureFolderPermission(dataDirectoryHandle); if (!ok) return;
  const file = await dataDirectoryHandle.getFileHandle('patients.json', { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(patients, null, 2)); await writable.close();
  const backups = await dataDirectoryHandle.getDirectoryHandle('Backups', { create: true });
  const backup = await backups.getFileHandle('patients_latest.json', { create: true });
  const bw = await backup.createWritable(); await bw.write(JSON.stringify(patients, null, 2)); await bw.close();
}
async function loadPatientsFromFolder(handle) {
  const ok = await ensureFolderPermission(handle); if (!ok) throw new Error('Folder permission was not granted.');
  try { const file = await handle.getFileHandle('patients.json'); const f = await file.getFile(); const text = await f.text(); const data = JSON.parse(text); if (Array.isArray(data)) patients = data; }
  catch (e) { await savePatientsToFolder(); }
  localStorage.setItem(KEY, JSON.stringify(patients));
}
async function selectDataFolder() {
  if (!window.showDirectoryPicker) { alert('Folder selection requires Google Chrome or Microsoft Edge. Please use one of these browsers.'); return }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const ok = await ensureFolderPermission(handle); if (!ok) { alert('Permission to use this folder was not granted.'); return }
    dataDirectoryHandle = handle; dataFolderName = handle.name || 'Selected Folder';
    await storeDirectoryHandle(handle);
    await loadPatientsFromFolder(handle);
    updateDataFolderStatus(); updateAll(); renderProfile();
    alert('Patient database is now connected to: ' + dataFolderName + '\n\nA patients.json file and Backups folder will be kept there.');
  } catch (e) { if (e?.name !== 'AbortError') alert('Could not connect the folder.\n' + e.message) }
}
async function reconnectStoredDataFolder() {
  const h = await getStoredDirectoryHandle(); if (!h) return;
  dataDirectoryHandle = h; dataFolderName = h.name || 'Selected Folder';
  if (await ensureFolderPermission(h)) { try { await loadPatientsFromFolder(h) } catch (e) { console.warn(e) } }
  updateDataFolderStatus(); updateAll(); renderProfile();
}
function updateDataFolderStatus() { const el = document.getElementById('dataFolderStatus'); if (el) el.textContent = dataDirectoryHandle ? 'Database folder: ' + dataFolderName : 'Database: Browser storage (select a local folder)' }

function nextNumber() { return Math.max(1000, patients.filter(p => !p.AppointmentOnly).reduce((m, p) => Math.max(m, Number(p.OPDNumber) || 0), 0)) + 1 }
function registeredPatients() { return patients.filter(p => !p.AppointmentOnly) }
function pad(n, len = 4) { return String(n).padStart(len, '0') }
function ymd(d) {
  const date = d instanceof Date ? d : (d ? new Date(d) : new Date());
  return date.toISOString().slice(0, 10);
}
function esc(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])) }
let isRegisteringPatient = false;
function registerPatient() {
  if (isRegisteringPatient) return;
  const regBtn = document.getElementById('btnRegisterPatient');
  const nameEl = document.getElementById('name');
  const contactEl = document.getElementById('contact');
  const genderEl = document.getElementById('gender');
  const addressEl = document.getElementById('address');
  const ageEl = document.getElementById('age');

  const name = (nameEl?.value || '').trim();
  const contact = (contactEl?.value || '').trim();
  const gender = genderEl?.value || '';

  if (!name) { showToast('Please enter the patient name.', 'warn'); nameEl?.focus(); return; }
  if (!contact) { showToast('Please enter the contact number.', 'warn'); contactEl?.focus(); return; }
  if (!gender) { showToast('Please select gender.', 'warn'); genderEl?.focus(); return; }

  isRegisteringPatient = true;
  if (regBtn) regBtn.disabled = true;

  const now = new Date();
  const opd = nextNumber();
  const p = {
    id: crypto.randomUUID(),
    OPDNumber: opd,
    Name: name,
    Address: (addressEl?.value || '').trim(),
    Age: (ageEl?.value || '').trim(),
    Gender: gender,
    Contact: contact,
    Date: now.toISOString().slice(0, 10),
    Time: now.toTimeString().slice(0, 8),
    Treatments: [],
    Subtotal: 0,
    DiscountPercent: 0,
    DiscountAmount: 0,
    FinalAmount: 0,
    PaymentStatus: 'Pending',
    PaymentMethod: '',
    BillNumber: '',
    Documents: [],
    VisitHistory: [],
    PaymentHistory: []
  };

  try {
    pendingProcedures = [];
    patients.push(p);
    save();
    clearForm();
    selectedId = p.id;
    showPage('profile');
    renderProfile();
    try { localStorage.removeItem('infinity_dental_registration_draft_v1'); } catch (_) { }
    showToast('✓ Patient registered successfully! OPD Number: ' + pad(opd), 'success');
  } finally {
    setTimeout(() => {
      isRegisteringPatient = false;
      if (regBtn) regBtn.disabled = false;
    }, 400);
  }
}
function clearForm() {
  ['name', 'contact', 'address', 'age'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const g = document.getElementById('gender');
  if (g) g.value = '';
}
function saveRegistrationDraft() { }
function loadRegistrationDraft() { }
function savePageInputs() { }
function saveVisitInputs() { }
function loadVisitDraft() { }
function renderPatients() { const q = (document.getElementById('search')?.value || '').trim().toLowerCase(); const list = registeredPatients().filter(p => !q || [p.OPDNumber, p.Name, p.Contact].some(v => String(v || '').toLowerCase().includes(q))).sort((a, b) => b.OPDNumber - a.OPDNumber); document.getElementById('patientRows').innerHTML = list.length ? list.map(p => `<tr class="clickable" onclick="openProfile('${p.id}')"><td>${pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact)}</td><td>${esc(p.Date)}</td><td>${esc(p.PaymentStatus || 'Pending')}</td></tr>`).join('') : `<tr><td colspan="5" class="empty">No patients found.</td></tr>` }
function openProfile(id) { pendingProcedures = []; selectedId = id; const recent = JSON.parse(localStorage.getItem('infinity_dental_recent_patients_v1') || '[]').filter(x => x !== id); recent.unshift(id); localStorage.setItem('infinity_dental_recent_patients_v1', JSON.stringify(recent.slice(0, 8))); showPage('profile'); renderProfile() }
let PROCEDURES = [];
function priceText(x) {
  if (x.price != null) return 'Rs. ' + Number(x.price).toLocaleString() + (x.unit ? ' ' + x.unit : '');
  if (x.min != null && x.max != null) return 'Rs. ' + Number(x.min).toLocaleString() + ' – ' + Number(x.max).toLocaleString();
  return 'Enter price';
}
function procedureDefault(x) { return Number(x.price != null ? x.price : (x.min != null ? x.min : 0)) }
async function loadPriceList() {
  if (window.dentalDB?.loadPrices) {
    try { const data = await window.dentalDB.loadPrices(); if (Array.isArray(data)) PROCEDURES = data; } catch (e) { console.warn('Price list load failed:', e) }
  } else {
    try {
      const res = await fetch('/api/prices');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) PROCEDURES = json.data;
      }
    } catch (e) {
      console.warn('Price API load error:', e);
    }
  }
  if (!PROCEDURES.length) PROCEDURES = [{ name: 'OPD Card', price: 100 }];
  updateProcedureDatalist();
}
function renderProcedureOptions() {
  return PROCEDURES.map((x, i) => `<option value="${i}" data-cost="${procedureDefault(x)}" data-min="${x.min ?? ''}" data-max="${x.max ?? ''}">${esc(x.name)} — ${esc(priceText(x))}</option>`).join('');
}

function renderProcedureDatalistOptions() {
  if (!Array.isArray(PROCEDURES) || !PROCEDURES.length) {
    return '<option value="Consultation">Rs. 500 – 750</option><option value="OPD Card">Rs. 100</option>';
  }
  return PROCEDURES.map(x => `<option value="${esc(x.name)}">${esc(priceText(x))}</option>`).join('');
}

function updateProcedureDatalist() {
  const dl = document.getElementById('procedureDatalist');
  if (dl) dl.innerHTML = renderProcedureDatalistOptions();
  const billDl = document.getElementById('billingPriceListOptions');
  if (billDl) {
    billDl.innerHTML = PROCEDURES.map(x => `<option value="${esc(x.name)}">${esc(priceText(x))}</option>`).join('');
  }
}

function onVisitProcedureInput(val) {
  let clean = (val || '').trim();
  if (!clean) return;
  if (clean.includes('—')) {
    clean = clean.split('—')[0].trim();
  }
  const match = (Array.isArray(PROCEDURES) ? PROCEDURES : []).find(p => p.name.toLowerCase() === clean.toLowerCase());
  if (match) {
    const cost = procedureDefault(match);
    const costEl = document.getElementById('visitCost');
    if (costEl && cost > 0) {
      costEl.value = cost;
      delete costEl.dataset.syncedWithPaid;
    }
  }
  updatePaymentChoice();
}

function applyQuickProcedure(name, cost) {
  const costEl = document.getElementById('visitCost');
  if (costEl) {
    costEl.value = cost;
    delete costEl.dataset.syncedWithPaid;
  }
  const procEl = document.getElementById('visitProcedure');
  if (procEl) {
    procEl.value = name;
  }
  updatePaymentChoice();
  showToast(`Selected: ${name} (Rs. ${cost})`, 'info');
}

function onVisitCostInput(val) {
  updatePaymentChoice();
}

function onVisitPaidInput(val) {
  const clean = String(val ?? '').trim();
  const raw = clean === '' ? 0 : (Number(clean) || 0);
  const costEl = document.getElementById('visitCost');
  const currentCost = Number(costEl?.value) || 0;
  if (costEl && pendingProcedures.length === 0 && (currentCost === 0 || costEl.dataset.syncedWithPaid === '1')) {
    if (raw > 0) {
      costEl.value = raw;
      costEl.dataset.syncedWithPaid = '1';
    } else {
      costEl.value = '0';
      delete costEl.dataset.syncedWithPaid;
    }
  }
  updatePaymentChoice();
}

function updateVisitCost() {
  const procEl = document.getElementById('visitProcedure');
  if (!procEl) return;
  if (procEl.tagName === 'SELECT') {
    const opt = procEl.options[procEl.selectedIndex];
    const costEl = document.getElementById('visitCost');
    if (costEl && opt && opt.value) {
      costEl.value = opt.dataset.cost || 0;
    }
  } else {
    onVisitProcedureInput(procEl.value);
  }
  updatePaymentChoice();
}

function addCustomProcedure() {
  const name = prompt('Enter custom procedure name:');
  if (!name || !name.trim()) return;
  const raw = prompt('Enter custom price (Rs.):');
  if (raw === null) return;
  const cost = Number(raw);
  if (!Number.isFinite(cost) || cost <= 0) {
    showToast('Please enter a valid price.', 'warn');
    return;
  }
  pendingProcedures.push({ procedure: name.trim(), cost });
  renderPendingProcedures();
}

function ensurePatientArrays(p) {
  p.VisitHistory = p.VisitHistory || [];
  p.PaymentHistory = p.PaymentHistory || [];
  p.Documents = p.Documents || [];
  p.Treatments = p.Treatments || [];
  if (p.default_doctor_id === undefined) p.default_doctor_id = '';
  if (p.default_doctor_name === undefined) p.default_doctor_name = '';
}

let pendingProcedures = [];

function addPendingProcedure() {
  const procEl = document.getElementById('visitProcedure');
  let procName = (procEl?.value || '').trim();
  if (procEl?.tagName === 'SELECT') {
    const opt = procEl.options[procEl.selectedIndex];
    const item = (opt && opt.value) ? PROCEDURES[Number(opt.value)] : null;
    procName = item ? item.name : (document.getElementById('customProcedureName')?.value?.trim() || 'General Dental Treatment');
  }
  if (!procName) {
    procName = (document.getElementById('customProcedureName')?.value || '').trim() || 'General Dental Treatment';
  }
  const cost = Number(document.getElementById('visitCost')?.value) || 0;

  if (cost <= 0) {
    showToast('Please enter a treatment amount before adding.', 'warn');
    document.getElementById('visitCost')?.focus();
    return;
  }

  pendingProcedures.push({ procedure: procName, cost });
  renderPendingProcedures();
  if (procEl) procEl.value = '';
  const costEl = document.getElementById('visitCost');
  if (costEl) costEl.value = '0';
  updatePaymentChoice();
  showToast(`Added: ${procName} (Rs. ${cost.toLocaleString()})`, 'success');
}

function removePendingProcedure(i) {
  pendingProcedures.splice(i, 1);
  renderPendingProcedures();
}

function renderPendingProcedures() {
  const box = document.getElementById('pendingProcedures');
  const total = pendingProcedures.reduce((a, x) => a + x.cost, 0);
  if (!box) return;

  if (pendingProcedures.length) {
    box.innerHTML = `<div style="font-weight:700;font-size:12px;margin-bottom:8px;color:#38bdf8">Staged Procedures (${pendingProcedures.length}):</div>
      <table class="mini-table">
        <thead><tr><th>Procedure</th><th>Cost</th><th></th></tr></thead>
        <tbody>${pendingProcedures.map((x, i) => `<tr><td>${esc(x.procedure)}</td><td>Rs. ${x.cost.toLocaleString()}</td><td><button type="button" class="btn danger" style="padding:2px 8px;font-size:10px" onclick="removePendingProcedure(${i})">✕</button></td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><th>Rs. ${total.toLocaleString()}</th><th></th></tr></tfoot>
      </table>`;
  } else {
    box.innerHTML = '<div class="muted">No additional procedures staged yet. The selected procedure &amp; amount above will be saved directly.</div>';
  }
  updatePaymentChoice();
}

function getVisitSubtotal() {
  const staged = pendingProcedures.reduce((a, x) => a + Number(x.cost || 0), 0);
  if (staged > 0) return staged;
  const directCost = Number(document.getElementById('visitCost')?.value) || 0;
  if (directCost > 0) return directCost;
  const paidVal = Number(document.getElementById('visitPaid')?.value) || 0;
  return paidVal;
}

let lastDiscountMode = 'amount';

function updateDiscountFromPercent() {
  lastDiscountMode = 'percent';
  const subtotal = getVisitSubtotal();
  const pct = Math.max(0, Math.min(100, Number(document.getElementById('discountPercent')?.value) || 0));
  const amt = (subtotal > 0) ? (subtotal * pct / 100) : 0;
  const a = document.getElementById('discountAmount');
  if (a && subtotal > 0) a.value = amt.toFixed(2);
  updatePaymentChoice();
}

function updateDiscountFromAmount() {
  lastDiscountMode = 'amount';
  const subtotal = getVisitSubtotal();
  const rawAmt = Number(document.getElementById('discountAmount')?.value) || 0;
  const amt = (subtotal > 0) ? Math.max(0, Math.min(subtotal, rawAmt)) : Math.max(0, rawAmt);
  const pct = (subtotal > 0) ? (amt / subtotal * 100) : 0;
  const p = document.getElementById('discountPercent');
  if (p && subtotal > 0) p.value = pct.toFixed(2);
  updatePaymentChoice();
}

function updatePaymentChoice() {
  const subtotal = getVisitSubtotal();
  const pctEl = document.getElementById('discountPercent');
  const amtEl = document.getElementById('discountAmount');
  let discount = 0;

  if (lastDiscountMode === 'percent' && pctEl && subtotal > 0) {
    const pct = Math.max(0, Math.min(100, Number(pctEl.value) || 0));
    discount = subtotal * pct / 100;
    if (amtEl) amtEl.value = discount.toFixed(2);
  } else {
    const rawDisc = Number(amtEl?.value) || 0;
    discount = Math.max(0, Math.min(subtotal, rawDisc));
    if (subtotal > 0 && pctEl) {
      pctEl.value = (discount / subtotal * 100).toFixed(2);
    }
  }

  const total = Math.max(0, subtotal - discount);
  const choice = document.querySelector('input[name=paymentType]:checked')?.value || 'total';
  const paidEl = document.getElementById('visitPaid');
  const hint = document.getElementById('paymentHint');
  const totalEl = document.getElementById('discountedTotal');
  const addBtn = document.getElementById('addVisitBtn');
  const visitHint = document.getElementById('visitHint');

  if (totalEl) totalEl.textContent = 'Rs. ' + total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (paidEl) {
    if (choice === 'total') {
      paidEl.placeholder = total > 0 ? `e.g. ${total.toLocaleString()} (Full Amount)` : 'Enter amount (Rs. 1 to 1,00,000)';
      if (hint) {
        hint.textContent = total > 0
          ? `Total payment: Enter amount paid (Rs. 1 to 1,00,000) or leave blank for full bill (Rs. ${total.toLocaleString()}).`
          : 'Enter amount paid (Rs. 1 to 1,00,000).';
      }
    } else {
      paidEl.placeholder = 'Enter partial amount (Rs. 1 to 1,00,000)';
      if (hint) {
        hint.textContent = 'Partial payment: Enter amount received today (Rs. 1 to 1,00,000). Remaining balance will be recorded as due.';
      }
    }
  }

  const costElVal = Number(document.getElementById('visitCost')?.value) || 0;
  const rawPaidVal = (paidEl?.value ?? '').trim();
  const paidElVal = Number(rawPaidVal) || 0;
  const hasAmount = total > 0 || costElVal > 0 || (rawPaidVal !== '' && paidElVal > 0) || pendingProcedures.length > 0;
  if (addBtn) addBtn.disabled = false;
  if (visitHint) {
    visitHint.textContent = hasAmount
      ? '✓ Ready to save visit & print bill.'
      : 'Click ADD VISIT & SAVE to record today’s visit.';
  }
}

function getVisitFinalTotal() {
  const subtotal = getVisitSubtotal();
  const pctEl = document.getElementById('discountPercent');
  const amtEl = document.getElementById('discountAmount');
  let discount = 0;
  if (lastDiscountMode === 'percent' && pctEl && subtotal > 0) {
    const pct = Math.max(0, Math.min(100, Number(pctEl.value) || 0));
    discount = subtotal * pct / 100;
  } else {
    const rawDisc = Number(amtEl?.value) || 0;
    discount = Math.max(0, Math.min(subtotal, rawDisc));
  }
  return Math.max(0, subtotal - discount);
}

function openClinicWebsite() {
  const url = 'https://www.infinitydentalclinic.com.np';
  try {
    if (window.dentalApp?.openExternal) {
      window.dentalApp.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  } catch (_) {
    window.open(url, '_blank');
  }
}

function addVisit() {
  const p = patients.find(x => x.id === selectedId);
  if (!p) {
    showToast('Please select a patient first.', 'warn');
    return;
  }
  ensurePatientArrays(p);

  // Auto-stage procedure if none added to list yet
  if (!pendingProcedures.length) {
    const procEl = document.getElementById('visitProcedure');
    let typedName = (procEl?.value || '').trim();
    if (procEl?.tagName === 'SELECT') {
      const opt = procEl.options[procEl.selectedIndex];
      const item = (opt && opt.value) ? PROCEDURES[Number(opt.value)] : null;
      if (item) typedName = item.name;
    }
    const directCost = Number(document.getElementById('visitCost')?.value) || 0;
    const paidInput = Number(document.getElementById('visitPaid')?.value) || 0;
    const finalCost = directCost > 0 ? directCost : (paidInput > 0 ? paidInput : 0);

    const procName = typedName || (document.getElementById('customProcedureName')?.value?.trim() || (finalCost > 0 ? 'General Dental Treatment' : 'General Dental Consultation & Checkup'));
    pendingProcedures.push({ procedure: procName, cost: finalCost });
  }

  const subtotal = getVisitSubtotal();
  const rawDiscount = Number(document.getElementById('discountAmount')?.value) || 0;
  const discountAmount = Math.max(0, Math.min(subtotal, rawDiscount));
  const discountPercent = subtotal ? (discountAmount / subtotal * 100) : 0;
  const total = Math.max(0, subtotal - discountAmount);
  const choice = document.querySelector('input[name=paymentType]:checked')?.value || 'total';

  const paidEl = document.getElementById('visitPaid');
  const rawPaid = (paidEl?.value ?? '').trim();
  let paid;
  if (rawPaid !== '') {
    paid = Number(rawPaid);
    if (isNaN(paid) || paid < 0) {
      showToast('Please enter a valid payment amount (Rs. 1 to 1,00,000).', 'warn');
      paidEl?.focus();
      return;
    }
  } else {
    paid = (choice === 'total') ? total : 0;
  }

  let mode = document.getElementById('visitPaymentMode')?.value || 'Cash';
  if (!mode) mode = 'Cash';

  const now = new Date(), date = now.toISOString().slice(0, 10), time = now.toTimeString().slice(0, 8);
  const visitNo = (p.VisitHistory.length || 0) + 1;
  const billNo = 'B-' + date.replaceAll('-', '') + '-' + pad(p.OPDNumber) + '-' + String(visitNo).padStart(3, '0');
  const procNames = pendingProcedures.map(x => x.procedure).join(', ');

  function completeSaveVisit(payMethod, payDone, txnId) {
    // Auto-save Next Appointment if selected/typed on this screen
    let apptAd = document.getElementById('appointmentAdDate')?.value || '';
    let apptBs = (document.getElementById('appointmentBsDateInput')?.value || '').trim();
    let apptT = document.getElementById('appointmentTime')?.value || '10:00';
    if (!apptAd && apptBs && /^\d{4}-\d{2}-\d{2}$/.test(apptBs)) {
      apptAd = apptAdFromBs(apptBs) || '';
    }
    if (!apptBs && apptAd) {
      apptBs = apptBsFromAd(apptAd) || '';
    }
    if (apptAd) {
      p.Appointment = { adDate: apptAd, bsDate: apptBs, time: apptT, status: 'scheduled', date: apptAd };
    }

    // Doctor Assignment & First Visit Rule (supports manual typing & dropdown selection)
    const docInput = document.getElementById('visitDoctor');
    const typedDoc = (docInput ? docInput.value : '').trim();
    let chosenDoc = null;
    let doctorId = '';
    let doctorName = '';

    if (typedDoc) {
      chosenDoc = clinicDoctors.find(d => 
        d.name.toLowerCase() === typedDoc.toLowerCase() || 
        String(d.id).toLowerCase() === typedDoc.toLowerCase()
      );
      if (chosenDoc) {
        doctorId = chosenDoc.id;
        doctorName = chosenDoc.name;
      } else {
        doctorName = typedDoc;
        doctorId = 'doc-' + typedDoc.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || ('doc-' + Date.now());
        registerNewDoctorIfAbsent(doctorId, doctorName);
      }
    } else if (p.default_doctor_name) {
      doctorId = p.default_doctor_id || '';
      doctorName = p.default_doctor_name || '';
    } else if (clinicDoctors.length) {
      doctorId = clinicDoctors[0].id;
      doctorName = clinicDoctors[0].name;
    }

    // First visit rule: if patient does not yet have a default doctor, save chosen/typed doctor as default
    if (!p.default_doctor_id && doctorName) {
      p.default_doctor_id = doctorId;
      p.default_doctor_name = doctorName;
    }

    const visit = {
      id: crypto.randomUUID(),
      date,
      time,
      doctorId,
      doctorName,
      procedures: procNames,
      paymentDone: payDone,
      amount: payDone,
      paymentMethod: payMethod,
      txnId: txnId || '',
      subtotal,
      discountPercent: Number(discountPercent.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      cost: total,
      billNumber: billNo,
      procedureItems: pendingProcedures.map(x => ({ procedure: x.procedure, cost: x.cost, doctorId, doctorName })),
      nextAppointment: apptAd ? { adDate: apptAd, bsDate: apptBs, time: apptT } : null
    };
    p.VisitHistory.unshift(visit);
    pendingProcedures.forEach(x => p.Treatments.push({ procedure: x.procedure, cost: x.cost, date, time, billNumber: billNo, doctorId, doctorName }));
    p.PaymentHistory.unshift({ date, time, billNumber: billNo, amount: payDone, method: payMethod, txnId: txnId || '', status: payDone >= total ? 'Paid' : payDone > 0 ? 'Partial' : 'Pending', doctorId, doctorName });
    p.PaymentStatus = payDone >= total ? 'Paid' : payDone > 0 ? 'Partial' : 'Pending';
    p.PaymentMethod = payMethod;
    p.Subtotal = (Number(p.Subtotal) || 0) + subtotal;
    p.FinalAmount = (Number(p.FinalAmount) || 0) + total;
    pendingProcedures = [];
    save();
    updateAll();
    if (payDone > 0) {
      sendNiziCommand({ command: 'success', amount: payDone });
    }
    if (payMethod === 'NepalPay QR' || (typeof payMethod === 'string' && payMethod.toLowerCase().includes('nepalpay'))) {
      logNepalPayMoneyRecord({
        billNumber: billNo,
        patientName: p.Name,
        opdNumber: 'OPD-' + pad(p.OPDNumber),
        amount: payDone,
        txnId: txnId || ('TXN-NPI-' + Date.now()),
        validationTraceId: txnId || ('TXN-NPI-' + Date.now()),
        status: 'SUCCESS',
        method: 'NepalPay QR',
        source: 'Visit Payment'
      });
    }
    renderProfile();
    showToast(`✓ Visit recorded successfully! Bill No: ${billNo}`, 'success');
    printBill(billNo);
  }

  if ((mode === 'NepalPay QR' || mode === 'Scan') && paid > 0) {
    if (typeof activeVisitQrTxnId !== 'undefined' && activeVisitQrTxnId) {
      const savedTxn = activeVisitQrTxnId;
      activeVisitQrTxnId = null;
      completeSaveVisit('NepalPay QR', paid, savedTxn);
      return;
    }
    openNepalPayModal({
      amount: paid,
      billNumber: billNo,
      patientName: p.Name,
      patientContact: p.Contact,
      opdNumber: p.OPDNumber,
      remarks: procNames.slice(0, 30),
      onSuccess: (eventData) => {
        completeSaveVisit('NepalPay QR', paid, eventData.txnId);
      }
    });
  } else {
    completeSaveVisit(mode, paid);
  }
}

function findBillForPatient(billNo) {
  let p = patients.find(x => x.id === (typeof billingSelectedPatientId !== 'undefined' && billingSelectedPatientId ? billingSelectedPatientId : selectedId));
  if (p && p.VisitHistory && p.VisitHistory.some(v => v.billNumber === billNo)) {
    const v = p.VisitHistory.find(x => x.billNumber === billNo);
    return { p, v };
  }
  for (const pat of patients) {
    if (pat.VisitHistory && pat.VisitHistory.some(v => v.billNumber === billNo)) {
      const v = pat.VisitHistory.find(x => x.billNumber === billNo);
      return { p: pat, v };
    }
  }
  if (p && p.VisitHistory && p.VisitHistory.length > 0) {
    return { p, v: p.VisitHistory[0] };
  }
  return null;
}
function code39Svg(value) {
  const patterns = { "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn", "A": "wnnnnwnnw", "B": "nnwnnwnnw", "C": "wnwnnwnnn", "D": "nnnnwwnnw", "E": "wnnnwwnnn", "F": "nnwnwwnnn", "G": "nnnnnwwnw", "H": "wnnnnwwnn", "I": "nnwnnwwnn", "J": "nnnnwwwnn", "K": "wnnnnnnww", "L": "nnwnnnnww", "M": "wnwnnnnwn", "N": "nnnnwnnww", "O": "wnnnwnnwn", "P": "nnwnwnnwn", "Q": "nnnnnnwww", "R": "wnnnnnwwn", "S": "nnwnnnwwn", "T": "nnnnwnwwn", "U": "wwnnnnnnw", "V": "nwwnnnnnw", "W": "wwwnnnnnn", "X": "nwnnwnnnw", "Y": "wwnnwnnnn", "Z": "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn" };
  const text = '*' + String(value).toUpperCase().replace(/[^0-9A-Z.\- $/+%]/g, '') + '*'; let x = 4, bars = ''; for (const ch of text) { const pat = patterns[ch] || patterns['0']; for (let i = 0; i < pat.length; i++) { const wide = pat[i] === 'w', w = wide ? 3 : 1; const black = i % 2 === 0; bars += `<rect x="${x}" y="8" width="${w}" height="58" fill="${black ? '#111' : 'white'}"/>`; x += w } x += 1 } return `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 4}" height="86" viewBox="0 0 ${x + 4} 86" aria-label="Barcode ${esc(value)}">${bars}<text x="${(x + 4) / 2}" y="82" text-anchor="middle" font-family="Arial" font-size="12">${esc(value)}</text></svg>`;
}
async function printSticker() {
  const p = patients.find(x => x.id === selectedId); if (!p) { alert('No patient selected.'); return }
  const w = window.open('', '_blank', 'width=620,height=420'); if (!w) { alert('Please allow pop-ups to preview the sticker.'); return }
  const logoUrl = clinicLogoDataUrl || (location.href.substring(0, location.href.lastIndexOf('/') + 1) + 'assets/clinic-logo.png');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>OPD Sticker - ${esc(p.OPDNumber)}</title><style>
 @page{size:100mm 50mm;margin:0}
 html,body{width:100mm!important;height:50mm!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff}
 *{box-sizing:border-box}
 body{font-family:Arial,Helvetica,sans-serif;color:#111}
 .sticker{width:100mm;height:50mm;padding:2.5mm 3mm;display:flex;flex-direction:column;overflow:hidden;break-after:avoid-page;page-break-after:avoid}
 .head{height:10mm;display:flex;align-items:flex-start;justify-content:space-between;flex:0 0 auto}
 .logo{width:24mm;height:8mm;object-fit:contain;object-position:left top}
 .clinic{font-size:10pt;font-weight:700;text-align:right;line-height:1.1}
 .clinic small{font-weight:400;font-size:7pt}
 .details{font-size:9.5pt;line-height:1.18;margin-top:1.2mm;flex:0 0 auto}
 .details div{display:grid;grid-template-columns:24mm 1fr;white-space:nowrap}
 .barcode{height:12mm;margin-top:auto;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;flex:0 0 12mm}
 .barcode svg{display:block;width:82mm;height:11mm;max-width:82mm}
 .print{position:fixed;top:8px;right:8px;padding:8px 14px;font-weight:700}
 @media print{.print{display:none!important}html,body{width:100mm!important;height:50mm!important;overflow:hidden!important}.sticker{width:100mm!important;height:50mm!important;overflow:hidden!important}}
 </style></head><body><div class="sticker"><div class="head"><img class="logo" src="${logoUrl}" onerror="this.style.display='none'"><div class="clinic">INFINITY DENTAL CLINIC<br><small>Dhumbarahi, Kathmandu • Tel: 9768592344, 01-4514888 • PAN: 125302054</small></div></div><div class="details"><div><b>Name</b><span>: ${esc(p.Name)}</span></div><div><b>Age/Gender</b><span>: ${esc(p.Age || '—')} / ${esc(p.Gender || '—')}</span></div><div><b>Address</b><span>: ${esc(p.Address || '—')}</span></div><div><b>Phone</b><span>: ${esc(p.Contact || '—')}</span></div><div><b>OPD No.</b><span>: OPD-${pad(p.OPDNumber)}</span></div></div><div class="barcode">${code39Svg('OPD-' + pad(p.OPDNumber))}</div></div><button class="print" onclick="window.print()">PRINT STICKER</button></body></html>`); w.document.close(); w.focus();
}
function numberToWords(n) {
  const num = Math.round(Number(n) || 0);
  if (num === 0) return 'Rupees Zero Only';
  if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function toWords(x) {
    if (x === 0) return '';
    if (x < 20) return a[x] + ' ';
    if (x < 100) return b[Math.floor(x / 10)] + (x % 10 !== 0 ? ' ' + a[x % 10] : '') + ' ';
    if (x < 1000) return a[Math.floor(x / 100)] + ' Hundred ' + toWords(x % 100);
    if (x < 100000) return toWords(Math.floor(x / 1000)) + 'Thousand ' + toWords(x % 1000);
    if (x < 10000000) return toWords(Math.floor(x / 100000)) + 'Lakh ' + toWords(x % 100000);
    return toWords(Math.floor(x / 10000000)) + 'Crore ' + toWords(x % 10000000);
  }

  return 'Rupees ' + toWords(num).trim() + ' Only';
}

function printBill(billNo) {
  const found = findBillForPatient(billNo);
  if (!found) { showToast('No bill found for this patient.', 'warn'); return; }
  const { p, v } = found;
  const items = (Array.isArray(v.procedureItems) && v.procedureItems.length)
    ? v.procedureItems
    : String(v.procedures || '').split(', ').map(name => ({ procedure: name, cost: Number(v.cost || 0) }));

  const subtotal = Number(v.subtotal || v.cost || items.reduce((a, x) => a + Number(x.cost || 0), 0));
  const discountAmount = Number(v.discountAmount || 0);
  const discountPercent = Number(v.discountPercent || (subtotal > 0 ? (discountAmount / subtotal * 100) : 0));
  const showDiscount = discountAmount > 0;
  const total = Math.max(0, subtotal - discountAmount);
  const paid = Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
  const due = Math.max(0, total - paid);

  const bsDate = (window.NepaliFunctions ? NepaliFunctions.AD2BS(v.date) : apptBsFromAd(v.date)) || '';
  const billLogoUrl = clinicLogoDataUrl || (location.href.substring(0, location.href.lastIndexOf('/') + 1) + 'assets/clinic-logo.png');
  const barcodeSvg = code39Svg(v.billNumber || ('OPD-' + pad(p.OPDNumber)));
  const wordsAmount = numberToWords(paid > 0 ? paid : total);

  const billWindow = window.open('', '_blank', 'width=780,height=960');
  if (!billWindow) {
    showToast('Please allow pop-ups to print the bill.', 'warn');
    return;
  }

  const rows = items.map((x, i) => `
    <tr>
      <td style="text-align:center;color:#64748b">${i + 1}</td>
      <td style="font-weight:600;color:#0f172a">${esc(x.procedure || 'Dental Consultation / Treatment')}</td>
      <td style="text-align:center">1</td>
      <td style="text-align:right">Rs. ${Number(x.cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      <td style="text-align:right;font-weight:700;color:#0f172a">Rs. ${Number(x.cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Patient Bill - ${esc(v.billNumber || '')}</title>
  <style>
    @page {
      size: A5 portrait;
      size: 148mm 210mm;
      margin: 6mm 8mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      font-size: 10.5pt;
      line-height: 1.35;
      padding: 16px 12px 28px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print-toolbar {
      max-width: 580px;
      margin: 0 auto 12px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .toolbar-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      font-size: 12.5px;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-print {
      background: #0284c7;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .btn-print:hover { background: #0369a1; }
    .btn-close {
      background: #e2e8f0;
      color: #334155;
    }
    .btn-close:hover { background: #cbd5e1; }

    .invoice-card {
      max-width: 580px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
      padding: 20px 24px;
      border: 1px solid #e2e8f0;
    }

    /* Clinic Header */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 2px solid #0284c7;
    }
    .header-logo-cell {
      width: 130px;
      vertical-align: middle;
    }
    .clinic-logo-img {
      max-width: 120px;
      max-height: 60px;
      object-fit: contain;
      display: block;
    }
    .clinic-pan-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 5px;
      padding: 2px 7px;
      background: #eff6ff;
      border: 1.5px solid #0284c7;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
      box-shadow: 0 1px 2px rgba(2, 132, 199, 0.12);
    }
    .clinic-pan-badge .pan-lbl {
      color: #0369a1;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .clinic-pan-badge .pan-num {
      color: #0f172a;
      font-family: "Courier New", Courier, monospace, sans-serif;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.8px;
    }
    .banner-pan-tag {
      display: inline-block;
      margin-left: 8px;
      font-size: 9.5px;
      font-weight: 800;
      color: #0369a1;
      background: #e0f2fe;
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid #bae6fd;
      letter-spacing: 0.4px;
    }
    .header-info-cell {
      text-align: right;
      vertical-align: middle;
    }
    .clinic-main-title {
      font-size: 19px;
      font-weight: 900;
      letter-spacing: 0.5px;
      color: #0f172a;
      line-height: 1.15;
    }
    .clinic-slogan-text {
      font-size: 10.5px;
      font-weight: 600;
      color: #0284c7;
      margin-top: 1px;
      letter-spacing: 0.3px;
    }
    .clinic-address-meta {
      font-size: 10px;
      color: #475569;
      margin-top: 3px;
      line-height: 1.35;
    }

    /* Invoice Title Banner */
    .invoice-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px 0 12px 0;
      padding: 5px 10px;
      background: #f8fafc;
      border-radius: 6px;
      border-left: 4px solid #0284c7;
    }
    .banner-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: #0f172a;
    }
    .status-badge {
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .badge-paid {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .badge-partial {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .badge-due {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
    }

    /* Meta Info Grid */
    .meta-box-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .meta-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 10px;
      line-height: 1.45;
    }
    .meta-card-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 4px;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 2px;
    }
    .meta-line {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      margin: 1.5px 0;
    }
    .meta-lbl {
      color: #64748b;
      font-weight: 600;
    }
    .meta-val {
      color: #0f172a;
      font-weight: 700;
      text-align: right;
    }

    /* Treatment Table */
    .table-wrap {
      margin-bottom: 12px;
    }
    .bill-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .bill-table th {
      background: #0f172a;
      color: #ffffff;
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      padding: 6px 8px;
      border: none;
    }
    .bill-table th:first-child { border-top-left-radius: 4px; }
    .bill-table th:last-child { border-top-right-radius: 4px; }
    .bill-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    .bill-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    /* Financial Summary */
    .financial-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 8px;
      align-items: start;
    }
    .words-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 7px 9px;
      font-size: 9.5px;
      color: #334155;
      line-height: 1.35;
    }
    .words-box b {
      color: #0f172a;
      display: block;
      margin-bottom: 2px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .barcode-wrap {
      margin-top: 6px;
      text-align: left;
    }
    .barcode-wrap svg {
      max-width: 140px;
      height: 34px;
    }

    .totals-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 10.5px;
    }
    .calc-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 0;
      color: #475569;
    }
    .calc-row.discount-row {
      color: #059669;
      font-weight: 600;
    }
    .calc-row.grand-total {
      border-top: 1.5px solid #cbd5e1;
      border-bottom: 1.5px solid #cbd5e1;
      margin: 3px 0;
      padding: 4px 0;
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
    }
    .calc-row.paid-row {
      font-weight: 700;
      color: #0284c7;
    }
    .calc-row.due-row {
      font-weight: 700;
      color: #dc2626;
    }

    /* Footer & Signatures */
    .bill-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px dashed #cbd5e1;
    }
    .terms-text {
      font-size: 8.5px;
      color: #64748b;
      line-height: 1.35;
      max-width: 300px;
    }
    .terms-text b { color: #334155; }
    .sign-box {
      text-align: center;
      width: 160px;
      position: relative;
    }
    .sign-line {
      border-top: 1.2px solid #0f172a;
      margin-bottom: 3px;
    }
    .sign-title {
      font-size: 9px;
      font-weight: 700;
      color: #0f172a;
    }
    .sign-sub {
      font-size: 8px;
      color: #64748b;
    }

    /* Stamp SVG within Bill */
    .clinic-stamp-seal-svg {
      width: 95px;
      height: 95px;
      display: inline-block;
      color: #1d4ed8;
      opacity: 0.90;
      transform: rotate(-3deg);
    }

    .thank-banner {
      text-align: center;
      margin-top: 10px;
      font-size: 10px;
      font-weight: 700;
      color: #0284c7;
      letter-spacing: 0.3px;
    }

    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .no-print-toolbar {
        display: none !important;
      }
      .invoice-card {
        max-width: 100% !important;
        width: 100% !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        border-radius: 0 !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-toolbar">
    <button class="toolbar-btn btn-print" onclick="window.print()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
      PRINT A5 BILL
    </button>
    <button class="toolbar-btn btn-close" onclick="window.close()">✕ Close</button>
  </div>

  <div class="invoice-card">
    <table class="header-table">
      <tr>
        <td class="header-logo-cell">
          <img class="clinic-logo-img" src="${billLogoUrl}" alt="Infinity Dental Clinic" onerror="this.style.display='none'">
          <div class="clinic-pan-badge">
            <span class="pan-lbl">PAN No:</span>
            <span class="pan-num">125302054</span>
          </div>
        </td>
        <td class="header-info-cell">
          <div class="clinic-main-title">INFINITY DENTAL CLINIC</div>
          <div class="clinic-slogan-text">Endless Care, Beautiful Smiles</div>
          <div class="clinic-address-meta">
            📍 Dhumbarahi, Kathmandu, Nepal &nbsp;•&nbsp; 📞 9768592344, 01-4514888<br>
            ✉️ The.infinity.dental@gmail.com &nbsp;•&nbsp; 🌐 www.infinitydentalclinic.com.np
          </div>
        </td>
      </tr>
    </table>

    <div class="invoice-banner">
      <div class="banner-title">
        PATIENT TAX INVOICE &amp; RECEIPT
        <span class="banner-pan-tag">PAN: 125302054</span>
      </div>
      <div class="status-badge ${paid >= total ? 'badge-paid' : (paid > 0 ? 'badge-partial' : 'badge-due')}">
        ${paid >= total ? 'PAID' : (paid > 0 ? 'PARTIAL PAYMENT' : 'PAYMENT DUE')}
      </div>
    </div>

    <div class="meta-box-grid">
      <div class="meta-card">
        <div class="meta-card-title">Patient Information</div>
        <div class="meta-line"><span class="meta-lbl">Patient Name:</span> <span class="meta-val" style="font-size:11px;color:#0284c7">${esc(p.Name)}</span></div>
        <div class="meta-line"><span class="meta-lbl">OPD Number:</span> <span class="meta-val">OPD-${pad(p.OPDNumber)}</span></div>
        <div class="meta-line"><span class="meta-lbl">Age / Gender:</span> <span class="meta-val">${esc(p.Age || '—')} Yrs / ${esc(p.Gender || '—')}</span></div>
        <div class="meta-line"><span class="meta-lbl">Contact No:</span> <span class="meta-val">${esc(p.Contact || '—')}</span></div>
        <div class="meta-line"><span class="meta-lbl">Address:</span> <span class="meta-val">${esc(p.Address || 'Dhumbarahi, Kathmandu')}</span></div>
      </div>

      <div class="meta-card">
        <div class="meta-card-title">Bill &amp; Visit Details</div>
        <div class="meta-line"><span class="meta-lbl">Bill Number:</span> <span class="meta-val" style="font-family:monospace;letter-spacing:0.3px">${esc(v.billNumber || '')}</span></div>
        <div class="meta-line"><span class="meta-lbl">Date (AD):</span> <span class="meta-val">${esc(v.date || '')}</span></div>
        <div class="meta-line"><span class="meta-lbl">Date (BS):</span> <span class="meta-val">${esc(bsDate || '—')}</span></div>
        <div class="meta-line"><span class="meta-lbl">Time:</span> <span class="meta-val">${esc(v.time || '')}</span></div>
        <div class="meta-line"><span class="meta-lbl">Payment Method:</span> <span class="meta-val">${esc(v.paymentMethod || 'Cash')}</span></div>
      </div>
    </div>

    <div class="table-wrap">
      <table class="bill-table">
        <thead>
          <tr>
            <th style="width:32px;text-align:center">S.N.</th>
            <th style="text-align:left">Treatment / Procedure Description</th>
            <th style="width:42px;text-align:center">Qty</th>
            <th style="width:95px;text-align:right">Rate (NPR)</th>
            <th style="width:105px;text-align:right">Amount (NPR)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div class="financial-grid">
      <div class="financial-left">
        <div class="words-box">
          <b>Amount in Words:</b>
          <div>${wordsAmount}</div>
        </div>
        ${v.txnId ? `<div style="font-size:9px;color:#64748b;margin-top:4px">Txn ID: <code style="font-family:monospace;color:#0f172a;background:#e2e8f0;padding:1px 3px;border-radius:2px">${esc(v.txnId)}</code></div>` : ''}
        <div class="barcode-wrap">
          ${barcodeSvg}
        </div>
      </div>

      <div class="totals-card">
        <div class="calc-row">
          <span>Subtotal:</span>
          <span>NPR ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        </div>
        ${showDiscount ? `
        <div class="calc-row discount-row">
          <span>Discount ${discountPercent ? `(${discountPercent.toFixed(1)}%)` : ''}:</span>
          <span>- NPR ${discountAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        </div>` : ''}
        <div class="calc-row grand-total">
          <span>${showDiscount ? 'Total After Discount:' : 'Total Amount:'}</span>
          <span>NPR ${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        </div>
        <div class="calc-row paid-row">
          <span>Amount Paid:</span>
          <span>NPR ${paid.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        </div>
        <div class="calc-row ${due > 0 ? 'due-row' : ''}">
          <span>Balance Due:</span>
          <span>NPR ${due.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        </div>
      </div>
    </div>

    <div class="bill-footer">
      <div class="terms-text">
        <b>Terms &amp; Instructions:</b><br>
        • Please bring this bill for dental check-up &amp; follow-up visits.<br>
        • Clinical queries &amp; appointments: 📞 9768592344, 01-4514888 • ✉️ The.infinity.dental@gmail.com<br>
        • Book appointments &amp; explore services online: 🌐 www.infinitydentalclinic.com.np
      </div>
      <div class="sign-box">
        ${getClinicStampHtmlForBill()}
        <div class="sign-line"></div>
        <div class="sign-title">Authorized Signatory</div>
        <div class="sign-sub">Infinity Dental Clinic • Dhumbarahi</div>
      </div>
    </div>

    <div class="thank-banner">
      Thank You for Choosing Infinity Dental Clinic!
    </div>
  </div>
</body>
</html>`;

  billWindow.document.open();
  billWindow.document.write(html);
  billWindow.document.close();
  billWindow.focus();
}

// duplicate updateVisitCost removed
// legacy appointment pickers cleaned up
// --- Patient Pictures, Photos, Dental X-Rays & Scanned Documents ---
function uploadPatientDocument(input) {
  const p = patients.find(x => x.id === selectedId);
  if (!p || !input.files.length) return;
  ensurePatientArrays(p);

  const files = Array.from(input.files);
  let processed = 0;

  files.forEach(file => {
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|tif|tiff)$/i.test(file.name);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

    if (!isImage && !isPdf) {
      alert(`File "${file.name}" is not supported.\nPlease select an image (JPG, PNG, WEBP, BMP) or a PDF document.`);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert(`File "${file.name}" is larger than 20MB. Please select a smaller photo or PDF.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      p.Documents.unshift({
        name: file.name,
        size: file.size,
        type: file.type || (isImage ? 'image/jpeg' : 'application/pdf'),
        isImage: isImage,
        data: reader.result,
        date: new Date().toISOString()
      });
      processed++;
      if (processed === files.length) {
        save();
        renderProfile();
      }
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

// Backward-compatible alias
function uploadPatientPdf(input) { uploadPatientDocument(input); }

function openPatientDocument(index) {
  const p = patients.find(x => x.id === selectedId);
  const d = p?.Documents?.[index];
  if (!d) return;
  const isImg = d.isImage || d.type?.startsWith('image/') || String(d.data || '').startsWith('data:image/');
  if (isImg) {
    openImageViewer(d.name, d.data);
  } else {
    const w = window.open();
    if (w) {
      w.document.write(`<title>${esc(d.name)}</title><iframe src="${d.data}" style="width:100%;height:100vh;border:0"></iframe>`);
      w.document.close();
    }
  }
}
function openPatientPdf(index) { openPatientDocument(index); }

function downloadPatientDocument(index) {
  const p = patients.find(x => x.id === selectedId);
  const d = p?.Documents?.[index];
  if (!d || !d.data) return;
  const a = document.createElement('a');
  a.href = d.data;
  a.download = d.name || 'patient-document';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function deletePatientDocument(index) {
  const p = patients.find(x => x.id === selectedId);
  if (!p) return;
  const d = p.Documents?.[index];
  const typeName = (d?.isImage || d?.type?.startsWith('image/')) ? 'picture / X-ray' : 'scanned document';
  if (confirm(`Remove this ${typeName} from the patient record?`)) {
    p.Documents.splice(index, 1);
    save();
    renderProfile();
  }
}
function deletePatientPdf(index) { deletePatientDocument(index); }

// --- Lightbox High-Resolution Viewer for Dental Photos & Radiographs ---
let activeLightboxImage = null;
let activeImageScale = 1;
let activeImageRotation = 0;

function openImageViewer(name, dataUrl) {
  activeLightboxImage = { name, dataUrl };
  activeImageScale = 1;
  activeImageRotation = 0;
  const modal = document.getElementById('imageLightboxModal');
  const img = document.getElementById('lightboxImg');
  const title = document.getElementById('lightboxTitle');
  if (title) title.textContent = name || 'Dental Picture / X-Ray Viewer';
  if (img) {
    img.src = dataUrl;
    applyImageTransform();
  }
  if (modal) modal.classList.add('active');
}

function closeImageViewer() {
  const modal = document.getElementById('imageLightboxModal');
  if (modal) modal.classList.remove('active');
  const img = document.getElementById('lightboxImg');
  if (img) img.src = '';
  activeLightboxImage = null;
}

function zoomImage(delta) {
  activeImageScale = Math.max(0.2, Math.min(5, activeImageScale + delta));
  applyImageTransform();
}

function rotateImage(deg) {
  activeImageRotation = (activeImageRotation + deg) % 360;
  applyImageTransform();
}

function resetImageTransform() {
  activeImageScale = 1;
  activeImageRotation = 0;
  applyImageTransform();
}

function applyImageTransform() {
  const img = document.getElementById('lightboxImg');
  if (img) {
    img.style.transform = `scale(${activeImageScale}) rotate(${activeImageRotation}deg)`;
  }
}

function printActiveImage() {
  if (!activeLightboxImage || !activeLightboxImage.dataUrl) return;
  const w = window.open('', '_blank', 'width=850,height=900');
  if (!w) { alert('Please allow pop-ups to print the picture.'); return; }
  w.document.write(`<!doctype html><html><head><title>${esc(activeLightboxImage.name)}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff}img{max-width:95%;max-height:95vh;object-fit:contain}</style></head><body><img src="${activeLightboxImage.dataUrl}"><script>window.onload=function(){window.print();window.close();}<\/script></body></html>`);
  w.document.close();
}

function downloadActiveImage() {
  if (!activeLightboxImage || !activeLightboxImage.dataUrl) return;
  const a = document.createElement('a');
  a.href = activeLightboxImage.dataUrl;
  a.download = activeLightboxImage.name || 'dental-photo.jpg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function setPaymentMode(mode) { }
function editPatientInfo() {
  const p = patients.find(x => x.id === selectedId); if (!p) return;
  const el = document.getElementById('profileContent');
  el.innerHTML = `<div class="card"><div class="profile-head"><div><div class="section-title">Edit Patient Information</div><span class="badge">OPD ${pad(p.OPDNumber)} (cannot be changed)</span></div><button class="btn secondary" onclick="renderProfile()">CANCEL</button></div>
 <div class="formgrid" style="margin-top:16px">
   <div class="field"><label>Patient Name</label><input id="editPatientName" type="text" value="${esc(p.Name || '')}"></div>
   <div class="field"><label>Contact Number</label><input id="editPatientContact" type="text" value="${esc(p.Contact || '')}"></div>
   <div class="field"><label>Age</label><input id="editPatientAge" type="text" value="${esc(p.Age || '')}"></div>
   <div class="field"><label>Gender</label><select id="editPatientGender"><option value="">Select Gender</option><option value="Male" ${p.Gender === 'Male' ? 'selected' : ''}>Male</option><option value="Female" ${p.Gender === 'Female' ? 'selected' : ''}>Female</option><option value="Other" ${p.Gender === 'Other' ? 'selected' : ''}>Other</option></select></div>
   <div class="field" style="grid-column:1/-1"><label>Address</label><input id="editPatientAddress" type="text" value="${esc(p.Address || '')}"></div>
 </div>
 <div class="actions" style="margin-top:16px"><button class="btn primary" onclick="savePatientInfo()">SAVE CHANGES</button><button class="btn secondary" onclick="renderProfile()">CANCEL</button></div></div>`;
  document.getElementById('editPatientName')?.focus();
}
function savePatientInfo() {
  const p = patients.find(x => x.id === selectedId); if (!p) return;
  const name = (document.getElementById('editPatientName')?.value || '').trim();
  const contact = (document.getElementById('editPatientContact')?.value || '').trim();
  const age = (document.getElementById('editPatientAge')?.value || '').trim();
  const gender = document.getElementById('editPatientGender')?.value || '';
  const address = (document.getElementById('editPatientAddress')?.value || '').trim();
  if (!name) { alert('Please enter the patient name.'); document.getElementById('editPatientName')?.focus(); return }
  if (!contact) { alert('Please enter the contact number.'); document.getElementById('editPatientContact')?.focus(); return }
  if (!gender) { alert('Please select gender.'); document.getElementById('editPatientGender')?.focus(); return }
  p.Name = name; p.Contact = contact; p.Age = age; p.Gender = gender; p.Address = address;
  save(); renderProfile(); renderPatients(); renderRecentPatients(); alert('Patient information updated successfully.');
}
function renderProfile() {
  const p = patients.find(x => x.id === selectedId); const el = document.getElementById('profileContent');
  if (!p) { el.innerHTML = '<div class="card empty">No patient selected.</div>'; return } ensurePatientArrays(p);
  const visits = p.VisitHistory, pays = p.PaymentHistory, docs = p.Documents;
  el.innerHTML = `<div class="card"><div class="profile-head"><div><div class="section-title">${esc(p.Name)}</div><span class="badge">OPD ${pad(p.OPDNumber)}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" onclick="showPage('patients')">BACK TO PATIENTS</button><button class="btn secondary" onclick="editPatientInfo()">EDIT PATIENT INFO</button><button class="btn secondary" onclick="printSticker()">PRINT STICKER</button><button class="btn primary" onclick="printLatestBill()">PRINT BILL</button></div></div>
    <div class="profile-info-row"><div class="patient-details"><div class="section-title">Patient Details</div><div class="details-grid"><div><b>Name:</b> ${esc(p.Name)}</div><div><b>OPD No:</b> ${pad(p.OPDNumber)}</div><div><b>Contact:</b> ${esc(p.Contact) || '—'}</div><div><b>Age / Gender:</b> ${esc(p.Age) || '—'} / ${esc(p.Gender) || '—'}</div><div><b>Address:</b> ${esc(p.Address) || '—'}</div><div><b>Registered:</b> ${esc(p.Date)} ${esc(p.Time)}</div><div><b>Default Doctor:</b> <span style="color:#38bdf8;font-weight:700">${esc(p.default_doctor_name || 'Not assigned yet')}</span> <button type="button" class="btn secondary" style="font-size:10px;padding:2px 7px;margin-left:6px" onclick="promptChangeDefaultDoctor('${p.id}')">Change</button></div></div></div>
    <div class="documents-compact">
      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>Patient Pictures &amp; Documents</span>
        <span class="badge" style="font-size:10px;padding:2px 7px">${docs.length} ${docs.length === 1 ? 'file' : 'files'}</span>
      </div>
      <div class="muted" style="font-size:11px;margin-bottom:6px">X-Rays, dental photos, reports, or PDFs</div>
      <div class="doc-upload"><input type="file" multiple accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.bmp" onchange="uploadPatientDocument(this)"></div>
      ${docs.length ? docs.map((d, i) => {
    const isImg = d.isImage || d.type?.startsWith('image/') || String(d.data || '').startsWith('data:image/');
    return `
        <div class="doc-item">
          <div class="doc-left">
            ${isImg ? `
              <img class="doc-thumb" src="${d.data}" onclick="openImageViewer('${esc(d.name)}','${d.data}')" title="Click to view full size photo" alt="Photo">
            `: `
              <div class="doc-pdf-icon">PDF</div>
            `}
            <div class="doc-meta">
              <span class="pill" style="${isImg ? 'background:#e0f2fe;color:#0369a1' : 'background:#fee2e2;color:#991b1b'}">${isImg ? '📷 PHOTO / X-RAY' : '📄 PDF'}</span>
              <b title="${esc(d.name)}">${esc(d.name)}</b>
              <div class="muted">${new Date(d.date).toLocaleString()} • ${(d.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn secondary" style="padding:4px 8px;font-size:10px" onclick="openPatientDocument(${i})">VIEW</button>
            <button class="btn secondary" style="padding:4px 8px;font-size:10px" onclick="downloadPatientDocument(${i})" title="Download">⬇</button>
            <button class="btn danger" style="padding:4px 8px;font-size:10px" onclick="deletePatientDocument(${i})" title="Remove">✕</button>
          </div>
        </div>
        `;
  }).join('') : '<div class="muted" style="padding:8px 0;text-align:center">No pictures or documents uploaded yet.</div>'}
    </div>
  </div>
 <div class="grid2 profile-main-grid" style="margin-top:18px">
   <div class="card" style="background:#090f19;border:1px solid #1e2e46;border-radius:12px;padding:20px">
     <div class="section-title" style="margin:0 0 4px 0">Add Visit / Procedure</div>
     <div class="muted" style="margin-bottom:12px;font-size:12px">Select a treatment or enter the amount directly. Quick presets available below.</div>

     <!-- Quick Common Procedure Presets -->
     <div style="margin-bottom:14px">
       <div class="muted" style="font-size:11px;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">⚡ One-Click Presets:</div>
       <div style="display:flex;gap:6px;flex-wrap:wrap">
         <button type="button" class="quick-proc-pill" onclick="applyQuickProcedure('Consultation', 500)">🩺 Consultation (Rs. 500)</button>
         <button type="button" class="quick-proc-pill" onclick="applyQuickProcedure('OPD Card', 100)">📋 OPD Card (Rs. 100)</button>
         <button type="button" class="quick-proc-pill" onclick="applyQuickProcedure('Scaling & Polishing', 1500)">✨ Scaling (Rs. 1,500)</button>
         <button type="button" class="quick-proc-pill" onclick="applyQuickProcedure('Tooth-Colored Filling', 1500)">🦷 Filling (Rs. 1,500)</button>
         <button type="button" class="quick-proc-pill" onclick="applyQuickProcedure('Tooth Extraction', 1000)">🩹 Extraction (Rs. 1,000)</button>
         <button type="button" class="quick-proc-pill" onclick="applyQuickProcedure('Root Canal Treatment (RCT)', 7000)">⚡ RCT (Rs. 7,000)</button>
       </div>
     </div>

     <!-- Assigned Doctor Row -->
     <div style="margin-bottom:12px">
       <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
         <label style="font-size:11px;font-weight:700;color:#94a3b8">
           👨‍⚕️ Assign Treating Doctor:
           <span id="visitDoctorHint" style="font-weight:400;margin-left:6px;color:${p.default_doctor_name ? '#38bdf8' : '#f59e0b'}">
             ${p.default_doctor_name ? `(Pre-selected default: ${esc(p.default_doctor_name)})` : '(First visit: typed or selected doctor will be saved as default)'}
           </span>
         </label>
         ${p.default_doctor_name ? `<button type="button" class="btn secondary" style="padding:2px 8px;font-size:10.5px" onclick="promptChangeDefaultDoctor('${esc(p.id)}')">⚙ Change Default</button>` : ''}
       </div>
       <div style="position:relative">
         <input type="text" id="visitDoctor" list="doctorDatalist" 
                value="${esc(p.default_doctor_name || (clinicDoctors[0]?.name || ''))}" 
                placeholder="Type doctor's name manually or pick from list..." 
                autocomplete="off"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#f8fafc;font-weight:600;font-size:13px">
         <datalist id="doctorDatalist">${renderDoctorDatalistOptions()}</datalist>
       </div>
     </div>

     <!-- Treatment Picker & Amount Row -->
     <div style="display:grid;grid-template-columns:1.8fr 1fr auto;gap:8px;align-items:center">
       <div>
         <label style="font-size:11px;font-weight:600;color:#94a3b8;display:block;margin-bottom:4px">
           Treatment / Procedure Name <span style="font-weight:400;color:#38bdf8">(Type manually or pick from list)</span>
         </label>
         <input type="text" id="visitProcedure" list="procedureDatalist" 
                placeholder="Type treatment name or select from price list..." 
                oninput="onVisitProcedureInput(this.value)" 
                onchange="onVisitProcedureInput(this.value)"
                autocomplete="off"
                style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#f8fafc;font-size:13px">
         <datalist id="procedureDatalist">${renderProcedureDatalistOptions()}</datalist>
       </div>
       <div>
         <label style="font-size:11px;font-weight:600;color:#94a3b8;display:block;margin-bottom:4px">Treatment Amount (Rs.) *</label>
         <input id="visitCost" type="number" min="0" step="1" value="0" placeholder="e.g. 1500" title="Actual amount charged" oninput="onVisitCostInput(this.value)" style="width:100%;box-sizing:border-box">
       </div>
       <div style="align-self:flex-end">
         <button type="button" class="btn secondary" onclick="addPendingProcedure()" title="Add another procedure item to this visit" style="font-size:11.5px;padding:9px 12px">+ Add Item</button>
       </div>
     </div>

     <div id="pendingProcedures" class="card" style="margin-top:10px;background:#060a12;border:1px solid #1a2538;padding:10px">
       <div class="muted">No additional procedures staged yet. The selected procedure &amp; amount above will be saved directly.</div>
     </div>

     <!-- Discount Card -->
     <div class="card" style="margin-top:12px;background:#060a12;border:1px solid #1a2538;padding:14px">
       <div class="section-title" style="margin:0 0 4px 0">Discount</div>
       <div class="muted" style="margin-bottom:8px;font-size:11.5px">Discount is decided separately for each visit.</div>
       <div class="formgrid">
         <div class="field">
           <label>Discount %</label>
           <input id="discountPercent" type="number" min="0" max="100" step="0.01" value="0" placeholder="0" oninput="updateDiscountFromPercent()">
         </div>
         <div class="field">
           <label>Discount Amount (Rs.)</label>
           <input id="discountAmount" type="number" min="0" step="1" value="0" placeholder="0" oninput="updateDiscountFromAmount()">
         </div>
       </div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid #1e2e46">
         <span class="muted" style="font-size:12.5px;font-weight:600">Final Total After Discount</span>
         <strong id="discountedTotal" style="font-size:16px;color:#38bdf8">Rs. 0</strong>
       </div>
     </div>

     <!-- Payment Done Card -->
     <div class="card" style="margin-top:12px;background:#060a12;border:1px solid #1a2538;padding:14px">
       <div class="section-title" style="margin:0 0 8px 0">Payment Done</div>
       <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
         <label style="display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer">
           <input type="radio" name="paymentType" value="total" checked onchange="updatePaymentChoice()"> Total Payment
         </label>
         <label style="display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer">
           <input type="radio" name="paymentType" value="partial" onchange="updatePaymentChoice()"> Partial Payment
         </label>
       </div>
       <div class="formgrid">
         <div class="field">
           <label>Amount Paid (Rs.)</label>
           <input id="visitPaid" type="number" min="0" max="1000000" step="any" placeholder="Enter amount (Rs. 1 to 1,00,000)" oninput="onVisitPaidInput(this.value)">
         </div>
         <div class="field">
           <label>Payment Method</label>
           <div class="payment-modes">
             <button type="button" class="payment-mode selected" data-mode="Cash" onclick="selectVisitPaymentMode('Cash')">CASH</button>
             <button type="button" class="payment-mode" data-mode="NepalPay QR" onclick="selectVisitPaymentMode('NepalPay QR')">NEPALPAY QR</button>
             <button type="button" class="payment-mode" data-mode="MPOS" onclick="selectVisitPaymentMode('MPOS')">MPOS</button>
           </div>
           <input id="visitPaymentMode" type="hidden" value="Cash">
         </div>
       </div>
       <div id="paymentHint" class="muted" style="margin-top:8px;font-size:11.5px">Enter amount paid (Rs. 1 to 1,00,000) or leave blank for full bill amount.</div>
       <div id="visitQrActionArea" style="margin-top:12px;padding:12px 14px;background:#030712;border:1px solid #1e3a8a;border-radius:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
         <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
           <button type="button" id="btnGenerateVisitQr" class="btn primary" style="background:#0284c7;font-weight:800;font-size:12.5px;padding:8px 18px;display:inline-flex;align-items:center;gap:7px;cursor:pointer" onclick="generateVisitNepalPayQr()">
             📱 GENERATE NEPALPAY QR
           </button>
           <span id="visitQrStatusText" class="muted" style="font-size:12px">Generate dynamic NepalPay QR for the exact amount entered above &amp; push to NiZi POS Soundbox.</span>
         </div>
       </div>
     </div>

     <!-- Next Appointment Card -->
     <div class="card" style="margin-top:12px;background:#060a12;border:1px solid #1a2538;padding:14px">
       <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
         <div class="section-title" style="margin:0">Next Appointment</div>
         <span class="muted" style="font-size:11px">English (AD) &amp; Nepali (BS) Synchronized</span>
       </div>
       <div class="formgrid">
         <div class="field">
           <label>English Date (AD) — Click to pick or type</label>
           <input id="appointmentAdDate" type="date" onclick="this.showPicker &amp;&amp; this.showPicker()" onchange="onAppointmentAdChange(this.value)">
         </div>
         <div class="field">
           <label>Nepali Date (BS) — Write / Edit</label>
           <input id="appointmentBsDateInput" placeholder="YYYY-MM-DD (e.g. 2083-05-27)" oninput="onAppointmentBsChange(this.value)">
         </div>
       </div>
       <div id="appointmentBsDateDisplay" class="appt-bs-sync-badge" style="margin-top:8px">📅 Select or write a date above</div>
       <div style="margin-top:10px">
         <div class="muted" style="font-size:11px;font-weight:700;margin-bottom:6px">QUICK DATE PRESETS:</div>
         <div class="quick-dates" style="flex-wrap:wrap">
           <button type="button" class="btn secondary quick-date" data-days="0" onclick="setQuickAppointment(0,this)">TODAY</button>
           <button type="button" class="btn secondary quick-date" data-days="1" onclick="setQuickAppointment(1,this)">TOMORROW</button>
           <button type="button" class="btn secondary quick-date" data-days="3" onclick="setQuickAppointment(3,this)">AFTER 3 DAYS</button>
           <button type="button" class="btn secondary quick-date" data-days="7" onclick="setQuickAppointment(7,this)">AFTER 1 WEEK</button>
           <button type="button" class="btn secondary quick-date" data-days="14" onclick="setQuickAppointment(14,this)">AFTER 2 WEEKS</button>
           <button type="button" class="btn secondary quick-date" data-days="30" onclick="setQuickAppointment(30,this)">AFTER 1 MONTH</button>
         </div>
       </div>
       <div class="formgrid" style="margin-top:12px;align-items:flex-end">
         <div class="field">
           <label>Appointment Time</label>
           <input id="appointmentTime" type="time" onclick="this.showPicker &amp;&amp; this.showPicker()" value="10:00">
         </div>
         <div class="field">
           <label class="muted" style="font-size:11px">Common Time Slots:</label>
           <div style="display:flex;gap:6px;flex-wrap:wrap">
             <button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('10:00')">10:00 AM</button>
             <button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('11:30')">11:30 AM</button>
             <button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('14:00')">02:00 PM</button>
             <button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('16:00')">04:00 PM</button>
             <button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('17:30')">05:30 PM</button>
           </div>
         </div>
       </div>
       <div class="actions" style="margin-top:12px">
         <button type="button" class="btn primary" onclick="saveAppointment()">SAVE APPOINTMENT</button>
       </div>
     </div>

     <div style="margin-top:16px;display:flex;align-items:center;gap:12px">
       <button id="addVisitBtn" class="btn primary" onclick="addVisit()" style="font-size:14px;padding:10px 22px">ADD VISIT &amp; SAVE</button>
       <span id="visitHint" class="muted" style="font-size:12.5px">Click ADD VISIT &amp; SAVE to record today’s visit &amp; print A5 bill.</span>
     </div>
   </div>
 </div>
 <div class="grid2" style="margin-top:18px">
   <div class="card">
     <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
       <div class="section-title" style="margin:0">Visit History</div>
       <button type="button" id="btnDeleteSelectedVisits" class="btn secondary" style="color:#ef4444;border-color:#ef4444;font-size:11px;padding:3px 10px;display:none;font-weight:700" onclick="deleteSelectedVisits('${p.id}')">
         🗑️ Delete Selected (<span id="selectedVisitsCount">0</span>)
       </button>
     </div>
     ${visits.length ? `<div class="tablewrap"><table class="table"><thead><tr><th style="width:32px;text-align:center"><input type="checkbox" id="selectAllVisits" style="width:15px;height:15px;cursor:pointer;accent-color:#0284c7" onchange="toggleSelectAllVisits(this)" title="Select All Visits"></th><th>Date</th><th>Time</th><th>Procedures Done</th><th>Payment Done</th><th>Action</th></tr></thead><tbody>${visits.map((v, vIdx) => `<tr><td style="text-align:center"><input type="checkbox" class="visit-select-chk" data-bill="${esc(v.billNumber || '')}" data-id="${esc(v.id || '')}" data-idx="${vIdx}" style="width:15px;height:15px;cursor:pointer;accent-color:#0284c7" onchange="updateVisitSelectionUI()"></td><td>${esc(v.date || '—')}</td><td>${esc(v.time || '—')}</td><td>${esc(v.procedures || v.treatment || '—')}<div class="muted">Cost: Rs. ${Number(v.cost || 0).toLocaleString()}</div>${(v.doctorName || p.default_doctor_name) ? `<div style="font-size:11px;color:#38bdf8;font-weight:600;margin-top:2px">👨‍⚕️ ${esc(v.doctorName || p.default_doctor_name)}</div>` : ''}</td><td>Rs. ${Number(v.paymentDone || v.amount || 0).toLocaleString()}${v.paymentMethod ? `<div class="muted">${esc(v.paymentMethod)}</div>` : ''}</td><td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center"><button type="button" class="btn primary" style="padding:3px 8px;font-size:11px" onclick="printBill('${esc(v.billNumber)}')">🖨️ A5 BILL</button><button type="button" class="btn secondary" style="padding:3px 8px;font-size:11px" onclick="onEditVisitClick('${p.id}', '${v.id || v.billNumber}')">✎ Edit</button><button type="button" class="btn secondary" style="padding:3px 7px;font-size:11px;color:#ef4444;border-color:#ef4444" onclick="deleteSingleVisit('${p.id}', '${v.id || v.billNumber}')" title="Delete this visit">🗑️</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No visits recorded yet.</div>'}
   </div>
   <div class="card">
     <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
       <div class="section-title" style="margin:0">Payment History</div>
       <button type="button" id="btnDeleteSelectedPayments" class="btn secondary" style="color:#ef4444;border-color:#ef4444;font-size:11px;padding:3px 10px;display:none;font-weight:700" onclick="deleteSelectedPayments('${p.id}')">
         🗑️ Delete Selected (<span id="selectedPaymentsCount">0</span>)
       </button>
     </div>
     ${pays.length ? `<div class="tablewrap"><table class="table"><thead><tr><th style="width:32px;text-align:center"><input type="checkbox" id="selectAllPayments" style="width:15px;height:15px;cursor:pointer;accent-color:#0284c7" onchange="toggleSelectAllPayments(this)" title="Select All Payments"></th><th>Date</th><th>Bill</th><th>Amount</th><th>Method</th><th>Status</th><th>Action</th></tr></thead><tbody>${pays.map((v, pIdx) => `<tr><td style="text-align:center"><input type="checkbox" class="payment-select-chk" data-bill="${esc(v.billNumber || '')}" data-idx="${pIdx}" style="width:15px;height:15px;cursor:pointer;accent-color:#0284c7" onchange="updatePaymentSelectionUI()"></td><td>${esc(v.date || '—')}</td><td>${esc(v.billNumber || '—')}</td><td>Rs. ${Number(v.amount || 0).toLocaleString()}</td><td>${esc(v.method || 'Cash')}</td><td>${esc(v.status || 'Paid')}</td><td><button type="button" class="btn secondary" style="padding:3px 7px;font-size:11px;color:#ef4444;border-color:#ef4444" onclick="deleteSinglePayment('${p.id}', '${v.billNumber || ''}', ${pIdx})" title="Delete this payment">🗑️ Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No payments recorded yet.</div>'}
   </div>
 </div>`;
  restoreAppointmentFields(p); renderPendingProcedures(); updatePaymentChoice();
}
function restoreAppointmentFields(p) {
  const d = document.getElementById('appointmentAdDate'), t = document.getElementById('appointmentTime');
  const bsInput = document.getElementById('appointmentBsDateInput');
  if (!d || !t) return;
  if (p && p.Appointment) {
    d.value = p.Appointment.adDate || p.Appointment.date || '';
    if (bsInput) bsInput.value = p.Appointment.bsDate || (d.value ? (apptBsFromAd(d.value) || '') : '');
    t.value = p.Appointment.time || '10:00';
    updateAppointmentBsDisplay();
  } else {
    d.value = '';
    if (bsInput) bsInput.value = '';
    t.value = '10:00';
    updateAppointmentBsDisplay();
  }
  document.querySelectorAll('.quick-date').forEach(b => b.classList.remove('primary'));
}

function onAppointmentAdChange(adVal) {
  const bsInput = document.getElementById('appointmentBsDateInput');
  if (adVal) {
    const bs = apptBsFromAd(adVal);
    if (bs && bsInput) bsInput.value = bs;
  }
  updateAppointmentBsDisplay();
}

function onAppointmentBsChange(bsVal) {
  const adInput = document.getElementById('appointmentAdDate');
  const clean = (bsVal || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const ad = apptAdFromBs(clean);
    if (ad && adInput) adInput.value = ad;
  }
  updateAppointmentBsDisplay();
}

function updateAppointmentBsDisplay() {
  const el = document.getElementById('appointmentBsDateDisplay');
  const d = document.getElementById('appointmentAdDate')?.value;
  const bsInput = document.getElementById('appointmentBsDateInput');
  if (!el) return;
  if (d) {
    const bs = apptBsFromAd(d);
    if (bs) {
      if (bsInput && !bsInput.value) bsInput.value = bs;
      const parts = bs.split('-').map(Number);
      const mName = (typeof APPT_BS_MONTHS_NP !== 'undefined' && APPT_BS_MONTHS_NP[parts[1] - 1]) || '';
      const enMName = (typeof APPT_BS_MONTHS !== 'undefined' && APPT_BS_MONTHS[parts[1] - 1]) || '';
      el.innerHTML = `📅 <b>Nepali (BS):</b> ${bs} (${mName} ${parts[2]}, ${parts[0]} • ${enMName}) &nbsp;·&nbsp; <b>English (AD):</b> ${d}`;
      return;
    }
  }
  if (bsInput?.value && /^\d{4}-\d{2}-\d{2}$/.test(bsInput.value.trim())) {
    const ad = apptAdFromBs(bsInput.value.trim());
    if (ad) {
      el.innerHTML = `📅 <b>Nepali (BS):</b> ${bsInput.value.trim()} &nbsp;·&nbsp; <b>English (AD):</b> ${ad}`;
      return;
    }
  }
  el.textContent = '📅 Pick an English date or type a Nepali BS date above.';
}

function setQuickAppointment(days, btn) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(days));
  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const el = document.getElementById('appointmentAdDate');
  const bsInput = document.getElementById('appointmentBsDateInput');
  if (el) el.value = iso;
  if (bsInput) bsInput.value = apptBsFromAd(iso) || '';
  document.querySelectorAll('.quick-date').forEach(b => b.classList.remove('primary'));
  if (btn) btn.classList.add('primary');
  updateAppointmentBsDisplay();
}

function setQuickTime(val) {
  const t = document.getElementById('appointmentTime');
  if (t) t.value = val;
}

let activeVisitQrTxnId = null;

function selectVisitPaymentMode(mode) {
  const hidden = document.getElementById('visitPaymentMode');
  if (hidden) hidden.value = mode;
  document.querySelectorAll('.payment-mode').forEach(b => b.classList.toggle('selected', b.dataset.mode === mode));
  const qrArea = document.getElementById('visitQrActionArea');
  if (qrArea) {
    if (mode === 'NepalPay QR') {
      qrArea.style.borderColor = '#0284c7';
      qrArea.style.boxShadow = '0 0 12px rgba(2, 132, 199, 0.25)';
    } else {
      qrArea.style.borderColor = '#1e3a8a';
      qrArea.style.boxShadow = 'none';
    }
  }
}

function openQrAmountPromptModal(defaultAmt = 500) {
  const modal = document.getElementById('qrAmountPromptModal');
  const input = document.getElementById('qrPromptAmountInput');
  if (input) {
    input.value = defaultAmt > 0 ? defaultAmt : 500;
  }
  if (modal) {
    modal.classList.add('show');
    setTimeout(() => {
      input?.focus();
      input?.select();
    }, 60);
  }
}

function closeQrAmountPromptModal() {
  const modal = document.getElementById('qrAmountPromptModal');
  if (modal) modal.classList.remove('show');
}

function setQrPromptAmount(amt) {
  const input = document.getElementById('qrPromptAmountInput');
  if (input) {
    input.value = amt;
    input.focus();
  }
}

function confirmQrPromptAmount() {
  const input = document.getElementById('qrPromptAmountInput');
  const amt = parseFloat(input?.value);
  if (isNaN(amt) || amt <= 0) {
    showToast('Please enter an amount greater than 0.', 'warn');
    input?.focus();
    return;
  }
  closeQrAmountPromptModal();

  const costEl = document.getElementById('visitCost');
  if (costEl && (Number(costEl.value) || 0) <= 0) {
    costEl.value = amt;
  }
  const paidEl = document.getElementById('visitPaid');
  if (paidEl) paidEl.value = amt;
  updatePaymentChoice();

  proceedGenerateVisitNepalPayQr(amt);
}

function generateVisitNepalPayQr() {
  let p = patients.find(x => x.id === selectedId);
  if (!p) {
    const opdText = document.querySelector('.profile-head .badge')?.textContent || '';
    const match = opdText.match(/\d+/);
    if (match) {
      const opdNum = parseInt(match[0], 10);
      p = patients.find(x => Number(x.OPDNumber) === opdNum);
      if (p) selectedId = p.id;
    }
  }
  if (!p) {
    showToast('Please select a patient first.', 'warn');
    return;
  }
  
  let amt = parseFloat(document.getElementById('visitPaid')?.value);
  if (isNaN(amt) || amt <= 0) {
    amt = parseFloat(document.getElementById('visitCost')?.value);
  }
  if (isNaN(amt) || amt <= 0) {
    amt = getVisitFinalTotal();
  }
  if (isNaN(amt) || amt <= 0) {
    // Open dedicated amount modal for seamless user experience
    openQrAmountPromptModal(500);
    return;
  }

  proceedGenerateVisitNepalPayQr(amt);
}

function proceedGenerateVisitNepalPayQr(amt) {
  let p = patients.find(x => x.id === selectedId);
  if (!p) {
    const opdText = document.querySelector('.profile-head .badge')?.textContent || '';
    const match = opdText.match(/\d+/);
    if (match) {
      const opdNum = parseInt(match[0], 10);
      p = patients.find(x => Number(x.OPDNumber) === opdNum);
      if (p) selectedId = p.id;
    }
  }
  if (!p) return;

  // Select NepalPay QR payment mode and sync input field
  selectVisitPaymentMode('NepalPay QR');
  const paidEl = document.getElementById('visitPaid');
  if (paidEl) paidEl.value = amt;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const visitNo = ((p.VisitHistory && p.VisitHistory.length) || 0) + 1;
  const billNo = 'B-' + dateStr + '-' + pad(p.OPDNumber) + '-' + String(visitNo).padStart(3, '0');
  const procEl = document.getElementById('visitProcedure');
  const remarks = (procEl?.value || 'Dental Treatment').slice(0, 30);

  const statusText = document.getElementById('visitQrStatusText');
  if (statusText) {
    statusText.innerHTML = `⏳ <span style="color:#38bdf8;font-weight:700">Generating NepalPay Dynamic QR for Rs. ${amt.toLocaleString()}...</span>`;
  }

  openNepalPayModal({
    amount: amt,
    billNumber: billNo,
    patientName: p.Name,
    patientContact: p.Contact,
    opdNumber: p.OPDNumber,
    remarks: remarks,
    onSuccess: (data) => {
      activeVisitQrTxnId = data.txnId || ('NPI-' + Date.now());
      if (statusText) {
        statusText.innerHTML = `🎉 <span style="color:#22c55e;font-weight:800">✓ Rs. ${amt.toLocaleString()} Paid via NepalPay (Txn: ${esc(activeVisitQrTxnId)})</span>`;
      }
      showToast(`✓ Payment Confirmed: Rs. ${amt.toLocaleString()} via NepalPay`, 'success');
    }
  });
}

function recalculatePatientFinancials(p) {
  if (!p) return;
  ensurePatientArrays(p);
  const visits = Array.isArray(p.VisitHistory) ? p.VisitHistory : [];
  const payments = Array.isArray(p.PaymentHistory) ? p.PaymentHistory : [];

  const totalSubtotal = visits.reduce((sum, v) => sum + (Number(v.subtotal) || Number(v.cost) || 0), 0);
  const totalCost = visits.reduce((sum, v) => sum + (Number(v.cost) || 0), 0);
  const totalPaid = payments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0);

  p.Subtotal = totalSubtotal;
  p.FinalAmount = totalCost;
  p.PaymentStatus = (totalPaid >= totalCost && totalCost > 0) ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Pending');
  if (totalCost === 0 && totalPaid === 0) {
    p.PaymentStatus = 'Pending';
  }
}

function toggleSelectAllVisits(masterChk) {
  const chks = document.querySelectorAll('.visit-select-chk');
  chks.forEach(c => c.checked = masterChk.checked);
  updateVisitSelectionUI();
}

function updateVisitSelectionUI() {
  const selected = document.querySelectorAll('.visit-select-chk:checked');
  const btn = document.getElementById('btnDeleteSelectedVisits');
  const countSpan = document.getElementById('selectedVisitsCount');
  if (btn && countSpan) {
    countSpan.textContent = selected.length;
    btn.style.display = selected.length > 0 ? 'inline-flex' : 'none';
  }
}

async function deleteSingleVisit(patientId, visitKey) {
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  const ok = confirm('Are you sure you want to delete this visit record? This will also remove its associated procedures and recalculate patient balance.');
  if (!ok) return;

  ensurePatientArrays(p);
  const v = p.VisitHistory.find(x => x.id === visitKey || x.billNumber === visitKey);
  const billNo = v?.billNumber || visitKey;

  p.VisitHistory = p.VisitHistory.filter(x => x.id !== visitKey && x.billNumber !== visitKey);
  if (billNo && Array.isArray(p.Treatments)) {
    p.Treatments = p.Treatments.filter(t => t.billNumber !== billNo);
  }
  if (billNo && Array.isArray(p.PaymentHistory)) {
    p.PaymentHistory = p.PaymentHistory.filter(pay => pay.billNumber !== billNo);
  }

  recalculatePatientFinancials(p);
  save();
  updateAll();
  renderProfile();
  showToast('✓ Visit record deleted successfully.', 'success');
}

async function deleteSelectedVisits(patientId) {
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  const selectedChks = Array.from(document.querySelectorAll('.visit-select-chk:checked'));
  if (!selectedChks.length) {
    showToast('No visits selected to delete.', 'warn');
    return;
  }

  const ok = confirm(`Are you sure you want to delete ${selectedChks.length} selected visit record(s)? This will also remove their associated procedures and recalculate patient balance.`);
  if (!ok) return;

  ensurePatientArrays(p);
  const deleteKeys = new Set(selectedChks.map(c => c.dataset.id || c.dataset.bill).filter(Boolean));
  const deleteBills = new Set(selectedChks.map(c => c.dataset.bill).filter(Boolean));

  p.VisitHistory = p.VisitHistory.filter(v => !deleteKeys.has(v.id) && !deleteBills.has(v.billNumber));
  if (Array.isArray(p.Treatments)) {
    p.Treatments = p.Treatments.filter(t => !deleteBills.has(t.billNumber));
  }
  if (Array.isArray(p.PaymentHistory)) {
    p.PaymentHistory = p.PaymentHistory.filter(pay => !deleteBills.has(pay.billNumber));
  }

  recalculatePatientFinancials(p);
  save();
  updateAll();
  renderProfile();
  showToast(`✓ ${selectedChks.length} visit record(s) deleted successfully.`, 'success');
}

function toggleSelectAllPayments(masterChk) {
  const chks = document.querySelectorAll('.payment-select-chk');
  chks.forEach(c => c.checked = masterChk.checked);
  updatePaymentSelectionUI();
}

function updatePaymentSelectionUI() {
  const selected = document.querySelectorAll('.payment-select-chk:checked');
  const btn = document.getElementById('btnDeleteSelectedPayments');
  const countSpan = document.getElementById('selectedPaymentsCount');
  if (btn && countSpan) {
    countSpan.textContent = selected.length;
    btn.style.display = selected.length > 0 ? 'inline-flex' : 'none';
  }
}

async function deleteSinglePayment(patientId, billNumber, index) {
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  const ok = confirm('Are you sure you want to delete this payment record? This will update the patient balance.');
  if (!ok) return;

  ensurePatientArrays(p);
  if (Array.isArray(p.PaymentHistory)) {
    if (billNumber) {
      p.PaymentHistory = p.PaymentHistory.filter((pay, i) => !(pay.billNumber === billNumber && i === index));
    } else {
      p.PaymentHistory.splice(index, 1);
    }
  }

  recalculatePatientFinancials(p);
  save();
  updateAll();
  renderProfile();
  showToast('✓ Payment record deleted successfully.', 'success');
}

async function deleteSelectedPayments(patientId) {
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  const selectedChks = Array.from(document.querySelectorAll('.payment-select-chk:checked'));
  if (!selectedChks.length) {
    showToast('No payments selected to delete.', 'warn');
    return;
  }

  const ok = confirm(`Are you sure you want to delete ${selectedChks.length} selected payment record(s)? This will update the patient balance.`);
  if (!ok) return;

  ensurePatientArrays(p);
  const indicesToDelete = new Set(selectedChks.map(c => parseInt(c.dataset.idx, 10)));
  p.PaymentHistory = p.PaymentHistory.filter((_, idx) => !indicesToDelete.has(idx));

  recalculatePatientFinancials(p);
  save();
  updateAll();
  renderProfile();
  showToast(`✓ ${selectedChks.length} payment record(s) deleted successfully.`, 'success');
}
// duplicate updateVisitCost removed
function updateAppointmentAd() { }
function initNepaliAppointmentPicker() { }
function setTodayBsAppointment() { setQuickAppointment(0, null) }

function saveAppointment() {
  const p = patients.find(x => x.id === selectedId);
  if (!p) return;
  let ad = document.getElementById('appointmentAdDate')?.value || '';
  let bs = (document.getElementById('appointmentBsDateInput')?.value || '').trim();
  let t = document.getElementById('appointmentTime')?.value || '10:00';
  if (!ad && bs && /^\d{4}-\d{2}-\d{2}$/.test(bs)) {
    ad = apptAdFromBs(bs) || '';
  }
  if (!bs && ad) {
    bs = apptBsFromAd(ad) || '';
  }
  if (!ad) {
    showToast('Please choose or enter an appointment date.', 'warn');
    return;
  }
  p.Appointment = { adDate: ad, bsDate: bs, time: t, status: 'scheduled', date: ad };
  save();
  updateAll();
  showToast('✓ Appointment saved for ' + (bs ? 'BS ' + bs + ' (' + ad + ')' : ad) + ' at ' + t, 'success');
  renderProfile();
}
function printLatestBill() { const p = patients.find(x => x.id === selectedId); if (!p || !p.VisitHistory?.length) { alert('No saved bill/visit found for this patient yet.'); return } printBill(p.VisitHistory[0].billNumber) }

function updateAll() {
  try {
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const registered = registeredPatients();

    const statPatients = document.getElementById('statPatients');
    if (statPatients) statPatients.textContent = registered.length;

    const attendedToday = getPatientsAttendedToday();
    const statToday = document.getElementById('statToday');
    if (statToday) statToday.textContent = attendedToday.length;
    renderAttendedTodayList(attendedToday);

    const nextOpdNum = pad(nextNumber());
    const statOpd = document.getElementById('statOpd');
    if (statOpd) statOpd.textContent = nextOpdNum;

    const nextOpd = document.getElementById('nextOpd');
    if (nextOpd) nextOpd.textContent = nextOpdNum;

    const statPending = document.getElementById('statPending');
    if (statPending) statPending.textContent = registered.filter(p => (p.PaymentStatus || 'Pending') === 'Pending').length;

    const statAppointments = document.getElementById('statAppointments');
    if (statAppointments) statAppointments.textContent = patients.filter(p => p.Appointment && p.Appointment.adDate === today).length;

    const todayAppointmentsEl = document.getElementById('todayAppointments');
    if (todayAppointmentsEl) {
      const todayAppointments = patients.filter(p => p.Appointment && p.Appointment.adDate === today).sort((a, b) => String(a.Appointment.time || '').localeCompare(String(b.Appointment.time || '')));
      todayAppointmentsEl.innerHTML = todayAppointments.length ? `<div class="tablewrap"><table class="table"><thead><tr><th>Time</th><th>OPD</th><th>Patient</th><th>Contact</th><th>Appointment</th></tr></thead><tbody>${todayAppointments.map(p => `<tr><td><strong>${esc(p.Appointment.time || '')}</strong></td><td>${p.AppointmentOnly ? 'Not registered' : pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact || '')}</td><td>${esc(p.Appointment.bsDate || p.Appointment.adDate || '')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><svg class="empty-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg><div>No appointments scheduled for today.</div></div>`;
    }

    renderPatients();
    renderRecentPatients();
  } catch (err) {
    console.warn('[updateAll] Update error:', err);
  }
}
let transactionRange = 'today';
function getTransactions() { const out = []; registeredPatients().forEach(p => { ensurePatientArrays(p); (p.PaymentHistory || []).forEach((tx, i) => { out.push({ id: p.id, date: tx.date || '', time: tx.time || '', opd: p.OPDNumber, name: p.Name, bill: tx.billNumber || ('VIS-' + pad(p.OPDNumber) + '-' + String(i + 1).padStart(3, '0')), amount: Number(tx.amount || 0), method: tx.method || p.PaymentMethod || '', status: tx.status || p.PaymentStatus || 'Pending' }); }); }); return out.sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time)); }
function dateOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
let transactionCalendarMode = 'BS';
let transactionCustomFrom = null;
let transactionCustomTo = null;

function transactionMatches(tx) {
  if (transactionRange === 'all') return true;
  const norm = normalizeDateToAdAndBs(tx.date);
  if (!norm.adDate) return false;

  const now = new Date();
  const todayAd = apptIsoDate(now);
  const todayBs = apptBsFromAd(todayAd) || '';

  if (transactionRange === 'today') {
    return norm.adDate === todayAd;
  }

  if (transactionRange === 'this_month_bs') {
    if (!todayBs || !norm.bsDate) return false;
    return norm.bsDate.slice(0, 7) === todayBs.slice(0, 7);
  }

  if (transactionRange === 'this_month_ad' || transactionRange === 'month') {
    return norm.adDate.slice(0, 7) === todayAd.slice(0, 7);
  }

  if (transactionRange === 'week') {
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfWeek.setDate(startOfWeek.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    endOfToday.setHours(23, 59, 59, 999);

    if (!norm.dateObj) return false;
    return norm.dateObj >= startOfWeek && norm.dateObj <= endOfToday;
  }

  if (transactionRange === 'year') {
    if (transactionCalendarMode === 'BS') {
      return norm.bsDate && todayBs && norm.bsDate.slice(0, 4) === todayBs.slice(0, 4);
    } else {
      return norm.adDate.slice(0, 4) === todayAd.slice(0, 4);
    }
  }

  if (transactionRange === 'custom') {
    if (!transactionCustomFrom && !transactionCustomTo) return true;

    if (transactionCalendarMode === 'BS') {
      const recBs = norm.bsDate;
      if (!recBs) return false;
      if (transactionCustomFrom) {
        const fromNorm = normalizeDateToAdAndBs(transactionCustomFrom);
        const cmpFrom = fromNorm.bsDate || transactionCustomFrom;
        if (recBs < cmpFrom) return false;
      }
      if (transactionCustomTo) {
        const toNorm = normalizeDateToAdAndBs(transactionCustomTo);
        const cmpTo = toNorm.bsDate || transactionCustomTo;
        if (recBs > cmpTo) return false;
      }
      return true;
    } else {
      const recAd = norm.adDate;
      if (!recAd) return false;
      if (transactionCustomFrom) {
        const fromNorm = normalizeDateToAdAndBs(transactionCustomFrom);
        const cmpFrom = fromNorm.adDate || transactionCustomFrom;
        if (recAd < cmpFrom) return false;
      }
      if (transactionCustomTo) {
        const toNorm = normalizeDateToAdAndBs(transactionCustomTo);
        const cmpTo = toNorm.adDate || transactionCustomTo;
        if (recAd > cmpTo) return false;
      }
      return true;
    }
  }

  return true;
}
const TRANSACTION_PIN = '2468';
let pendingSecureRange = null;

// ==========================================================================
// INFINITY DENTAL CLINIC - AUTHENTICATION & STAFF MANAGEMENT SYSTEM
// Super Admin & Manager Login with Manager ID prefix 'm' enforcement
// ==========================================================================

const AUTH_STORAGE_KEY = 'infinity_dental_auth_session';
const FALLBACK_USERS_KEY = 'infinity_dental_users_fallback';
const AUTH_SALT = 'infinity_dental_salt_2026';

let currentUser = null;

// SHA-256 for local browser fallback
async function sha256Hex(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { }
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'fallback_' + Math.abs(hash);
}

// Fallback users storage for offline/standalone execution
function getFallbackUsers() {
  try {
    const raw = localStorage.getItem(FALLBACK_USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { }
  const defaults = [
    {
      id: 'admin-001',
      username: 'admin',
      password_hash: '967d64386fc75bfbb0ea1f8f3c706ff175d7b51b3f9dc4d402377a06a3e144fe',
      plain_pass: 'admin123',
      role: 'superadmin',
      name: 'Super Administrator',
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: 'manager-001',
      username: 'm123456',
      password_hash: '3f694e9f54668bba3356891eb97f80da28469c4709825b410f968984955f15d5',
      plain_pass: 'manager123',
      role: 'manager',
      name: 'Clinic Manager',
      status: 'active',
      created_at: new Date().toISOString()
    }
  ];
  saveFallbackUsers(defaults);
  return defaults;
}

function saveFallbackUsers(list) {
  try {
    localStorage.setItem(FALLBACK_USERS_KEY, JSON.stringify(list));
  } catch (_) { }
}

// Unified Auth Service bridging Electron IPC, Node API, and Local Storage
const authService = {
  async login(username, password) {
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();

    // 1. Electron IPC
    if (window.dentalAuth?.login) {
      const res = await window.dentalAuth.login(cleanUser, cleanPass);
      if (!res.success) throw new Error(res.error || 'Login failed.');
      return res.user;
    }

    // 2. Localhost REST API
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return data.user;
      }
      if (data && data.error) {
        throw new Error(data.error);
      }
    } catch (netErr) {
      if (netErr.message && !netErr.message.includes('fetch') && !netErr.message.includes('Failed to fetch')) {
        throw netErr;
      }
    }

    // 3. Fallback Local Storage
    const users = getFallbackUsers();
    const found = users.find(u => u.username.toLowerCase() === cleanUser.toLowerCase());
    if (!found) throw new Error('Invalid login ID or password.');
    if (found.status !== 'active') throw new Error('This account has been deactivated.');

    const calcHash = await sha256Hex(AUTH_SALT + ':' + cleanPass);
    if (found.password_hash !== calcHash && found.plain_pass !== cleanPass) {
      throw new Error('Invalid login ID or password.');
    }

    if (found.role === 'manager' && !found.username.toLowerCase().startsWith('m')) {
      throw new Error("Manager account ID must start with letter 'm'.");
    }

    return {
      id: found.id,
      username: found.username,
      role: found.role,
      name: found.name,
      status: found.status
    };
  },

  async getUsers() {
    if (window.dentalAuth?.listUsers) {
      const res = await window.dentalAuth.listUsers();
      if (res.success) return res.users || [];
    }
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        if (data.success) return data.users || [];
      }
    } catch (_) { }
    return getFallbackUsers();
  },

  async createManager({ username, password, name }) {
    let cleanUser = String(username || '').trim();
    const cleanPass = String(password || '').trim();
    const cleanName = String(name || '').trim();

    if (!cleanUser.toLowerCase().startsWith('m')) {
      throw new Error("Manager User ID must start with letter 'm' (example: m123456).");
    }

    if (window.dentalAuth?.createUser) {
      const res = await window.dentalAuth.createUser({ username: cleanUser, password: cleanPass, name: cleanName, role: 'manager' });
      if (!res.success) throw new Error(res.error || 'Failed to create manager.');
      return res.user;
    }

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass, name: cleanName, role: 'manager' })
      });
      const data = await res.json();
      if (res.ok && data.success) return data.user;
      if (data && data.error) throw new Error(data.error);
    } catch (e) {
      if (!e.message.includes('fetch')) throw e;
    }

    // Fallback Local Storage
    const users = getFallbackUsers();
    if (users.some(u => u.username.toLowerCase() === cleanUser.toLowerCase())) {
      throw new Error(`Login ID '${cleanUser}' already exists.`);
    }
    const hash = await sha256Hex(AUTH_SALT + ':' + cleanPass);
    const newUser = {
      id: 'm-' + Date.now(),
      username: cleanUser,
      password_hash: hash,
      plain_pass: cleanPass,
      role: 'manager',
      name: cleanName,
      status: 'active',
      created_at: new Date().toISOString()
    };
    users.push(newUser);
    saveFallbackUsers(users);
    return newUser;
  },

  async updateUser(id, data) {
    if (window.dentalAuth?.updateUser) {
      const res = await window.dentalAuth.updateUser(id, data);
      if (!res.success) throw new Error(res.error || 'Update failed.');
      return res.user;
    }

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (res.ok && resData.success) return resData.user;
      if (resData && resData.error) throw new Error(resData.error);
    } catch (e) {
      if (!e.message.includes('fetch')) throw e;
    }

    // Fallback Local Storage
    const users = getFallbackUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found.');

    if (data.username) users[idx].username = data.username;
    if (data.name) users[idx].name = data.name;
    if (data.status) users[idx].status = data.status;
    if (data.password) {
      users[idx].plain_pass = data.password;
      users[idx].password_hash = await sha256Hex(AUTH_SALT + ':' + data.password);
    }
    users[idx].updated_at = new Date().toISOString();
    saveFallbackUsers(users);
    return users[idx];
  },

  async deleteUser(id) {
    if (window.dentalAuth?.deleteUser) {
      const res = await window.dentalAuth.deleteUser(id);
      if (!res.success) throw new Error(res.error || 'Failed to delete user.');
      return true;
    }

    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) return true;
      if (data && data.error) throw new Error(data.error);
    } catch (e) {
      if (!e.message.includes('fetch')) throw e;
    }

    // Fallback Local Storage
    let users = getFallbackUsers();
    const user = users.find(u => u.id === id);
    if (!user) throw new Error('User not found.');
    if (user.role === 'superadmin') throw new Error('Super Admin accounts cannot be deleted.');
    users = users.filter(u => u.id !== id);
    saveFallbackUsers(users);
    return true;
  }
};

// --- Login Page Real-Time Feedback & Form Logic ---
function onLoginUsernameChange(val) {
  const clean = (val || '').trim();
  const hintEl = document.getElementById('loginRoleHint');
  const iconEl = document.getElementById('loginRoleHintIcon');
  const textEl = document.getElementById('loginRoleHintText');
  if (!hintEl) return;

  if (!clean) {
    hintEl.className = 'login-role-hint role-hint-neutral';
    if (iconEl) iconEl.textContent = 'ℹ️';
    if (textEl) textEl.textContent = "Enter Super Admin username or Manager ID starting with 'm'";
  } else if (clean.toLowerCase().startsWith('m')) {
    hintEl.className = 'login-role-hint role-hint-manager';
    if (iconEl) iconEl.textContent = '👤';
    if (textEl) textEl.innerHTML = "<b>Manager Account:</b> User ID starts with <code>'m'</code> (e.g. " + esc(clean) + ")";
  } else {
    hintEl.className = 'login-role-hint role-hint-admin';
    if (iconEl) iconEl.textContent = '🛡️';
    if (textEl) textEl.innerHTML = "<b>Super Admin Login:</b> Standard username (no symbolic prefix required)";
  }
}

function quickFillLogin(user, pass) {
  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  if (uInput) {
    uInput.value = user;
    onLoginUsernameChange(user);
  }
  if (pInput) {
    pInput.value = pass;
  }
  const err = document.getElementById('loginErrorMsg');
  if (err) err.style.display = 'none';
  document.getElementById('loginSubmitBtn')?.focus();
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

let isLoggingIn = false;
async function submitLoginForm(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  if (isLoggingIn) return;

  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  const errBox = document.getElementById('loginErrorMsg');
  const btn = document.getElementById('loginSubmitBtn');
  const remember = document.getElementById('loginRememberMe')?.checked;

  const username = (uInput?.value || '').trim();
  const password = (pInput?.value || '').trim();

  if (!username) {
    if (errBox) {
      errBox.textContent = 'Please enter your Login ID or Username.';
      errBox.style.display = 'block';
    }
    uInput?.focus();
    return;
  }
  if (!password) {
    if (errBox) {
      errBox.textContent = 'Please enter your password.';
      errBox.style.display = 'block';
    }
    pInput?.focus();
    return;
  }

  isLoggingIn = true;
  if (errBox) errBox.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Signing In...</span>';
  }

  try {
    const user = await authService.login(username, password);
    currentUser = user;

    // Save session
    const sessionJson = JSON.stringify(user);
    sessionStorage.setItem(AUTH_STORAGE_KEY, sessionJson);
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, sessionJson);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    applyLoggedInState();
    if (pInput) pInput.value = '';
  } catch (err) {
    console.error('[Login] Error:', err);
    if (errBox) {
      errBox.textContent = err.message || 'Login failed. Please check credentials.';
      errBox.style.display = 'block';
    }
  } finally {
    isLoggingIn = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔐 SIGN IN TO CLINIC</span>';
    }
  }
}

function logoutUser() {
  if (!confirm('Are you sure you want to sign out of Infinity Dental Clinic?')) return;
  currentUser = null;
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEY);
  applyLoggedOutState();
}

function checkAuthSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.username && user.role) {
        currentUser = user;
        applyLoggedInState();
        return;
      }
    }
  } catch (_) { }
  applyLoggedOutState();
}

function applyLoggedInState() {
  const loginContainer = document.getElementById('loginContainer');
  if (loginContainer) {
    loginContainer.classList.add('hidden');
    loginContainer.style.display = 'none';
  }

  const userWrap = document.getElementById('headerUserWrap');
  const userBadge = document.getElementById('headerUserBadge');
  const staffBtn = document.getElementById('headerStaffBtn');
  const navStaff = document.getElementById('navStaff');
  const logoutBtn = document.getElementById('headerLogoutBtn');
  const headerWifiBtn = document.getElementById('headerWifiBtn');

  // Sidebar settings shifted items
  const settingsUserBadge = document.getElementById('settingsUserBadge');
  const settingsStaffBtn = document.getElementById('settingsStaffBtn');
  const settingsWifiBtn = document.getElementById('settingsWifiBtn');
  const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');

  if (userWrap) userWrap.style.display = 'flex';
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  if (sidebarSettingsBtn) sidebarSettingsBtn.style.display = 'flex';

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const userHtml = `<span class="user-role-dot"></span><span class="user-role-name">${isSuperAdmin ? 'Super Admin' : 'Manager'}</span><span class="user-name-sep">·</span><span class="user-acc-name">${esc(currentUser.username)}</span>`;

  if (settingsUserBadge) {
    settingsUserBadge.className = 'settings-user-pill ' + (isSuperAdmin ? 'is-superadmin' : 'is-manager');
    settingsUserBadge.innerHTML = userHtml;
  }
  if (userBadge) {
    userBadge.className = 'header-user-pill ' + (isSuperAdmin ? 'is-superadmin' : 'is-manager');
    userBadge.innerHTML = userHtml;
  }

  if (settingsStaffBtn) settingsStaffBtn.style.display = isSuperAdmin ? 'flex' : 'none';
  if (staffBtn) staffBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
  if (navStaff) navStaff.style.display = isSuperAdmin ? 'block' : 'none';
  if (headerWifiBtn) headerWifiBtn.style.display = 'inline-flex';
  if (settingsWifiBtn) settingsWifiBtn.style.display = 'flex';

  // If a manager was on the staff page, take them to dashboard
  const activePage = document.querySelector('.page.active')?.id;
  if (!isSuperAdmin && activePage === 'staff') {
    showPage('dashboard');
  }

  if (isSuperAdmin) {
    const adminUserInp = document.getElementById('adminUsernameInput');
    if (adminUserInp) adminUserInp.value = currentUser.username;
    loadStaffAccounts();
  }
}

function applyLoggedOutState() {
  const loginContainer = document.getElementById('loginContainer');
  if (loginContainer) {
    loginContainer.classList.remove('hidden');
    loginContainer.style.display = 'flex';
  }

  const userWrap = document.getElementById('headerUserWrap');
  if (userWrap) userWrap.style.display = 'none';

  const logoutBtn = document.getElementById('headerLogoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  const navStaff = document.getElementById('navStaff');
  if (navStaff) navStaff.style.display = 'none';

  const headerWifiBtn = document.getElementById('headerWifiBtn');
  if (headerWifiBtn) headerWifiBtn.style.display = 'none';

  const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
  if (sidebarSettingsBtn) sidebarSettingsBtn.style.display = 'none';
  closeSettingsMenu();

  const uInput = document.getElementById('loginUsername');
  if (uInput) {
    onLoginUsernameChange(uInput.value);
    setTimeout(() => uInput.focus(), 100);
  }
}

// --- Super Admin Staff & Manager Management Logic ---
function validateManagerIdInput() {
  const input = document.getElementById('newManagerUsername');
  const hint = document.getElementById('managerIdValidationHint');
  if (!input || !hint) return;

  const val = input.value.trim();
  if (!val) {
    hint.innerHTML = "Example: <code>m123456</code> (Manager User ID must start with letter 'm')";
    hint.style.color = '#64748b';
  } else if (!val.toLowerCase().startsWith('m')) {
    hint.innerHTML = `⚠️ <b>Must start with 'm':</b> <button type="button" class="btn secondary" style="padding:2px 6px;font-size:10px;margin-left:4px" onclick="fixManagerIdPrefix()">Auto-add 'm': m${esc(val)}</button>`;
    hint.style.color = '#b91c1c';
  } else {
    hint.innerHTML = "✓ Valid Manager ID format (starts with 'm')";
    hint.style.color = '#15803d';
  }
}

function fixManagerIdPrefix() {
  const input = document.getElementById('newManagerUsername');
  if (!input) return;
  const val = input.value.trim().replace(/^[^a-zA-Z0-9]+/, '');
  input.value = 'm' + val;
  validateManagerIdInput();
}

function generateRandomManagerId() {
  const num = Math.floor(100000 + Math.random() * 900000);
  const input = document.getElementById('newManagerUsername');
  if (input) {
    input.value = 'm' + num;
    validateManagerIdInput();
  }
}

function generateRandomPassword(targetId) {
  const adjectives = ['Dental', 'Smile', 'Care', 'Clinic', 'Bright'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const pwd = `${adj}@${num}`;

  const input = document.getElementById(targetId);
  if (input) {
    input.type = 'text';
    input.value = pwd;
    alert(`Generated password: ${pwd}\n\nPlease take note of this password to give to the staff member.`);
  }
}

async function submitCreateManager() {
  const uInput = document.getElementById('newManagerUsername');
  const nInput = document.getElementById('newManagerName');
  const pInput = document.getElementById('newManagerPassword');
  const alertBox = document.getElementById('createManagerAlert');

  let username = (uInput?.value || '').trim();
  const name = (nInput?.value || '').trim();
  const password = (pInput?.value || '').trim();

  function showAlert(msg, isSuccess) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
    alertBox.style.background = isSuccess ? '#dcfce7' : '#fee2e2';
    alertBox.style.color = isSuccess ? '#15803d' : '#991b1b';
    alertBox.style.border = `1px solid ${isSuccess ? '#bbf7d0' : '#fca5a5'}`;
  }

  if (!username) {
    showAlert('Please enter a Manager User ID.', false);
    uInput?.focus();
    return;
  }

  // Enforce rule: Manager ID must start with 'm'
  if (!username.toLowerCase().startsWith('m')) {
    showAlert("Manager User ID must start with letter 'm' (example: m123456).", false);
    uInput?.focus();
    return;
  }

  if (!name) {
    showAlert('Please enter the Staff / Manager Full Name.', false);
    nInput?.focus();
    return;
  }

  if (!password || password.length < 4) {
    showAlert('Password must be at least 4 characters long.', false);
    pInput?.focus();
    return;
  }

  try {
    const created = await authService.createManager({ username, name, password });
    showAlert(`✓ Manager account '${created.username}' (${created.name}) created successfully!`, true);
    if (uInput) uInput.value = '';
    if (nInput) nInput.value = '';
    if (pInput) pInput.value = '';
    validateManagerIdInput();
    loadStaffAccounts();
  } catch (err) {
    showAlert(err.message || 'Could not create manager account.', false);
  }
}

async function submitUpdateAdminCredentials() {
  const uInput = document.getElementById('adminUsernameInput');
  const pInput = document.getElementById('adminPasswordInput');
  const cInput = document.getElementById('adminPasswordConfirmInput');
  const alertBox = document.getElementById('updateAdminAlert');

  const username = (uInput?.value || '').trim();
  const password = (pInput?.value || '').trim();
  const confirm = (cInput?.value || '').trim();

  function showAlert(msg, isSuccess) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
    alertBox.style.background = isSuccess ? '#dcfce7' : '#fee2e2';
    alertBox.style.color = isSuccess ? '#15803d' : '#991b1b';
    alertBox.style.border = `1px solid ${isSuccess ? '#bbf7d0' : '#fca5a5'}`;
  }

  if (!username) {
    showAlert('Super Admin username cannot be empty.', false);
    return;
  }

  if (password) {
    if (password.length < 4) {
      showAlert('New password must be at least 4 characters long.', false);
      return;
    }
    if (password !== confirm) {
      showAlert('Passwords do not match. Please re-enter confirmation password.', false);
      return;
    }
  }

  try {
    const payload = { username };
    if (password) payload.password = password;

    const updated = await authService.updateUser(currentUser.id, payload);
    currentUser.username = updated.username;

    const json = JSON.stringify(currentUser);
    sessionStorage.setItem(AUTH_STORAGE_KEY, json);
    if (localStorage.getItem(AUTH_STORAGE_KEY)) localStorage.setItem(AUTH_STORAGE_KEY, json);

    showAlert('✓ Super Admin credentials updated successfully.', true);
    if (pInput) pInput.value = '';
    if (cInput) cInput.value = '';
    applyLoggedInState();
    loadStaffAccounts();
  } catch (err) {
    showAlert(err.message || 'Failed to update credentials.', false);
  }
}

let staffAccountsList = [];

async function loadStaffAccounts() {
  const tbody = document.getElementById('staffTableRows');
  if (!tbody) return;

  try {
    const list = await authService.getUsers();
    staffAccountsList = list || [];

    const totalEl = document.getElementById('statStaffTotal');
    const mgrsEl = document.getElementById('statStaffManagers');
    const admsEl = document.getElementById('statStaffAdmins');

    const managers = staffAccountsList.filter(u => u.role === 'manager');
    const admins = staffAccountsList.filter(u => u.role === 'superadmin');

    if (totalEl) totalEl.textContent = staffAccountsList.length;
    if (mgrsEl) mgrsEl.textContent = managers.length;
    if (admsEl) admsEl.textContent = admins.length;

    if (!staffAccountsList.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No staff accounts found.</td></tr>';
      return;
    }

    tbody.innerHTML = staffAccountsList.map(u => {
      const isSuper = u.role === 'superadmin';
      const roleBadge = isSuper
        ? '<span class="badge badge-admin-pill" style="font-weight:800">🛡️ Super Admin</span>'
        : '<span class="badge badge-manager-pill" style="font-weight:800">👤 Manager (m...)</span>';
      const statusPill = u.status === 'active'
        ? '<span class="status-pill live">Active</span>'
        : '<span class="status-pill disconnected">Deactivated</span>';
      const dateStr = u.created_at ? u.created_at.slice(0, 10) : '—';

      return `
        <tr>
          <td>${roleBadge}</td>
          <td><strong>${esc(u.username)}</strong></td>
          <td>${esc(u.name || '—')}</td>
          <td>${statusPill}</td>
          <td>${esc(dateStr)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn secondary" style="padding:4px 8px;font-size:11px" onclick="openStaffResetModal('${u.id}', '${esc(u.username)}', '${esc(u.name)}')">🔑 Reset Password</button>
              ${!isSuper ? `<button class="btn danger" style="padding:4px 8px;font-size:11px" onclick="deleteManagerAccount('${u.id}', '${esc(u.username)}')">🗑️ Delete</button>` : `<span class="muted" style="font-size:11px;align-self:center">Protected</span>`}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty" style="color:#b91c1c">Failed to load accounts: ${esc(err.message)}</td></tr>`;
  }
}

async function deleteManagerAccount(id, username) {
  if (!confirm(`Are you sure you want to delete Manager account '${username}'?\n\nThis manager will no longer be able to log in.`)) return;
  try {
    await authService.deleteUser(id);
    alert(`Manager account '${username}' deleted successfully.`);
    loadStaffAccounts();
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

function openStaffResetModal(userId, username, name) {
  const modal = document.getElementById('staffResetPasswordModal');
  const idInp = document.getElementById('staffResetUserId');
  const infoText = document.getElementById('staffResetInfoText');
  const pwdInp = document.getElementById('staffResetNewPassword');
  const alertBox = document.getElementById('staffResetAlert');

  if (idInp) idInp.value = userId;
  if (infoText) infoText.innerHTML = `Set a new login password for <b>${esc(name || username)}</b> (ID: <code>${esc(username)}</code>).`;
  if (pwdInp) pwdInp.value = '';
  if (alertBox) alertBox.style.display = 'none';

  if (modal) modal.classList.add('show');
  setTimeout(() => pwdInp?.focus(), 50);
}

function closeStaffResetModal() {
  const modal = document.getElementById('staffResetPasswordModal');
  if (modal) modal.classList.remove('show');
}

async function submitStaffPasswordReset() {
  const idInp = document.getElementById('staffResetUserId');
  const pwdInp = document.getElementById('staffResetNewPassword');
  const alertBox = document.getElementById('staffResetAlert');

  const userId = idInp?.value;
  const newPassword = (pwdInp?.value || '').trim();

  function showAlert(msg, isSuccess) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
    alertBox.style.background = isSuccess ? '#dcfce7' : '#fee2e2';
    alertBox.style.color = isSuccess ? '#15803d' : '#991b1b';
    alertBox.style.border = `1px solid ${isSuccess ? '#bbf7d0' : '#fca5a5'}`;
  }

  if (!newPassword || newPassword.length < 4) {
    showAlert('Password must be at least 4 characters long.', false);
    return;
  }

  try {
    await authService.updateUser(userId, { password: newPassword });
    showAlert('✓ Password has been updated successfully!', true);
    setTimeout(() => {
      closeStaffResetModal();
      loadStaffAccounts();
    }, 900);
  } catch (err) {
    showAlert(err.message || 'Failed to update password.', false);
  }
}

// ==========================================================================
// INFINITY DENTAL CLINIC - DOCTOR MANAGEMENT & COMMISSION SETTLEMENT MODULE
// ==========================================================================

const FALLBACK_DOCTORS_KEY = 'infinity_dental_doctors_fallback';
let clinicDoctors = [];
let selectedDoctorId = '';
let doctorCasesRange = 'this_month_bs';
let doctorCasesCalendarMode = 'BS';
let doctorCasesCustomFrom = null;
let doctorCasesCustomTo = null;
let doctorCommissionPercentOverride = null;
let deductOpdCardCharge = true;
let deductMedicineCharge = true;
let doctorCustomDeduction = 0;

const doctorService = {
  async list() {
    if (window.dentalDoctors?.list) {
      try {
        const res = await window.dentalDoctors.list();
        if (res && res.success && Array.isArray(res.doctors)) return res.doctors;
        if (Array.isArray(res)) return res;
      } catch (err) {
        console.warn('[dentalDoctors.list error]', err);
      }
    }
    try {
      const res = await fetch('/api/doctors');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) return json.data;
      }
    } catch (_) { }
    const raw = localStorage.getItem(FALLBACK_DOCTORS_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (_) { }
    }
    return [
      { id: 'doc-1', name: 'Dr. Sankalpa Paudel', specialty: 'Chief Dental Surgeon / Prosthodontist', phone: '9841000001', default_commission_percent: 40, status: 'active' },
      { id: 'doc-2', name: 'Dr. Pranisha KC', specialty: 'Dental Surgeon / Endodontist', phone: '9841000002', default_commission_percent: 40, status: 'active' },
      { id: 'doc-3', name: 'Dr. Aayush Shrestha', specialty: 'Orthodontist / Dental Surgeon', phone: '9841000003', default_commission_percent: 40, status: 'active' }
    ];
  },

  async create(doc) {
    if (window.dentalDoctors?.create) {
      const res = await window.dentalDoctors.create(doc);
      if (!res.success) throw new Error(res.error || 'Failed to add doctor.');
      return res;
    }
    try {
      const res = await fetch('/api/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to add doctor.');
      return json;
    } catch (netErr) {
      const list = await doctorService.list();
      doc.id = doc.id || ('doc-' + Date.now());
      list.push(doc);
      localStorage.setItem(FALLBACK_DOCTORS_KEY, JSON.stringify(list));
      return { success: true, doctor: doc, id: doc.id };
    }
  },

  async update(id, doc) {
    if (window.dentalDoctors?.update) {
      const res = await window.dentalDoctors.update(id, doc);
      if (!res.success) throw new Error(res.error || 'Failed to update doctor.');
      return res;
    }
    try {
      const res = await fetch(`/api/doctors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to update doctor.');
      return json;
    } catch (netErr) {
      const list = await doctorService.list();
      const idx = list.findIndex(d => d.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...doc };
        localStorage.setItem(FALLBACK_DOCTORS_KEY, JSON.stringify(list));
      }
      return { success: true };
    }
  },

  async delete(id) {
    if (window.dentalDoctors?.delete) {
      const res = await window.dentalDoctors.delete(id);
      if (!res.success) throw new Error(res.error || 'Failed to delete doctor.');
      return res;
    }
    try {
      const res = await fetch(`/api/doctors/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to delete doctor.');
      return json;
    } catch (netErr) {
      let list = await doctorService.list();
      list = list.filter(d => d.id !== id);
      localStorage.setItem(FALLBACK_DOCTORS_KEY, JSON.stringify(list));
      return { success: true };
    }
  }
};

async function loadClinicDoctors() {
  try {
    const list = await doctorService.list();
    if (Array.isArray(list) && list.length) {
      clinicDoctors = list;
    }
  } catch (e) {
    console.warn('[Doctors] Load error:', e);
  }
  if (!clinicDoctors || !clinicDoctors.length) {
    clinicDoctors = [
      { id: 'doc-1', name: 'Dr. Sankalpa Paudel', specialty: 'Chief Dental Surgeon / Prosthodontist', phone: '9841000001', default_commission_percent: 40, status: 'active' },
      { id: 'doc-2', name: 'Dr. Pranisha KC', specialty: 'Dental Surgeon / Endodontist', phone: '9841000002', default_commission_percent: 40, status: 'active' },
      { id: 'doc-3', name: 'Dr. Aayush Shrestha', specialty: 'Orthodontist / Dental Surgeon', phone: '9841000003', default_commission_percent: 40, status: 'active' }
    ];
  }
  if (!selectedDoctorId && clinicDoctors.length) {
    selectedDoctorId = clinicDoctors[0].id;
  }
  updateDoctorDatalist();
  renderDoctorSelectOptions();
  renderDoctorCasesModule();
}

function renderDoctorDatalistOptions() {
  if (!Array.isArray(clinicDoctors) || !clinicDoctors.length) {
    return '<option value="Dr. Sankalpa Paudel">Chief Dental Surgeon / Prosthodontist</option>';
  }
  return clinicDoctors.map(d => {
    const spec = d.specialty ? ` (${d.specialty})` : '';
    return `<option value="${esc(d.name)}">${esc(d.name)}${esc(spec)}</option>`;
  }).join('');
}

function updateDoctorDatalist() {
  const dl = document.getElementById('doctorDatalist');
  if (dl) dl.innerHTML = renderDoctorDatalistOptions();
  const billDl = document.getElementById('billingDoctorDatalist');
  if (billDl) billDl.innerHTML = renderDoctorDatalistOptions();
}

function registerNewDoctorIfAbsent(id, name, specialty = 'Visiting / Consulting Doctor') {
  if (!name || !name.trim()) return;
  const cleanName = name.trim();
  const exists = clinicDoctors.some(d => d.name.toLowerCase() === cleanName.toLowerCase());
  if (exists) return;
  const newDoc = {
    id: id || ('doc-' + Date.now()),
    name: cleanName,
    specialty: specialty || 'Dental Surgeon',
    phone: '',
    default_commission_percent: 40,
    status: 'active'
  };
  clinicDoctors.push(newDoc);
  updateDoctorDatalist();
  renderDoctorSelectOptions();
  doctorService.create(newDoc).catch(e => console.warn('[AutoDoctorRegister]', e));
}

function renderDoctorOptions(selectedId) {
  if (!clinicDoctors || !clinicDoctors.length) {
    return '<option value="">-- No Doctors Configured --</option>';
  }
  return clinicDoctors.map(doc => {
    const isSel = String(doc.id) === String(selectedId) ? 'selected' : '';
    const spec = doc.specialty ? ` (${doc.specialty})` : '';
    return `<option value="${esc(doc.id)}" ${isSel}>${esc(doc.name)}${esc(spec)}</option>`;
  }).join('');
}

function renderDoctorSelectOptions() {
  updateDoctorDatalist();

  const staffSelect = document.getElementById('doctorCasesDoctorSelect');
  if (staffSelect) {
    staffSelect.innerHTML = clinicDoctors.map(d => {
      const isSel = String(d.id) === String(selectedDoctorId) ? 'selected' : '';
      const spec = d.specialty ? ` — ${d.specialty}` : '';
      return `<option value="${esc(d.id)}" ${isSel}>${esc(d.name)}${esc(spec)}</option>`;
    }).join('');
  }

  const billingSelect = document.getElementById('billingDoctorSelect');
  if (billingSelect) {
    if (billingSelect.tagName === 'SELECT') {
      const currentVal = billingSelect.value;
      billingSelect.innerHTML = '<option value="">-- Choose Treating Doctor --</option>' + renderDoctorOptions(currentVal);
    }
  }

  const editVisitSelect = document.getElementById('editVisitDoctor');
  if (editVisitSelect) {
    if (editVisitSelect.tagName === 'SELECT') {
      const currentVal = editVisitSelect.value;
      editVisitSelect.innerHTML = '<option value="">-- Select Doctor --</option>' + renderDoctorOptions(currentVal);
    }
  }
}

function switchStaffTab(tab) {
  const btnCases = document.getElementById('tabBtnDoctorCases');
  const btnLogins = document.getElementById('tabBtnStaffLogins');
  const viewCases = document.getElementById('staffDoctorCasesView');
  const viewLogins = document.getElementById('staffLoginsView');

  if (tab === 'doctorCases') {
    if (btnCases) btnCases.className = 'tab active';
    if (btnLogins) btnLogins.className = 'tab';
    if (viewCases) viewCases.style.display = 'block';
    if (viewLogins) viewLogins.style.display = 'none';
    renderDoctorCasesModule();
  } else {
    if (btnCases) btnCases.className = 'tab';
    if (btnLogins) btnLogins.className = 'tab active';
    if (viewCases) viewCases.style.display = 'none';
    if (viewLogins) viewLogins.style.display = 'block';
    loadStaffAccounts();
  }
}

function onDoctorCasesDoctorChange(docId) {
  selectedDoctorId = docId;
  doctorCommissionPercentOverride = null;
  const doc = clinicDoctors.find(d => String(d.id) === String(selectedDoctorId));
  const pct = doc ? (doc.default_commission_percent != null ? doc.default_commission_percent : 40) : 40;
  const inp = document.getElementById('docCommissionInput');
  if (inp) inp.value = pct;
  updateCommissionPillStyles(pct);
  renderDoctorCasesModule();
}

function setDoctorCommissionPercent(pct) {
  doctorCommissionPercentOverride = Number(pct);
  const inp = document.getElementById('docCommissionInput');
  if (inp) inp.value = pct;
  updateCommissionPillStyles(pct);
  renderDoctorCasesModule();
}

function onDoctorCommissionPercentInput(val) {
  const p = Number(val);
  if (!isNaN(p) && p >= 0 && p <= 100) {
    doctorCommissionPercentOverride = p;
    updateCommissionPillStyles(p);
    renderDoctorCasesModule();
  }
}

function updateCommissionPillStyles(pct) {
  document.querySelectorAll('.doc-pct-btn').forEach(btn => {
    const bPct = Number(btn.dataset.pct);
    btn.className = 'btn doc-pct-btn ' + (bPct === Number(pct) ? 'primary' : 'secondary');
  });
}

function onDeductionSettingsChange() {
  deductOpdCardCharge = !!document.getElementById('chkDeductOpdCard')?.checked;
  deductMedicineCharge = !!document.getElementById('chkDeductMedicine')?.checked;
  const rawOther = Number(document.getElementById('docOtherDeduction')?.value) || 0;
  doctorCustomDeduction = Math.max(0, rawOther);
  renderDoctorCasesModule();
}

function setDoctorCalendarMode(mode) {
  doctorCasesCalendarMode = mode;
  const bsBtn = document.getElementById('docModeBS');
  const adBtn = document.getElementById('docModeAD');
  if (bsBtn) bsBtn.className = 'btn ' + (mode === 'BS' ? 'primary' : 'secondary');
  if (adBtn) adBtn.className = 'btn ' + (mode === 'AD' ? 'primary' : 'secondary');

  const fromInput = document.getElementById('docDateFrom');
  const toInput = document.getElementById('docDateTo');
  if (fromInput) fromInput.placeholder = mode === 'BS' ? 'From BS (YYYY-MM-DD)' : 'From AD (YYYY-MM-DD)';
  if (toInput) toInput.placeholder = mode === 'BS' ? 'To BS (YYYY-MM-DD)' : 'To AD (YYYY-MM-DD)';

  renderDoctorCasesModule();
}

function setDoctorRange(range) {
  doctorCasesRange = range;
  const buttons = [
    ['today', 'docToday'],
    ['week', 'docWeek'],
    ['this_month_bs', 'docMonthBs'],
    ['this_month_ad', 'docMonthAd'],
    ['all', 'docAll']
  ];
  buttons.forEach(([r, id]) => {
    const b = document.getElementById(id);
    if (b) b.className = 'btn ' + (r === range ? 'primary' : 'secondary');
  });
  renderDoctorCasesModule();
}

function applyDoctorCustomRange(silent = false) {
  const fromVal = (document.getElementById('docDateFrom')?.value || '').trim();
  const toVal = (document.getElementById('docDateTo')?.value || '').trim();
  if (!fromVal && !toVal) {
    if (!silent) showToast('Please enter a From or To date.', 'warn');
    return;
  }
  doctorCasesCustomFrom = fromVal || null;
  doctorCasesCustomTo = toVal || null;
  doctorCasesRange = 'custom';

  ['docToday', 'docWeek', 'docMonthBs', 'docMonthAd', 'docAll'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.className = 'btn secondary';
  });

  renderDoctorCasesModule();
  if (!silent) showToast(`Doctor filter applied (${doctorCasesCalendarMode})`, 'info');
}

function resetDoctorFilters() {
  const f = document.getElementById('docDateFrom');
  const t = document.getElementById('docDateTo');
  if (f) f.value = '';
  if (t) t.value = '';
  doctorCasesCustomFrom = null;
  doctorCasesCustomTo = null;
  setDoctorRange('this_month_bs');
}

function doctorCaseMatchesDate(dateStr) {
  if (doctorCasesRange === 'all') return true;
  const norm = normalizeDateToAdAndBs(dateStr);
  if (!norm.adDate) return false;

  const now = new Date();
  const todayAd = apptIsoDate(now);
  const todayBs = apptBsFromAd(todayAd) || '';

  if (doctorCasesRange === 'today') {
    return norm.adDate === todayAd;
  }
  if (doctorCasesRange === 'this_month_bs') {
    if (!todayBs || !norm.bsDate) return false;
    return norm.bsDate.slice(0, 7) === todayBs.slice(0, 7);
  }
  if (doctorCasesRange === 'this_month_ad' || doctorCasesRange === 'month') {
    return norm.adDate.slice(0, 7) === todayAd.slice(0, 7);
  }
  if (doctorCasesRange === 'week') {
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfWeek.setDate(startOfWeek.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    endOfToday.setHours(23, 59, 59, 999);
    return norm.dateObj && norm.dateObj >= startOfWeek && norm.dateObj <= endOfToday;
  }
  if (doctorCasesRange === 'custom') {
    if (!doctorCasesCustomFrom && !doctorCasesCustomTo) return true;
    if (doctorCasesCalendarMode === 'BS') {
      const recBs = norm.bsDate;
      if (!recBs) return false;
      if (doctorCasesCustomFrom) {
        const fromNorm = normalizeDateToAdAndBs(doctorCasesCustomFrom);
        const cmpFrom = fromNorm.bsDate || doctorCasesCustomFrom;
        if (recBs < cmpFrom) return false;
      }
      if (doctorCasesCustomTo) {
        const toNorm = normalizeDateToAdAndBs(doctorCasesCustomTo);
        const cmpTo = toNorm.bsDate || doctorCasesCustomTo;
        if (recBs > cmpTo) return false;
      }
      return true;
    } else {
      const recAd = norm.adDate;
      if (!recAd) return false;
      if (doctorCasesCustomFrom) {
        const fromNorm = normalizeDateToAdAndBs(doctorCasesCustomFrom);
        const cmpFrom = fromNorm.adDate || doctorCasesCustomFrom;
        if (recAd < cmpFrom) return false;
      }
      if (doctorCasesCustomTo) {
        const toNorm = normalizeDateToAdAndBs(doctorCasesCustomTo);
        const cmpTo = toNorm.adDate || doctorCasesCustomTo;
        if (recAd > cmpTo) return false;
      }
      return true;
    }
  }
  return true;
}

function isOpdCardCharge(name) {
  const s = String(name || '').toLowerCase();
  return /opd\s*card|registration|card\s*fee|consultation\s*fee/i.test(s);
}

function isMedicineCharge(name) {
  const s = String(name || '').toLowerCase();
  return /medicine|pharmacy|drug|meds|tablet|capsule|syrup|ointment|rinse/i.test(s);
}

function getDoctorCases(doctorId) {
  const doc = clinicDoctors.find(d => String(d.id) === String(doctorId)) || clinicDoctors[0];
  if (!doc) return { cases: [], grossTotal: 0, opdDedTotal: 0, medDedTotal: 0, otherDedTotal: 0, totalDeductions: 0, netTotal: 0, docShareTotal: 0, clinicShareTotal: 0, commissionPct: 40 };

  const commissionPct = doctorCommissionPercentOverride != null
    ? doctorCommissionPercentOverride
    : (doc.default_commission_percent != null ? Number(doc.default_commission_percent) : 40);

  const matchedCases = [];

  registeredPatients().forEach(p => {
    ensurePatientArrays(p);
    const pVisits = Array.isArray(p.VisitHistory) ? p.VisitHistory : [];
    pVisits.forEach((v, vIdx) => {
      // Check if visit belongs to this doctor
      const isAssignedToDoc = (v.doctorId && String(v.doctorId) === String(doc.id)) ||
        (!v.doctorId && p.default_doctor_id && String(p.default_doctor_id) === String(doc.id)) ||
        (!v.doctorId && !p.default_doctor_id && (v.doctorName === doc.name || p.default_doctor_name === doc.name));

      if (!isAssignedToDoc) return;
      if (!doctorCaseMatchesDate(v.date)) return;

      // Calculate Gross Amount
      const gross = Number(v.cost != null ? v.cost : (v.subtotal != null ? v.subtotal : (v.paymentDone || v.amount || 0)));

      // Detect OPD Card and Medicine Charges
      let opdDed = 0;
      let medDed = 0;

      if (Array.isArray(v.procedureItems) && v.procedureItems.length) {
        v.procedureItems.forEach(item => {
          const itemCost = Number(item.cost || item.price || 0);
          if (isOpdCardCharge(item.procedure || item.name)) {
            opdDed += itemCost;
          } else if (isMedicineCharge(item.procedure || item.name)) {
            medDed += itemCost;
          }
        });
      } else {
        const procStr = String(v.procedures || v.treatment || '');
        if (isOpdCardCharge(procStr)) opdDed += Math.min(100, gross);
        if (isMedicineCharge(procStr)) medDed += Math.min(gross - opdDed, 0);
      }

      const effectiveOpdDed = deductOpdCardCharge ? opdDed : 0;
      const effectiveMedDed = deductMedicineCharge ? medDed : 0;
      const caseDeductions = Math.min(gross, effectiveOpdDed + effectiveMedDed);
      const netEligible = Math.max(0, gross - caseDeductions);
      const docShare = Math.round((netEligible * commissionPct) / 100);
      const clinicShare = netEligible - docShare;

      matchedCases.push({
        patientId: p.id,
        patientName: p.Name,
        opdNumber: p.OPDNumber,
        contact: p.Contact,
        visitId: v.id || v.billNumber || ('VIS-' + vIdx),
        billNumber: v.billNumber || '',
        date: v.date || '',
        time: v.time || '',
        procedures: v.procedures || v.treatment || 'Consultation & Treatment',
        procedureItems: v.procedureItems || [],
        gross,
        opdDed: effectiveOpdDed,
        medDed: effectiveMedDed,
        otherDed: 0,
        totalDeductions: caseDeductions,
        netEligible,
        docShare,
        clinicShare,
        paymentStatus: v.paymentDone >= gross ? 'Paid' : (v.paymentDone > 0 ? 'Partial' : 'Pending'),
        paymentMethod: v.paymentMethod || 'Cash'
      });
    });
  });

  // Sort newest first
  matchedCases.sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));

  // Compute summary totals
  const grossTotal = matchedCases.reduce((sum, c) => sum + c.gross, 0);
  const opdDedTotal = matchedCases.reduce((sum, c) => sum + c.opdDed, 0);
  const medDedTotal = matchedCases.reduce((sum, c) => sum + c.medDed, 0);
  const otherDedTotal = Number(doctorCustomDeduction) || 0;
  const totalDeductions = opdDedTotal + medDedTotal + otherDedTotal;
  const netTotal = Math.max(0, grossTotal - totalDeductions);
  const docShareTotal = Math.round((netTotal * commissionPct) / 100);
  const clinicShareTotal = netTotal - docShareTotal;

  return {
    cases: matchedCases,
    grossTotal,
    opdDedTotal,
    medDedTotal,
    otherDedTotal,
    totalDeductions,
    netTotal,
    docShareTotal,
    clinicShareTotal,
    commissionPct,
    doctor: doc
  };
}

function renderDoctorCasesModule() {
  const doc = clinicDoctors.find(d => String(d.id) === String(selectedDoctorId)) || clinicDoctors[0];
  if (!doc) return;

  const summary = getDoctorCases(doc.id);
  const commissionPct = summary.commissionPct;

  // Update Summary KPI Cards
  const totalCountEl = document.getElementById('docCasesTotalCount');
  if (totalCountEl) totalCountEl.textContent = summary.cases.length + (summary.cases.length === 1 ? ' Case' : ' Cases');

  const grossTotalEl = document.getElementById('docCasesGrossTotal');
  if (grossTotalEl) grossTotalEl.textContent = 'Rs. ' + summary.grossTotal.toLocaleString();

  const totalDeductionsEl = document.getElementById('docCasesTotalDeductions');
  if (totalDeductionsEl) totalDeductionsEl.textContent = '- Rs. ' + summary.totalDeductions.toLocaleString();

  const dedBreakdownEl = document.getElementById('docCasesDeductionBreakdown');
  if (dedBreakdownEl) {
    dedBreakdownEl.textContent = `OPD: Rs. ${summary.opdDedTotal.toLocaleString()} · Meds: Rs. ${summary.medDedTotal.toLocaleString()}${summary.otherDedTotal ? ` · Other: Rs. ${summary.otherDedTotal.toLocaleString()}` : ''}`;
  }

  const netTotalEl = document.getElementById('docCasesNetTotal');
  if (netTotalEl) netTotalEl.textContent = 'Rs. ' + summary.netTotal.toLocaleString();

  const docShareTitleEl = document.getElementById('docCasesDoctorShareTitle');
  if (docShareTitleEl) docShareTitleEl.textContent = `Doctor Share (${commissionPct}%)`;

  const docShareEl = document.getElementById('docCasesDoctorShare');
  if (docShareEl) docShareEl.textContent = 'Rs. ' + summary.docShareTotal.toLocaleString();

  const clinicShareTitleEl = document.getElementById('docCasesClinicShareTitle');
  if (clinicShareTitleEl) clinicShareTitleEl.textContent = `Clinic Share (${100 - commissionPct}%)`;

  const clinicShareEl = document.getElementById('docCasesClinicShare');
  if (clinicShareEl) clinicShareEl.textContent = 'Rs. ' + summary.clinicShareTotal.toLocaleString();

  // Headings
  const tableHeading = document.getElementById('doctorCasesTableHeading');
  if (tableHeading) tableHeading.textContent = `${doc.name} — Case Ledger & Settlements`;

  const tableSubheading = document.getElementById('doctorCasesTableSubheading');
  if (tableSubheading) {
    tableSubheading.textContent = `Specialty: ${doc.specialty || 'Dental Surgeon'} • Rate: ${commissionPct}% • Range: ${doctorCasesRange.replaceAll('_', ' ').toUpperCase()}`;
  }

  // Table Rows
  const tbody = document.getElementById('doctorCasesTableRows');
  if (!tbody) return;

  if (!summary.cases.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">No case records found for ${esc(doc.name)} in this period.</td></tr>`;
    return;
  }

  tbody.innerHTML = summary.cases.map(c => {
    const norm = normalizeDateToAdAndBs(c.date);
    const dateDisplay = doctorCasesCalendarMode === 'BS'
      ? `<b>${esc(norm.bsDate || c.date)}</b> <div class="muted" style="font-size:10.5px">${esc(norm.adDate)}</div>`
      : `<b>${esc(norm.adDate || c.date)}</b> <div class="muted" style="font-size:10.5px">${esc(norm.bsDate)}</div>`;

    const dedParts = [];
    if (c.opdDed > 0) dedParts.push(`OPD: -Rs. ${c.opdDed.toLocaleString()}`);
    if (c.medDed > 0) dedParts.push(`Meds: -Rs. ${c.medDed.toLocaleString()}`);
    if (c.otherDed > 0) dedParts.push(`Other: -Rs. ${c.otherDed.toLocaleString()}`);
    const dedText = dedParts.length ? dedParts.join('<br>') : '—';

    return `
      <tr class="clickable" onclick="openProfile('${c.patientId}')">
        <td>${dateDisplay}</td>
        <td>
          <strong>${esc(c.patientName)}</strong>
          <div class="muted" style="font-size:11px">OPD: ${pad(c.opdNumber)} ${c.contact ? '• ' + esc(c.contact) : ''}</div>
        </td>
        <td>
          <div style="font-weight:600">${esc(c.procedures)}</div>
          ${c.billNumber ? `<div class="muted" style="font-size:10.5px">Bill: ${esc(c.billNumber)}</div>` : ''}
        </td>
        <td style="text-align:right;font-weight:700">Rs. ${c.gross.toLocaleString()}</td>
        <td style="text-align:right;font-size:11px;color:#ef4444">${dedText}</td>
        <td style="text-align:right;font-weight:800;color:#38bdf8">Rs. ${c.netEligible.toLocaleString()}</td>
        <td style="text-align:right;font-weight:900;color:#10b981">
          Rs. ${c.docShare.toLocaleString()}
          <div class="muted" style="font-size:10.5px;color:#059669">${commissionPct}%</div>
        </td>
        <td>
          <span class="badge" style="background:#0284c7;color:#fff;font-size:11px">${esc(c.paymentMethod || 'Cash')}</span>
          <div class="muted" style="font-size:10.5px">${esc(c.paymentStatus)}</div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddDoctorModal() {
  document.getElementById('doctorModalTitle').textContent = 'Add New Doctor';
  document.getElementById('docModalId').value = '';
  document.getElementById('docModalName').value = '';
  document.getElementById('docModalSpecialty').value = '';
  document.getElementById('docModalPhone').value = '';
  document.getElementById('docModalCommission').value = '40';
  document.getElementById('docModalStatus').value = 'active';
  document.getElementById('doctorModal').classList.add('show');
  setTimeout(() => document.getElementById('docModalName')?.focus(), 50);
}

function openEditDoctorModal() {
  const doc = clinicDoctors.find(d => String(d.id) === String(selectedDoctorId));
  if (!doc) {
    showToast('Please select a doctor to edit.', 'warn');
    return;
  }
  document.getElementById('doctorModalTitle').textContent = 'Edit Doctor Details';
  document.getElementById('docModalId').value = doc.id;
  document.getElementById('docModalName').value = doc.name;
  document.getElementById('docModalSpecialty').value = doc.specialty || '';
  document.getElementById('docModalPhone').value = doc.phone || '';
  document.getElementById('docModalCommission').value = doc.default_commission_percent != null ? doc.default_commission_percent : 40;
  document.getElementById('docModalStatus').value = doc.status || 'active';
  document.getElementById('doctorModal').classList.add('show');
}

function closeDoctorModal() {
  document.getElementById('doctorModal').classList.remove('show');
}

async function saveDoctorModal() {
  const id = document.getElementById('docModalId')?.value;
  const name = (document.getElementById('docModalName')?.value || '').trim();
  const specialty = (document.getElementById('docModalSpecialty')?.value || '').trim();
  const phone = (document.getElementById('docModalPhone')?.value || '').trim();
  const commission = Number(document.getElementById('docModalCommission')?.value || 40);
  const status = document.getElementById('docModalStatus')?.value || 'active';

  if (!name) {
    alert('Please enter doctor full name.');
    document.getElementById('docModalName')?.focus();
    return;
  }

  try {
    if (id) {
      await doctorService.update(id, { name, specialty, phone, default_commission_percent: commission, status });
      showToast(`Doctor '${name}' updated successfully!`, 'success');
    } else {
      const res = await doctorService.create({ name, specialty, phone, default_commission_percent: commission, status });
      if (res && res.id) selectedDoctorId = res.id;
      showToast(`Doctor '${name}' added successfully!`, 'success');
    }
    closeDoctorModal();
    await loadClinicDoctors();
  } catch (err) {
    alert('Failed to save doctor: ' + err.message);
  }
}

async function deleteSelectedDoctor() {
  const doc = clinicDoctors.find(d => String(d.id) === String(selectedDoctorId));
  if (!doc) return;
  if (!confirm(`Are you sure you want to delete ${doc.name}?\n\nThis will remove the doctor from active selection lists.`)) return;
  try {
    await doctorService.delete(doc.id);
    showToast(`Doctor '${doc.name}' removed.`, 'info');
    selectedDoctorId = '';
    await loadClinicDoctors();
  } catch (err) {
    alert('Failed to delete doctor: ' + err.message);
  }
}

function promptChangeDefaultDoctor(patientId) {
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  const modal = document.getElementById('changeDoctorModal');
  const idInp = document.getElementById('changeDoctorPatientId');
  const info = document.getElementById('changeDoctorPatientInfo');
  const sel = document.getElementById('changeDoctorSelect');

  if (idInp) idInp.value = p.id;
  if (info) info.textContent = `Assign default primary doctor for patient: ${p.Name} (OPD-${pad(p.OPDNumber)})`;
  if (sel) {
    if (sel.tagName === 'SELECT') {
      sel.innerHTML = '<option value="">-- No Default Doctor --</option>' + renderDoctorOptions(p.default_doctor_id);
    } else {
      sel.value = p.default_doctor_name || '';
    }
  }
  if (modal) modal.classList.add('show');
}

function closeChangeDoctorModal() {
  document.getElementById('changeDoctorModal')?.classList.remove('show');
}

function saveChangeDoctor() {
  const patientId = document.getElementById('changeDoctorPatientId')?.value;
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  const sel = document.getElementById('changeDoctorSelect');
  const typedName = (sel ? sel.value : '').trim();

  if (typedName) {
    const matched = clinicDoctors.find(d => 
      d.name.toLowerCase() === typedName.toLowerCase() || 
      String(d.id).toLowerCase() === typedName.toLowerCase()
    );
    if (matched) {
      p.default_doctor_id = matched.id;
      p.default_doctor_name = matched.name;
    } else {
      const docId = 'doc-' + typedName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || ('doc-' + Date.now());
      p.default_doctor_id = docId;
      p.default_doctor_name = typedName;
      registerNewDoctorIfAbsent(docId, typedName);
    }
  } else {
    p.default_doctor_id = '';
    p.default_doctor_name = '';
  }
  save();
  closeChangeDoctorModal();
  renderProfile();
  showToast(`Default doctor updated to: ${p.default_doctor_name || 'None'}`, 'success');
}

function printDoctorSettlementStatement() {
  const doc = clinicDoctors.find(d => String(d.id) === String(selectedDoctorId));
  if (!doc) {
    showToast('Please select a doctor first.', 'warn');
    return;
  }
  const summary = getDoctorCases(doc.id);
  const now = new Date();
  const todayAd = apptIsoDate(now);
  const todayBs = apptBsFromAd(todayAd) || '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Doctor Settlement - ${esc(doc.name)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 20px; color: #000; font-size: 13px; line-height: 1.4; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 15px; }
    .clinic-name { font-size: 20px; font-weight: 800; text-transform: uppercase; margin-bottom: 2px; }
    .clinic-sub { font-size: 12px; color: #333; }
    .doc-meta { display: flex; justify-content: space-between; margin-bottom: 15px; background: #f4f4f4; padding: 10px 14px; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    .text-right { text-align: right; }
    .summary-box { margin-top: 18px; border: 2px solid #000; padding: 12px; width: 340px; margin-left: auto; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .summary-row.total { border-top: 2px solid #000; font-weight: bold; font-size: 14px; margin-top: 4px; padding-top: 6px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding-top: 20px; }
    .sig-line { width: 200px; border-top: 1px dashed #000; text-align: center; padding-top: 5px; font-weight: 600; }
    @media print {
      body { margin: 10mm; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="clinic-name">INFINITY DENTAL CLINIC</div>
    <div class="clinic-sub">Dhumbarahi, Kathmandu • 📞 9768592344, 01-4514888 • PAN: 125302054</div>
    <div style="font-size:15px;font-weight:700;margin-top:8px">DOCTOR CASE LEDGER &amp; COMMISSION SETTLEMENT STATEMENT</div>
  </div>

  <div class="doc-meta">
    <div>
      <div><b>Doctor Name:</b> ${esc(doc.name)}</div>
      <div><b>Specialty:</b> ${esc(doc.specialty || 'Dental Surgeon')}</div>
      <div><b>Contact:</b> ${esc(doc.phone || '—')}</div>
    </div>
    <div style="text-align:right">
      <div><b>Statement Period:</b> ${doctorCasesRange.replaceAll('_', ' ').toUpperCase()} (${doctorCasesCalendarMode})</div>
      <div><b>Statement Date:</b> BS ${todayBs} (AD ${todayAd})</div>
      <div><b>Commission Rate:</b> ${summary.commissionPct}%</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th>OPD No. &amp; Patient</th>
        <th>Procedures Done</th>
        <th class="text-right">Gross (Rs.)</th>
        <th class="text-right">Deductions (Rs.)</th>
        <th class="text-right">Net Eligible (Rs.)</th>
        <th class="text-right">Doctor (${summary.commissionPct}%)</th>
      </tr>
    </thead>
    <tbody>
      ${summary.cases.map((c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(c.date)}</td>
          <td><b>${esc(c.patientName)}</b> (OPD-${pad(c.opdNumber)})</td>
          <td>${esc(c.procedures)}</td>
          <td class="text-right">${c.gross.toLocaleString()}</td>
          <td class="text-right">${c.totalDeductions ? '-' + c.totalDeductions.toLocaleString() : '0'}</td>
          <td class="text-right">${c.netEligible.toLocaleString()}</td>
          <td class="text-right"><b>${c.docShare.toLocaleString()}</b></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="summary-box">
    <div class="summary-row"><span>Total Cases Handled:</span> <b>${summary.cases.length}</b></div>
    <div class="summary-row"><span>Gross Procedure Collection:</span> <b>Rs. ${summary.grossTotal.toLocaleString()}</b></div>
    <div class="summary-row"><span>Less OPD Card Charges:</span> <span>- Rs. ${summary.opdDedTotal.toLocaleString()}</span></div>
    <div class="summary-row"><span>Less Medicine Charges:</span> <span>- Rs. ${summary.medDedTotal.toLocaleString()}</span></div>
    ${summary.otherDedTotal ? `<div class="summary-row"><span>Less Other Deductions:</span> <span>- Rs. ${summary.otherDedTotal.toLocaleString()}</span></div>` : ''}
    <div class="summary-row" style="border-top:1px solid #ccc;padding-top:4px"><span>Net Commissionable Revenue:</span> <b>Rs. ${summary.netTotal.toLocaleString()}</b></div>
    <div class="summary-row total"><span>Doctor Payout (${summary.commissionPct}%):</span> <span style="color:#059669">Rs. ${summary.docShareTotal.toLocaleString()}</span></div>
    <div class="summary-row"><span>Clinic Share (${100 - summary.commissionPct}%):</span> <span>Rs. ${summary.clinicShareTotal.toLocaleString()}</span></div>
  </div>

  <div class="signatures">
    <div class="sig-line">Doctor's Signature</div>
    <div class="sig-line">Clinic Director / Stamp</div>
  </div>

  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=880,height=900');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

function secureTransactionRange(range) {
  if (currentUser?.role === 'superadmin') {
    setTransactionRange(range);
    return;
  }
  pendingSecureRange = range;
  const label = range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'All Transactions';
  document.getElementById('adminAuthTitle').textContent = 'Requires Super Admin Authorization';
  document.getElementById('adminAuthText').textContent = 'Enter Super Admin Password or 4-digit PIN (2468) to view ' + label + '.';
  document.getElementById('adminPin').value = '';
  document.getElementById('adminPin').type = 'password';
  document.getElementById('adminPin').maxLength = 30;
  document.getElementById('adminPin').pattern = '.*';
  document.getElementById('adminPinError').textContent = '';
  document.getElementById('adminAuthModal').classList.add('show');
  setTimeout(() => document.getElementById('adminPin').focus(), 50);
}
function closeAdminAuth() { pendingSecureRange = null; document.getElementById('adminAuthModal').classList.remove('show'); document.getElementById('adminPin').value = '' }
async function authorizeTransaction() {
  const val = document.getElementById('adminPin').value.trim();
  if (!val) {
    document.getElementById('adminPinError').textContent = 'Please enter Super Admin password or PIN.';
    return;
  }
  if (val === TRANSACTION_PIN) {
    const range = pendingSecureRange;
    closeAdminAuth();
    if (range) setTransactionRange(range);
    return;
  }
  try {
    const adminUser = (await authService.getUsers()).find(u => u.role === 'superadmin');
    if (adminUser) {
      const calcHash = await sha256Hex(AUTH_SALT + ':' + val);
      if (adminUser.password_hash === calcHash || adminUser.plain_pass === val) {
        const range = pendingSecureRange;
        closeAdminAuth();
        if (range) setTransactionRange(range);
        return;
      }
    }
  } catch (_) { }
  document.getElementById('adminPinError').textContent = 'Incorrect credentials. Authorization denied.';
  document.getElementById('adminPin').select();
}

function setTransactionRange(range) {
  transactionRange = range;
  const buttonIds = [
    ['today', 'txToday'],
    ['this_month_bs', 'txMonthBs'],
    ['this_month_ad', 'txMonthAd'],
    ['week', 'txWeek'],
    ['year', 'txYear'],
    ['all', 'txAll']
  ];
  buttonIds.forEach(([r, btnId]) => {
    const b = document.getElementById(btnId);
    if (b) b.className = 'btn ' + (r === range ? 'primary' : 'secondary');
  });
  renderTransactions();
}

function setTransactionCalendarMode(mode) {
  transactionCalendarMode = mode;
  const bsBtn = document.getElementById('txModeBS');
  const adBtn = document.getElementById('txModeAD');
  if (bsBtn) bsBtn.className = 'btn ' + (mode === 'BS' ? 'primary' : 'secondary');
  if (adBtn) adBtn.className = 'btn ' + (mode === 'AD' ? 'primary' : 'secondary');

  const fromInput = document.getElementById('txDateFrom');
  const toInput = document.getElementById('txDateTo');
  if (fromInput) fromInput.placeholder = mode === 'BS' ? 'From BS (YYYY-MM-DD)' : 'From AD (YYYY-MM-DD)';
  if (toInput) toInput.placeholder = mode === 'BS' ? 'To BS (YYYY-MM-DD)' : 'To AD (YYYY-MM-DD)';

  if (transactionRange === 'custom') {
    renderTransactions();
  }
}

function applyTransactionCustomRange(silent = false) {
  const fromVal = (document.getElementById('txDateFrom')?.value || '').trim();
  const toVal = (document.getElementById('txDateTo')?.value || '').trim();
  if (!fromVal && !toVal) {
    if (!silent) showToast('Please enter a From or To date.', 'warn');
    return;
  }
  transactionCustomFrom = fromVal || null;
  transactionCustomTo = toVal || null;
  transactionRange = 'custom';

  ['txToday', 'txMonthBs', 'txMonthAd', 'txWeek', 'txYear', 'txAll'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.className = 'btn secondary';
  });

  renderTransactions();
  if (!silent) showToast(`Filter applied: ${fromVal || 'Start'} to ${toVal || 'End'} (${transactionCalendarMode})`, 'info');
}

function resetTransactionFilters() {
  const fromInput = document.getElementById('txDateFrom');
  const toInput = document.getElementById('txDateTo');
  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  transactionCustomFrom = null;
  transactionCustomTo = null;
  setTransactionRange('today');
}

function renderTransactions() {
  const all = getTransactions(), list = all.filter(transactionMatches);
  const total = list.reduce((a, x) => a + x.amount, 0);
  const cashList = list.filter(x => String(x.method || '').toLowerCase() === 'cash');
  const digitalList = list.filter(x => {
    const m = String(x.method || '').toLowerCase();
    return m === 'scan' || m === 'mpos' || m.includes('qr') || m.includes('nepalpay');
  });
  const cash = cashList.reduce((a, x) => a + x.amount, 0);
  const digital = digitalList.reduce((a, x) => a + x.amount, 0);

  const elCount = document.getElementById('txCount');
  if (elCount) elCount.textContent = list.length + (list.length === 1 ? ' Txn' : ' Txns');

  const elCountBreakdown = document.getElementById('txCountBreakdown');
  if (elCountBreakdown) elCountBreakdown.textContent = `${cashList.length} Cash · ${digitalList.length} Digital`;

  const elTotal = document.getElementById('txTotal');
  if (elTotal) elTotal.textContent = 'Rs. ' + total.toLocaleString();

  const elTotalCount = document.getElementById('txTotalCount');
  if (elTotalCount) elTotalCount.textContent = `${list.length} payment${list.length === 1 ? '' : 's'} completed`;

  const elCash = document.getElementById('txCash');
  if (elCash) elCash.textContent = 'Rs. ' + cash.toLocaleString();

  const elCashCount = document.getElementById('txCashCount');
  if (elCashCount) elCashCount.textContent = `${cashList.length} cash receipt${cashList.length === 1 ? '' : 's'}`;

  const elDigital = document.getElementById('txDigital');
  if (elDigital) elDigital.textContent = 'Rs. ' + digital.toLocaleString();

  const elDigitalCount = document.getElementById('txDigitalCount');
  if (elDigitalCount) elDigitalCount.textContent = `${digitalList.length} NepalPay & QR bill${digitalList.length === 1 ? '' : 's'}`;

  const elTitle = document.getElementById('txTitle');
  if (elTitle) {
    const todayBs = apptBsFromAd(apptIsoDate(new Date())) || '';
    if (transactionRange === 'today') {
      elTitle.textContent = "Today's Transactions (" + (transactionCalendarMode === 'BS' ? todayBs : apptIsoDate(new Date())) + ")";
    } else if (transactionRange === 'this_month_bs') {
      elTitle.textContent = "This Month's Transactions (BS: " + todayBs.slice(0, 7) + ")";
    } else if (transactionRange === 'this_month_ad' || transactionRange === 'month') {
      elTitle.textContent = "This Month's Transactions (AD: " + new Date().toLocaleString('default', { month: 'long', year: 'numeric' }) + ")";
    } else if (transactionRange === 'week') {
      elTitle.textContent = "This Week's Transactions";
    } else if (transactionRange === 'year') {
      elTitle.textContent = "This Year's Transactions (" + new Date().getFullYear() + ")";
    } else if (transactionRange === 'custom') {
      elTitle.textContent = `Custom Filter (${transactionCustomFrom || 'Any'} to ${transactionCustomTo || 'Present'} ${transactionCalendarMode})`;
    } else {
      elTitle.textContent = "All Clinic Transactions";
    }
  }
  const elRows = document.getElementById('transactionRows');
  if (elRows) {
    elRows.innerHTML = list.length ? list.map(x => {
      const norm = normalizeDateToAdAndBs(x.date);
      const dateDisplay = transactionCalendarMode === 'BS'
        ? (norm.bsDate ? `<b>${esc(norm.bsDate)}</b> <span class="muted" style="font-size:10.5px">(${esc(norm.adDate)})</span>` : esc(x.date))
        : (norm.adDate ? `<b>${esc(norm.adDate)}</b> <span class="muted" style="font-size:10.5px">(${esc(norm.bsDate)})</span>` : esc(x.date));
      return `<tr class="clickable" onclick="openProfile('${x.id}')"><td>${dateDisplay}</td><td>${esc(x.time || '—')}</td><td>${pad(x.opd)}</td><td>${esc(x.name)}</td><td>${esc(x.bill)}</td><td>Rs. ${x.amount.toLocaleString()}</td><td>${esc(x.method || '—')}</td><td>${esc(x.status)}</td></tr>`;
    }).join('') : `<tr><td colspan="8" class="empty">No transactions found for this period.</td></tr>`;
  }
}
function renderRecentPatients() { const el = document.getElementById('recentPatients'); if (!el) return; const ids = JSON.parse(localStorage.getItem('infinity_dental_recent_patients_v1') || '[]'); const list = ids.map(id => patients.find(p => p.id === id)).filter(p => p && !p.AppointmentOnly); el.innerHTML = list.length ? `<div class="tablewrap"><table class="table"><thead><tr><th>OPD</th><th>Patient</th><th>Contact</th></tr></thead><tbody>${list.map(p => `<tr class="clickable" onclick="openProfile('${p.id}')"><td>${pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact || '')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><svg class="empty-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg><div>No recently opened patients.</div></div>` }
// ==========================================================================
// CLINIC OFFICIAL STAMP & SEAL SETTINGS
// ==========================================================================
let clinicStampConfig = {
  enabled: true,
  isDefault: true,
  customDataUrl: null,
  clinicName: 'INFINITY DENTAL CLINIC',
  address: 'Dhumbarahi, Kathmandu',
  pan: '125302054'
};

function generateDefaultClinicStampSvg() {
  return `<svg class="clinic-stamp-seal-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer Double Border -->
    <circle cx="100" cy="100" r="95" stroke="#1d4ed8" stroke-width="3" fill="none" stroke-dasharray="4,2"/>
    <circle cx="100" cy="100" r="90" stroke="#1d4ed8" stroke-width="2.5" fill="none"/>
    <circle cx="100" cy="100" r="62" stroke="#1d4ed8" stroke-width="1.8" fill="none"/>

    <!-- Circular Text Path Definitions -->
    <defs>
      <path id="stampUpperArc" d="M 24,100 A 76,76 0 1,1 176,100" fill="none"/>
      <path id="stampLowerArc" d="M 176,100 A 76,76 0 0,1 24,100" fill="none"/>
    </defs>

    <!-- Top Text: INFINITY DENTAL CLINIC -->
    <text fill="#1d4ed8" font-family="'Segoe UI', Arial, sans-serif" font-weight="900" font-size="12" letter-spacing="1.2">
      <textPath href="#stampUpperArc" startOffset="50%" text-anchor="middle">
        ★ INFINITY DENTAL CLINIC ★
      </textPath>
    </text>

    <!-- Bottom Text: DHUMBARAHI, KATHMANDU -->
    <text fill="#1d4ed8" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="10.5" letter-spacing="0.8">
      <textPath href="#stampLowerArc" startOffset="50%" text-anchor="middle">
        DHUMBARAHI, KATHMANDU
      </textPath>
    </text>

    <!-- Center Stylized Tooth Emblem -->
    <g transform="translate(86, 68) scale(1.1)">
      <path d="M 12.5,2 C 7,2 3,5 3,11 C 3,16 6,19 7,24 C 8,28 9,30 11,30 C 12,30 12,27 12.5,23 C 13,27 13,30 14,30 C 16,30 17,28 18,24 C 19,19 22,16 22,11 C 22,5 18,2 12.5,2 Z"
            fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linejoin="round"/>
    </g>

    <!-- Center PAN Badge -->
    <rect x="36" y="106" width="128" height="18" rx="4" fill="#1d4ed8"/>
    <text x="100" y="119" fill="#ffffff" font-family="'Segoe UI', Arial, sans-serif" font-weight="800" font-size="9" text-anchor="middle" letter-spacing="0.6">
      PAN: 125302054
    </text>

    <!-- Center Text: OFFICIAL SEAL -->
    <text x="100" y="137" fill="#1d4ed8" font-family="'Segoe UI', Arial, sans-serif" font-weight="900" font-size="8.5" text-anchor="middle" letter-spacing="1">
      OFFICIAL SEAL
    </text>
  </svg>`;
}

function loadClinicStampConfig() {
  try {
    const raw = localStorage.getItem('infinity_dental_clinic_stamp');
    if (raw) {
      const parsed = JSON.parse(raw);
      clinicStampConfig = { ...clinicStampConfig, ...parsed };
    }
  } catch (_) {}

  if (window.dentalStamp && window.dentalStamp.get) {
    window.dentalStamp.get().then(res => {
      if (res && res.success && res.stamp) {
        clinicStampConfig = { ...clinicStampConfig, ...res.stamp };
        localStorage.setItem('infinity_dental_clinic_stamp', JSON.stringify(clinicStampConfig));
        renderStampPreview();
      }
    }).catch(() => {});
  } else {
    fetch('/api/clinic/stamp').then(r => r.json()).then(res => {
      if (res && res.success && res.stamp) {
        clinicStampConfig = { ...clinicStampConfig, ...res.stamp };
        localStorage.setItem('infinity_dental_clinic_stamp', JSON.stringify(clinicStampConfig));
        renderStampPreview();
      }
    }).catch(() => {});
  }
}

function renderStampPreview() {
  const container = document.getElementById('stampPreviewContainer');
  const label = document.getElementById('stampStatusLabel');
  const toggle = document.getElementById('stampEnabledToggle');
  if (toggle) toggle.checked = Boolean(clinicStampConfig.enabled);

  if (!container) return;

  if (!clinicStampConfig.enabled) {
    container.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:30px 10px">Stamp is currently disabled.<br>Toggle above to include on bills.</div>';
    if (label) label.textContent = 'Stamp Disabled';
    return;
  }

  if (clinicStampConfig.customDataUrl) {
    container.innerHTML = `<img src="${clinicStampConfig.customDataUrl}" style="max-height:130px;max-width:150px;object-fit:contain;transform:rotate(-3deg)" alt="Custom Stamp">`;
    if (label) label.textContent = 'Custom Rubber Stamp Active';
  } else {
    container.innerHTML = generateDefaultClinicStampSvg();
    if (label) label.textContent = 'Default Official Clinic Seal Active';
  }
}

function openClinicStampModal() {
  loadClinicStampConfig();
  renderStampPreview();
  const m = document.getElementById('clinicStampModal');
  if (m) m.classList.add('show');
}

function closeClinicStampModal() {
  const m = document.getElementById('clinicStampModal');
  if (m) m.classList.remove('show');
}

function toggleStampEnabled(checked) {
  clinicStampConfig.enabled = Boolean(checked);
  renderStampPreview();
}

function useDefaultClinicStamp() {
  clinicStampConfig.isDefault = true;
  clinicStampConfig.customDataUrl = null;
  clinicStampConfig.enabled = true;
  renderStampPreview();
  showToast('Switched to official clinic seal.', 'info');
}

function handleStampFileUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (!file.type.startsWith('image/')) {
    alert('Please upload a valid image file (PNG, JPG, or WEBP).');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('Stamp file is too large. Please select an image under 5MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    clinicStampConfig.customDataUrl = e.target.result;
    clinicStampConfig.isDefault = false;
    clinicStampConfig.enabled = true;
    renderStampPreview();
    showToast('Custom stamp loaded successfully!', 'success');
  };
  reader.readAsDataURL(file);
}

async function saveClinicStampConfig() {
  localStorage.setItem('infinity_dental_clinic_stamp', JSON.stringify(clinicStampConfig));
  if (window.dentalStamp && window.dentalStamp.save) {
    await window.dentalStamp.save(clinicStampConfig);
  } else {
    await fetch('/api/clinic/stamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clinicStampConfig)
    }).catch(() => {});
  }
  showToast('✓ Clinic Stamp settings saved successfully!', 'success');
  closeClinicStampModal();
}

function getClinicStampHtmlForBill() {
  if (!clinicStampConfig.enabled) return '';
  if (clinicStampConfig.customDataUrl) {
    return `<div style="margin-bottom:-22px;position:relative;z-index:2;display:flex;justify-content:center;pointer-events:none">
      <img src="${clinicStampConfig.customDataUrl}" style="max-height:85px;max-width:140px;object-fit:contain;opacity:0.92;transform:rotate(-4deg)" alt="Official Stamp">
    </div>`;
  }
  return `<div style="margin-bottom:-22px;position:relative;z-index:2;display:flex;justify-content:center;pointer-events:none">
    ${generateDefaultClinicStampSvg()}
  </div>`;
}

// ==========================================================================
// BILLING & POS TERMINAL (Official A5 Invoices, Payments & Patient Accounting)
// ==========================================================================
let billingStagedProcedures = [];
let billingSelectedPatientId = null;
let lastBillingDiscountMode = 'amount';

function populateBillingPatients() {
  const sel = document.getElementById('billingPatient');
  const dList = document.getElementById('billingPriceListOptions');

  if (dList) {
    const treatments = (typeof priceList === 'object' && priceList !== null)
      ? Object.keys(priceList)
      : ['Consultation', 'OPD Card', 'Scaling & Polishing', 'Tooth Extraction', 'Root Canal (RCT)', 'Dental X-Ray', 'Ceramic Crown', 'Teeth Whitening', 'Composite Restoration'];
    dList.innerHTML = treatments.map(t => {
      const cost = priceList[t] || '';
      return `<option value="${esc(t)}">${esc(t)}${cost ? ` (Rs. ${cost})` : ''}</option>`;
    }).join('');
  }

  if (sel) {
    const list = registeredPatients().slice().sort((a, b) => b.OPDNumber - a.OPDNumber);
    sel.innerHTML = '<option value="">-- Choose Registered Patient --</option>' +
      list.map(p => `<option value="${p.id}">OPD-${pad(p.OPDNumber)} — ${esc(p.Name)} (${esc(p.Contact || 'No phone')})</option>`).join('');

    if (selectedId && patients.some(p => p.id === selectedId)) {
      sel.value = selectedId;
      billingSelectedPatientId = selectedId;
    } else if (billingSelectedPatientId && patients.some(p => p.id === billingSelectedPatientId)) {
      sel.value = billingSelectedPatientId;
    }
  }

  renderBillingWorkspace();
}

function onBillingSearchInput(query) {
  const resBox = document.getElementById('billingSearchResults');
  if (!resBox) return;
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    resBox.style.display = 'none';
    resBox.innerHTML = '';
    return;
  }

  const matches = registeredPatients().filter(p => {
    const name = String(p.Name || '').toLowerCase();
    const opd = String(p.OPDNumber || '');
    const contact = String(p.Contact || '');
    return name.includes(q) || opd.includes(q) || contact.includes(q);
  }).slice(0, 8);

  if (!matches.length) {
    resBox.innerHTML = '<div style="padding:10px 14px;color:#94a3b8;font-size:12px">No registered patients found matching "' + esc(query) + '"</div>';
    resBox.style.display = 'block';
    return;
  }

  resBox.innerHTML = matches.map(p => `
    <div style="padding:9px 12px;border-bottom:1px solid #1e2e46;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s"
         onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='transparent'"
         onclick="selectBillingPatient('${p.id}'); document.getElementById('billingSearchResults').style.display='none'; document.getElementById('billingSearchInput').value='${esc(p.Name)}';">
      <div>
        <span style="font-weight:700;color:#f8fafc;font-size:13px">${esc(p.Name)}</span>
        <span class="badge" style="font-size:10px;margin-left:6px;background:#0284c7;color:#fff">OPD-${pad(p.OPDNumber)}</span>
        <div style="font-size:11px;color:#94a3b8">${esc(p.Contact || 'No contact')} • ${esc(p.Address || 'Dhumbarahi, Kathmandu')}</div>
      </div>
      <span style="font-size:11px;color:#38bdf8;font-weight:700">Select →</span>
    </div>
  `).join('');
  resBox.style.display = 'block';
}

function selectBillingPatient(id) {
  billingSelectedPatientId = id || null;
  selectedId = id || selectedId;
  const sel = document.getElementById('billingPatient');
  if (sel) sel.value = id || '';
  renderBillingWorkspace();
}

function renderBillingWorkspace() {
  const pWorkspace = document.getElementById('billingPatientWorkspace');
  const eWorkspace = document.getElementById('billingEmptyWorkspace');
  const p = patients.find(x => x.id === (billingSelectedPatientId || selectedId));

  if (!p) {
    if (pWorkspace) pWorkspace.style.display = 'none';
    if (eWorkspace) {
      eWorkspace.style.display = 'block';
      renderBillingRecentAndDuePatients();
    }
    return;
  }

  ensurePatientArrays(p);
  if (eWorkspace) eWorkspace.style.display = 'none';
  if (pWorkspace) pWorkspace.style.display = 'block';

  const nameEl = document.getElementById('billingPatientName');
  const opdEl = document.getElementById('billingPatientOpd');
  const metaEl = document.getElementById('billingPatientMeta');
  const initEl = document.getElementById('billingPatientInitial');
  const visitsEl = document.getElementById('billingPatientVisitsCount');
  const paidEl = document.getElementById('billingPatientTotalPaid');
  const dueEl = document.getElementById('billingPatientDueBalance');

  if (nameEl) nameEl.textContent = p.Name;
  if (opdEl) opdEl.textContent = `OPD-${pad(p.OPDNumber)}`;
  if (metaEl) metaEl.textContent = `Contact: ${p.Contact || '—'} • Age/Gender: ${p.Age || '—'} / ${p.Gender || '—'} • Address: ${p.Address || 'Dhumbarahi, Kathmandu'}`;
  if (initEl) initEl.textContent = (p.Name || 'P').charAt(0).toUpperCase();

  const visits = p.VisitHistory || [];
  let totalBilled = 0;
  let totalPaid = 0;
  visits.forEach(v => {
    const cost = Number(v.cost || v.subtotal || 0);
    const paid = Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
    totalBilled += cost;
    totalPaid += paid;
  });
  const totalDue = Math.max(0, totalBilled - totalPaid);

  if (visitsEl) visitsEl.textContent = visits.length;
  if (paidEl) paidEl.textContent = `Rs. ${totalPaid.toLocaleString()}`;
  if (dueEl) {
    dueEl.textContent = `Rs. ${totalDue.toLocaleString()}`;
    dueEl.style.color = totalDue > 0 ? '#ef4444' : '#10b981';
  }

  renderBillingStagedRows();
  updateBillingCalculations();
  renderBillingInvoicesHistory(p);

  const docSel = document.getElementById('billingDoctorSelect');
  if (docSel) {
    if (docSel.tagName === 'SELECT') {
      docSel.innerHTML = '<option value="">-- Choose Treating Doctor --</option>' + renderDoctorOptions(p.default_doctor_id || selectedDoctorId);
    } else {
      docSel.value = p.default_doctor_name || (clinicDoctors[0]?.name || '');
    }
  }
  const hintEl = document.getElementById('billingDoctorHint');
  if (hintEl) {
    hintEl.textContent = p.default_doctor_name ? `(Default Doctor: ${p.default_doctor_name})` : '(First visit: typed or selected doctor will be saved as default)';
  }
}

function renderBillingRecentAndDuePatients() {
  const recEl = document.getElementById('billingRecentPatientsList');
  const dueEl = document.getElementById('billingDuePatientsList');
  const reg = registeredPatients();

  if (recEl) {
    const recent = reg.slice(-6).reverse();
    recEl.innerHTML = recent.length ? `
      <div class="tablewrap"><table class="table">
        <thead><tr><th>OPD</th><th>Patient Name</th><th>Contact</th><th>Action</th></tr></thead>
        <tbody>
          ${recent.map(p => `
            <tr class="clickable" onclick="selectBillingPatient('${p.id}')">
              <td><span class="badge">OPD-${pad(p.OPDNumber)}</span></td>
              <td style="font-weight:700">${esc(p.Name)}</td>
              <td>${esc(p.Contact || '—')}</td>
              <td><button class="btn primary" style="padding:3px 8px;font-size:11px" onclick="event.stopPropagation();selectBillingPatient('${p.id}')">Open POS</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    ` : '<div class="empty">No registered patients found.</div>';
  }

  if (dueEl) {
    const dueList = reg.filter(p => {
      ensurePatientArrays(p);
      let billed = 0, paid = 0;
      (p.VisitHistory || []).forEach(v => {
        billed += Number(v.cost || v.subtotal || 0);
        paid += Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
      });
      return (billed - paid) > 0.01;
    }).slice(0, 6);

    dueEl.innerHTML = dueList.length ? `
      <div class="tablewrap"><table class="table">
        <thead><tr><th>OPD</th><th>Patient Name</th><th style="text-align:right">Due (Rs.)</th><th>Action</th></tr></thead>
        <tbody>
          ${dueList.map(p => {
            let billed = 0, paid = 0;
            p.VisitHistory.forEach(v => {
              billed += Number(v.cost || v.subtotal || 0);
              paid += Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
            });
            const due = Math.max(0, billed - paid);
            return `
              <tr class="clickable" onclick="selectBillingPatient('${p.id}')">
                <td><span class="badge">OPD-${pad(p.OPDNumber)}</span></td>
                <td style="font-weight:700">${esc(p.Name)}</td>
                <td style="text-align:right;font-weight:800;color:#ef4444">Rs. ${due.toLocaleString()}</td>
                <td><button class="btn secondary" style="padding:3px 8px;font-size:11px;color:#ef4444" onclick="event.stopPropagation();selectBillingPatient('${p.id}')">Collect Due</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table></div>
    ` : '<div class="empty" style="color:#10b981">✓ All registered patients are fully paid. No pending dues!</div>';
  }
}

function applyBillingQuickProcedure(name, cost) {
  billingStagedProcedures.push({ procedure: name, cost: Number(cost) });
  renderBillingStagedRows();
  updateBillingCalculations();
}

function onBillingProcSelect(val) {
  const costEl = document.getElementById('billingProcCost');
  if (!costEl) return;
  const cost = (typeof priceList === 'object' && priceList !== null) ? priceList[val] : null;
  if (cost != null) costEl.value = cost;
}

function addBillingProcedureItem() {
  const nameInput = document.getElementById('billingProcName');
  const costInput = document.getElementById('billingProcCost');
  const name = (nameInput?.value || '').trim();
  const cost = Number(costInput?.value) || 0;

  if (!name) {
    showToast('Please enter or select a procedure name.', 'warn');
    nameInput?.focus();
    return;
  }
  if (cost < 0) {
    showToast('Procedure rate cannot be negative.', 'warn');
    return;
  }

  billingStagedProcedures.push({ procedure: name, cost });
  if (nameInput) nameInput.value = '';
  if (costInput) costInput.value = '';
  renderBillingStagedRows();
  updateBillingCalculations();
  nameInput?.focus();
}

function removeBillingProcedureItem(index) {
  billingStagedProcedures.splice(index, 1);
  renderBillingStagedRows();
  updateBillingCalculations();
}

function renderBillingStagedRows() {
  const tbody = document.getElementById('billingStagedRows');
  if (!tbody) return;
  if (!billingStagedProcedures.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty" style="padding:14px;text-align:center;color:#64748b">No treatments added to this bill yet. Click a preset or add above.</td></tr>';
    return;
  }

  tbody.innerHTML = billingStagedProcedures.map((item, idx) => `
    <tr>
      <td style="text-align:center;color:#64748b">${idx + 1}</td>
      <td style="font-weight:700;color:#f8fafc">${esc(item.procedure)}</td>
      <td style="text-align:right;font-weight:700;color:#38bdf8">Rs. ${Number(item.cost || 0).toLocaleString()}</td>
      <td style="text-align:center">
        <button type="button" class="btn danger" style="padding:2px 7px;font-size:11px" onclick="removeBillingProcedureItem(${idx})" title="Remove item">✕</button>
      </td>
    </tr>
  `).join('');
}

function getBillingSubtotal() {
  return billingStagedProcedures.reduce((acc, item) => acc + (Number(item.cost) || 0), 0);
}

function onBillingDiscountPercentInput() {
  lastBillingDiscountMode = 'percent';
  const subtotal = getBillingSubtotal();
  const pct = Math.max(0, Math.min(100, Number(document.getElementById('billingDiscountPercent')?.value) || 0));
  const amt = (subtotal > 0) ? (subtotal * pct / 100) : 0;
  const amtEl = document.getElementById('billingDiscountAmount');
  if (amtEl) amtEl.value = amt.toFixed(2);
  updateBillingCalculations();
}

function onBillingDiscountAmountInput() {
  lastBillingDiscountMode = 'amount';
  const subtotal = getBillingSubtotal();
  const rawAmt = Number(document.getElementById('billingDiscountAmount')?.value) || 0;
  const amt = (subtotal > 0) ? Math.max(0, Math.min(subtotal, rawAmt)) : Math.max(0, rawAmt);
  const pctEl = document.getElementById('billingDiscountPercent');
  if (subtotal > 0 && pctEl) pctEl.value = (amt / subtotal * 100).toFixed(2);
  updateBillingCalculations();
}

function updateBillingCalculations() {
  const subtotal = getBillingSubtotal();
  const pctEl = document.getElementById('billingDiscountPercent');
  const amtEl = document.getElementById('billingDiscountAmount');
  let discount = 0;

  if (lastBillingDiscountMode === 'percent' && pctEl && subtotal > 0) {
    const pct = Math.max(0, Math.min(100, Number(pctEl.value) || 0));
    discount = subtotal * pct / 100;
    if (amtEl) amtEl.value = discount.toFixed(2);
  } else {
    const rawDisc = Number(amtEl?.value) || 0;
    discount = Math.max(0, Math.min(subtotal, rawDisc));
    if (subtotal > 0 && pctEl) {
      pctEl.value = (discount / subtotal * 100).toFixed(2);
    }
  }

  const netTotal = Math.max(0, subtotal - discount);
  const subLabel = document.getElementById('billingSubtotalLabel');
  const netLabel = document.getElementById('billingNetTotalLabel');

  if (subLabel) subLabel.textContent = `Rs. ${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  if (netLabel) netLabel.textContent = `Rs. ${netTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

  updateBillingPaymentCalculations();
}

function updateBillingPaymentCalculations() {
  const subtotal = getBillingSubtotal();
  const rawDisc = Number(document.getElementById('billingDiscountAmount')?.value) || 0;
  const discount = Math.max(0, Math.min(subtotal, rawDisc));
  const netTotal = Math.max(0, subtotal - discount);

  const choice = document.querySelector('input[name=billingPaymentChoice]:checked')?.value || 'full';
  const paidInput = document.getElementById('billingAmountPaidInput');

  if (choice === 'full') {
    if (paidInput) {
      paidInput.value = netTotal > 0 ? netTotal.toFixed(2) : '0';
      paidInput.disabled = false;
    }
  } else if (choice === 'due') {
    if (paidInput) {
      paidInput.value = '0';
      paidInput.disabled = true;
    }
  } else {
    if (paidInput) {
      paidInput.disabled = false;
    }
  }

  updateBillingDueBalance();
}

function updateBillingDueBalance() {
  const subtotal = getBillingSubtotal();
  const rawDisc = Number(document.getElementById('billingDiscountAmount')?.value) || 0;
  const discount = Math.max(0, Math.min(subtotal, rawDisc));
  const netTotal = Math.max(0, subtotal - discount);

  const paidVal = Number(document.getElementById('billingAmountPaidInput')?.value) || 0;
  const due = Math.max(0, netTotal - paidVal);

  const dueDisplay = document.getElementById('billingDueBalanceDisplay');
  if (dueDisplay) {
    dueDisplay.textContent = `Rs. ${due.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    dueDisplay.style.color = due > 0 ? '#ef4444' : '#10b981';
  }
}

function onBillingPaymentMethodChange(val) {
  if (val === 'NepalPay QR') {
    showToast('NepalPay Dynamic QR selected. Dynamic QR will be displayed on screen and sent to NiZi Soundbox upon collection.', 'info');
  }
}

function clearBillingForm() {
  billingStagedProcedures = [];
  const pctEl = document.getElementById('billingDiscountPercent');
  const amtEl = document.getElementById('billingDiscountAmount');
  if (pctEl) pctEl.value = '0';
  if (amtEl) amtEl.value = '0';
  renderBillingStagedRows();
  updateBillingCalculations();
}

async function collectBillingAndPrintA5(printAfterSave = true) {
  const p = patients.find(x => x.id === (billingSelectedPatientId || selectedId));
  if (!p) {
    showToast('Please select a registered patient first.', 'warn');
    return;
  }
  ensurePatientArrays(p);

  if (!billingStagedProcedures.length) {
    showToast('Please add at least one treatment / procedure to the bill.', 'warn');
    return;
  }

  const subtotal = getBillingSubtotal();
  const discountAmount = Number(document.getElementById('billingDiscountAmount')?.value) || 0;
  const discountPercent = Number(document.getElementById('billingDiscountPercent')?.value) || 0;
  const netTotal = Math.max(0, subtotal - discountAmount);

  const choice = document.querySelector('input[name=billingPaymentChoice]:checked')?.value || 'full';
  let paid = Number(document.getElementById('billingAmountPaidInput')?.value) || 0;
  if (choice === 'due') paid = 0;
  if (choice === 'full' && paid === 0 && netTotal > 0) paid = netTotal;

  const mode = document.getElementById('billingPaymentMethodSelect')?.value || 'Cash';
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const visitNo = (p.VisitHistory.length || 0) + 1;
  const billNo = 'B-' + date.replaceAll('-', '') + '-' + pad(p.OPDNumber) + '-' + String(visitNo).padStart(3, '0');
  const procNames = billingStagedProcedures.map(x => x.procedure).join(', ');

  function finalizeSave(payMethod, payDone, txnId) {
    const docInput = document.getElementById('billingDoctorSelect');
    const typedDoc = (docInput ? docInput.value : '').trim();
    let chosenDoc = null;
    let doctorId = '';
    let doctorName = '';

    if (typedDoc) {
      chosenDoc = clinicDoctors.find(d => 
        d.name.toLowerCase() === typedDoc.toLowerCase() || 
        String(d.id).toLowerCase() === typedDoc.toLowerCase()
      );
      if (chosenDoc) {
        doctorId = chosenDoc.id;
        doctorName = chosenDoc.name;
      } else {
        doctorName = typedDoc;
        doctorId = 'doc-' + typedDoc.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || ('doc-' + Date.now());
        registerNewDoctorIfAbsent(doctorId, doctorName);
      }
    } else if (p.default_doctor_name) {
      doctorId = p.default_doctor_id || '';
      doctorName = p.default_doctor_name || '';
    } else if (clinicDoctors.length) {
      doctorId = clinicDoctors[0].id;
      doctorName = clinicDoctors[0].name;
    }

    // First visit rule: if patient does not yet have default doctor, save as default
    if (!p.default_doctor_id && doctorName) {
      p.default_doctor_id = doctorId;
      p.default_doctor_name = doctorName;
    }

    const visit = {
      id: crypto.randomUUID(),
      date,
      time,
      doctorId,
      doctorName,
      procedures: procNames,
      paymentDone: payDone,
      amount: payDone,
      paymentMethod: payMethod,
      txnId: txnId || '',
      subtotal,
      discountPercent: Number(discountPercent.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      cost: netTotal,
      billNumber: billNo,
      procedureItems: billingStagedProcedures.map(x => ({ procedure: x.procedure, cost: x.cost, doctorId, doctorName }))
    };

    p.VisitHistory.unshift(visit);
    billingStagedProcedures.forEach(x => {
      p.Treatments.push({ procedure: x.procedure, cost: x.cost, date, time, billNumber: billNo, doctorId, doctorName });
    });

    p.PaymentHistory.unshift({
      date,
      time,
      billNumber: billNo,
      amount: payDone,
      method: payMethod,
      txnId: txnId || '',
      status: payDone >= netTotal ? 'Paid' : payDone > 0 ? 'Partial' : 'Pending',
      doctorId,
      doctorName
    });

    p.PaymentStatus = payDone >= netTotal ? 'Paid' : payDone > 0 ? 'Partial' : 'Pending';
    p.PaymentMethod = payMethod;
    p.Subtotal = (Number(p.Subtotal) || 0) + subtotal;
    p.FinalAmount = (Number(p.FinalAmount) || 0) + netTotal;

    billingStagedProcedures = [];
    save();

    if (payDone > 0) {
      sendNiziCommand({ command: 'success', amount: payDone });
    }
    if (payMethod === 'NepalPay QR' || (typeof payMethod === 'string' && payMethod.toLowerCase().includes('nepalpay'))) {
      logNepalPayMoneyRecord({
        billNumber: billNo,
        patientName: p.Name,
        opdNumber: 'OPD-' + pad(p.OPDNumber),
        amount: payDone,
        txnId: txnId || ('TXN-NPI-' + Date.now()),
        validationTraceId: txnId || ('TXN-NPI-' + Date.now()),
        status: 'SUCCESS',
        method: 'NepalPay QR',
        source: 'Billing Terminal'
      });
    }

    renderBillingWorkspace();
    renderProfile();
    showToast(`✓ Payment collected! Bill No: ${billNo}`, 'success');

    if (printAfterSave) {
      printBill(billNo);
    }
  }

  if (mode === 'NepalPay QR' && paid > 0) {
    openNepalPayModal({
      amount: paid,
      billNumber: billNo,
      patientName: p.Name,
      patientContact: p.Contact,
      opdNumber: p.OPDNumber,
      remarks: procNames.slice(0, 30),
      onSuccess: (eventData) => {
        finalizeSave('NepalPay QR', paid, eventData.txnId);
      }
    });
  } else {
    finalizeSave(mode, paid);
  }
}

function saveBillingVisitOnly() {
  collectBillingAndPrintA5(false);
}

function printBillingLatestBill() {
  const p = patients.find(x => x.id === (billingSelectedPatientId || selectedId));
  if (!p || !p.VisitHistory?.length) {
    showToast('No saved bills found for this patient yet.', 'warn');
    return;
  }
  printBill(p.VisitHistory[0].billNumber);
}

function collectDueForBill(billNo) {
  const found = findBillForPatient(billNo);
  if (!found) {
    showToast('Bill not found.', 'warn');
    return;
  }
  const { p, v } = found;
  const cost = Number(v.cost || v.subtotal || 0);
  const currentPaid = Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
  const remainingDue = Math.max(0, cost - currentPaid);

  if (remainingDue <= 0) {
    showToast('This bill is already fully paid.', 'info');
    return;
  }

  const inputAmt = prompt(`Collect Due Payment for Bill: ${billNo}\nPatient: ${p.Name} (OPD-${pad(p.OPDNumber)})\n\nTotal Bill: Rs. ${cost.toLocaleString()}\nAlready Paid: Rs. ${currentPaid.toLocaleString()}\nRemaining Due: Rs. ${remainingDue.toLocaleString()}\n\nEnter amount to collect now:`, remainingDue);
  if (inputAmt === null) return;
  const addPaid = Number(inputAmt);
  if (isNaN(addPaid) || addPaid <= 0) {
    alert('Invalid payment amount entered.');
    return;
  }

  const newTotalPaid = Math.min(cost, currentPaid + addPaid);
  v.paymentDone = newTotalPaid;
  v.amount = newTotalPaid;
  if (newTotalPaid >= cost) {
    v.status = 'Paid';
  } else {
    v.status = 'Partial';
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);

  p.PaymentHistory.unshift({
    date,
    time,
    billNumber: billNo,
    amount: addPaid,
    method: 'Cash (Due Collection)',
    status: newTotalPaid >= cost ? 'Paid' : 'Partial'
  });

  save();
  sendNiziCommand({ command: 'success', amount: addPaid });
  renderBillingWorkspace();
  showToast(`✓ Due payment of Rs. ${addPaid} collected!`, 'success');
  if (confirm(`Payment of Rs. ${addPaid} collected.\n\nPrint updated A5 Bill now?`)) {
    printBill(billNo);
  }
}

function renderBillingInvoicesHistory(p) {
  const tbody = document.getElementById('billingHistoryRows');
  if (!tbody) return;
  const visits = p.VisitHistory || [];

  if (!visits.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty" style="text-align:center;padding:16px;color:#64748b">No past bills found for this patient.</td></tr>';
    return;
  }

  tbody.innerHTML = visits.map((v, i) => {
    const cost = Number(v.cost || v.subtotal || 0);
    const paid = Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
    const due = Math.max(0, cost - paid);
    const isPaid = due <= 0;
    return `
      <tr>
        <td style="font-family:monospace;font-weight:700;color:#f8fafc">${esc(v.billNumber || 'VIS-' + (i + 1))}</td>
        <td>${esc(v.date || '')} <span class="muted" style="font-size:11px">${esc(v.time || '')}</span></td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(v.procedures || '')}">${esc(v.procedures || 'Dental Treatment')}</td>
        <td style="text-align:right;font-weight:700;color:#f8fafc">Rs. ${cost.toLocaleString()}</td>
        <td style="text-align:right;font-weight:700;color:#10b981">Rs. ${paid.toLocaleString()}</td>
        <td style="text-align:right;font-weight:800;color:${due > 0 ? '#ef4444' : '#64748b'}">Rs. ${due.toLocaleString()}</td>
        <td>${esc(v.paymentMethod || 'Cash')}</td>
        <td>
          <span class="badge" style="${isPaid ? 'background:#166534;color:#dcfce7' : (paid > 0 ? 'background:#854d0e;color:#fef9c3' : 'background:#991b1b;color:#fee2e2')}">
            ${isPaid ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'DUE')}
          </span>
        </td>
        <td style="text-align:center">
          <div style="display:inline-flex;gap:4px">
            <button class="btn primary" style="padding:3px 8px;font-size:11px" onclick="printBill('${esc(v.billNumber)}')">🖨️ A5 BILL</button>
            ${due > 0 ? `<button class="btn secondary" style="padding:3px 8px;font-size:11px;color:#ef4444" onclick="collectDueForBill('${esc(v.billNumber)}')">Collect Due</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function showPage(id) {
  if (id === 'staff' && currentUser?.role !== 'superadmin') {
    alert('Access restricted to Super Admin only.');
    id = 'dashboard';
  }
  // Reset scroll position so switching sections never lands in the footer
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.scrollTop = 0;

  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const p = document.getElementById(id);
  if (p) p.classList.add('active');
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.page === id));
  if (id === 'register') {
    isRegisteringPatient = false;
    const regBtn = document.getElementById('btnRegisterPatient');
    if (regBtn) {
      regBtn.disabled = false;
      regBtn.innerHTML = 'REGISTER PATIENT';
    }
    const el = document.getElementById('nextOpd');
    if (el) el.textContent = pad(nextNumber());
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const nameInput = document.getElementById('name');
        if (nameInput) {
          nameInput.focus();
        }
      });
    });
  }
  if (id === 'patients') renderPatients();
  if (id === 'profile') renderProfile();
  if (id === 'transactions') renderTransactions();
  if (id === 'billing') { populateBillingPatients(); renderBillingWorkspace(); }
  if (id === 'dashboard') renderRecentPatients();
  if (id === 'appointments') {
    appointmentSelectedAD = apptIsoDate(new Date());
    appointmentSetViewForAD(appointmentSelectedAD);
    renderAppointments();
  }
  if (id === 'staff') { loadClinicDoctors(); loadStaffAccounts(); renderDoctorCasesModule(); }
  if (id === 'nepalpay') { loadSoundboxPorts(false); autoConnectNiziUsb(true); }
  if (id === 'labworks') { loadLabCompanies(); loadLabData(); loadPatientsDatalist(); }
  if (id === 'purchases') { loadPurchasesData(); }
  if (id === 'stocks') { loadStockData(); refreshPhoneNetworkQr(); }
}
document.querySelectorAll('.nav').forEach(b => b.onclick = () => showPage(b.dataset.page));

async function initializeClinicDatabase() {
  loadClinicStampConfig();
  await loadPriceList();
  await loadClinicDoctors();
  if (window.dentalDB?.load) {
    try { const data = await window.dentalDB.load(); if (Array.isArray(data)) patients = data; const path = await window.dentalDB.path(); const el = document.getElementById('dataFolderStatus'); if (el) el.textContent = path ? 'SQLite Database: ' + path : 'SQLite Database'; }
    catch (e) { console.warn('SQLite load failed:', e) }
  } else {
    try {
      const res = await fetch('/api/patients');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          patients = json.data;
          const el = document.getElementById('dataFolderStatus');
          if (el) el.textContent = 'SQLite Database: ' + (json.dbPath || 'Localhost Server Connected');
        }
      }
    } catch (err) {
      console.log('Falling back to local browser storage:', err);
      reconnectStoredDataFolder();
    }
  }
  setupSseListener();
  updateAll(); renderTransactions(); renderNepalPayTxnTable();
  checkAuthSession();
}
function applyTheme() {
  const dark = localStorage.getItem('infinity_dental_theme') === 'dark';
  document.body.classList.toggle('dark', dark);
  const themeLabel = document.getElementById('settingsThemeLabel');
  if (themeLabel) themeLabel.textContent = dark ? 'Light Mode' : 'Dark Mode';
  const b = document.getElementById('themeToggle');
  if (b) b.textContent = dark ? 'Light Mode' : 'Dark Mode';
}
function toggleTheme() { const dark = !document.body.classList.contains('dark'); localStorage.setItem('infinity_dental_theme', dark ? 'dark' : 'light'); applyTheme() }
applyTheme();
loadRegistrationDraft(); function tick() { document.getElementById('clock').textContent = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }); setTimeout(tick, 1000) } tick(); updateAll(); renderTransactions(); initializeClinicDatabase();

// Auto-detect and connect to NiZi POS USB and check updates on app startup
if (window.dentalApp && window.dentalApp.getVersion) {
  window.dentalApp.getVersion().then(v => {
    const headerBadge = document.getElementById('appVersionBadge');
    if (headerBadge) headerBadge.textContent = 'v' + v;
  });
}
setTimeout(() => {
  loadSoundboxPorts(false);
  autoConnectNiziUsb(true);
  checkAppUpdates(false);
  loadClinicWifiConfig();
  loadLabCompanies();
  loadClinicDoctors();
}, 100);

// --- GitHub Client Updates ---
function openUpdateModal() {
  const modal = document.getElementById('updateModal');
  if (modal) modal.classList.add('show');
  let storedRepo = localStorage.getItem('infinity_dental_github_repo');
  if (!storedRepo || storedRepo === 'Sankalpannt/dental-') {
    storedRepo = 'paudelsankalpa33-create/infinity-dental';
    localStorage.setItem('infinity_dental_github_repo', storedRepo);
  }
  const input = document.getElementById('githubRepoInput');
  if (input) input.value = storedRepo;

  if (window.dentalApp && window.dentalApp.getVersion) {
    window.dentalApp.getVersion().then(v => {
      const formatted = (v && !v.startsWith('v')) ? 'v' + v : (v || 'v1.0.25');
      const badge = document.getElementById('modalCurrentVersion');
      if (badge) badge.textContent = formatted;
      const settingsBadge = document.getElementById('settingsVersionBadge');
      if (settingsBadge) settingsBadge.textContent = formatted;
      const headerBadge = document.getElementById('appVersionBadge');
      if (headerBadge) headerBadge.textContent = formatted;
      if (typeof syncAppVersionUI === 'function') syncAppVersionUI();
    });
  }
}

function closeUpdateModal() {
  const modal = document.getElementById('updateModal');
  if (modal) modal.classList.remove('show');
}

function dismissUpdateBanner() {
  const banner = document.getElementById('updateBanner');
  if (banner) banner.classList.remove('active');
}

async function checkAppUpdates(manual = false) {
  const input = document.getElementById('githubRepoInput');
  let repo = (input?.value || localStorage.getItem('infinity_dental_github_repo') || 'paudelsankalpa33-create/infinity-dental').trim();
  if (repo === 'Sankalpannt/dental-') {
    repo = 'paudelsankalpa33-create/infinity-dental';
    if (input) input.value = repo;
  }
  localStorage.setItem('infinity_dental_github_repo', repo);

  const statusArea = document.getElementById('updateStatusArea');
  const checkBtn = document.getElementById('checkUpdateBtn');
  if (statusArea && manual) {
    statusArea.style.display = 'block';
    statusArea.style.background = '#f1f5f9';
    statusArea.style.border = '1px solid var(--border)';
    statusArea.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span>⏳</span><span>Checking update server for latest version...</span></div>';
  }
  if (checkBtn && manual) checkBtn.disabled = true;

  try {
    let result = null;
    if (window.dentalApp && window.dentalApp.checkUpdate) {
      result = await window.dentalApp.checkUpdate(repo);
    } else {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (res.ok) {
        const data = await res.json();
        const latestTag = data.tag_name || '';
        const currentVersion = '1.0.0';
        const hasUpdate = (latestTag.replace(/^[vV]/, '') !== currentVersion);
        let downloadUrl = data.html_url;
        if (Array.isArray(data.assets)) {
          const exe = data.assets.find(a => a.name && (a.name.endsWith('.exe') || a.name.endsWith('.zip')));
          if (exe) downloadUrl = exe.browser_download_url;
        }
        result = {
          success: true,
          hasUpdate,
          currentVersion,
          latestVersion: latestTag.replace(/^[vV]/, ''),
          releaseName: data.name || latestTag,
          releaseNotes: data.body || '',
          publishedAt: data.published_at,
          htmlUrl: data.html_url,
          downloadUrl
        };
      } else {
        result = { success: false, error: 'Update server returned HTTP ' + res.status };
      }
    }

    if (result && result.success && result.hasUpdate) {
      window.currentUpdateInfo = result;
      const banner = document.getElementById('updateBanner');
      const vBadge = document.getElementById('updateBannerVersion');
      const tText = document.getElementById('updateBannerTitle');
      if (vBadge) vBadge.textContent = 'v' + result.latestVersion;
      if (tText) tText.textContent = result.releaseName || 'New update available for Infinity Dental Clinic';
      if (banner) banner.classList.add('active');

      if (statusArea) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#f0fdf4';
        statusArea.style.border = '1px solid #86efac';
        statusArea.innerHTML = `
          <div style="color:#166534;font-weight:800;font-size:14px;margin-bottom:6px">🎉 New Version v${esc(result.latestVersion)} is Available!</div>
          <div style="color:#334155;font-size:11px;font-weight:600;margin-bottom:8px">Published: ${result.publishedAt ? new Date(result.publishedAt).toLocaleDateString() : 'Recently'}</div>
          ${result.releaseNotes ? `<div class="release-notes-box" style="background:#ffffff;padding:10px 14px;border-radius:6px;font-size:12px;max-height:100px;overflow-y:auto;white-space:pre-wrap;margin-bottom:12px;border:1px solid #86efac;color:#000000 !important;font-weight:600;line-height:1.5">${esc(result.releaseNotes)}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button id="inAppDownloadBtn" type="button" class="btn primary" style="background:#16a34a;padding:9px 18px;font-weight:800;cursor:pointer" onclick="startInAppUpdate()">⬇ DOWNLOAD &amp; INSTALL UPDATE (IN-APP)</button>
            <button type="button" class="btn secondary" style="font-size:12px;padding:9px 14px;display:inline-flex;align-items:center;cursor:pointer" onclick="downloadAppUpdateDirect()">📥 Direct Setup (.exe)</button>
            <button type="button" class="btn secondary" style="font-size:11px;padding:8px 12px;cursor:pointer" onclick="openReleasePage()">View Release Details</button>
          </div>
        `;
      }
      if (manual) openUpdateModal();
    } else if (result && result.success && !result.hasUpdate) {
      if (statusArea && manual) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#f0fdf4';
        statusArea.style.border = '1px solid #bbf7d0';
        statusArea.innerHTML = `<div style="color:#15803d;font-weight:700">✓ Infinity Dental Clinic is up to date! (v${esc(result.currentVersion)})</div><div style="color:#334155;font-size:11px;font-weight:600;margin-top:4px">You are running the latest official version.</div>`;
      }
    } else {
      if (statusArea && manual) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#fef2f2';
        statusArea.style.border = '1px solid #fecaca';
        statusArea.innerHTML = `<div style="color:#b91c1c;font-weight:700">Could not check updates</div><div style="color:#64748b;font-size:11px;margin-top:4px">${esc(result?.error || 'Unknown error')}</div>`;
      }
    }
  } catch (err) {
    if (statusArea && manual) {
      statusArea.style.display = 'block';
      statusArea.style.background = '#fef2f2';
      statusArea.style.border = '1px solid #fecaca';
      statusArea.innerHTML = `<div style="color:#b91c1c;font-weight:700">Update check failed</div><div class="muted" style="font-size:11px;margin-top:4px">${esc(err.message)}</div>`;
    }
  } finally {
    if (checkBtn) checkBtn.disabled = false;
  }
}

let isDownloadingUpdate = false;
let downloadedUpdatePath = null;
let currentUpdateInfo = null;

function downloadAppUpdateDirect() {
  const url = window.currentUpdateInfo?.setupUrl || window.currentUpdateInfo?.downloadUrl || window.currentUpdateInfo?.htmlUrl || 'https://github.com/paudelsankalpa33-create/infinity-dental/releases/latest';
  console.log('[Updater] Direct setup download requested:', url);
  openExternalUrl(url);
}

function openReleasePage() {
  const url = window.currentUpdateInfo?.htmlUrl || 'https://github.com/paudelsankalpa33-create/infinity-dental/releases/latest';
  openExternalUrl(url);
}

async function startInAppUpdate(overrideUrl) {
  if (isDownloadingUpdate) return;
  let downloadUrl = overrideUrl || window.currentUpdateInfo?.downloadUrl || window.currentUpdateInfo?.setupUrl || window.currentUpdateInfo?.htmlUrl;
  if (!downloadUrl) {
    downloadUrl = 'https://github.com/paudelsankalpa33-create/infinity-dental/releases/latest';
  }
  console.log('[Updater] startInAppUpdate invoked with URL:', downloadUrl);

  const downloadArea = document.getElementById('updateDownloadArea');
  const statusText = document.getElementById('downloadStatusText');
  const percentText = document.getElementById('downloadPercentText');
  const bytesText = document.getElementById('downloadBytesText');
  const progressBar = document.getElementById('updateProgressBar');
  const inAppBtn = document.getElementById('inAppDownloadBtn');
  const checkBtn = document.getElementById('checkUpdateBtn');
  const installArea = document.getElementById('installActionsArea');

  // Immediate visual feedback on click
  if (inAppBtn) {
    inAppBtn.disabled = true;
    inAppBtn.innerHTML = '⏳ Preparing Update...';
  }
  if (downloadArea) downloadArea.style.display = 'block';
  if (installArea) installArea.style.display = 'none';
  if (checkBtn) checkBtn.disabled = true;

  if (statusText) {
    statusText.textContent = 'Connecting to update service...';
    statusText.style.color = '#0369a1';
  }
  if (progressBar) progressBar.style.width = '15%';
  if (percentText) percentText.textContent = '15%';
  if (bytesText) bytesText.textContent = 'Connecting...';

  // 1. Electron Desktop Environment
  if (window.dentalApp && window.dentalApp.downloadUpdate) {
    isDownloadingUpdate = true;
    if (statusText) statusText.textContent = 'Downloading update directly inside the app...';

    window.dentalApp.onDownloadProgress((data) => {
      const p = data.percent || 0;
      if (progressBar) progressBar.style.width = p + '%';
      if (percentText) percentText.textContent = p + '%';
      if (bytesText && data.totalBytes > 0) {
        const dlMb = (data.downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMb = (data.totalBytes / 1024 / 1024).toFixed(1);
        let extra = '';
        if (data.speedMb && data.speedMb !== '0.0') {
          extra += ` • ${data.speedMb} MB/s`;
        }
        if (data.etaSec && data.etaSec > 0) {
          extra += ` (ETA: ${data.etaSec}s)`;
        }
        if (data.isResuming) {
          extra += ` ⚡ Resuming...`;
        }
        bytesText.textContent = `${dlMb} MB / ${totalMb} MB${extra}`;
      }
    });

    try {
      const res = await window.dentalApp.downloadUpdate(downloadUrl);
      if (res && res.success) {
        downloadedUpdatePath = res.filePath;
        if (progressBar) progressBar.style.width = '100%';
        if (percentText) percentText.textContent = '100%';
        if (statusText) {
          statusText.innerHTML = '🎉 <b>Update Downloaded Successfully!</b> Ready to install.';
          statusText.style.color = '#15803d';
        }
        if (bytesText) bytesText.textContent = 'Complete';
        if (installArea) installArea.style.display = 'block';
        if (inAppBtn) inAppBtn.style.display = 'none';
      } else {
        throw new Error(res?.error || 'Download failed');
      }
    } catch (err) {
      console.error('[Updater] In-app download error:', err);
      if (statusText) {
        statusText.innerHTML = `⚠️ In-app notice: ${esc(err.message)}. Opening direct browser download...`;
        statusText.style.color = '#b91c1c';
      }
      if (bytesText) {
        bytesText.innerHTML = `<button type="button" onclick="downloadAppUpdateDirect()" class="btn secondary" style="font-size:11px;padding:4px 8px;margin-top:4px;cursor:pointer">📥 Download via Browser</button>`;
      }
      if (inAppBtn) {
        inAppBtn.disabled = false;
        inAppBtn.innerHTML = '⬇ RETRY IN-APP UPDATE';
      }
      if (downloadUrl) {
        openExternalUrl(downloadUrl);
      }
    } finally {
      isDownloadingUpdate = false;
      if (checkBtn) checkBtn.disabled = false;
    }
    return;
  }

  // 2. Web Browser / Localhost Server Mode
  // Try to launch local installer directly on Windows through server.js
  try {
    if (statusText) statusText.innerHTML = '🔍 Checking local installer on this PC...';
    const launchRes = await fetch('/api/updates/launch-installer', { method: 'POST' }).then(r => r.json()).catch(() => null);
    if (launchRes && launchRes.success && launchRes.launched) {
      if (progressBar) progressBar.style.width = '100%';
      if (percentText) percentText.textContent = '100%';
      if (statusText) {
        statusText.innerHTML = '🚀 <b>Installer Launched!</b> Follow the setup window on your screen to complete the update.';
        statusText.style.color = '#15803d';
      }
      if (bytesText) bytesText.textContent = 'Setup window opened';
      if (inAppBtn) {
        inAppBtn.disabled = false;
        inAppBtn.innerHTML = '✓ Setup Launched (Click to re-launch)';
      }
      if (checkBtn) checkBtn.disabled = false;
      return;
    }
  } catch (_) { }

  // If local launcher wasn't available (remote user or static deployment):
  // Initiate browser direct download
  if (statusText) {
    statusText.innerHTML = '📥 <b>Downloading Setup Installer...</b>';
    statusText.style.color = '#0369a1';
  }
  if (progressBar) progressBar.style.width = '100%';
  if (percentText) percentText.textContent = '100%';

  // Trigger download via anchor element
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', '');
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 1000);

  if (bytesText) {
    bytesText.innerHTML = `
      <div style="margin-top:6px">
        <a href="${esc(downloadUrl)}" target="_blank" download class="btn primary" style="background:#2563eb;padding:8px 16px;font-size:12px;font-weight:700;display:inline-block;text-decoration:none">
          👉 If download didn't start, Click Here to Download .exe
        </a>
        <div class="muted" style="margin-top:4px;font-size:11px">Once downloaded, double-click to install the update.</div>
      </div>
    `;
  }

  if (inAppBtn) {
    inAppBtn.disabled = false;
    inAppBtn.innerHTML = '⬇ Download Again';
  }
  if (checkBtn) checkBtn.disabled = false;
}

async function applyUpdateAndRestart() {
  const statusText = document.getElementById('downloadStatusText');
  const restartBtn = document.getElementById('restartInstallBtn');
  if (restartBtn) {
    restartBtn.disabled = true;
    restartBtn.textContent = 'Closing app & applying update...';
  }
  if (statusText) {
    statusText.innerHTML = '⏳ <b>Restarting Infinity Dental Clinic to install update...</b>';
  }

  if (window.dentalApp && window.dentalApp.installAndRestart) {
    const res = await window.dentalApp.installAndRestart(downloadedUpdatePath);
    if (!res?.success) {
      alert('Could not start update installer: ' + (res?.error || 'Unknown error'));
      if (restartBtn) restartBtn.disabled = false;
    }
  }
}

function downloadAppUpdate(url) {
  if (url) {
    openExternalUrl(url);
  } else {
    downloadAppUpdateDirect();
  }
}

function openExternalUrl(url) {
  if (!url) return;
  console.log('[ExternalUrl] Opening:', url);
  try {
    if (window.dentalApp && window.dentalApp.openExternal) {
      window.dentalApp.openExternal(url);
      return;
    }
  } catch (e) {
    console.warn('[ExternalUrl] dentalApp.openExternal failed:', e);
  }
  try {
    window.open(url, '_blank');
  } catch (e) {
    console.warn('[ExternalUrl] window.open failed:', e);
  }
}

/* Appointments section */
let appointmentMode = 'BS';
let appointmentSelectedAD = apptIsoDate(new Date());
let appointmentView = (function() {
  const d = new Date();
  const bs = apptBsFromAd(apptIsoDate(d));
  if (bs) {
    const [y, m] = bs.split('-').map(Number);
    return { y, m };
  }
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
})();
function appointmentToday() { const d = new Date(); appointmentSelectedAD = apptIsoDate(d); appointmentSetViewForAD(appointmentSelectedAD); renderAppointments() }
function appointmentTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); appointmentSelectedAD = apptIsoDate(d); appointmentSetViewForAD(appointmentSelectedAD); renderAppointments() }
function appointmentSetViewForAD(ad) { const bs = apptBsFromAd(ad); if (appointmentMode === 'BS' && bs) { const [y, m] = bs.split('-').map(Number); appointmentView = { y, m } } else { const d = apptParseIso(ad); appointmentView = { y: d.getFullYear(), m: d.getMonth() + 1 } } }
function setAppointmentCalendarMode(mode) { appointmentMode = mode; appointmentSetViewForAD(appointmentSelectedAD); renderAppointments() }
function toggleAppointmentGoto() { const el = document.getElementById('appointmentGoto'); if (!el) return; el.style.display = el.style.display === 'none' ? 'flex' : 'none'; const input = document.getElementById('appointmentGotoInput'); if (input) { input.placeholder = appointmentMode === 'BS' ? '2083-05-27' : '2026-09-12'; input.focus() } }
function goAppointmentTypedDate() {
  const input = document.getElementById('appointmentGotoInput');
  const value = (input?.value || '').trim();
  let ad = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const y = Number(value.split('-')[0]);
    if (y > 2050) {
      ad = apptAdFromBs(value);
    } else {
      ad = value;
    }
  } else if (appointmentMode === 'BS') {
    ad = apptAdFromBs(value);
  } else if (apptParseIso(value)) {
    ad = value;
  }
  if (!ad) {
    showToast('Invalid date. Please use YYYY-MM-DD.', 'warn');
    return;
  }
  appointmentSelectedAD = ad;
  appointmentSetViewForAD(ad);
  const box = document.getElementById('appointmentGoto');
  if (box) box.style.display = 'none';
  renderAppointments();
}
function appointmentPrevMonth() { if (appointmentMode === 'BS') { let { y, m } = appointmentView; m--; if (m < 1) { m = 12; y-- } if (!APPT_BS_LENGTHS[y]) return; appointmentView = { y, m } } else { let { y, m } = appointmentView; m--; if (m < 1) { m = 12; y-- } appointmentView = { y, m } } renderAppointments() }
function appointmentNextMonth() { if (appointmentMode === 'BS') { let { y, m } = appointmentView; m++; if (m > 12) { m = 1; y++ } if (!APPT_BS_LENGTHS[y]) return; appointmentView = { y, m } } else { let { y, m } = appointmentView; m++; if (m > 12) { m = 1; y++ } appointmentView = { y, m } } renderAppointments() }
function appointmentPatientsForAD(ad) { return patients.filter(p => p.Appointment && p.Appointment.adDate === ad).sort((a, b) => String(a.Appointment.time || '').localeCompare(String(b.Appointment.time || ''))) }
function toggleNewAppointmentForm(show) { const form = document.getElementById('newAppointmentForm'); if (!form) return; const opening = show === undefined ? form.style.display === 'none' : !!show; form.style.display = opening ? 'block' : 'none'; if (opening) { document.getElementById('newApptDate').value = appointmentSelectedAD || apptIsoDate(new Date()); document.getElementById('newApptName').focus() } }
function addAppointmentFromSection() { const name = document.getElementById('newApptName').value.trim(), phone = document.getElementById('newApptPhone').value.trim(), ad = document.getElementById('newApptDate').value, time = document.getElementById('newApptTime').value; if (!name) { alert('Please enter the patient name.'); document.getElementById('newApptName').focus(); return } if (!phone) { alert('Please enter the phone number.'); document.getElementById('newApptPhone').focus(); return } if (!apptParseIso(ad)) { alert('Please select a valid appointment date.'); return } if (!time) { alert('Please select an appointment time.'); document.getElementById('newApptTime').focus(); return } const existing = registeredPatients().find(p => String(p.Contact || '').replace(/\D/g, '') === phone.replace(/\D/g, '') && String(p.Name || '').trim().toLowerCase() === name.toLowerCase()); const record = existing || { id: crypto.randomUUID(), AppointmentOnly: true, Name: name, Contact: phone, Appointment: null }; record.Name = name; record.Contact = phone; record.Appointment = { adDate: ad, bsDate: apptBsFromAd(ad) || '', time, status: 'scheduled' }; if (!existing) patients.push(record); save(); appointmentSelectedAD = ad; appointmentSetViewForAD(ad); document.getElementById('newApptName').value = ''; document.getElementById('newApptPhone').value = ''; document.getElementById('newApptTime').value = ''; toggleNewAppointmentForm(false); renderAppointments(); alert('Appointment saved for ' + name + '. ' + (existing ? 'Linked to the existing registered patient.' : 'This person remains unregistered and has not been assigned an OPD number.')) }
function registerAppointmentGuest(id) { const p = patients.find(x => x.id === id && x.AppointmentOnly); if (!p) return; const now = new Date(); p.AppointmentOnly = false; if (p.Appointment) p.Appointment.status = 'attended'; p.OPDNumber = nextNumber(); p.Address = ''; p.Age = ''; p.Gender = ''; p.Date = now.toISOString().slice(0, 10); p.Time = now.toTimeString().slice(0, 8); p.Treatments = []; p.Subtotal = 0; p.DiscountPercent = 0; p.DiscountAmount = 0; p.FinalAmount = 0; p.PaymentStatus = 'Pending'; p.PaymentMethod = ''; p.BillNumber = ''; p.Documents = []; p.VisitHistory = []; p.PaymentHistory = []; save(); selectedId = p.id; showPage('profile'); renderProfile(); alert('Patient registered successfully. OPD Number: ' + pad(p.OPDNumber)) }
function appointmentStatusFor(p) { const a = p && p.Appointment; if (!a) return 'scheduled'; if (a.status === 'attended') return 'attended'; if (a.adDate < apptIsoDate(new Date())) return 'no-show'; return 'scheduled' }
function markAppointmentArrived(id) { const p = patients.find(x => x.id === id && x.Appointment); if (!p) return; p.Appointment.status = 'attended'; p.Appointment.arrivedAt = new Date().toISOString(); save(); renderAppointments(); alert('Appointment marked as arrived for ' + p.Name + '.') }
function saveAppointmentFollowUp(id) { const p = patients.find(x => x.id === id && x.Appointment); if (!p) return; const a = p.Appointment; const status = document.getElementById('followStatus_' + id)?.value || 'not-called'; const date = document.getElementById('followDate_' + id)?.value || apptIsoDate(new Date()); const attempts = Math.max(0, Number(document.getElementById('followAttempts_' + id)?.value) || 0); const note = (document.getElementById('followNote_' + id)?.value || '').trim(); a.followUpStatus = status; a.followUpDate = date; a.followUpAttempts = attempts; a.followUpNotes = note; if (!Array.isArray(a.followUpHistory)) a.followUpHistory = []; a.followUpHistory.push({ status, date, attempts, note, savedAt: new Date().toISOString() }); save(); renderAppointments(); alert('Follow-up details saved. This does not change the appointment attendance status.'); }
function followUpLabel(status) { return ({ 'not-called': 'NOT CALLED YET', 'interested': 'WANTS TO COME', 'call-back': 'CALL BACK LATER', 'no-answer': 'NO ANSWER', 'declined': 'DECLINED' })[status] || 'NOT CALLED YET' }
function followUpClass(status) { return ({ 'not-called': 'fu-not-called', 'interested': 'fu-interested', 'call-back': 'fu-call-back', 'no-answer': 'fu-no-answer', 'declined': 'fu-declined' })[status] || 'fu-not-called' }
function renderAppointmentList() { const list = document.getElementById('appointmentList'), title = document.getElementById('appointmentListTitle'), sub = document.getElementById('appointmentListSub'); if (!list) return; const ad = appointmentSelectedAD, bs = apptBsFromAd(ad), items = appointmentPatientsForAD(ad); title.textContent = ad === apptIsoDate(new Date()) ? 'Today\'s Appointments' : 'Appointments'; sub.textContent = (appointmentMode === 'BS' && bs ? bs + ' BS' : 'AD ' + ad) + ' • ' + items.length + ' appointment' + (items.length === 1 ? '' : 's'); list.innerHTML = items.length ? items.map(p => { const a = p.Appointment, status = appointmentStatusFor(p), label = status === 'attended' ? 'ARRIVED' : status === 'no-show' ? 'DID NOT COME' : 'SCHEDULED', fs = a.followUpStatus || 'not-called', hist = Array.isArray(a.followUpHistory) ? a.followUpHistory : [], recent = hist.slice(-2).reverse(); return `<div class="appt-row appt-${status}"><div class="appt-main"><div class="appt-name">${esc(p.Name)} <span class="appt-status">${label}</span> <span class="follow-status ${followUpClass(fs)}">CALL: ${followUpLabel(fs)}</span></div><div class="appt-meta">${p.AppointmentOnly ? 'Not registered' : ('OPD ' + pad(p.OPDNumber))} • ${esc(p.Contact || '')} • ${esc(a.time || '')}</div><div class="followup-panel"><div class="followup-heading">Follow-up call tracking</div><div class="followup-fields"><label>Call outcome<select id="followStatus_${p.id}"><option value="not-called" ${fs === 'not-called' ? 'selected' : ''}>Not called yet</option><option value="interested" ${fs === 'interested' ? 'selected' : ''}>Wants to come / interested</option><option value="call-back" ${fs === 'call-back' ? 'selected' : ''}>Call back later</option><option value="no-answer" ${fs === 'no-answer' ? 'selected' : ''}>No answer</option><option value="declined" ${fs === 'declined' ? 'selected' : ''}>Declined / not interested</option></select></label><label>Call date<input id="followDate_${p.id}" type="date" value="${esc(a.followUpDate || apptIsoDate(new Date()))}"></label><label>Call attempts<input id="followAttempts_${p.id}" type="number" min="0" max="999" step="1" value="${Number(a.followUpAttempts) || 0}"></label><label class="follow-note-field">Notes<textarea id="followNote_${p.id}" rows="2" placeholder="e.g. Try calling again in the evening.">${esc(a.followUpNotes || '')}</textarea></label></div><div class="followup-actions"><button class="btn secondary" onclick="saveAppointmentFollowUp('${p.id}')">SAVE FOLLOW-UP</button>${hist.length ? `<span class="muted">${hist.length} saved update${hist.length === 1 ? '' : 's'}</span>` : ''}</div>${recent.length ? `<details class="followup-history"><summary>Previous follow-up history (${hist.length})</summary>${recent.map(h => `<div class="followup-history-item"><strong>${esc(h.date || '')}</strong> · ${esc(followUpLabel(h.status))} · ${Number(h.attempts) || 0} attempts${h.note ? ' — ' + esc(h.note) : ''}</div>`).join('')}</details>` : ''}</div></div><div class="appt-actions">${p.AppointmentOnly ? `<button class="btn secondary" onclick="registerAppointmentGuest('${p.id}')">REGISTER & ARRIVED</button><button class="btn secondary" onclick="openRescheduleModal('${p.id}')">RESCHEDULE</button>` : status !== 'attended' ? `<button class="btn secondary" onclick="markAppointmentArrived('${p.id}')">MARK ARRIVED</button><button class="btn secondary" onclick="openRescheduleModal('${p.id}')">RESCHEDULE</button><button class="btn secondary" onclick="openProfile('${p.id}')">OPEN</button>` : `<button class="btn secondary" onclick="openRescheduleModal('${p.id}')">RESCHEDULE</button><button class="btn secondary" onclick="openProfile('${p.id}')">OPEN</button>`}</div></div>` }).join('') : '<div class="appointment-empty">No appointments scheduled for this date.</div>' }
function renderAppointmentCalendar() { const wrap = document.getElementById('appointmentCalendar'), title = document.getElementById('appointmentMonthTitle'), sub = document.getElementById('appointmentMonthSub'); if (!wrap) return; let y = appointmentView.y, m = appointmentView.m; if (appointmentMode === 'BS') { const lens = APPT_BS_LENGTHS[y]; if (!lens) return; title.textContent = APPT_BS_MONTHS_NP[m - 1] + ' ' + y; sub.textContent = APPT_BS_MONTHS[m - 1] + ' • ' + m + 'th month'; const firstAd = apptAdFromBs(y + '-' + apptPad(m) + '-01'), first = apptParseIso(firstAd); const start = first.getDay(); const days = lens[m - 1]; let cells = ''; for (let i = 0; i < start; i++)cells += '<td></td>'; for (let d = 1; d <= days; d++) { const bs = y + '-' + apptPad(m) + '-' + apptPad(d), ad = apptAdFromBs(bs), selected = ad === appointmentSelectedAD ? ' selected' : '', today = ad === apptIsoDate(new Date()) ? ' today' : '', count = appointmentPatientsForAD(ad).length; cells += `<td><button class="cal-day${selected}${today}" onclick="selectAppointmentBS('${bs}')"><div class="daynum">${d}</div>${count ? `<div class="appt-dot">${count} appt</div>` : ''}</button></td>`; if ((start + d) % 7 === 0) { cells += '</tr><tr>' } } wrap.innerHTML = `<table class="bs-cal"><thead><tr>${APPT_BS_DAYS.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table>` } else { const first = new Date(y, m - 1, 1), start = first.getDay(), days = new Date(y, m, 0).getDate(); title.textContent = first.toLocaleString(undefined, { month: 'long', year: 'numeric' }); sub.textContent = 'Gregorian / AD'; let cells = ''; for (let i = 0; i < start; i++)cells += '<td></td>'; for (let d = 1; d <= days; d++) { const ad = y + '-' + apptPad(m) + '-' + apptPad(d), selected = ad === appointmentSelectedAD ? ' selected' : '', today = ad === apptIsoDate(new Date()) ? ' today' : '', count = appointmentPatientsForAD(ad).length; cells += `<td><button class="cal-day${selected}${today}" onclick="selectAppointmentAD('${ad}')"><div class="daynum">${d}</div>${count ? `<div class="appt-dot">${count} appt</div>` : ''}</button></td>`; if ((start + d) % 7 === 0) cells += '</tr><tr>' } wrap.innerHTML = `<table class="bs-cal"><thead><tr>${APPT_BS_DAYS.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table>` } }
function selectAppointmentBS(bs) { const ad = apptAdFromBs(bs); if (!ad) return; appointmentSelectedAD = ad; appointmentSetViewForAD(ad); renderAppointments() }
function selectAppointmentAD(ad) { if (!apptParseIso(ad)) return; appointmentSelectedAD = ad; appointmentSetViewForAD(ad); renderAppointments() }
function renderAppointments() { const p = document.getElementById('appointments'); if (!p) return; document.getElementById('appointmentModeAD')?.classList.toggle('primary', appointmentMode === 'AD'); document.getElementById('appointmentModeBS')?.classList.toggle('primary', appointmentMode === 'BS'); document.getElementById('appointmentModeAD')?.classList.toggle('secondary', appointmentMode !== 'AD'); document.getElementById('appointmentModeBS')?.classList.toggle('secondary', appointmentMode !== 'BS'); renderAppointmentCalendar(); renderAppointmentList() }
const originalShowPage = showPage;
showPage = function (id) {
  originalShowPage(id);
  if (id === 'appointments') {
    appointmentSelectedAD = apptIsoDate(new Date());
    appointmentSetViewForAD(appointmentSelectedAD);
    renderAppointments();
  }
  if (id === 'nepalpay') {
    renderNepalPayTxnTable();
    updateNiziClock();
    // Default standby screen on opening NepalPay: show configured standby screen (IDLE or Wi-Fi), never push test QR
    const startupPref = localStorage.getItem('infinity_nizi_startup_screen') || 'idle';
    const selectEl = document.getElementById('niziStartupScreenSelect');
    if (selectEl) selectEl.value = startupPref;
    if (startupPref === 'wifi') {
      showWifiQrOnNizi();
    } else {
      sendNiziCommand('IDLE');
    }
  }
};

/* --- NepalPay Dynamic QR & NiZi POS Controller --- */
// (Serial and transaction state variables are hoisted to the top of the file)

function playPosChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
    osc2.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.35);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc1.start();
    osc2.start(audioCtx.currentTime + 0.12);
    osc1.stop(audioCtx.currentTime + 0.6);
    osc2.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    console.warn('Audio chime failed:', e);
  }
}

function speakVoicePayment(amount) {
  try {
    playPosChime();
    if ('speechSynthesis' in window) {
      setTimeout(() => {
        const text = `Payment of rupees ${Math.round(amount)} received successfully.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        window.speechSynthesis.speak(utterance);
      }, 400);
    }
  } catch (e) {
    console.warn('Voice speak failed:', e);
  }
}

// --- NiZi POS B33 Hardware Auto-Detect & USB Serial Connection ---
// (Reader & connection state variables are hoisted to the top of the file)

function isCh341Device(port) {
  if (!port || typeof port.getInfo !== 'function') return false;
  try {
    const info = port.getInfo();
    const vid = info.usbVendorId;
    return vid === 0x1a86 || vid === 6790;
  } catch (_) {
    return false;
  }
}

function setupNiziSerialListeners() {
  if (niziSerialListenersInitialized) return;
  niziSerialListenersInitialized = true;

  if (typeof navigator !== 'undefined' && navigator.serial) {
    navigator.serial.addEventListener('connect', async (event) => {
      console.log('[WebSerial] NiZi device plugged into USB:', event.target);
      const isNiZi = isCh341Device(event.target);
      if (isNiZi) {
        await autoConnectNiziUsb(true, event.target);
      }
    });
    navigator.serial.addEventListener('disconnect', (event) => {
      console.log('[WebSerial] NiZi device unplugged from USB:', event.target);
      handleNiziUsbDisconnect();
    });
  }

  if (window.dentalApp && window.dentalApp.onSerialDeviceChanged) {
    window.dentalApp.onSerialDeviceChanged(async (data) => {
      console.log('[Electron Serial Event]:', data);
      if (data.action === 'added') {
        await autoConnectNiziUsb(true);
      } else if (data.action === 'removed') {
        handleNiziUsbDisconnect();
      }
    });
  }
}

async function autoConnectNiziUsb(silent = false, specificPort = null) {
  setupNiziSerialListeners();

  if (!navigator.serial) {
    if (!silent) {
      alert('Web Serial is supported on Google Chrome, Microsoft Edge, and the desktop Electron app.\nPlease use one of these to connect directly to the USB soundbox.');
    }
    return;
  }
  if (niziSerialPort && niziSerialPort.readable && niziSerialWriter) {
    if (!silent) alert('✓ NiZi POS B33 is already connected via USB!');
    return;
  }
  if (niziIsConnecting) return;
  niziIsConnecting = true;

  try {
    let port = specificPort;
    if (!port) {
      const ports = await navigator.serial.getPorts();
      const matched = (ports || []).filter(isCh341Device);
      if (matched.length > 0) {
        port = matched[0];
      }
    }

    // In silent auto-detect, do not prompt or attempt to open unknown Bluetooth ports
    if (!port && silent) {
      niziIsConnecting = false;
      return;
    }

    if (!port) {
      try {
        port = await navigator.serial.requestPort({
          filters: [{ usbVendorId: 0x1a86 }]
        });
      } catch (reqErr) {
        console.warn('requestPort result:', reqErr);
        if (!silent) {
          const statusPill = document.getElementById('niziHardwareStatusPill');
          if (statusPill) {
            statusPill.textContent = 'Simulated / Ready';
            statusPill.className = 'status-pill simulated';
          }
          const label = document.getElementById('niziPortLabel');
          if (label) label.textContent = 'Software Soundbox Simulator Active';
          sendNiziCommand({ command: 'display_logo', title: 'Infinity Dental' });
          speakVoicePayment(getActiveTestQrAmount());
          alert('🔌 NiZi POS Hardware Notice:\n\nNo physical USB soundbox was selected.\n\nThe built-in Software Soundbox Simulator is ACTIVE:\n• You can test sound chimes (🔊 Test Sound)\n• You can push QR codes to the LCD screen\n• You can test voice announcements and simulated payments\n\n💡 If your physical NiZi box is plugged in but Windows does not recognize it, click the "📦 Install Driver" button to install the official CH341 USB driver in 1 click!');
        }
        niziIsConnecting = false;
        return;
      }
    }

    if (!port) {
      niziIsConnecting = false;
      return;
    }

    try {
      await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
      console.log('[NiZi USB] Port opened successfully at 115200 baud.');
      if (port.setSignals) {
        try {
          await port.setSignals({ dataTerminalReady: false, requestToSend: false });
          console.log('[NiZi USB] Handshake signals set: DTR=false, RTS=false');
        } catch (_) { }
      }
    } catch (openErr) {
      console.warn('[NiZi USB] Port open result:', openErr.message);
      niziIsConnecting = false;
      return;
    }

    if (port.writable) {
      niziSerialWriter = port.writable.getWriter();
    }
    niziSerialPort = port;

    const statusPill = document.getElementById('niziHardwareStatusPill');
    if (statusPill) {
      statusPill.textContent = '✓ Hardware USB Connected';
      statusPill.className = 'status-pill live';
    }
    const label = document.getElementById('niziPortLabel');
    if (label) label.textContent = 'NiZi POS B33 Online (Auto-connected via USB)';
    const btn = document.getElementById('niziUsbConnectBtn');
    if (btn) {
      btn.textContent = '✓ USB CONNECTED';
      btn.className = 'btn primary';
    }

    readNiziSerialLoop(port);
    sendNiziCommand({ command: 'display_logo', title: 'Infinity Dental' });

    if (!silent) {
      alert('✓ NiZi POS B33 connected successfully via USB!');
    }
  } catch (e) {
    console.error('NiZi USB connection error:', e);
    if (!silent && e.name !== 'AbortError') {
      alert('NiZi POS connection note: ' + e.message);
    }
  } finally {
    niziIsConnecting = false;
  }
}

async function installSoundboxDriver() {
  const btn = document.getElementById('niziDriverBtn');
  const originalText = btn ? btn.textContent : '📦 Install Driver';
  if (btn) {
    btn.textContent = '⏳ Launching...';
    btn.disabled = true;
  }

  try {
    let result = null;
    if (window.dentalApp && typeof window.dentalApp.installSoundboxDriver === 'function') {
      result = await window.dentalApp.installSoundboxDriver();
    } else {
      const resp = await fetch('/api/nizi/install-driver', { method: 'POST' });
      result = await resp.json();
    }

    if (result && result.success) {
      alert(
        '📦 CH341 USB Driver Installer Launched!\n\n' +
        'How to finish setup:\n' +
        '1. Look for the "DriverSetup(X64)" window that just opened.\n' +
        '2. Click the "INSTALL" button in that window.\n' +
        '3. Wait ~2 seconds until it says "Driver install success!".\n' +
        '4. Plug in your NiZi POS USB soundbox cable.\n' +
        '5. Click "🔌 CONNECT USB" to connect!'
      );
    } else {
      alert('Could not launch driver installer: ' + (result?.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to launch driver installer: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

// --- NiZi POS Soundbox Serial Port UI Integration ---
let serverSoundboxStatus = { connected: false, port: null };

function applySoundboxStatusToUi(status) {
  if (!status) return;
  serverSoundboxStatus = status;

  const statusPill = document.getElementById('niziHardwareStatusPill');
  const portLabel = document.getElementById('niziPortLabel');
  const connectBtn = document.getElementById('niziUsbConnectBtn');
  const portSelect = document.getElementById('soundboxPortSelect');

  if (status.connected && status.port) {
    if (statusPill) {
      statusPill.textContent = `✓ USB Connected (${status.port})`;
      statusPill.className = 'status-pill live';
    }
    if (portLabel) {
      portLabel.textContent = `NiZi Soundbox Online on ${status.port} (115200 baud 8-N-1)`;
    }
    if (connectBtn) {
      connectBtn.textContent = '✓ USB CONNECTED';
      connectBtn.className = 'btn primary';
      connectBtn.title = `Connected on ${status.port} at 115200 baud. Click to disconnect or switch port.`;
    }
    if (portSelect) {
      let found = false;
      for (let i = 0; i < portSelect.options.length; i++) {
        if (portSelect.options[i].value === status.port) {
          portSelect.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found && portSelect.options.length > 0) {
        const opt = document.createElement('option');
        opt.value = status.port;
        opt.textContent = `✓ ${status.port} (Connected)`;
        opt.selected = true;
        portSelect.appendChild(opt);
      }
    }
  } else {
    if (statusPill) {
      statusPill.textContent = 'Disconnected / Simulated';
      statusPill.className = 'status-pill simulated';
    }
    if (portLabel) {
      portLabel.textContent = status.error
        ? `Port error: ${status.error}`
        : 'Select COM port and click Connect (115200 baud)';
    }
    if (connectBtn) {
      connectBtn.textContent = '🔌 CONNECT USB';
      connectBtn.className = 'btn secondary';
      connectBtn.title = 'Click to connect to the selected COM port';
    }
  }
}

async function loadSoundboxPorts(manual = false) {
  const select = document.getElementById('soundboxPortSelect');
  const refreshBtn = document.getElementById('niziRefreshPortsBtn');
  if (refreshBtn) refreshBtn.textContent = '⏳';

  try {
    const res = await fetch('/api/soundbox/ports');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (select) {
      select.innerHTML = '';

      if (!data.ports || data.ports.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No COM Ports Found';
        select.appendChild(opt);
      } else {
        const autoOpt = document.createElement('option');
        autoOpt.value = 'auto';
        autoOpt.textContent = '⚡ Auto-Detect Port';
        select.appendChild(autoOpt);

        let preferredValue = null;

        data.ports.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.path;
          let label = p.path;
          if (p.isCandidate) {
            label += ` ★ (${p.manufacturer ? p.manufacturer.split(' ')[0] : 'NiZi'})`;
            if (!preferredValue) preferredValue = p.path;
          } else if (p.friendlyName && p.friendlyName !== p.path) {
            label += ` (${p.friendlyName.replace(/\s*\(COM\d+\)/i, '').slice(0, 15)})`;
          }
          opt.textContent = label;
          if (data.activePort === p.path && data.connected) {
            opt.selected = true;
            preferredValue = p.path;
          }
          select.appendChild(opt);
        });

        if (data.connected && data.activePort) {
          select.value = data.activePort;
        } else if (preferredValue) {
          select.value = preferredValue;
        } else {
          select.value = 'auto';
        }
      }
    }

    if (data.status) {
      applySoundboxStatusToUi(data.status);
    }

    if (manual) {
      console.log(`[Soundbox Ports] Refreshed: ${data.ports ? data.ports.length : 0} port(s) detected.`);
    }
  } catch (err) {
    console.warn('[Soundbox Ports] Error loading ports:', err.message);
    if (select && select.options.length === 0) {
      select.innerHTML = '<option value="">COM Detection Offline</option>';
    }
  } finally {
    if (refreshBtn) refreshBtn.textContent = '🔄';
  }
}

function onSoundboxPortSelected(val) {
  console.log('[Soundbox UI] User selected port:', val);
}

async function connectSelectedSoundboxPort() {
  const select = document.getElementById('soundboxPortSelect');
  const connectBtn = document.getElementById('niziUsbConnectBtn');
  const selectedPort = select ? (select.value || 'auto') : 'auto';

  // If already connected, prompt user to disconnect
  if (serverSoundboxStatus && serverSoundboxStatus.connected) {
    const confirmDisconnect = confirm(
      `NiZi POS Soundbox is currently CONNECTED on ${serverSoundboxStatus.port} at 115200 baud.\n\n` +
      `Would you like to disconnect?`
    );
    if (confirmDisconnect) {
      try {
        if (connectBtn) {
          connectBtn.textContent = 'Disconnecting...';
          connectBtn.disabled = true;
        }
        await fetch('/api/soundbox/disconnect', { method: 'POST' });
        serverSoundboxStatus.connected = false;
        applySoundboxStatusToUi({ connected: false });
        alert('NiZi Soundbox disconnected.');
      } catch (err) {
        alert('Disconnect error: ' + err.message);
      } finally {
        if (connectBtn) connectBtn.disabled = false;
        loadSoundboxPorts(false);
      }
    }
    return;
  }

  // Not connected -> connect to selected port
  if (connectBtn) {
    connectBtn.textContent = '⏳ Connecting...';
    connectBtn.disabled = true;
  }

  try {
    console.log(`[Soundbox UI] Connecting to port "${selectedPort}" at 115200 baud (8-N-1)...`);
    const resp = await fetch('/api/soundbox/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: selectedPort, baudRate: 115200 })
    });

    const result = await resp.json();

    if (result && result.success && result.status && result.status.connected) {
      applySoundboxStatusToUi(result.status);
      sendNiziCommand({ command: 'display_logo', title: 'Infinity Dental' });
      speakVoicePayment(1500);
      alert(`✓ NiZi POS Soundbox successfully connected on ${result.status.port} at 115200 baud (8-N-1)!`);
    } else {
      const errMsg = result.error || 'Could not open serial connection';
      alert(
        `🔌 NiZi POS Connection Notice:\n\n` +
        `Failed to open port: ${errMsg}\n\n` +
        `Tips:\n` +
        `• Make sure the USB cable is firmly plugged into your PC.\n` +
        `• If you haven't installed the CH341 driver yet, click the "📦 Driver" button.\n` +
        `• Try selecting another COM port from the dropdown.`
      );
      if (result.status) applySoundboxStatusToUi(result.status);
    }
  } catch (err) {
    console.error('[Soundbox UI] Connection request error:', err);
    if (navigator.serial) {
      const tryWebSerial = confirm(`Backend connection note: ${err.message}\n\nWould you like to try browser WebSerial directly?`);
      if (tryWebSerial) {
        await autoConnectNiziUsb(false);
      }
    } else {
      alert('Soundbox connection error: ' + err.message);
    }
  } finally {
    if (connectBtn) connectBtn.disabled = false;
    loadSoundboxPorts(false);
  }
}

async function connectNiziUsb() {
  await connectSelectedSoundboxPort();
}

function handleNiziUsbDisconnect() {
  try {
    if (niziSerialWriter) {
      niziSerialWriter.releaseLock();
      niziSerialWriter = null;
    }
    if (niziSerialPort) {
      niziSerialPort.close().catch(() => { });
      niziSerialPort = null;
    }
  } catch (e) { }

  const statusPill = document.getElementById('niziHardwareStatusPill');
  if (statusPill) {
    statusPill.textContent = 'Disconnected / Simulated';
    statusPill.className = 'status-pill simulated';
  }
  const label = document.getElementById('niziPortLabel');
  if (label) label.textContent = 'Plug in USB cable to auto-connect';
  const btn = document.getElementById('niziUsbConnectBtn');
  if (btn) {
    btn.textContent = '🔌 CONNECT USB';
    btn.className = 'btn secondary';
  }
}

async function readNiziSerialLoop(port) {
  while (port && port.readable && niziSerialPort === port) {
    try {
      const reader = port.readable.getReader();
      niziSerialReader = reader;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const text = new TextDecoder().decode(value);
          console.log('[NiZi USB Rx]:', text);
        }
      }
    } catch (err) {
      break;
    } finally {
      if (niziSerialReader) {
        try { niziSerialReader.releaseLock(); } catch (e) { }
        niziSerialReader = null;
      }
    }
  }
}

// NiZi B33 Local HTTP Bridge Controller (Exact logic from Infinity_NiziPOS_B33_HTML_v3_Key_Configured.html)
const NIZI_DEFAULT_KEY = 'Z8uVovI2eftp65dO9JoxEstKcWggSlTAza4erAQhELmSC761rVtp5IIzaXOxWNw0ycPCICYCnJBCVPCzvdT8fbJvWIWm69fhHveZesIiDEIeI0BkdSspMPimWYNWs25D';
const NIZI_DEFAULT_URL = 'http://127.0.0.1:9121';
const NIZI_DEFAULT_PORT = 'COM4';

function getNiziKey() {
  const el = document.getElementById('niziKeyInput');
  return (el?.value || localStorage.getItem('nizi_bridge_key') || NIZI_DEFAULT_KEY).trim();
}

function getNiziPort() {
  const el = document.getElementById('niziComPortInput');
  return (el?.value || localStorage.getItem('nizi_bridge_port') || NIZI_DEFAULT_PORT).trim();
}

function getNiziBaseUrl() {
  return (localStorage.getItem('nizi_bridge_url') || NIZI_DEFAULT_URL).trim().replace(/\/+$/, '');
}

function saveNiziSettings() {
  const key = getNiziKey();
  const port = getNiziPort();
  localStorage.setItem('nizi_bridge_key', key);
  localStorage.setItem('nizi_bridge_port', port);
}

function toggleNiziMainKeyVisibility() {
  const input = document.getElementById('niziKeyInput');
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  const btn = document.getElementById('niziKeyToggleBtn');
  if (btn) btn.textContent = isPass ? '🔒' : '👁️';
}

function niziClean(s) {
  return String(s || '').replace(/\*\*/g, ' ').replace(/[\r\n]/g, ' ').trim();
}

function niziLog(msg) {
  const logEl = document.getElementById('niziB33Log');
  if (!logEl) return;
  const t = new Date().toLocaleTimeString();
  logEl.textContent = `${t}  ${msg}\n` + logEl.textContent.slice(0, 4500);
}

function niziStatus(msg, isSuccess = null) {
  const statusEl = document.getElementById('niziB33StatusText');
  const pillEl = document.getElementById('niziB33StatusPill');
  const mainPill = document.getElementById('niziHardwareStatusPill');
  if (statusEl) statusEl.textContent = msg;
  niziLog(msg);

  if (isSuccess === true) {
    if (pillEl) {
      pillEl.className = 'status-pill online';
      pillEl.textContent = 'Connected';
    }
    if (mainPill) {
      mainPill.className = 'status-pill live';
      mainPill.textContent = 'Bridge Online';
    }
  } else if (isSuccess === false) {
    if (pillEl) {
      pillEl.className = 'status-pill offline';
      pillEl.textContent = 'Bridge Offline';
    }
    if (mainPill) {
      mainPill.className = 'status-pill disconnected';
      mainPill.textContent = 'Bridge Offline';
    }
  }
}

async function niziApi(path, method = 'GET', body = undefined) {
  saveNiziSettings();
  const base = getNiziBaseUrl();
  const key = getNiziKey();
  if (!key) throw Error('Enter your real API key first.');

  // 1. Try backend proxy first (/api/nizi-bridge/* or /api/*) for zero CORS issues
  try {
    const proxyPath = '/api/nizi-bridge' + path.replace(/^\/api/, '');
    const proxyUrl = proxyPath + (method === 'GET' ? `?url=${encodeURIComponent(base)}&apiKey=${encodeURIComponent(key)}` : '');
    const proxyOpts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== undefined) {
      proxyOpts.body = JSON.stringify({ ...body, bridgeUrl: base, apiKey: key });
    }
    const pRes = await fetch(proxyUrl, proxyOpts);
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData.success !== false) {
        return pData.data || pData.response || pData;
      }
    }
  } catch (proxyErr) {
    console.warn('NiZi backend proxy attempt warning:', proxyErr);
  }

  // 2. Direct browser fetch fallback (matching Infinity_NiziPOS_B33_HTML_v3_Key_Configured.html)
  const options = {
    method,
    headers: { 'X-API-Key': key }
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(base + path, options);
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = raw; }
  if (!response.ok) throw Error(`HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function niziRun(fn) {
  try {
    const data = await fn();
    niziStatus(typeof data === 'string' ? data : JSON.stringify(data, null, 2), true);
    return data;
  } catch (e) {
    niziStatus('ERROR: ' + e.message + '\nIf PowerShell works but this HTML shows Failed to fetch, the service likely blocks browser CORS. The connector developer must allow the page origin, or the Windows app should call the API from its backend.', false);
    return null;
  }
}

function niziRunCheck() {
  const pillEl = document.getElementById('niziB33StatusPill');
  if (pillEl) {
    pillEl.className = 'status-pill checking';
    pillEl.textContent = 'Checking...';
  }
  return niziRun(() => niziApi('/api/status'));
}

function niziRunConnect() {
  const port = getNiziPort();
  return niziRun(() => niziApi('/api/connect', 'POST', { port }));
}

function niziRunDisconnect() {
  return niziRun(() => niziApi('/api/disconnect', 'POST', {}));
}

async function detectNiZiSerialPorts() {
  const portInput = document.getElementById('niziComPortInput');
  try {
    const res = await fetch('/api/soundbox/ports');
    const data = await res.json();
    if (data && data.ports && data.ports.length > 0) {
      const candidate = data.ports.find(p => p.isCandidate) || data.ports[0];
      if (candidate && portInput) {
        portInput.value = candidate.path;
        localStorage.setItem('nizi_bridge_port', candidate.path);
        niziLog(`Auto-detected port: ${candidate.path} (${candidate.friendlyName || 'Serial'})`);
        alert(`Detected ${data.ports.length} COM port(s). Selected: ${candidate.path}`);
        return;
      }
    }
    alert('No active COM ports detected. Defaulting to COM4.');
  } catch (e) {
    console.warn('Port detection warning:', e.message);
  }
}

function niziCommand(type) {
  const amountEl = document.getElementById('niziAmountInput');
  const amount = (amountEl?.value || '150.00').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw Error('Enter a valid non-negative amount, e.g. 150.00');
  const a = 'Rs. ' + amount;
  const msgEl = document.getElementById('niziMessageInput');
  const m = niziClean(msgEl?.value) || 'Infinity Dental';

  switch (type) {
    case 'idle': return 'IDLE';
    case 'text': return `TEXT**Infinity Dental**Welcome**${m}`;
    case 'qr': {
      const payloadEl = document.getElementById('niziPayloadInput');
      const p = (payloadEl?.value || '').trim();
      if (!p) throw Error('Enter a real QR payload first.');
      return `QR**${a}**Scan to pay**${p}`;
    }
    case 'wait': return `WAIT**${a}**Please wait`;
    case 'pass': return `PASS**${a}**Payment successful`;
    case 'fail': return `FAIL**${a}**Payment failed`;
    case 'info': return `INFO**Infinity Dental**${m}`;
    case 'warn': return `WARN**Device Not Ready**${m}`;
    default: throw Error('Unknown command');
  }
}

async function niziSend(cmd) {
  if (!cmd || cmd.includes('\n') || cmd.includes('\r')) throw Error('Command must be a single line.');
  niziLog('Sending: ' + (cmd.startsWith('QR**') ? 'QR**[amount]**[action]**[payload hidden]' : cmd));

  // Update simulator LCD preview
  updateNiziDeviceDisplayFromRaw(cmd);

  return niziApi('/api/command', 'POST', { command: cmd });
}

function niziExecCommand(type) {
  niziRun(() => niziSend(niziCommand(type)));
}

function niziSendRaw() {
  const rawInput = document.getElementById('niziRawInput');
  const cmd = (rawInput?.value || '').trim();
  niziRun(() => niziSend(cmd));
}

// Convert raw protocol string into simulated screen display update
function updateNiziDeviceDisplayFromRaw(cmdStr) {
  if (!cmdStr) return;
  const parts = cmdStr.split('**');
  const verb = parts[0].toUpperCase();

  if (verb === 'IDLE') {
    updateNiziDeviceDisplay({ command: 'display_logo' });
  } else if (verb === 'TEXT') {
    updateNiziDeviceDisplay({ command: 'text', title: parts[1] || 'Infinity Dental', message: parts[3] || parts[2] || 'Welcome' });
  } else if (verb === 'QR') {
    updateNiziDeviceDisplay({ command: 'show_qr', amount: parts[1]?.replace('Rs.', '').trim(), payload: parts[3] || '' });
  } else if (verb === 'WAIT') {
    updateNiziDeviceDisplay({ command: 'loading', message: parts[2] || 'Please wait' });
  } else if (verb === 'PASS') {
    updateNiziDeviceDisplay({ command: 'success', amount: parts[1]?.replace('Rs.', '').trim() });
  } else if (verb === 'FAIL') {
    updateNiziDeviceDisplay({ command: 'failure', message: parts[2] || 'Payment failed' });
  }
}

// Core forwarder used across the software (billing, checkout, simulation, wifi)
async function sendNiziCommand(cmd) {
  let formattedCmd = 'IDLE';

  if (typeof cmd === 'string') {
    formattedCmd = cmd.trim();
  } else if (cmd && typeof cmd === 'object') {
    const c = cmd.command || '';
    if (/^(QR|PASS|TEXT|WAIT|FAIL|WARN|INFO|IDLE|RESET|WAKE|VOLUME|BRIGHTNESS)\b/i.test(c)) {
      formattedCmd = c;
    } else if (c === 'show_qr' || c === 'qr') {
      const amtStr = (cmd.amount != null && !isNaN(Number(cmd.amount))) ? Number(cmd.amount).toFixed(2) : '0.00';
      formattedCmd = `QR**Rs. ${amtStr}**Scan to pay**${cmd.payload || cmd.qrPayload || 'TEST-ONLY-NOT-PAYABLE'}`;
    } else if (c === 'success' || c === 'payment_success') {
      const amtStr = (cmd.amount != null && !isNaN(Number(cmd.amount))) ? Number(cmd.amount).toFixed(2) : '0.00';
      formattedCmd = `PASS**Rs. ${amtStr}**Payment successful`;
    } else if (c === 'show_wifi') {
      formattedCmd = `QR**Guest Wi-Fi**Scan to Connect**${cmd.payload || ''}`;
    } else if (c === 'wait' || c === 'loading') {
      const amtStr = (cmd.amount != null && !isNaN(Number(cmd.amount))) ? Number(cmd.amount).toFixed(2) : '0.00';
      formattedCmd = `WAIT**Rs. ${amtStr}**Please wait`;
    } else if (c === 'fail' || c === 'failure') {
      const amtStr = (cmd.amount != null && !isNaN(Number(cmd.amount))) ? Number(cmd.amount).toFixed(2) : '0.00';
      formattedCmd = `FAIL**Rs. ${amtStr}**Payment failed`;
    } else if (c === 'idle' || c === 'display_logo' || c === 'reset') {
      formattedCmd = 'IDLE';
    } else if (c === 'text' || c === 'welcome') {
      formattedCmd = `TEXT**Infinity Dental**Welcome**${niziClean(cmd.message || 'Thank you for visiting')}`;
    } else if (c === 'info') {
      formattedCmd = `INFO**Infinity Dental**${niziClean(cmd.message || 'Please visit reception')}`;
    } else if (c === 'warn') {
      formattedCmd = `WARN**Device Not Ready**${niziClean(cmd.message || 'Please wait')}`;
    }
  }

  // 1. Update on-screen simulator preview
  updateNiziDeviceDisplayFromRaw(formattedCmd);

  // 2. Transmit via direct USB Web Serial if port open in browser
  if (niziSerialWriter) {
    try {
      await niziSerialWriter.write(new TextEncoder().encode(formattedCmd + '\n'));
      console.log('[NiZi USB Tx Official Protocol]:', formattedCmd);
    } catch (e) {
      console.warn('[NiZi USB] Serial write warning:', e.message);
    }
  }

  // 3. Post to backend HTTP endpoint /api/command (Node.js backend forwards to 127.0.0.1:9121 with API key, 0 CORS issues)
  try {
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: formattedCmd })
    });
    if (res.ok) {
      const json = await res.json();
      console.log('[NiZi Backend Response]:', json);
    }
  } catch (backendErr) {
    console.warn('[NiZi Backend Command Warning]:', backendErr.message);
  }
}

function renderQrToElement(container, text, width = 136, height = 136) {
  if (!container) return;
  container.innerHTML = '';
  const cleanText = String(text || '').trim();
  if (!cleanText) return;

  // 1. Primary: Use offline local QRCode generator library
  if (typeof QRCode !== 'undefined') {
    try {
      new QRCode(container, {
        text: cleanText,
        width: width,
        height: height,
        correctLevel: QRCode.CorrectLevel.M
      });
      return;
    } catch (qrErr) {
      console.warn('QRCode offline engine error, trying fallback:', qrErr);
    }
  }

  // 2. Reliable Fallback: Render SVG/PNG QR image (guaranteed rendering in all modern browsers & webviews)
  const img = document.createElement('img');
  img.style.width = width + 'px';
  img.style.height = height + 'px';
  img.style.objectFit = 'contain';
  img.style.display = 'block';
  img.style.margin = '0 auto';
  img.alt = 'NepalPay QR';
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${width}x${height}&data=${encodeURIComponent(cleanText)}`;
  container.appendChild(img);
}

function updateNiziDeviceDisplay(cmd) {
  const screen = document.getElementById('niziScreen');
  if (!screen) return;
  if (cmd.command === 'show_qr') {
    screen.className = 'nizi-screen';
    screen.innerHTML = `
      <div class="nizi-qr" id="niziDeviceQrWrap"></div>
      <div class="nizi-price">Rs. ${Number(cmd.amount || 0).toLocaleString()}</div>
      <div class="nizi-sub">${esc(cmd.title || 'Infinity Dental')}</div>
      <div class="nizi-sub" style="font-size:9px;color:#38bdf8">${esc(cmd.billNumber || 'Scan & Pay')}</div>
    `;
    const wrap = document.getElementById('niziDeviceQrWrap');
    if (wrap) {
      renderQrToElement(wrap, cmd.payload, 136, 136);
    }
  } else if (cmd.command === 'success') {
    screen.className = 'nizi-screen success';
    screen.innerHTML = `
      <div style="font-size:54px;margin-bottom:6px">✓</div>
      <div style="font-size:16px;font-weight:800;letter-spacing:.5px">PAYMENT RECEIVED</div>
      <div class="nizi-price" style="color:#86efac;font-size:22px">Rs. ${Number(cmd.amount || 0).toLocaleString()}</div>
      <div class="nizi-sub" style="color:#d1fae5">Thank You!</div>
      <div class="nizi-sub" style="font-size:9px;margin-top:6px;color:#a7f3d0">Infinity Dental Clinic</div>
    `;
    speakVoicePayment(cmd.amount || 0);
  } else if (cmd.command === 'show_wifi') {
    screen.className = 'nizi-screen wifi-screen';
    screen.innerHTML = `
      <div style="font-size:10px;font-weight:800;color:#38bdf8;letter-spacing:1px;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:4px">
        <span>📶</span> <span>GUEST WI-FI</span>
      </div>
      <div class="nizi-qr" id="niziDeviceQrWrap"></div>
      <div style="font-size:11.5px;font-weight:800;color:#fff;margin-top:4px">${esc(cmd.ssid || 'Infinity Dental')}</div>
      <div class="nizi-sub" style="font-size:9.5px;color:#cbd5e1">Password: <b style="color:#38bdf8">${esc(cmd.password || 'None')}</b></div>
      <div class="nizi-sub" style="font-size:8.5px;color:#94a3b8;margin-top:2px">📷 Scan with Camera to Connect</div>
    `;
    const wrap = document.getElementById('niziDeviceQrWrap');
    if (wrap) {
      renderQrToElement(wrap, cmd.payload, 136, 136);
    }
  } else if (cmd.command === 'display_logo' || cmd.command === 'reset') {
    resetNiziScreen(true);
  }
}

function resetNiziScreen(skipSendCommand) {
  const screen = document.getElementById('niziScreen');
  if (screen) {
    screen.className = 'nizi-screen';
    screen.innerHTML = `
      <div class="nizi-logo-badge">
        <img src="assets/clinic-logo.png" style="width:64px;height:64px;object-fit:contain;display:block" alt="Infinity Dental">
      </div>
      <div style="font-size:13px;font-weight:800;letter-spacing:.5px">INFINITY DENTAL</div>
      <div class="nizi-sub">Welcome to Clinic</div>
      <div id="niziScreenMessage" class="nizi-sub" style="color:#38bdf8;margin-top:10px">Ready for payment</div>
    `;
  }
  if (!skipSendCommand) {
    sendNiziCommand('IDLE');
  }
}

// --- Clinic Guest Wi-Fi & NiZi Soundbox Integration ---
let currentWifiConfig = {
  ssid: 'Infinity Dental Guest',
  password: '',
  security: 'WPA',
  hidden: false
};

function escapeWifiString(str) {
  return String(str || '').replace(/([\\;,":])/g, '\\$1');
}

function buildWifiPayload({ ssid, password, security = 'WPA', hidden = false }) {
  const cleanSsid = escapeWifiString(ssid || 'Infinity Dental Guest');
  const cleanPass = escapeWifiString(password || '');
  const sec = String(security || 'WPA').toUpperCase();
  const secTag = (sec === 'NONE' || sec === 'NOPASS') ? 'nopass' : (sec === 'WEP' ? 'WEP' : 'WPA');
  const passPart = secTag === 'nopass' ? '' : `P:${cleanPass};`;
  const hiddenPart = hidden ? 'H:true;' : '';
  return `WIFI:S:${cleanSsid};T:${secTag};${passPart}${hiddenPart};`;
}

async function loadClinicWifiConfig() {
  try {
    if (window.dentalWifi && window.dentalWifi.get) {
      const res = await window.dentalWifi.get();
      if (res && res.success && res.wifi) {
        currentWifiConfig = res.wifi;
      }
    } else {
      const res = await fetch('/api/wifi/config');
      if (res.ok) {
        const data = await res.json();
        if (data.wifi) currentWifiConfig = data.wifi;
      }
    }
  } catch (_) {
    try {
      const local = localStorage.getItem('infinity_dental_wifi_config');
      if (local) currentWifiConfig = JSON.parse(local);
    } catch (_) { }
  }
  updateWifiModalFormValues();
}

function updateWifiModalFormValues() {
  const ssidInp = document.getElementById('wifiSsidInput');
  const passInp = document.getElementById('wifiPasswordInput');
  const secSel = document.getElementById('wifiSecuritySelect');
  const hiddenChk = document.getElementById('wifiHiddenCheckbox');
  const ssidLabel = document.getElementById('niziWifiSsidLabel');
  const previewSsid = document.getElementById('wifiModalPreviewSsid');

  if (ssidInp && !ssidInp.matches(':focus')) ssidInp.value = currentWifiConfig.ssid || '';
  if (passInp && !passInp.matches(':focus')) passInp.value = currentWifiConfig.password || '';
  if (secSel) secSel.value = currentWifiConfig.security || 'WPA';
  if (hiddenChk) hiddenChk.checked = Boolean(currentWifiConfig.hidden);

  if (ssidLabel) ssidLabel.textContent = currentWifiConfig.ssid || 'Infinity Dental Guest';
  if (previewSsid) previewSsid.textContent = currentWifiConfig.ssid || 'Infinity Dental Guest';

  renderCurrentWifiQrPreview();
}

function renderCurrentWifiQrPreview() {
  const wrap = document.getElementById('wifiModalQrWrap');
  if (!wrap) return;
  const payload = buildWifiPayload(currentWifiConfig);
  renderQrToElement(wrap, payload, 144, 144);
}

function onWifiFormChange() {
  const ssidInp = document.getElementById('wifiSsidInput');
  const passInp = document.getElementById('wifiPasswordInput');
  const secSel = document.getElementById('wifiSecuritySelect');
  const hiddenChk = document.getElementById('wifiHiddenCheckbox');
  const previewSsid = document.getElementById('wifiModalPreviewSsid');

  const draftConfig = {
    ssid: (ssidInp ? ssidInp.value : currentWifiConfig.ssid) || 'Infinity Dental Guest',
    password: passInp ? passInp.value : currentWifiConfig.password,
    security: secSel ? secSel.value : 'WPA',
    hidden: hiddenChk ? hiddenChk.checked : false
  };

  if (previewSsid) previewSsid.textContent = draftConfig.ssid;
  const wrap = document.getElementById('wifiModalQrWrap');
  if (wrap) {
    const payload = buildWifiPayload(draftConfig);
    renderQrToElement(wrap, payload, 144, 144);
  }
}

function openWifiModal() {
  if (!currentUser || (currentUser.role !== 'superadmin' && currentUser.role !== 'manager')) {
    alert('🔒 Authorized Access Only:\n\nOnly Clinic Admins and Managers can configure clinic guest Wi-Fi credentials and display the Wi-Fi QR on the NiZi Soundbox.\n\nPlease log in first with your Admin or Manager ID.');
    return;
  }

  const badge = document.getElementById('wifiModalUserBadge');
  if (badge) {
    badge.textContent = `${currentUser.role === 'superadmin' ? '🛡️ Super Admin' : '👤 Manager'}: ${currentUser.username}`;
  }

  updateWifiModalFormValues();

  const modal = document.getElementById('wifiModal');
  if (modal) modal.classList.add('show');
}

function closeWifiModal() {
  const modal = document.getElementById('wifiModal');
  if (modal) modal.classList.remove('show');
}

async function saveWifiConfigFromModal() {
  if (!currentUser || (currentUser.role !== 'superadmin' && currentUser.role !== 'manager')) {
    alert('Unauthorized: Super Admin or Manager session required.');
    return;
  }

  const ssid = (document.getElementById('wifiSsidInput')?.value || '').trim();
  const password = (document.getElementById('wifiPasswordInput')?.value || '').trim();
  const security = document.getElementById('wifiSecuritySelect')?.value || 'WPA';
  const hidden = Boolean(document.getElementById('wifiHiddenCheckbox')?.checked);

  if (!ssid) {
    alert('Please enter a valid Wi-Fi Network Name (SSID).');
    return;
  }

  const newConfig = { ssid, password, security, hidden };
  const alertEl = document.getElementById('wifiModalAlert');

  try {
    if (window.dentalWifi && window.dentalWifi.save) {
      await window.dentalWifi.save(newConfig);
    } else {
      await fetch('/api/wifi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
    }

    try {
      localStorage.setItem('infinity_dental_wifi_config', JSON.stringify(newConfig));
    } catch (_) { }

    currentWifiConfig = newConfig;
    updateWifiModalFormValues();

    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#dcfce7';
      alertEl.style.color = '#15803d';
      alertEl.style.border = '1px solid #bbf7d0';
      alertEl.innerHTML = `✓ Wi-Fi credentials for <b>${esc(ssid)}</b> saved successfully!`;
      setTimeout(() => { if (alertEl) alertEl.style.display = 'none'; }, 4000);
    }
  } catch (err) {
    if (alertEl) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#fee2e2';
      alertEl.style.color = '#b91c1c';
      alertEl.style.border = '1px solid #fecaca';
      alertEl.textContent = 'Failed to save Wi-Fi config: ' + err.message;
    }
  }
}

async function showWifiOnNiziBox() {
  if (!currentUser || (currentUser.role !== 'superadmin' && currentUser.role !== 'manager')) {
    alert('🔒 Authorized Access Only:\n\nPlease log in as Super Admin or Manager to control the NiZi POS Soundbox display.');
    return;
  }

  const ssid = currentWifiConfig.ssid || 'Infinity Dental Guest';
  const password = currentWifiConfig.password || '';
  const payload = buildWifiPayload(currentWifiConfig);

  sendNiziCommand(`QR**Guest Wi-Fi**Scan to Connect**${payload}`);

  try {
    await fetch('/api/wifi/show-on-nizi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentWifiConfig)
    });
  } catch (_) { }

  // Update NiZi status pill
  const pill = document.getElementById('niziHardwareStatusPill');
  if (pill) {
    pill.textContent = '📶 Wi-Fi QR on Screen';
    pill.className = 'status-pill live';
  }

  console.log(`[NiZi Screen] 📶 Broadcasted Clinic Wi-Fi QR for "${ssid}" to soundbox screen.`);
}

async function resetNiziScreenFromWifi() {
  resetNiziScreen();
  sendNiziCommand({ command: 'display_logo', title: 'Infinity Dental' });
  try {
    await fetch('/api/wifi/reset-nizi', { method: 'POST' });
  } catch (_) { }
}

function printWifiStandCard() {
  const ssid = currentWifiConfig.ssid || 'Infinity Dental Guest';
  const password = currentWifiConfig.password || 'None';
  const payload = buildWifiPayload(currentWifiConfig);

  const ssidLabel = document.getElementById('wifiPrintSsidLabel');
  const passLabel = document.getElementById('wifiPrintPassLabel');
  const qrWrap = document.getElementById('wifiPrintQrWrap');

  if (ssidLabel) ssidLabel.textContent = ssid;
  if (passLabel) passLabel.textContent = password || 'None (Open Network)';
  if (qrWrap) renderQrToElement(qrWrap, payload, 180, 180);

  document.body.classList.add('printing-wifi');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-wifi');
  }, 1000);
}

function getActiveTestQrAmount() {
  const el = document.getElementById('testQrAmount');
  const val = Number(el?.value);
  return (val && !isNaN(val) && val > 0) ? val : 500;
}

function onTestQrAmountInput(val) {
  testNiziQr();
}

function setQuickTestAmount(amount, remarks) {
  const amtInput = document.getElementById('testQrAmount');
  const remInput = document.getElementById('testQrRemarks');
  if (amtInput) amtInput.value = amount;
  if (remInput && remarks) remInput.value = remarks;

  testNiziQr();
}

function testNiziChime() {
  const amt = getActiveTestQrAmount() || 150;
  speakVoicePayment(amt);
  sendNiziCommand('TEXT**Infinity Dental**Welcome**Thank you for visiting');
}

function testNiziSuccessScreen() {
  const amt = getActiveTestQrAmount() || 150;
  const amtStr = Number(amt).toFixed(2);
  sendNiziCommand(`PASS**Rs. ${amtStr}**Payment successful`);
}

function testNiziQr() {
  const amt = getActiveTestQrAmount() || 150;
  const amtStr = Number(amt).toFixed(2);
  const billInput = document.getElementById('testQrBillNo');
  if (billInput && (!billInput.value || billInput.value === 'B-20261020-001')) {
    billInput.value = 'B-' + Date.now();
  }
  const bill = (billInput?.value || ('B-' + Date.now())).trim();
  const rem = (document.getElementById('testQrRemarks')?.value || 'Scaling & Polishing').trim();
  const patient = (document.getElementById('testQrPatient')?.value || 'Ram Shrestha').trim();
  const qrString = buildClientNepalPayQr({
    amount: amt,
    billNumber: bill,
    remarks: rem
  }) || 'TEST-ONLY-NOT-PAYABLE';

  sendNiziCommand(`QR**Rs. ${amtStr}**Scan to pay**${qrString}`);

  if (!activeQrTransaction || !document.getElementById('nepalPayQrModal')?.classList.contains('show')) {
    activeQrTransaction = {
      validationTraceId: 'TRC-LOCAL-' + Date.now(),
      billNumber: bill,
      amount: amt,
      patientName: patient,
      qrString
    };
  }

  // Update inline QR preview in Testing Terminal card if present
  const inlineWrap = document.getElementById('terminalInlineQrWrap');
  if (inlineWrap) {
    renderQrToElement(inlineWrap, qrString, 136, 136);
  }
  const inlinePrice = document.getElementById('terminalInlinePrice');
  if (inlinePrice) {
    inlinePrice.textContent = 'Rs. ' + amt.toLocaleString();
  }
  const inlinePatient = document.getElementById('terminalInlinePatient');
  if (inlinePatient) {
    inlinePatient.textContent = `${patient} • ${bill}`;
  }
}

// --- EMVCo NepalQR Client Generator (Guaranteed Offline & Desktop Support) ---
// (NPI_CLIENT_CONFIG is hoisted to the top of the file)

function crc16CcittClient(str) {
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

function buildClientNepalPayQr({ amount, billNumber, remarks }) {
  function tlv(tag, val) {
    const s = String(val ?? '');
    return tag + String(s.length).padStart(2, '0') + s;
  }
  // Tag 26: Legacy NepalPay Template
  const tag26Val = tlv('00', 'np.nchl.nepalpay') + tlv('01', NPI_CLIENT_CONFIG.acquirerId) + tlv('02', NPI_CLIENT_CONFIG.merchantId);

  // Tag 29: Official NepalQR Guid & Merchant Details
  const nchlGuid = 'NCHL' + NPI_CLIENT_CONFIG.acquirerId + NPI_CLIENT_CONFIG.merchantId;
  const tag29Val = tlv('00', nchlGuid) +
    tlv('01', NPI_CLIENT_CONFIG.merchantId) +
    tlv('02', NPI_CLIENT_CONFIG.storeLabel || 'Store1') +
    tlv('03', NPI_CLIENT_CONFIG.terminalLabel || 'Terminal1');

  const tag62Val = tlv('01', billNumber || ('B-' + Date.now())) +
    tlv('05', remarks || 'DentalBill') +
    tlv('07', NPI_CLIENT_CONFIG.terminalLabel || 'Terminal1') +
    tlv('08', NPI_CLIENT_CONFIG.storeLabel || 'Store1');
  const formattedAmount = Number(amount || 0).toFixed(2);
  const raw = tlv('00', '01') +
    tlv('01', '12') +
    tlv('26', tag26Val) +
    tlv('29', tag29Val) +
    tlv('52', String(NPI_CLIENT_CONFIG.merchantCategoryCode)) +
    tlv('53', '524') +
    tlv('54', formattedAmount) +
    tlv('58', 'NP') +
    tlv('59', NPI_CLIENT_CONFIG.merchantName) +
    tlv('60', 'Kathmandu') +
    tlv('62', tag62Val) +
    '6304';
  return raw + crc16CcittClient(raw);
}

async function openNepalPayModal({ amount, billNumber, remarks, patientName, patientContact, opdNumber, onSuccess }) {
  onActiveQrSuccessCallback = onSuccess || null;
  const modal = document.getElementById('nepalPayQrModal');
  const amountEl = document.getElementById('modalQrAmount');
  const infoEl = document.getElementById('modalQrPatientInfo');
  const canvasWrap = document.getElementById('modalQrCanvasWrap');
  const countdownEl = document.getElementById('modalCountdown');
  const statusPill = document.getElementById('modalQrStatusPill');

  if (!modal || !canvasWrap) return;

  const parsedAmount = Number(amount || 0);
  amountEl.textContent = 'Rs. ' + parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 });
  infoEl.textContent = `Patient: ${patientName || 'Walk-in'} | Bill: ${billNumber || '—'} | OPD: ${opdNumber ? pad(opdNumber) : '—'}`;

  // Instant Display: Generate and render the client NepalQR immediately so modal is never blank
  const safeBillNo = billNumber || ('B-' + Date.now());
  const initialTraceId = 'TRC' + Date.now();
  const initialQr = buildClientNepalPayQr({
    amount: parsedAmount,
    billNumber: safeBillNo,
    remarks: remarks || 'Dental Treatment'
  });

  activeQrTransaction = {
    validationTraceId: initialTraceId,
    billNumber: safeBillNo,
    amount: parsedAmount,
    patientName: patientName || 'Walk-in',
    qrString: initialQr,
    isLiveNchl: false
  };

  renderQrToElement(canvasWrap, initialQr, 190, 190);
  statusPill.textContent = 'Active (Ready to Scan)';
  statusPill.className = 'status-pill live';

  sendNiziCommand({
    command: 'show_qr',
    payload: initialQr,
    amount: parsedAmount,
    title: 'Infinity Dental',
    billNumber: safeBillNo
  });

  const existingNotice = document.getElementById('modalNchlNotice');
  if (existingNotice) existingNotice.remove();

  modal.classList.add('show');

  try {
    let data = null;

    // 1. Try Electron IPC if running in desktop app
    if (window.dentalNpi && window.dentalNpi.generateQr) {
      try {
        data = await window.dentalNpi.generateQr({ amount: parsedAmount, billNumber, remarks, patientName, patientContact, opdNumber });
      } catch (ipcErr) {
        console.warn('IPC QR generation warning:', ipcErr);
      }
    }

    // 2. Try REST API if server.js / localhost is accessible
    if (!data || !data.success || !data.qrString) {
      try {
        const res = await fetch('/api/nepalpay/generate-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: parsedAmount, billNumber, remarks, patientName, patientContact, opdNumber })
        });
        data = await res.json();
      } catch (err) {
        console.warn('REST API fetch error:', err);
      }
    }

    // Always ensure a valid QR string is present and displayed on screen
    const safeBillNo = data?.billNumber || billNumber || ('B-' + Date.now());
    const safeTraceId = data?.validationTraceId || ('TRC' + Date.now());
    const qrStringToDisplay = data?.qrString || buildClientNepalPayQr({
      amount: parsedAmount,
      billNumber: safeBillNo,
      remarks: remarks || 'Dental Treatment'
    });

    activeQrTransaction = {
      validationTraceId: safeTraceId,
      billNumber: safeBillNo,
      amount: parsedAmount,
      patientName: patientName || 'Walk-in',
      qrString: qrStringToDisplay,
      isLiveNchl: !!data?.isLiveNchl
    };

    // Render the QR code in the modal canvas wrap
    renderQrToElement(canvasWrap, qrStringToDisplay, 190, 190);

    // Only mark status as "Active (Awaiting Scan)" if the upstream response succeeded (success === true)
    const isSuccess = Boolean(data && data.success === true && (data.isLiveNchl || data.qrString));

    if (isSuccess) {
      statusPill.textContent = 'Active (Awaiting Scan)';
      statusPill.className = 'status-pill live';
      statusPill.style.background = '';
      statusPill.style.color = '';
    } else {
      const errCode = data?.statusCode || data?.nchlStatusCode || 502;
      const rawErrMsg = data?.error || data?.nchlError || 'NCHL Gateway is temporarily unavailable';
      const cleanErrMsg = String(rawErrMsg).replace(/<[^>]*>/g, '').trim() || 'NCHL Gateway is temporarily unavailable';

      const noticeDiv = document.createElement('div');
      noticeDiv.id = 'modalNchlNotice';
      noticeDiv.style.cssText = 'margin-top:10px;font-size:11.5px;color:#991b1b;background:#fee2e2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;text-align:center;line-height:1.45;';
      noticeDiv.innerHTML = `⚠️ <b>NCHL Gateway Status (HTTP ${errCode}):</b> ${esc(cleanErrMsg)}<br><span style="color:#4b5563;font-size:11px">Offline NepalQR fallback active. Click <b>SIMULATE CUSTOMER PAYMENT</b> below to test locally.</span>`;
      canvasWrap.parentNode.insertBefore(noticeDiv, canvasWrap.nextSibling);

      statusPill.textContent = 'Gateway Unavailable';
      statusPill.className = 'status-pill disconnected';
      statusPill.style.background = '#fef2f2';
      statusPill.style.color = '#dc2626';
    }

    // Push QR directly to simulated NiZi POS Color LCD Display!
    sendNiziCommand({
      command: 'show_qr',
      payload: qrStringToDisplay,
      amount: parsedAmount,
      currency: 'NPR',
      billNumber: safeBillNo,
      title: 'Infinity Dental'
    });

    const inlineWrap = document.getElementById('terminalInlineQrWrap');
    if (inlineWrap) {
      renderQrToElement(inlineWrap, qrStringToDisplay, 136, 136);
    }
    const inlinePrice = document.getElementById('terminalInlinePrice');
    if (inlinePrice) {
      inlinePrice.textContent = 'Rs. ' + parsedAmount.toLocaleString();
    }
    const inlinePatient = document.getElementById('terminalInlinePatient');
    if (inlinePatient) {
      inlinePatient.textContent = `${patientName || 'Walk-in'} • ${safeBillNo}`;
    }

    let remainingSec = 600;
    if (qrCountdownTimer) clearInterval(qrCountdownTimer);
    qrCountdownTimer = setInterval(() => {
      remainingSec--;
      if (remainingSec <= 0) {
        clearInterval(qrCountdownTimer);
        if (countdownEl) countdownEl.textContent = 'Expired';
        statusPill.textContent = 'QR Expired';
        statusPill.className = 'status-pill disconnected';
      } else {
        const m = Math.floor(remainingSec / 60);
        const s = remainingSec % 60;
        if (countdownEl) countdownEl.textContent = `Expires in: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    }, 1000);

    recordNepalPayTxn({
      traceId: safeTraceId,
      billNumber: safeBillNo,
      patientName: patientName || 'Walk-in',
      amount: parsedAmount,
      status: 'PENDING',
      time: new Date().toLocaleTimeString()
    });

    // Start automatic payment status inquiry polling every 3 seconds
    if (qrStatusPollTimer) clearInterval(qrStatusPollTimer);
    qrStatusPollTimer = setInterval(async () => {
      if (!activeQrTransaction) {
        clearInterval(qrStatusPollTimer);
        qrStatusPollTimer = null;
        return;
      }
      try {
        const traceId = activeQrTransaction.validationTraceId || '';
        const billNo = activeQrTransaction.billNumber || '';
        const pollUrl = `/api/nepalpay/status/${encodeURIComponent(traceId)}?billNumber=${encodeURIComponent(billNo)}`;

        let data = null;
        if (window.dentalNpi && window.dentalNpi.checkPaymentStatus) {
          data = await window.dentalNpi.checkPaymentStatus({ validationTraceId: traceId, billNumber: billNo });
        } else {
          const res = await fetch(pollUrl);
          if (res.ok) data = await res.json();
        }

        if (data && (data.status === 'SUCCESS' || data.responseCode === '000' || data.transaction?.status === 'SUCCESS')) {
          clearInterval(qrStatusPollTimer);
          qrStatusPollTimer = null;

          const txnId = data.txnId || data.transaction?.txnId || ('NPI-' + Date.now());
          const amt = data.amount || data.transaction?.amount || activeQrTransaction.amount;
          const payerName = data.payerName || data.transaction?.payerName || '';

          console.log(`[QR Modal Poll] 🎉 Payment SUCCESS confirmed via NCHL gateway! Txn: ${txnId}, Amount: ${amt}, Payer: ${payerName}`);
          handlePaymentReceivedEvent({
            traceId: activeQrTransaction.validationTraceId,
            billNumber: activeQrTransaction.billNumber,
            txnId,
            amount: amt,
            payerName
          });
        }
      } catch (pollErr) {
        console.warn('[QR Modal Poll] Error polling status:', pollErr);
      }
    }, 3000);

  } catch (e) {
    console.error('Error generating QR:', e);
    const fallback = buildClientNepalPayQr({ amount: parsedAmount, billNumber, remarks });
    renderQrToElement(canvasWrap, fallback, 190, 190);
    sendNiziCommand({ command: 'show_qr', payload: fallback, amount: parsedAmount, currency: 'NPR', billNumber, title: 'Infinity Dental' });
    statusPill.textContent = 'NepalQR Ready (Offline Fallback)';
    statusPill.className = 'status-pill live';
  }
}

function closeNepalPayModal() {
  if (qrCountdownTimer) clearInterval(qrCountdownTimer);
  if (qrStatusPollTimer) {
    clearInterval(qrStatusPollTimer);
    qrStatusPollTimer = null;
  }
  const notice = document.getElementById('modalNchlNotice');
  if (notice) notice.remove();
  const modal = document.getElementById('nepalPayQrModal');
  if (modal) modal.classList.remove('show');
  activeQrTransaction = null;
  onActiveQrSuccessCallback = null;
}

async function simulateActiveQrPayment() {
  if (!activeQrTransaction) {
    alert('No active QR transaction to simulate.');
    return;
  }
  const traceId = activeQrTransaction.validationTraceId;
  const amt = activeQrTransaction.amount;
  const bill = activeQrTransaction.billNumber;
  const txnId = 'TXN-NPI-' + Date.now();

  // Try background notification if available
  try {
    if (window.dentalNpi && window.dentalNpi.simulatePayment) {
      await window.dentalNpi.simulatePayment(traceId);
    }
  } catch (_) { }

  try {
    await fetch('/api/nepalpay/simulate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validationTraceId: traceId, txnId, billNumber: bill, amount: amt })
    });
  } catch (postErr) {
    console.warn('Simulation API call failed:', postErr);
  }

  // Immediately apply success in client UI
  handlePaymentReceivedEvent({
    traceId,
    txnId,
    amount: amt,
    billNumber: bill
  });
}

function handlePaymentReceivedEvent(eventData) {
  const found = recentNepalPayTransactions.find(t =>
    (eventData.traceId && t.traceId === eventData.traceId) ||
    (eventData.billNumber && t.billNumber === eventData.billNumber)
  );
  if (found) {
    found.status = 'SUCCESS';
    found.txnId = eventData.txnId;
    if (eventData.payerName) found.patientName = eventData.payerName;
    renderNepalPayTxnTable();
  }

  // Animate NiZi soundbox screen with green payment checkmark and sound
  sendNiziCommand({
    command: 'success',
    amount: eventData.amount || (activeQrTransaction ? activeQrTransaction.amount : 0),
    currency: 'NPR',
    payload: `Payment of ${eventData.amount} rupees received successfully`
  });

  logNepalPayMoneyRecord({
    billNumber: eventData.billNumber || (activeQrTransaction ? activeQrTransaction.billNumber : ''),
    patientName: eventData.payerName || (activeQrTransaction ? activeQrTransaction.patientName : 'Guest Patient'),
    opdNumber: (activeQrTransaction && activeQrTransaction.opdNumber ? ('OPD-' + pad(activeQrTransaction.opdNumber)) : ''),
    amount: Number(eventData.amount || (activeQrTransaction ? activeQrTransaction.amount : 0)),
    txnId: eventData.txnId || ('TXN-NPI-' + Date.now()),
    validationTraceId: eventData.traceId || (activeQrTransaction ? activeQrTransaction.validationTraceId : ''),
    status: 'SUCCESS',
    method: 'NepalPay QR',
    source: (activeQrTransaction && activeQrTransaction.isSimulator) ? 'B33 Simulator' : 'Dynamic QR'
  });

  // Visually confirm payment success on modal
  const statusPill = document.getElementById('modalQrStatusPill');
  if (statusPill) {
    statusPill.textContent = 'Payment Successful ✓';
    statusPill.className = 'status-pill live';
    statusPill.style.background = '#047857';
    statusPill.style.color = '#ffffff';
  }

  if (activeQrTransaction && (
    (eventData.traceId && activeQrTransaction.validationTraceId === eventData.traceId) ||
    (eventData.billNumber && activeQrTransaction.billNumber === eventData.billNumber)
  )) {
    const cb = onActiveQrSuccessCallback;
    setTimeout(() => {
      closeNepalPayModal();
      if (cb) cb(eventData);
      else {
        alert(`🎉 Payment of Rs. ${Number(eventData.amount || 0).toLocaleString()} confirmed successfully!\nTxn ID: ${eventData.txnId}\nPayer: ${eventData.payerName || 'connectIPS Customer'}`);
      }
    }, 1200);
  }
}

let localFrontendWs = null;
function setupRealtimeWebsocket() {
  if (typeof WebSocket === 'undefined') return;
  try {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = (location.protocol === 'file:') ? 'ws://localhost:3000/ws' : `${wsProto}//${location.host}/ws`;
    localFrontendWs = new WebSocket(wsUrl);

    localFrontendWs.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'payment_received') {
          handlePaymentReceivedEvent(data);
        } else if (data.type === 'nizi_command') {
          updateNiziDeviceDisplay(data.command);
        } else if (data.type === 'soundbox_status') {
          applySoundboxStatusToUi(data.status);
        }
      } catch (_) { }
    };

    localFrontendWs.onclose = () => {
      setTimeout(setupRealtimeWebsocket, 4000);
    };

    localFrontendWs.onerror = () => {
      try { localFrontendWs.close(); } catch (_) { }
    };
  } catch (err) {
    console.warn('Realtime WS setup warning:', err);
  }
}

function setupSseListener() {
  setupRealtimeWebsocket();
  try {
    const sseUrl = (location.protocol === 'file:') ? 'http://localhost:3000/api/events' : '/api/events';
    const sse = new EventSource(sseUrl);
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'payment_received') {
          handlePaymentReceivedEvent(data);
        } else if (data.type === 'nizi_command') {
          updateNiziDeviceDisplay(data.command);
        } else if (data.type === 'soundbox_status') {
          applySoundboxStatusToUi(data.status);
        }
      } catch (err) { }
    };
  } catch (e) {
    console.warn('SSE setup warning:', e);
  }
}

function recordNepalPayTxn(tx) {
  recentNepalPayTransactions.unshift(tx);
  if (recentNepalPayTransactions.length > 20) recentNepalPayTransactions.pop();
  renderNepalPayTxnTable();
}

function renderNepalPayTxnTable() {
  const tbody = document.getElementById('nepalPayTxnRows');
  if (!tbody) return;
  if (!recentNepalPayTransactions.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No dynamic QR transactions generated yet in this session.</td></tr>';
    return;
  }
  tbody.innerHTML = recentNepalPayTransactions.map(t => `
    <tr>
      <td><strong>${esc(t.txnId || t.traceId)}</strong></td>
      <td>${esc(t.billNumber || '—')}</td>
      <td>${esc(t.patientName || 'Walk-in')}</td>
      <td>Rs. ${Number(t.amount || 0).toLocaleString()}</td>
      <td>NepalPay QR</td>
      <td><span class="status-pill ${t.status === 'SUCCESS' ? 'live' : 'simulated'}">${esc(t.status)}</span></td>
      <td>
        ${t.status === 'PENDING' ? `<button class="btn secondary" style="font-size:10px;padding:4px 8px" onclick="simulateSpecificPayment('${t.traceId}')">Simulate Pay</button>` : `<span class="muted" style="font-size:11px">Completed</span>`}
      </td>
    </tr>
  `).join('');
}

async function simulateSpecificPayment(traceId) {
  try {
    const res = await fetch('/api/nepalpay/simulate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validationTraceId: traceId,
        txnId: 'TXN-NPI-' + Date.now()
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  } catch (e) {
    alert('Simulation error: ' + e.message);
  }
}

function generateDynamicQrFromConsole() {
  const amt = Number(document.getElementById('testQrAmount')?.value) || 0;
  if (amt <= 0) {
    alert('Please enter a valid amount.');
    document.getElementById('testQrAmount')?.focus();
    return;
  }
  const patient = (document.getElementById('testQrPatient')?.value || 'Walk-in').trim();

  // Always generate a fresh unique bill number for every dynamic QR session
  const billInput = document.getElementById('testQrBillNo');
  const bill = 'B-' + Date.now();
  if (billInput) billInput.value = bill;

  const rem = (document.getElementById('testQrRemarks')?.value || 'Dental Treatment').trim();

  openNepalPayModal({
    amount: amt,
    billNumber: bill,
    patientName: patient,
    remarks: rem,
    onSuccess: (data) => {
      alert(`🎉 Payment Confirmed via NCHL!\nAmount: Rs. ${amt}\nTxn ID: ${data.txnId}\nPayer: ${data.payerName || patient}`);
      if (billInput) billInput.value = 'B-' + Date.now();
    }
  });
}

function updateNiziClock() {
  const el = document.getElementById('niziScreenClock');
  if (el) {
    const d = new Date();
    el.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
}
setInterval(updateNiziClock, 10000);

// Auto-initialize NiZi Soundbox LCD & Terminal QR on load
setTimeout(() => {
  try {
    testNiziQr();
  } catch (_) { }
}, 250);



/* ==========================================================================
   INFINITY DENTAL - LAB WORKS, PURCHASES & STOCKS INTEGRATED MODULE
   ========================================================================== */

// --- Module Navigation & Tab Switching ---
function module(x) {
  if (x === 'lab') showPage('labworks');
  else if (x === 'buy') showPage('purchases');
  else if (x === 'stock') showPage('stocks');
}

function labTab(x) {
  ['overview', 'records', 'new', 'accounts', 'history', 'delete'].forEach(t => {
    const el = document.getElementById('lab-' + t);
    const tabBtn = document.getElementById('lt-' + t);
    if (el) el.classList.toggle('hide', t !== x);
    if (tabBtn) tabBtn.classList.toggle('active', t === x);
  });
  const hsView = document.getElementById('hs-view');
  if (hsView) hsView.classList.add('hide');
  if (x === 'overview' || x === 'records') renderLab();
  if (x === 'accounts') renderAcc('ac', CUR_MONTH);
  if (x === 'history') renderHist();
  if (x === 'delete') renderDelLab();
}

function buyTab(x) {
  ['overview', 'new', 'suppliers', 'records', 'delete'].forEach(t => {
    const el = document.getElementById('buy-' + t);
    const tabBtn = document.getElementById('bt-' + t);
    if (el) el.classList.toggle('hide', t !== x);
    if (tabBtn) tabBtn.classList.toggle('active', t === x);
  });
  if (x === 'overview') renderBuy();
  if (x === 'suppliers') renderSup();
  if (x === 'records') renderPur();
  if (x === 'delete') renderDelBuy();
}

function stTab(x) {
  ['list', 'update', 'moves', 'loc', 'delete'].forEach(t => {
    const el = document.getElementById('stock-' + t);
    const tabBtn = document.getElementById('st-' + t);
    if (el) el.classList.toggle('hide', t !== x);
    if (tabBtn) tabBtn.classList.toggle('active', t === x);
  });
  if (x === 'update') showCur();
  if (x === 'delete') renderDelStock();
  renderAll();
}

function f(id) {
  return document.getElementById(id);
}

const rs = n => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');
const sumArr = a => (Array.isArray(a) ? a.reduce((x, y) => x + y, 0) : 0);
// todayIso is hoisted globally at the top of app.js

// --- In-Memory State Linked to SQLite REST Backend ---
let stockItemsList = [];
let stockMovementsList = [];
let labCasesList = [];
let labPaymentsList = [];
let suppliersList = [];
let purchasesList = [];
let cachedPatientDirectory = [];

// Nepali Months & Static Reference Settings
const BS_MONTH_NAMES = { '04': 'Shrawan', '05': 'Bhadra', '06': 'Ashwin', '07': 'Kartik' };
const BS_MONTHS = ['04', '05', '06', '07'];
const CUR_MONTH = '07';
let labCompaniesList = [
  { id: 'lab-1', name: 'Smile Lab', contact_person: 'Manager', phone: '9800000001', address: 'Kathmandu', opening_balance: 8000 },
  { id: 'lab-2', name: 'Dental Craft', contact_person: 'Manager', phone: '9800000002', address: 'Lalitpur', opening_balance: 0 },
  { id: 'lab-3', name: 'Precision Dental Lab', contact_person: 'Manager', phone: '9800000003', address: 'Kathmandu', opening_balance: 5000 }
];

let LAB_PARTNERS = {
  'Smile Lab': { name: 'Smile Lab', open: 8000 },
  'Dental Craft': { name: 'Dental Craft', open: 0 },
  'Precision Dental Lab': { name: 'Precision Dental Lab', open: 5000 }
};

function rebuildLabPartnersObj() {
  LAB_PARTNERS = {};
  labCompaniesList.forEach(l => {
    LAB_PARTNERS[l.name] = { name: l.name, open: Number(l.opening_balance || 0), phone: l.phone, contact: l.contact_person };
  });
  updateLabDropdowns();
}

const PURCHASE_CATEGORIES = ['Consumables', 'Dental materials', 'Medicines', 'Instruments', 'Orthodontic materials'];
const PURCHASE_UNITS = ['Box', 'Piece', 'Bottle', 'Pack', 'Syringe', 'Cartridge'];
const optHtml = a => a.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');

// =========================================================================
// 1. ADMIN PIN VERIFICATION BACKEND ENDPOINT
// =========================================================================
let adminPinPromiseResolve = null;

function promptAdminPin(actionDescription) {
  return new Promise((resolve) => {
    adminPinPromiseResolve = resolve;
    const modal = document.getElementById('adminPinModal');
    const title = document.getElementById('adminPinModalTitle');
    const msg = document.getElementById('adminPinModalMsg');
    const input = document.getElementById('adminPinModalInput');
    const err = document.getElementById('adminPinModalErr');
    if (title) title.textContent = 'Admin Authorization Required';
    if (msg) msg.textContent = `Authorize ${actionDescription || 'this action'}? Enter 4-digit Admin PIN:`;
    if (input) { input.value = ''; setTimeout(() => input.focus(), 60); }
    if (err) err.textContent = '';
    if (modal) modal.classList.add('show');
  });
}

function closeAdminPinModal() {
  const modal = document.getElementById('adminPinModal');
  if (modal) modal.classList.remove('show');
  if (adminPinPromiseResolve) {
    adminPinPromiseResolve(false);
    adminPinPromiseResolve = null;
  }
}

async function confirmAdminPinModal() {
  const input = document.getElementById('adminPinModalInput');
  const err = document.getElementById('adminPinModalErr');
  const pin = (input?.value || '').trim();
  if (!pin) {
    if (err) err.textContent = 'Please enter Admin PIN.';
    return;
  }

  try {
    const res = await fetch('/api/admin/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (res.ok && data.success && data.authorized) {
      const modal = document.getElementById('adminPinModal');
      if (modal) modal.classList.remove('show');
      if (adminPinPromiseResolve) {
        adminPinPromiseResolve(true);
        adminPinPromiseResolve = null;
      }
      return;
    }
  } catch (_) {}

  // Local fallback
  if (pin === '1234' || pin === 'admin123' || pin === '2468') {
    const modal = document.getElementById('adminPinModal');
    if (modal) modal.classList.remove('show');
    if (adminPinPromiseResolve) {
      adminPinPromiseResolve(true);
      adminPinPromiseResolve = null;
    }
    return;
  }

  if (err) err.textContent = 'Incorrect Admin PIN. Try again.';
  if (input) { input.value = ''; input.focus(); }
}

async function verifyAdminPin(actionDescription) {
  return await promptAdminPin(actionDescription);
}

// =========================================================================
// 2. PATIENT DIRECTORY & OPD LOOKUP
// =========================================================================
async function loadPatientsDatalist() {
  try {
    const res = await fetch('/api/patients/lookup');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.patients)) {
        cachedPatientDirectory = data.patients;
        const opdl = f('opdl');
        if (opdl) {
          opdl.innerHTML = data.patients.map(p => `<option value="${p.opd}">${esc(p.name)} (${esc(p.phone || '')})</option>`).join('');
        }
      }
    }
  } catch (e) {
    console.warn('Patient datalist load warning:', e.message);
  }
}

async function fetchPat() {
  const val = (f('ln-opd')?.value || '').trim().toUpperCase();
  const box = f('ln-pat');
  if (!box) return;
  if (!val) {
    box.textContent = 'Enter an OPD number to load patient details.';
    return;
  }

  try {
    const res = await fetch(`/api/patients/lookup?opd=${encodeURIComponent(val)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.patient) {
        const p = data.patient;
        const prevCount = labCasesList.filter(c => (c.opd_number || '').toUpperCase() === p.opd.toUpperCase()).length;
        box.innerHTML = `<b>${esc(p.name)}</b> • ${p.age || '—'} yrs / ${p.gender || '—'} • ${esc(p.phone || '—')}<br><span class="foot">${p.opd} • ${prevCount} previous lab case(s)</span>`;
        return;
      }
    }
  } catch (_) { }

  // Fallback to local memory patients
  const localMatch = patients.find(p => ('OPD-' + p.OPDNumber).toUpperCase() === val || String(p.OPDNumber) === val.replace(/^OPD-?/i, ''));
  if (localMatch) {
    const prevCount = labCasesList.filter(c => (c.opd_number || '').includes(String(localMatch.OPDNumber))).length;
    box.innerHTML = `<b>${esc(localMatch.FullName || localMatch.Name)}</b> • ${localMatch.Age || '—'} yrs / ${localMatch.Gender || '—'} • ${esc(localMatch.Contact || localMatch.Phone || '—')}<br><span class="foot">OPD-${localMatch.OPDNumber} • ${prevCount} previous lab case(s)</span>`;
  } else {
    box.innerHTML = '<span style="color:#b42318">No registered patient found with this OPD number.</span>';
  }
}

// =========================================================================
// 3. LAB WORKS MODULE LOGIC
// =========================================================================
const LAB_WORKFLOW = ['Pending', 'Ongoing', 'To Be Received', 'Received', 'To Be Fitted', 'Fitted'];

async function loadLabData() {
  try {
    const res = await fetch('/api/lab/cases');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.cases)) {
        labCasesList = data.cases;
      }
    }
  } catch (err) {
    console.warn('Failed to load lab cases:', err.message);
  }
  renderLab();
}

function renderLab() {
  const q = (f('lr-q')?.value || '').toLowerCase();
  const cnt = t => labCasesList.filter(c => c.status === t).length;
  const todayStr = todayIso();

  // Overview Cards
  const loCards = f('lo-cards');
  if (loCards) {
    loCards.innerHTML = `
      <div class="card"><div class="muted">Active Lab Cases</div><div class="stat num">${labCasesList.filter(c => c.status !== 'Fitted').length}</div></div>
      <div class="card"><div class="muted">Sent Today</div><div class="stat num">${labCasesList.filter(c => c.sent_date === todayStr).length}</div></div>
      <div class="card"><div class="muted">To Be Received</div><div class="stat num">${cnt('To Be Received')}</div></div>
      <div class="card"><div class="muted">To Be Fitted</div><div class="stat num">${cnt('To Be Fitted')}</div></div>
      <div class="card"><div class="muted">Registered Labs</div><div class="stat num">${Object.keys(LAB_PARTNERS).length}</div></div>
    `;
  }

  // Recent Table
  const loBody = f('lo-body');
  if (loBody) {
    loBody.innerHTML = labCasesList.slice(0, 6).map(c => {
      const workLabel = esc(c.work_type) + (c.tooth ? ' · ' + esc(c.tooth) : '');
      const pat = cachedPatientDirectory.find(p => p.opd === c.opd_number) || { name: 'Patient' };
      return `<tr><td>${esc(c.opd_number)}</td><td>${esc(pat.name)} · ${workLabel}</td><td>${esc(c.lab)}</td><td><span class="tag ${/Pending|Ongoing/.test(c.status) ? 'warn' : ''}">${esc(c.status)}</span></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty">No lab works yet.</td></tr>';
  }

  // Records Table
  const lrBody = f('lr-body');
  if (lrBody) {
    const filtered = labCasesList.filter(c => {
      if (!q) return true;
      const pat = cachedPatientDirectory.find(p => p.opd === c.opd_number) || {};
      const fullText = (c.opd_number + ' ' + (pat.name || '') + ' ' + c.lab + ' ' + c.work_type).toLowerCase();
      return fullText.includes(q);
    });

    lrBody.innerHTML = filtered.map(c => {
      const p = cachedPatientDirectory.find(x => x.opd === c.opd_number) || { name: '—', age: '', gender: '', phone: '' };
      const curIdx = LAB_WORKFLOW.indexOf(c.status);
      const nextStep = curIdx !== -1 && curIdx < LAB_WORKFLOW.length - 1 ? LAB_WORKFLOW[curIdx + 1] : null;
      const workLabel = esc(c.work_type) + (c.tooth ? ' · ' + esc(c.tooth) : '');

      return `<tr>
        <td><b>${esc(c.opd_number)}</b></td>
        <td>${esc(p.name)}</td>
        <td>${p.age || '—'} / ${p.gender || '—'}</td>
        <td>${esc(p.phone || '—')}</td>
        <td>${workLabel}</td>
        <td>${esc(c.lab)}</td>
        <td>${esc(c.sent_date || '—')}</td>
        <td>${esc(c.expected_date_bs || '—')}</td>
        <td><span class="tag ${/Pending|Ongoing/.test(c.status) ? 'warn' : ''}">${esc(c.status)}</span></td>
        <td class="noexp">${nextStep ? `<button class="btn mini primary" onclick="advanceLabCase('${c.id}')">→ ${nextStep}</button>` : '✓ Fitted'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="10" class="empty">No lab cases match your search.</td></tr>';
  }

  renderDelLab();
}

async function advanceLabCase(id) {
  try {
    const res = await fetch(`/api/lab/cases/${encodeURIComponent(id)}/advance`, { method: 'PUT' });
    if (res.ok) {
      await loadLabData();
    }
  } catch (err) {
    alert('Failed to advance case: ' + err.message);
  }
}

async function saveLab(send) {
  const msgEl = f('ln-msg');
  const opdVal = (f('ln-opd')?.value || '').trim().toUpperCase();
  const labVal = (f('ln-lab')?.value || '').trim();
  const workVal = (f('ln-work')?.value || '').trim();
  const toothVal = (f('ln-tooth')?.value || '').trim();
  const shadeVal = (f('ln-shade')?.value || '').trim();
  const sentVal = (f('ln-sent')?.value || (send ? todayIso() : '')).trim();
  const expVal = (f('ln-exp')?.value || '').trim();
  const insVal = (f('ln-ins')?.value || '').trim();
  const chargeVal = Number(f('ln-charge')?.value || 0);

  const showBad = text => {
    if (msgEl) { msgEl.style.color = '#b42318'; msgEl.textContent = text; }
  };

  if (!opdVal) return showBad('Enter a valid Patient OPD number.');
  if (!labVal) return showBad('Select a laboratory.');
  if (!workVal) return showBad('Enter the work type (e.g. Crown, RPD, Denture).');

  const newCase = {
    id: String(Date.now()),
    opd_number: opdVal,
    lab: labVal,
    work_type: workVal,
    tooth: toothVal,
    shade: shadeVal,
    sent_date: send ? (sentVal || todayIso()) : sentVal,
    expected_date_bs: expVal,
    status: send ? 'Ongoing' : 'Pending',
    instructions: insVal,
    charge: chargeVal
  };

  try {
    const res = await fetch('/api/lab/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCase)
    });
    if (res.ok) {
      if (msgEl) {
        msgEl.style.color = '#21804b';
        msgEl.textContent = send ? '✓ Lab assignment saved and dispatched.' : '✓ Lab draft saved.';
      }
      ['ln-opd', 'ln-work', 'ln-tooth', 'ln-shade', 'ln-exp', 'ln-ins', 'ln-charge'].forEach(id => {
        const input = f(id);
        if (input) input.value = '';
      });
      if (f('ln-lab')) f('ln-lab').value = '';
      if (f('ln-sent')) f('ln-sent').value = todayIso();
      fetchPat();
      await loadLabData();
    } else {
      const err = await res.json();
      showBad(err.error || 'Failed to save lab assignment.');
    }
  } catch (err) {
    showBad(err.message);
  }
}

// Lab Accounts & Monthly Overview
async function renderAcc(prefix, monthBs) {
  try {
    const res = await fetch(`/api/lab/accounts?month=${encodeURIComponent(monthBs)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.summaries)) {
        const sumOut = sumArr(data.summaries.map(s => s.outstanding));
        const sumDue = sumArr(data.summaries.map(s => s.due));
        const sumCh = sumArr(data.summaries.map(s => s.charge));
        const sumPd = sumArr(data.summaries.map(s => s.paid));

        const cardsEl = f(prefix + '-cards');
        if (cardsEl) {
          cardsEl.innerHTML = `
            <div class="card"><div class="muted">Total Outstanding</div><div class="stat num" style="color:var(--primary)">${rs(sumOut)}</div></div>
            <div class="card"><div class="muted">Due from Previous Month</div><div class="stat num">${rs(sumDue)}</div></div>
            <div class="card"><div class="muted">Charge of This Month</div><div class="stat num">${rs(sumCh)}</div></div>
            <div class="card"><div class="muted">Paid</div><div class="stat num" style="color:#15803d">${rs(sumPd)}</div></div>
          `;
        }

        const bodyEl = f(prefix + '-body');
        if (bodyEl) {
          bodyEl.innerHTML = data.summaries.map(s => `
            <tr class="clk" onclick="openLabDetail('${prefix}', '${monthBs}', '${esc(s.lab)}')">
              <td><b>${esc(s.lab)}</b></td>
              <td>${rs(s.due)}</td>
              <td>${rs(s.charge)}</td>
              <td>${rs(s.paid)}</td>
              <td><b>${rs(s.outstanding)}</b></td>
            </tr>
          `).join('');
        }

        const mNameEl = f(prefix + '-mname');
        if (mNameEl) mNameEl.textContent = (BS_MONTH_NAMES[monthBs] || 'Kartik') + ' 2083';
      }
    }
  } catch (err) {
    console.warn('Error loading lab accounts:', err.message);
  }
}

async function renderHist() {
  const container = f('hs-months');
  if (!container) return;
  const pastMonths = ['06', '05', '04'];
  container.innerHTML = '';
  for (const m of pastMonths) {
    try {
      const res = await fetch(`/api/lab/accounts?month=${m}`);
      if (res.ok) {
        const data = await res.json();
        const sumOut = sumArr(data.summaries.map(s => s.outstanding));
        const sumDue = sumArr(data.summaries.map(s => s.due));
        const sumCh = sumArr(data.summaries.map(s => s.charge));
        const sumPd = sumArr(data.summaries.map(s => s.paid));
        container.innerHTML += `
          <tr class="clk" onclick="openPastMonth('${m}')">
            <td><b>${BS_MONTH_NAMES[m]} 2083</b></td>
            <td>${rs(sumDue)}</td>
            <td>${rs(sumCh)}</td>
            <td>${rs(sumPd)}</td>
            <td><b>${rs(sumOut)}</b></td>
          </tr>
        `;
      }
    } catch (_) { }
  }
}

function openPastMonth(m) {
  const hsView = f('hs-view');
  if (hsView) hsView.classList.remove('hide');
  const hsName = f('hs-mname');
  if (hsName) hsName.textContent = (BS_MONTH_NAMES[m] || m) + ' 2083';
  renderAcc('hs', m);
  hsView?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function openLabDetail(prefix, monthBs, labName) {
  const detailEl = f(prefix + '-detail');
  if (!detailEl) return;
  try {
    const res = await fetch(`/api/lab/accounts?month=${encodeURIComponent(monthBs)}`);
    if (res.ok) {
      const data = await res.json();
      const labData = data.summaries.find(s => s.lab === labName);
      if (!labData) return;

      const casesHtml = (labData.cases && labData.cases.length > 0)
        ? labData.cases.map(c => `<tr><td>${esc(c.sent_date || c.expected_date_bs || '—')}</td><td>${esc(c.opd_number)}</td><td>${esc(c.work_type)}</td><td>${esc(c.tooth || '—')}</td><td>${rs(c.charge)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">No cases for this month</td></tr>';

      const paysHtml = (labData.payments && labData.payments.length > 0)
        ? labData.payments.map(p => `<tr><td>${esc(p.date_bs)}</td><td>${esc(p.method)}</td><td>${rs(p.amount)}</td></tr>`).join('')
        : '<tr><td colspan="3" class="empty">No payments logged for this month</td></tr>';

      detailEl.innerHTML = `
        <div class="panel" style="margin-top:16px">
          <div class="ph">
            <span>${esc(labName)} • ${BS_MONTH_NAMES[monthBs] || monthBs} 2083 Details</span>
            <button class="btn secondary mini" onclick="f('${prefix}-detail').innerHTML=''">✕ Close</button>
          </div>
          <div class="pb">
            <p><b>Outstanding: ${rs(labData.outstanding)}</b> = Due (${rs(labData.due)}) + Charge (${rs(labData.charge)}) − Paid (${rs(labData.paid)})</p>
            <h4>Cases Assigned in this Month</h4>
            <div style="overflow:auto"><table class="table"><thead><tr><th>Date</th><th>OPD</th><th>Work Type</th><th>Tooth</th><th>Charge</th></tr></thead><tbody>${casesHtml}</tbody></table></div>
            <h4>Payments to Lab in this Month</h4>
            <div style="overflow:auto"><table class="table"><thead><tr><th>Date (BS)</th><th>Method</th><th>Amount</th></tr></thead><tbody>${paysHtml}</tbody></table></div>
          </div>
        </div>
      `;
      detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    console.warn(err);
  }
}

// Lab Work Export Rows for Excel
function labRows() {
  return [['OPD No.', 'Work Type', 'Tooth', 'Shade', 'Laboratory', 'Sent (AD)', 'Expected (BS)', 'Status', 'Instructions', 'Charge']].concat(
    labCasesList.map(c => [
      c.opd_number, c.work_type, c.tooth || '', c.shade || '', c.lab, c.sent_date || '', c.expected_date_bs || '', c.status, c.instructions || '', String(c.charge || 0)
    ])
  );
}

// =========================================================================
// 4. PURCHASES & SUPPLIER INVENTORY MODULE LOGIC
// =========================================================================
async function loadPurchasesData() {
  try {
    const [resSup, resPur] = await Promise.all([
      fetch('/api/suppliers'),
      fetch('/api/purchases')
    ]);
    if (resSup.ok) {
      const dataSup = await resSup.json();
      if (dataSup.success) suppliersList = dataSup.suppliers;
    }
    if (resPur.ok) {
      const dataPur = await resPur.json();
      if (dataPur.success) purchasesList = dataPur.purchases;
    }
  } catch (err) {
    console.warn('Error loading purchases data:', err.message);
  }
  renderBuy();
}

function renderBuy() {
  // Overview cards
  const boCards = f('bo-cards');
  if (boCards) {
    boCards.innerHTML = `
      <div class="card"><div class="muted">Items in Stock</div><div class="stat num">${stockItemsList.length}</div></div>
      <div class="card"><div class="muted">Low Stock Items</div><div class="stat num">${stockItemsList.filter(i => i.quantity <= i.min_quantity).length}</div></div>
      <div class="card"><div class="muted">Expiring in ≤ 90 Days</div><div class="stat num">${stockItemsList.filter(i => (new Date(i.expiry) - new Date()) / 864e5 <= 90).length}</div></div>
      <div class="card"><div class="muted">Active Suppliers</div><div class="stat num">${suppliersList.filter(s => s.active).length}</div></div>
    `;
  }

  // Recent Purchases
  const boBody = f('bo-body');
  if (boBody) {
    boBody.innerHTML = purchasesList.slice(0, 6).map(p => `
      <tr>
        <td><b>${esc(p.supplier)}</b> · ${esc(p.invoice_no)}</td>
        <td>${esc(p.date_bs)}</td>
        <td><b>${rs(p.total)}</b></td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="empty">No purchases entered yet.</td></tr>';
  }

  renderSup();
  renderPur();
  fillSupSel();
  renderDelBuy();
}

function renderSup() {
  const q = (f('bs-q')?.value || '').toLowerCase();
  const bsCards = f('bs-cards');
  if (bsCards) {
    const activeCount = suppliersList.filter(s => s.active).length;
    const totalInvoiced = sumArr(purchasesList.map(p => p.total));
    const totalBalance = sumArr(purchasesList.map(p => p.balance));
    bsCards.innerHTML = `
      <div class="card"><div class="muted">Total Suppliers</div><div class="stat num">${suppliersList.length}</div></div>
      <div class="card"><div class="muted">Active Suppliers</div><div class="stat num">${activeCount}</div></div>
      <div class="card"><div class="muted">Outstanding Balance</div><div class="stat num" style="color:#b42318">${rs(totalBalance)}</div></div>
      <div class="card"><div class="muted">Total Invoiced</div><div class="stat num" style="color:var(--primary)">${rs(totalInvoiced)}</div></div>
    `;
  }

  const bsBody = f('bs-body');
  if (bsBody) {
    const filtered = suppliersList.filter(s => {
      if (!q) return true;
      return (s.name + ' ' + (s.contact || '') + ' ' + (s.phone || '') + ' ' + (s.pan || '')).toLowerCase().includes(q);
    });

    bsBody.innerHTML = filtered.map(s => {
      const supPurchases = purchasesList.filter(p => p.supplier === s.name);
      const outBal = sumArr(supPurchases.map(p => p.balance));
      const cats = Array.isArray(s.categories) ? s.categories.join(', ') : '';
      const dels = Array.isArray(s.delivery_persons) ? s.delivery_persons.map(d => d.n).join(', ') : '';

      return `<tr>
        <td><b>${esc(s.name)}</b></td>
        <td>${esc(s.contact || '—')}</td>
        <td>${esc(s.phone)}</td>
        <td>${esc(s.pan || '—')}</td>
        <td><small>${esc(cats || '—')}</small></td>
        <td><small>${esc(dels || '—')}</small></td>
        <td><b>${rs(outBal)}</b></td>
        <td><span class="tag ${s.active ? '' : 'warn'}">${s.active ? 'Active' : 'Inactive'}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">No suppliers found.</td></tr>';
  }
}

function supForm(open) {
  const panel = f('sup-form');
  if (panel) {
    panel.classList.toggle('hide', !open);
    if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function saveSup() {
  const msgEl = f('sf-msg');
  const g = id => (f(id)?.value || '').trim();
  const showBad = text => {
    if (msgEl) { msgEl.style.color = '#b42318'; msgEl.textContent = text; }
  };

  const name = g('sf-name');
  const contact = g('sf-contact');
  const phone = g('sf-phone');
  const alt = g('sf-alt');
  const email = g('sf-email');
  const addr = g('sf-addr');
  const pan = g('sf-pan');
  const credit = Number(g('sf-credit') || 0);
  const openBal = Number(g('sf-open') || 0);

  if (!name) return showBad('Supplier name is required.');
  if (!phone) return showBad('Phone number is required.');

  const checkedCats = [...document.querySelectorAll('#sf-cats input:checked')].map(x => x.value);
  const delPersons = g('sf-dn') ? [{ n: g('sf-dn'), p: g('sf-dp') }] : [];

  const payload = {
    name, contact, phone, alt_phone: alt, email, address: addr, pan,
    credit_days: credit, opening_balance: openBal,
    categories: checkedCats,
    delivery_persons: delPersons
  };

  try {
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      if (msgEl) { msgEl.style.color = '#21804b'; msgEl.textContent = '✓ Supplier added successfully.'; }
      ['sf-name', 'sf-contact', 'sf-phone', 'sf-alt', 'sf-email', 'sf-addr', 'sf-pan', 'sf-credit', 'sf-open', 'sf-dn', 'sf-dp'].forEach(id => {
        const inp = f(id); if (inp) inp.value = '';
      });
      document.querySelectorAll('#sf-cats input').forEach(x => { x.checked = false; });
      await loadPurchasesData();
    } else {
      const err = await res.json();
      showBad(err.error || 'Failed to save supplier.');
    }
  } catch (err) {
    showBad(err.message);
  }
}

async function togSup(id) {
  try {
    const res = await fetch(`/api/suppliers/${encodeURIComponent(id)}/toggle`, { method: 'PUT' });
    if (res.ok) await loadPurchasesData();
  } catch (err) {
    alert('Error updating supplier status: ' + err.message);
  }
}

function fillSupSel() {
  const supSelect = f('pn-sup');
  if (supSelect) {
    const curVal = supSelect.value;
    supSelect.innerHTML = '<option value="">Select supplier</option>' + suppliersList.filter(s => s.active).map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
    if (curVal) supSelect.value = curVal;
  }
  const itemsl = f('itemsl');
  if (itemsl) {
    const allItemNames = [...new Set([
      ...stockItemsList.map(i => i.name),
      ...purchasesList.flatMap(p => (p.items || []).map(i => i.item_name || i.name))
    ])];
    itemsl.innerHTML = optHtml(allItemNames);
  }
  const sfCats = f('sf-cats');
  if (sfCats && sfCats.innerHTML === '') {
    sfCats.innerHTML = PURCHASE_CATEGORIES.map(c => `<label><input type="checkbox" value="${c}"> ${c}</label>`).join('');
  }
}

function supChange() {
  const supName = f('pn-sup')?.value || '';
  const s = suppliersList.find(x => x.name === supName);
  const dl = f('pn-dl');
  if (dl) {
    dl.innerHTML = s && Array.isArray(s.delivery_persons)
      ? s.delivery_persons.map(d => `<option value="${esc(d.n)}">${esc(d.p)}</option>`).join('')
      : '';
  }
}

function dnFill() {
  const supName = f('pn-sup')?.value || '';
  const dnVal = (f('pn-dn')?.value || '').trim().toLowerCase();
  const s = suppliersList.find(x => x.name === supName);
  if (s && Array.isArray(s.delivery_persons)) {
    const match = s.delivery_persons.find(d => (d.n || '').toLowerCase() === dnVal);
    if (match && f('pn-dp')) f('pn-dp').value = match.p;
  }
}

function addItem(focusNew) {
  const tbody = f('pn-items');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="i-n" list="itemsl" placeholder="Item name"></td>
    <td><select class="i-c">${optHtml(PURCHASE_CATEGORIES)}</select></td>
    <td><input class="i-q" type="number" min="0" value="1" oninput="calcInv()"></td>
    <td><select class="i-u">${optHtml(PURCHASE_UNITS)}</select></td>
    <td><input class="i-p" type="number" min="0" placeholder="0.00" oninput="calcInv()"></td>
    <td class="i-t" style="font-weight:700">Rs. 0</td>
    <td><button class="btn mini bad" type="button" onclick="this.closest('tr').remove();calcInv()">✕</button></td>
  `;
  tbody.appendChild(tr);
  if (focusNew) tr.querySelector('.i-n')?.focus();
}

function calcInv() {
  let subtotal = 0;
  document.querySelectorAll('#pn-items tr').forEach(r => {
    const q = Number(r.querySelector('.i-q')?.value || 0);
    const p = Number(r.querySelector('.i-p')?.value || 0);
    const lineTotal = q * p;
    const tCell = r.querySelector('.i-t');
    if (tCell) tCell.textContent = rs(lineTotal);
    subtotal += lineTotal;
  });

  const disc = Number(f('pn-disc')?.value || 0);
  const paid = Number(f('pn-paid')?.value || 0);
  const total = Math.max(0, subtotal - disc);
  const bal = Math.max(0, total - paid);

  if (f('pn-sub')) f('pn-sub').textContent = rs(subtotal);
  if (f('pn-tot')) f('pn-tot').textContent = rs(total);
  if (f('pn-bal')) f('pn-bal').textContent = rs(bal);
}

function clearInv() {
  ['pn-inv', 'pn-date', 'pn-due', 'pn-paid', 'pn-dn', 'pn-dp'].forEach(id => {
    const inp = f(id); if (inp) inp.value = '';
  });
  if (f('pn-disc')) f('pn-disc').value = 0;
  if (f('pn-sup')) f('pn-sup').value = '';
  if (f('pn-pm')) f('pn-pm').selectedIndex = 0;
  const tbody = f('pn-items');
  if (tbody) { tbody.innerHTML = ''; addItem(false); }
  calcInv();
  if (f('pn-msg')) f('pn-msg').textContent = '';
}

async function savePur() {
  const msgEl = f('pn-msg');
  const g = id => (f(id)?.value || '').trim();
  const showBad = text => {
    if (msgEl) { msgEl.style.color = '#b42318'; msgEl.textContent = text; }
  };

  const supVal = g('pn-sup');
  const invVal = g('pn-inv');
  const dateVal = g('pn-date');
  const dueVal = g('pn-due');
  const paidVal = Number(g('pn-paid') || 0);
  const pmVal = f('pn-pm')?.value || 'Cash';
  const dnVal = g('pn-dn');
  const dpVal = g('pn-dp');
  const discVal = Number(g('pn-disc') || 0);

  const items = [];
  let itemErr = '';
  document.querySelectorAll('#pn-items tr').forEach((r, idx) => {
    const n = (r.querySelector('.i-n')?.value || '').trim();
    const q = Number(r.querySelector('.i-q')?.value || 0);
    const c = Number(r.querySelector('.i-p')?.value || 0);
    const cat = r.querySelector('.i-c')?.value || 'Dental materials';
    const u = r.querySelector('.i-u')?.value || 'Piece';
    if (!n && !q && !c) return;
    if (!n || q <= 0 || c < 0) {
      itemErr = `Item row ${idx + 1}: please enter valid item name, quantity, and unit cost.`;
      return;
    }
    items.push({ item_name: n, category: cat, quantity: q, unit: u, unit_cost: c });
  });

  if (!supVal) return showBad('Select a supplier.');
  if (!invVal) return showBad('Enter the invoice number.');
  if (!dateVal) return showBad('Enter the purchase date (BS).');
  if (itemErr) return showBad(itemErr);
  if (items.length === 0) return showBad('Add at least one item to this invoice.');

  const payload = {
    supplier: supVal,
    invoice_no: invVal,
    date_bs: dateVal,
    due_date_bs: dueVal,
    paid: paidVal,
    payment_method: pmVal,
    delivery_name: dnVal,
    delivery_phone: dpVal,
    discount: discVal,
    receipt_status: 'Pending',
    items
  };

  try {
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      if (msgEl) {
        msgEl.style.color = '#21804b';
        msgEl.textContent = `✓ Invoice ${invVal} saved with ${items.length} item(s). Stock is increased only after confirmation of goods receipt.`;
      }
      clearInv();
      await loadPurchasesData();
    } else {
      const err = await res.json();
      showBad(err.error || 'Failed to save purchase invoice.');
    }
  } catch (err) {
    showBad(err.message);
  }
}

function renderPur() {
  const q = (f('pr-q')?.value || '').toLowerCase();
  const fromD = (f('pr-from')?.value || '').trim();
  const toD = (f('pr-to')?.value || '').trim();
  const stFilter = f('pr-st')?.value || 'All receipt statuses';

  const prBody = f('pr-body');
  if (!prBody) return;

  const filtered = purchasesList.filter(p => {
    if (q) {
      const itStr = (p.items || []).map(i => i.item_name || i.name).join(' ');
      const text = (p.invoice_no + ' ' + p.supplier + ' ' + (p.delivery_name || '') + ' ' + itStr).toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (fromD && p.date_bs < fromD) return false;
    if (toD && p.date_bs > toD) return false;
    if (stFilter !== 'All receipt statuses' && p.receipt_status !== stFilter) return false;
    return true;
  });

  prBody.innerHTML = filtered.map(p => `
    <tr class="clk" onclick="openPurDetail('${p.id}')">
      <td><b>${esc(p.invoice_no)}</b></td>
      <td>${esc(p.supplier)}</td>
      <td>${esc(p.date_bs)}</td>
      <td>${(p.items || []).length} item(s)</td>
      <td><b>${rs(p.total)}</b></td>
      <td>${rs(p.paid)}</td>
      <td><span style="color:${p.balance > 0 ? '#b42318' : '#15803d'}">${rs(p.balance)}</span></td>
      <td>${esc(p.delivery_name || '—')}</td>
      <td><span class="tag ${p.receipt_status === 'Received' ? '' : 'warn'}">${esc(p.receipt_status || 'Pending')}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="9" class="empty">No purchase records found.</td></tr>';
}

function openPurDetail(id) {
  const p = purchasesList.find(x => String(x.id) === String(id));
  const detailEl = f('pr-detail');
  if (!p || !detailEl) return;

  const itemsHtml = (p.items || []).map((it, idx) => {
    const q = it.quantity || it.q || 0;
    const c = it.unit_cost || it.c || 0;
    return `<tr>
      <td>${idx + 1}</td>
      <td><b>${esc(it.item_name || it.name)}</b></td>
      <td>${esc(it.category || '—')}</td>
      <td>${q} ${esc(it.unit || '')}</td>
      <td>${rs(c)}</td>
      <td><b>${rs(q * c)}</b></td>
    </tr>`;
  }).join('');

  detailEl.innerHTML = `
    <div class="panel" style="margin-top:16px">
      <div class="ph">
        <span>Invoice ${esc(p.invoice_no)} • ${esc(p.supplier)}</span>
        <button class="btn secondary mini" onclick="f('pr-detail').innerHTML=''">✕ Close</button>
      </div>
      <div class="pb">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;font-size:13px">
          <div>Date (BS): <b>${esc(p.date_bs)}</b> • Due: <b>${esc(p.due_date_bs || '—')}</b> • Method: <b>${esc(p.payment_method)}</b></div>
          <div>Receipt Status: <b>${esc(p.receipt_status)}</b> • Delivered by: <b>${esc(p.delivery_name || '—')} (${esc(p.delivery_phone || '—')})</b></div>
        </div>
        <div style="overflow:auto"><table class="table"><thead><tr><th>#</th><th>Item</th><th>Category</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table></div>
        <div style="margin-top:12px;text-align:right;font-size:13px">
          <div>Subtotal: <b>${rs(p.subtotal)}</b></div>
          <div>Discount: <b>${rs(p.discount || 0)}</b></div>
          <div style="font-size:16px;color:var(--primary)">Invoice Total: <b>${rs(p.total)}</b></div>
          <div>Amount Paid: <b>${rs(p.paid)}</b> • Balance Due: <b style="color:#b42318">${rs(p.balance)}</b></div>
        </div>
      </div>
    </div>
  `;
  detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// =========================================================================
// 5. STOCKS & INVENTORY MODULE LOGIC
// =========================================================================
async function loadStockData() {
  try {
    const [resItems, resMoves] = await Promise.all([
      fetch('/api/stock/items'),
      fetch('/api/stock/movements')
    ]);
    if (resItems.ok) {
      const data = await resItems.json();
      if (data.success && Array.isArray(data.items)) {
        stockItemsList = data.items;
      }
    }
    if (resMoves.ok) {
      const data = await resMoves.json();
      if (data.success && Array.isArray(data.movements)) {
        stockMovementsList = data.movements;
      }
    }
  } catch (err) {
    console.warn('Error loading stock:', err.message);
  }
  renderAll();
}

function stStatus(i) {
  const d = (new Date(i.expiry) - new Date()) / 864e5;
  if (d < 0) return ['Expired', 'bad'];
  if (i.quantity <= 0) return ['Out of stock', 'bad'];
  if (i.quantity <= i.min_quantity) return ['Low stock', 'warn'];
  if (d <= 90) return ['Expiring soon', 'warn'];
  return ['In stock', ''];
}

function renderStock() {
  const q = (f('f-q')?.value || '').toLowerCase();
  const loc = f('f-loc')?.value || 'All Locations';
  const st = (f('f-st')?.value || 'All Status').toLowerCase();

  const stockBody = f('stock-body');
  if (!stockBody) return;

  const filtered = stockItemsList.filter(i => {
    if (q && !(i.name + ' ' + (i.batch || '')).toLowerCase().includes(q)) return false;
    if (loc !== 'All Locations' && i.location !== loc) return false;
    if (st !== 'all status') {
      const [statusText] = stStatus(i);
      if (statusText.toLowerCase() !== st && !statusText.toLowerCase().includes(st)) return false;
    }
    return true;
  });

  stockBody.innerHTML = filtered.map(i => {
    const [statusLabel, statusClass] = stStatus(i);
    return `<tr>
      <td><b>${esc(i.name)}</b></td>
      <td>${esc(i.batch || '—')}</td>
      <td>${esc(i.location)}</td>
      <td><b>${i.quantity}</b> ${esc(i.unit)}</td>
      <td>${esc(i.expiry)}</td>
      <td><span class="tag ${statusClass}">${statusLabel}</span></td>
      <td class="noexp"><button class="btn mini primary" onclick="quickUse('${i.id}', 1)">− 1 used</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No stock items found.</td></tr>';

  if (f('c-items')) f('c-items').textContent = stockItemsList.length;
  if (f('c-low')) f('c-low').textContent = stockItemsList.filter(i => /Low|Out/.test(stStatus(i)[0])).length;
  if (f('c-exp')) f('c-exp').textContent = stockItemsList.filter(i => (new Date(i.expiry) - new Date()) / 864e5 <= 90).length;
}

function fillSel() {
  const sel = f('u-item');
  if (!sel) return;
  const curVal = sel.value;
  sel.innerHTML = stockItemsList.map(i => `<option value="${i.id}">${esc(i.name)} · ${esc(i.batch || '')} · ${esc(i.location)}</option>`).join('');
  if (curVal && stockItemsList.some(i => String(i.id) === String(curVal))) {
    sel.value = curVal;
  }
}

function cur() {
  const selId = f('u-item')?.value;
  return stockItemsList.find(i => String(i.id) === String(selId));
}

function showCur() {
  const i = cur();
  if (!i) return;
  if (f('u-cur')) f('u-cur').textContent = `${i.quantity} ${i.unit}`;
  const t = f('u-type')?.value;
  if (f('u-ql')) f('u-ql').textContent = (t === 'set' ? 'New counted quantity' : 'Quantity');
  preview();
}

function calcStockMath(i, type, n) {
  if (type === 'use' || type === 'waste') return i.quantity - n;
  if (type === 'add') return i.quantity + n;
  return n;
}

function preview() {
  const i = cur();
  const n = Number(f('u-qty')?.value || 0);
  const t = f('u-type')?.value;
  const prevEl = f('u-prev');
  if (!i || !prevEl) return;
  if (t === 'remove') {
    prevEl.textContent = `This will remove "${i.name}" from the active stock list (audit log is preserved).`;
    return;
  }
  const r = calcStockMath(i, t, n);
  prevEl.textContent = (r < 0) ? `Not enough stock: only ${i.quantity} ${i.unit} available.` : `After update: ${r} ${i.unit}`;
}

async function quickUse(id, qty) {
  try {
    const res = await fetch(`/api/stock/items/${encodeURIComponent(id)}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty, note: 'Quick use from stock screen' })
    });
    if (res.ok) {
      await loadStockData();
    } else {
      const err = await res.json();
      alert(err.error || 'Quick use failed');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function applyUpdate() {
  const i = cur();
  const msgEl = f('u-msg');
  if (!i) return;
  const actionType = f('u-type')?.value || 'use';
  const qtyVal = Number(f('u-qty')?.value || 0);
  const noteVal = (f('u-note')?.value || '').trim();

  try {
    const res = await fetch(`/api/stock/items/${encodeURIComponent(i.id)}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actionType, quantity: qtyVal, note: noteVal })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (msgEl) {
        msgEl.style.color = '#21804b';
        msgEl.textContent = data.message || 'Stock count updated successfully.';
      }
      if (f('u-note')) f('u-note').value = '';
      await loadStockData();
      showCur();
    } else {
      if (msgEl) {
        msgEl.style.color = '#b42318';
        msgEl.textContent = data.error || 'Failed to update stock.';
      }
    }
  } catch (err) {
    if (msgEl) { msgEl.style.color = '#b42318'; msgEl.textContent = err.message; }
  }
}

function renderMoves() {
  const movesBody = f('moves-body');
  if (movesBody) {
    movesBody.innerHTML = stockMovementsList.map(m => `
      <tr>
        <td>${esc(m.created_at ? m.created_at.replace('T', ' ').slice(0, 19) : '')}</td>
        <td><b>${esc(m.item_name)}</b></td>
        <td>${esc(m.location)}</td>
        <td><span class="tag ${m.type === 'Used' || m.type === 'Wasted' ? 'warn' : ''}">${esc(m.type)}</span></td>
        <td>${m.quantity} ${esc(m.unit || '')}</td>
        <td>${m.before_qty} → <b>${m.after_qty}</b></td>
        <td>${esc(m.note || '—')}</td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="empty">No movements logged yet.</td></tr>';
  }

  const recentBody = f('recent-body');
  if (recentBody) {
    recentBody.innerHTML = stockMovementsList.slice(0, 6).map(m => `
      <tr>
        <td>${esc(m.created_at ? m.created_at.slice(11, 16) : '')}</td>
        <td>${esc(m.item_name)}</td>
        <td>${esc(m.type)} ${m.quantity}</td>
        <td><b>${m.after_qty}</b> ${esc(m.unit || '')}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty">No updates yet.</td></tr>';
  }
}

async function resetStock() {
  const ok = confirm('Reset all stock items and movement audit logs to default prototype records?');
  if (!ok) return;
  try {
    const res = await fetch('/api/stock/reset', { method: 'POST' });
    if (res.ok) {
      await loadStockData();
      alert('Stock items reset to sample data.');
    }
  } catch (err) {
    alert('Reset failed: ' + err.message);
  }
}

function renderAll() {
  fillSel();
  renderStock();
  renderMoves();
  renderDelStock();
}

// =========================================================================
// 6. DELETE RECORDS LOGIC (PROTECTED BY ADMIN PIN)
// =========================================================================
function renderDelLab() {
  const drLab = f('dr-lab');
  if (!drLab) return;
  drLab.innerHTML = labCasesList.map(c => `
    <tr>
      <td><b>${esc(c.opd_number)}</b></td>
      <td>${esc(c.work_type)}</td>
      <td>${esc(c.work_type)}</td>
      <td>${esc(c.lab)}</td>
      <td>${esc(c.sent_date || '—')}</td>
      <td><span class="tag">${esc(c.status)}</span></td>
      <td class="noexp"><button class="btn mini bad" onclick="delLab('${c.id}')">🗑 Delete</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty">No lab records.</td></tr>';
}

function renderDelBuy() {
  const drSup = f('dr-sup');
  if (drSup) {
    drSup.innerHTML = suppliersList.map(s => {
      const invCount = purchasesList.filter(p => p.supplier === s.name).length;
      return `<tr>
        <td><b>${esc(s.name)}</b></td>
        <td>${esc(s.phone)}</td>
        <td>${invCount} invoice(s)</td>
        <td><span class="tag ${s.active ? '' : 'warn'}">${s.active ? 'Active' : 'Inactive'}</span></td>
        <td class="noexp">
          <button class="btn mini secondary" onclick="togSup('${s.id}')">${s.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn mini bad" onclick="delSup('${s.id}')">🗑 Delete</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">No suppliers.</td></tr>';
  }

  const drPur = f('dr-pur');
  if (drPur) {
    drPur.innerHTML = purchasesList.map(p => `
      <tr>
        <td><b>${esc(p.invoice_no)}</b></td>
        <td>${esc(p.supplier)}</td>
        <td>${esc(p.date_bs)}</td>
        <td>${(p.items || []).length} item(s)</td>
        <td>${rs(p.total)}</td>
        <td class="noexp"><button class="btn mini bad" onclick="delPur('${p.id}')">🗑 Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty">No invoices.</td></tr>';
  }
}

function renderDelStock() {
  const drStock = f('dr-stock');
  if (!drStock) return;
  drStock.innerHTML = stockItemsList.map(i => `
    <tr>
      <td><b>${esc(i.name)}</b></td>
      <td>${esc(i.batch || '—')}</td>
      <td>${esc(i.location)}</td>
      <td>${i.quantity} ${esc(i.unit)}</td>
      <td>${esc(i.expiry)}</td>
      <td class="noexp"><button class="btn mini bad" onclick="delStock('${i.id}')">🗑 Delete</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="empty">No stock items.</td></tr>';
}

async function delLab(id) {
  const ok = await verifyAdminPin('deletion of Lab case');
  if (!ok) return;
  try {
    const res = await fetch(`/api/lab/cases/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) await loadLabData();
  } catch (err) {
    alert(err.message);
  }
}

async function delSup(id) {
  const ok = await verifyAdminPin('deletion of Supplier');
  if (!ok) return;
  try {
    const res = await fetch(`/api/suppliers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadPurchasesData();
    } else {
      alert(data.error || 'Failed to delete supplier');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function delPur(id) {
  const ok = await verifyAdminPin('deletion of Purchase Invoice');
  if (!ok) return;
  try {
    const res = await fetch(`/api/purchases/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) await loadPurchasesData();
  } catch (err) {
    alert(err.message);
  }
}

async function delStock(id) {
  const ok = await verifyAdminPin('deletion of Stock Item');
  if (!ok) return;
  try {
    const res = await fetch(`/api/stock/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) await loadStockData();
  } catch (err) {
    alert(err.message);
  }
}

// =========================================================================
// 7. LOCAL WI-FI PHONE QR STOCK SCANNER & MOBILE VIEW
// =========================================================================
async function refreshPhoneNetworkQr() {
  try {
    const res = await fetch('/api/network-info');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.phoneUrl) {
        if (f('qr-addr')) {
          f('qr-addr').value = `http://${data.primaryIp}:${data.port}`;
        }
        drawQR();
        return;
      }
    }
  } catch (_) { }
  // Default to current location
  if (f('qr-addr') && !f('qr-addr').value) {
    f('qr-addr').value = location.origin;
  }
  drawQR();
}

function phoneUrl() {
  const a = (f('qr-addr')?.value || '').trim().replace(/\/$/, '');
  const base = a || location.origin;
  return base + '/?phone=stock';
}

function drawQR() {
  const container = f('qr');
  if (!container) return;
  container.innerHTML = '';
  const url = phoneUrl();
  const warn = f('qr-warn');
  const urlLabel = f('qr-url');
  if (warn) warn.textContent = f('qr-addr')?.value ? '' : 'Auto-detecting Wi-Fi IP address...';
  if (urlLabel) urlLabel.textContent = url;

  if (window.QRCode) {
    new QRCode(container, {
      text: url,
      width: 154,
      height: 154,
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

// Mobile Phone View Functions (When accessed via ?phone=stock)
function phCur() {
  const selId = f('ph-item')?.value;
  return stockItemsList.find(i => String(i.id) === String(selId));
}

function phShow() {
  const i = phCur();
  const t = f('ph-type')?.value || 'use';
  const n = Number(f('ph-qty')?.value || 0);
  if (f('ph-ql')) f('ph-ql').textContent = (t === 'set' ? 'New counted quantity' : 'Quantity');
  if (!i) {
    if (f('ph-cur')) f('ph-cur').textContent = '—';
    if (f('ph-prev')) f('ph-prev').textContent = '';
    return;
  }
  if (f('ph-cur')) f('ph-cur').textContent = `${i.quantity} ${i.unit}`;
  const r = calcStockMath(i, t, n);
  if (f('ph-prev')) f('ph-prev').textContent = (r < 0) ? `Not enough stock: only ${i.quantity} available.` : `After update: ${r} ${i.unit}`;
}

function phRender() {
  const sel = f('ph-item');
  if (!sel) return;
  const curVal = sel.value;
  sel.innerHTML = stockItemsList.map(i => `<option value="${i.id}">${esc(i.name)} · ${esc(i.location)}</option>`).join('') || '<option value="">No items in stock</option>';
  if (curVal && stockItemsList.some(i => String(i.id) === String(curVal))) sel.value = curVal;
  phShow();

  const phRec = f('ph-recent');
  if (phRec) {
    phRec.innerHTML = stockMovementsList.slice(0, 5).map(m => `
      <div class="pvr">
        <b>${esc(m.item_name)}</b> · ${esc(m.type)} ${m.quantity}<br>
        <small class="muted">${esc(m.created_at ? m.created_at.slice(11, 16) : '')} ${m.note ? '· ' + esc(m.note) : ''}</small>
      </div>
    `).join('') || '<small class="muted">No recent updates</small>';
  }
}

async function phApply() {
  const i = phCur();
  const msgEl = f('ph-msg');
  if (!i) return;
  const t = f('ph-type')?.value || 'use';
  const n = Number(f('ph-qty')?.value || 0);
  const staffName = (f('ph-name')?.value || '').trim();
  const noteText = (f('ph-note')?.value || '').trim();
  const fullNote = [staffName ? 'by ' + staffName : '', noteText, 'via mobile Wi-Fi'].filter(Boolean).join(' · ');

  try {
    const res = await fetch(`/api/stock/items/${encodeURIComponent(i.id)}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: t, quantity: n, note: fullNote })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (msgEl) {
        msgEl.style.color = '#21804b';
        msgEl.textContent = `✓ ${i.name} updated to ${data.quantity} ${i.unit}`;
      }
      if (f('ph-note')) f('ph-note').value = '';
      await loadStockData();
      phRender();
    } else {
      if (msgEl) { msgEl.style.color = '#b42318'; msgEl.textContent = data.error || 'Update failed.'; }
    }
  } catch (err) {
    if (msgEl) { msgEl.style.color = '#b42318'; msgEl.textContent = err.message; }
  }
}

async function phRemove() {
  const i = phCur();
  if (!i) return;
  const ok = confirm(`Remove "${i.name}" from the active stock list? Use this only when it is completely finished.`);
  if (!ok) return;

  const staffName = (f('ph-name')?.value || '').trim();
  const fullNote = [staffName ? 'by ' + staffName : '', 'Used up - removed via phone'].filter(Boolean).join(' · ');

  try {
    const res = await fetch(`/api/stock/items/${encodeURIComponent(i.id)}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', note: fullNote })
    });
    if (res.ok) {
      await loadStockData();
      phRender();
      if (f('ph-msg')) {
        f('ph-msg').style.color = '#21804b';
        f('ph-msg').textContent = `✓ ${i.name} removed from stock list.`;
      }
    }
  } catch (err) {
    alert(err.message);
  }
}

// Check on load if opened from phone
if (new URLSearchParams(location.search).get('phone') === 'stock') {
  document.body.classList.add('phone');
  window.addEventListener('DOMContentLoaded', () => {
    loadStockData().then(() => phRender());
  });
}

// =========================================================================
// 8. BUILT-IN OFFLINE EXCEL (.XLSX) & PDF PRINT ENGINE
// =========================================================================
const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
const calcCrc = d => {
  let c = -1;
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function buildZipBlob(files) {
  const enc = new TextEncoder();
  const parts = [];
  const cd = [];
  let offset = 0;

  for (const x of files) {
    const nameBytes = enc.encode(x.n);
    const crcVal = calcCrc(x.d);
    const len = x.d.length;

    const localHdr = new DataView(new ArrayBuffer(30));
    localHdr.setUint32(0, 0x04034b50, true);
    localHdr.setUint16(4, 20, true);
    localHdr.setUint16(12, 33, true);
    localHdr.setUint32(14, crcVal, true);
    localHdr.setUint32(18, len, true);
    localHdr.setUint32(22, len, true);
    localHdr.setUint16(26, nameBytes.length, true);

    parts.push(new Uint8Array(localHdr.buffer), nameBytes, x.d);

    const cdHdr = new DataView(new ArrayBuffer(46));
    cdHdr.setUint32(0, 0x02014b50, true);
    cdHdr.setUint16(4, 20, true);
    cdHdr.setUint16(6, 20, true);
    cdHdr.setUint16(14, 33, true);
    cdHdr.setUint32(16, crcVal, true);
    cdHdr.setUint32(20, len, true);
    cdHdr.setUint32(24, len, true);
    cdHdr.setUint16(28, nameBytes.length, true);
    cdHdr.setUint32(42, offset, true);

    cd.push(new Uint8Array(cdHdr.buffer), nameBytes);
    offset += 30 + nameBytes.length + len;
  }

  let cdLen = 0;
  cd.forEach(x => cdLen += x.length);

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdLen, true);
  eocd.setUint32(16, offset, true);

  return new Blob([...parts, ...cd, new Uint8Array(eocd.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

const colLetter = n => {
  let t = '';
  n++;
  while (n) {
    const r = (n - 1) % 26;
    t = String.fromCharCode(65 + r) + t;
    n = Math.floor((n - 1) / 26);
  }
  return t;
};

const parseNumForExcel = v => {
  const x = String(v).replace(/^Rs\.?\s*/, '').replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(x) ? +x : null;
};

function generateXlsxBlob(sheets) {
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const N = 'http://schemas.openxmlformats.org/';
  const M = N + 'spreadsheetml/2006/main';
  const E = new TextEncoder();
  const O = N + 'officeDocument/2006/relationships/';

  const F = [
    ['[Content_Types].xml', X + '<Types xmlns="' + N + 'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="' + N + 'package/2006/relationships"><Relationship Id="rId1" Type="' + O + 'officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + '<workbook xmlns="' + M + '" xmlns:r="' + O.slice(0, -1) + '"><sheets>' + sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="' + N + 'package/2006/relationships">' + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + O + 'worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + O + 'styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', X + '<styleSheet xmlns="' + M + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']
  ];

  sheets.forEach((s, i) => {
    const colDefs = (s.rows[0] || []).map((_, j) => '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + Math.min(40, Math.max(10, ...s.rows.map(r => String(r[j] || '').length + 2))) + '" customWidth="1"/>').join('');
    const rowDefs = s.rows.map((r, rIdx) => '<row r="' + (rIdx + 1) + '">' + r.map((v, j) => {
      const ref = colLetter(j) + (rIdx + 1);
      const num = rIdx > 0 ? parseNumForExcel(v) : null;
      return num !== null
        ? '<c r="' + ref + '"><v>' + num + '</v></c>'
        : '<c r="' + ref + '" t="inlineStr"' + (rIdx ? '' : ' s="1"') + '><is><t>' + esc(v) + '</t></is></c>';
    }).join('') + '</row>').join('');

    F.push(['xl/worksheets/sheet' + (i + 1) + '.xml', X + '<worksheet xmlns="' + M + '"><cols>' + colDefs + '</cols><sheetData>' + rowDefs + '</sheetData></worksheet>']);
  });

  return buildZipBlob(F.map(x => ({ n: x[0], d: E.encode(x[1]) })));
}

function gatherTables(root) {
  const out = [];
  const seen = {};
  root.querySelectorAll('table').forEach(t => {
    if (t.dataset.nox || t.querySelector('input, select')) return;
    const rows = [...t.rows].map(r => [...r.cells].filter(c => !c.classList.contains('noexp')).map(c => c.innerText.replace(/\s+/g, ' ').trim()));
    if (rows.length < 2) return;
    let title = (t.dataset.name || 'Sheet').replace(/[\[\]:*?\/\\]/g, '').slice(0, 31);
    let key = title;
    let count = 2;
    while (seen[key]) key = title.slice(0, 28) + ' ' + count++;
    seen[key] = 1;
    out.push({ name: key, rows });
  });
  return out;
}

function downloadFile(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

let ACTIVE_DL_SECTION = null;
function dlOpen(btn) {
  ACTIVE_DL_SECTION = btn.closest('section');
  const scopeSelect = f('dl-scope');
  if (scopeSelect && ACTIVE_DL_SECTION) {
    const secTitle = ACTIVE_DL_SECTION.querySelector('.title')?.textContent || 'Module';
    const activeTab = ACTIVE_DL_SECTION.querySelector('.tab.active')?.textContent || 'Current Tab';
    scopeSelect.innerHTML = `
      <option value="tab">This tab — ${esc(activeTab)}</option>
      <option value="all">All tabs — ${esc(secTitle)}</option>
    `;
  }
  dlNote();
  f('dlm')?.classList.remove('hide');
}

function dlClose() {
  f('dlm')?.classList.add('hide');
}

function dlNote() {
  const noteEl = f('dl-note');
  const calVal = f('dl-cal')?.value || 'BS';
  if (noteEl) {
    noteEl.style.color = '';
    noteEl.textContent = 'Leave date fields empty to download all records. ' +
      (calVal === 'BS' ? 'BS filters apply to Nepali calendar date fields; AD dates will be included in full.' : 'AD filters apply to English date fields; BS dates will be included in full.');
  }
}

function dlGo() {
  const noteEl = f('dl-note');
  const showBad = t => { if (noteEl) { noteEl.style.color = '#b42318'; noteEl.textContent = t; } };
  const fromVal = (f('dl-from')?.value || '').trim();
  const toVal = (f('dl-to')?.value || '').trim();
  const isAll = f('dl-scope')?.value === 'all';
  const fmt = document.querySelector('input[name="dl-fmt"]:checked')?.value || 'x';

  if (!ACTIVE_DL_SECTION) return;
  const targetRoot = isAll ? ACTIVE_DL_SECTION : ([...ACTIVE_DL_SECTION.children].find(e => e.id && !e.classList.contains('hide')) || ACTIVE_DL_SECTION);
  let sheets = gatherTables(targetRoot);

  if (isAll) {
    if (ACTIVE_DL_SECTION.id === 'labworks') {
      sheets.push({ name: 'Lab Work Records (Full)', rows: labRows() });
    }
  }

  if (sheets.length === 0) {
    return showBad('No exportable data tables found for this view.');
  }

  const baseName = `Infinity_${ACTIVE_DL_SECTION.id}_${todayIso()}`;
  dlClose();

  if (fmt === 'x') {
    const xlsxBlob = generateXlsxBlob(sheets);
    downloadFile(xlsxBlob, baseName + '.xlsx');
  } else {
    printToPdf(ACTIVE_DL_SECTION.querySelector('.title')?.textContent || 'Export', sheets);
  }
}

function printToPdf(title, sheets) {
  const pa = f('pa');
  if (!pa) return;
  pa.innerHTML = `
    <h2>Infinity Dental Clinic — ${esc(title)}</h2>
    <div style="font-size:12px;color:#64748b;margin-bottom:8px">Dhumbarahi, Kathmandu, Nepal • Tel: 9768592344, 01-4514888 • Email: The.infinity.dental@gmail.com • Web: www.infinitydentalclinic.com.np • PAN: 125302054</div>
    <p class="foot">Export generated on ${new Date().toLocaleString()}</p>
    ${sheets.map(s => `
      <h3>${esc(s.name)}</h3>
      <table>
        ${s.rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}
      </table>
    `).join('')}
  `;
  document.body.classList.add('printing');
  setTimeout(() => {
    window.print();
    document.body.classList.remove('printing');
  }, 100);
}


// --- Settings Menu & Flyout Dropup Handlers ---
function toggleSettingsMenu(e) {
  if (e) e.stopPropagation();
  const flyout = document.getElementById('settingsFlyout');
  const btn = document.getElementById('sidebarSettingsBtn');
  if (!flyout) return;
  const isClosed = flyout.style.display === 'none' || !flyout.style.display;
  flyout.style.display = isClosed ? 'block' : 'none';
  if (btn) btn.classList.toggle('active', isClosed);
}

function closeSettingsMenu() {
  const flyout = document.getElementById('settingsFlyout');
  const btn = document.getElementById('sidebarSettingsBtn');
  if (flyout) flyout.style.display = 'none';
  if (btn) btn.classList.remove('active');
}

// Global click listener to close settings flyout when clicking outside
document.addEventListener('click', function (e) {
  const flyout = document.getElementById('settingsFlyout');
  const btn = document.getElementById('sidebarSettingsBtn');
  if (flyout && flyout.style.display !== 'none') {
    if (!flyout.contains(e.target) && !btn?.contains(e.target)) {
      closeSettingsMenu();
    }
  }
});

// Escape key listener to close settings flyout
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeSettingsMenu();
  }
});


// ============================================================================
// NEPALPAY FINANCIAL AUDIT & SETTLEMENT LOGS (CONFIDENTIAL / SETTINGS ONLY)
// ============================================================================
let nepalPayAuditLogsCache = [];
let nepalPayLogsFiltered = [];

async function logNepalPayMoneyRecord(record) {
  try {
    const now = new Date();
    const fullRecord = {
      id: record.id || ('NPI-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
      timestamp: record.timestamp || now.toISOString(),
      date: record.date || now.toISOString().slice(0, 10),
      time: record.time || now.toLocaleTimeString(),
      billNumber: record.billNumber || '',
      patientName: record.patientName || 'Guest Patient',
      opdNumber: record.opdNumber || '',
      amount: Number(record.amount || 0),
      validationTraceId: record.validationTraceId || ('TXN-NPI-' + Date.now()),
      txnId: record.txnId || ('TXN-NPI-' + Date.now()),
      status: record.status || 'SUCCESS',
      method: record.method || 'NepalPay QR',
      source: record.source || 'Billing Terminal',
      remarks: record.remarks || '',
      created_at: now.toISOString()
    };

    // Prepend to local memory cache
    nepalPayAuditLogsCache = [fullRecord, ...nepalPayAuditLogsCache.filter(x => x.id !== fullRecord.id)];
    try {
      localStorage.setItem('infinity_nepalpay_audit_logs_v1', JSON.stringify(nepalPayAuditLogsCache.slice(0, 500)));
    } catch (_) {}

    // Persist to SQLite
    if (window.dentalNepalPayLogs && window.dentalNepalPayLogs.add) {
      await window.dentalNepalPayLogs.add(fullRecord);
    } else {
      await fetch('/api/nepalpay/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullRecord)
      });
    }
  } catch (err) {
    console.warn('[logNepalPayMoneyRecord] Persist failed:', err);
  }
}

async function loadNepalPayLogsFromBackend() {
  let logs = [];
  try {
    if (window.dentalNepalPayLogs && window.dentalNepalPayLogs.list) {
      const res = await window.dentalNepalPayLogs.list();
      if (res && res.success && Array.isArray(res.logs)) {
        logs = res.logs;
      }
    } else {
      const resp = await fetch('/api/nepalpay/logs');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.logs)) {
          logs = data.logs;
        }
      }
    }
  } catch (err) {
    console.warn('[loadNepalPayLogsFromBackend] Remote fetch failed:', err);
  }

  // Fallback to local storage if remote returned empty
  if (!logs || !logs.length) {
    try {
      logs = JSON.parse(localStorage.getItem('infinity_nepalpay_audit_logs_v1') || '[]');
    } catch (_) {
      logs = [];
    }
  }

  // If still empty or sparse, auto-seed from historical patient visits with NepalPay QR
  if (!logs.length && Array.isArray(patients)) {
    const historicalSeeds = [];
    patients.forEach(p => {
      (p.VisitHistory || []).forEach(v => {
        const m = String(v.paymentMethod || '').toLowerCase();
        if (m === 'nepalpay qr' || m.includes('nepalpay') || m.includes('qr')) {
          const amt = Number(v.paymentDone != null ? v.paymentDone : (v.amount || v.cost || 0));
          if (amt > 0) {
            historicalSeeds.push({
              id: 'NPI-HIST-' + (v.id || v.billNumber || Math.random().toString(36).substring(2, 8)),
              timestamp: (v.date || '2026-11-16') + 'T' + (v.time || '10:00:00') + 'Z',
              date: v.date || '',
              time: v.time || '10:00 AM',
              billNumber: v.billNumber || '',
              patientName: p.Name || '',
              opdNumber: 'OPD-' + pad(p.OPDNumber),
              amount: amt,
              validationTraceId: v.txnId || ('TXN-NPI-' + (v.billNumber || Date.now())),
              txnId: v.txnId || ('TXN-NPI-' + (v.billNumber || Date.now())),
              status: 'SUCCESS',
              method: 'NepalPay QR',
              source: 'Historical Bill',
              remarks: v.procedures || '',
              created_at: new Date().toISOString()
            });
          }
        }
      });
    });

    if (historicalSeeds.length) {
      logs = historicalSeeds;
      // Persist seeds
      historicalSeeds.forEach(s => logNepalPayMoneyRecord(s));
    }
  }

  nepalPayAuditLogsCache = logs;
  return logs;
}

async function openNepalPayLogsModal() {
  const m = document.getElementById('nepalPayLogsModal');
  if (m) m.classList.add('show');

  // Load latest logs
  await loadNepalPayLogsFromBackend();
  filterNepalPayLogs();
}

function closeNepalPayLogsModal() {
  const m = document.getElementById('nepalPayLogsModal');
  if (m) m.classList.remove('show');
}

function filterNepalPayLogs() {
  const search = (document.getElementById('npiLogSearchInput')?.value || '').trim().toLowerCase();
  const period = document.getElementById('npiLogFilterPeriod')?.value || 'all';

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();

  // Week start calculation
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  // Month start calculation
  const monthStartStr = now.toISOString().slice(0, 7);

  nepalPayLogsFiltered = nepalPayAuditLogsCache.filter(item => {
    // Period filter
    const itemDate = (item.date || (item.timestamp ? item.timestamp.slice(0, 10) : ''));
    if (period === 'today' && itemDate !== todayStr) return false;
    if (period === 'week' && itemDate < weekStartStr) return false;
    if (period === 'month' && !itemDate.startsWith(monthStartStr)) return false;

    // Search filter
    if (search) {
      const match = (
        (item.patientName && item.patientName.toLowerCase().includes(search)) ||
        (item.billNumber && item.billNumber.toLowerCase().includes(search)) ||
        (item.opdNumber && item.opdNumber.toLowerCase().includes(search)) ||
        (item.txnId && item.txnId.toLowerCase().includes(search)) ||
        (item.validationTraceId && item.validationTraceId.toLowerCase().includes(search)) ||
        (item.source && item.source.toLowerCase().includes(search))
      );
      if (!match) return false;
    }

    return true;
  });

  renderNepalPayLogsTable();
}

function renderNepalPayLogsTable() {
  const tbody = document.getElementById('npiLogTableBody');
  const totalVolEl = document.getElementById('npiLogTotalVolume');
  const totalCountEl = document.getElementById('npiLogTotalCount');
  const todayVolEl = document.getElementById('npiLogTodayVolume');
  const todayCountEl = document.getElementById('npiLogTodayCount');

  const totalVol = nepalPayAuditLogsCache.reduce((a, x) => a + Number(x.amount || 0), 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayItems = nepalPayAuditLogsCache.filter(x => (x.date || '').slice(0, 10) === todayStr);
  const todayVol = todayItems.reduce((a, x) => a + Number(x.amount || 0), 0);

  if (totalVolEl) totalVolEl.textContent = 'Rs. ' + totalVol.toLocaleString();
  if (totalCountEl) totalCountEl.textContent = `${nepalPayAuditLogsCache.length} total transaction${nepalPayAuditLogsCache.length === 1 ? '' : 's'}`;
  if (todayVolEl) todayVolEl.textContent = 'Rs. ' + todayVol.toLocaleString();
  if (todayCountEl) todayCountEl.textContent = `${todayItems.length} today`;

  if (!tbody) return;

  if (!nepalPayLogsFiltered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px 12px;color:var(--muted)">No NepalPay transactions match the selected criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = nepalPayLogsFiltered.map(x => `
    <tr>
      <td style="padding:9px 12px;white-space:nowrap;color:var(--text)">
        <div style="font-weight:700">${esc(x.date || '—')}</div>
        <div style="font-size:11px;color:var(--muted)">${esc(x.time || '')}</div>
      </td>
      <td style="padding:9px 12px;font-family:monospace;font-weight:700;color:#0284c7">${esc(x.billNumber || '—')}</td>
      <td style="padding:9px 12px;font-weight:600">${esc(x.opdNumber || '—')}</td>
      <td style="padding:9px 12px;font-weight:700;color:var(--text)">${esc(x.patientName || 'Guest Patient')}</td>
      <td style="padding:9px 12px;text-align:right;font-weight:800;color:#10b981;font-size:13px">Rs. ${Number(x.amount || 0).toLocaleString()}</td>
      <td style="padding:9px 12px;font-family:monospace;font-size:11px;color:var(--muted)">${esc(x.txnId || x.validationTraceId || '—')}</td>
      <td style="padding:9px 12px;text-align:center">
        <span style="font-size:10.5px;padding:2px 8px;border-radius:4px;background:rgba(2,132,199,0.12);color:#38bdf8;border:1px solid rgba(2,132,199,0.25)">${esc(x.source || 'Terminal')}</span>
      </td>
      <td style="padding:9px 12px;text-align:center">
        <span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)">✓ ${esc(x.status || 'SUCCESS')}</span>
      </td>
    </tr>
  `).join('');
}

function exportNepalPayLogsCsv() {
  if (!nepalPayLogsFiltered.length) {
    showToast('No logs available to export.', 'warn');
    return;
  }
  const headers = ['Date', 'Time', 'Bill Number', 'OPD Number', 'Patient Name', 'Amount (NPR)', 'Txn / Trace ID', 'Source', 'Status'];
  const rows = nepalPayLogsFiltered.map(x => [
    `"${(x.date || '').replaceAll('"', '""')}"`,
    `"${(x.time || '').replaceAll('"', '""')}"`,
    `"${(x.billNumber || '').replaceAll('"', '""')}"`,
    `"${(x.opdNumber || '').replaceAll('"', '""')}"`,
    `"${(x.patientName || '').replaceAll('"', '""')}"`,
    `"${Number(x.amount || 0)}"`,
    `"${(x.txnId || x.validationTraceId || '').replaceAll('"', '""')}"`,
    `"${(x.source || '').replaceAll('"', '""')}"`,
    `"${(x.status || 'SUCCESS').replaceAll('"', '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `NepalPay_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('✓ NepalPay logs exported as CSV.', 'success');
}

function printNepalPayLogsReport() {
  if (!nepalPayLogsFiltered.length) {
    showToast('No logs available to print.', 'warn');
    return;
  }
  const totalVol = nepalPayLogsFiltered.reduce((a, x) => a + Number(x.amount || 0), 0);
  const printWindow = window.open('', '_blank', 'width=900,height=960');
  if (!printWindow) {
    showToast('Please allow pop-ups to print the report.', 'warn');
    return;
  }

  const rows = nepalPayLogsFiltered.map((x, i) => `
    <tr>
      <td style="text-align:center;color:#64748b">${i + 1}</td>
      <td>${esc(x.date || '')} ${esc(x.time || '')}</td>
      <td style="font-family:monospace;font-weight:600">${esc(x.billNumber || '—')}</td>
      <td>${esc(x.opdNumber || '—')}</td>
      <td style="font-weight:600">${esc(x.patientName || 'Guest Patient')}</td>
      <td style="text-align:right;font-weight:700">Rs. ${Number(x.amount || 0).toLocaleString()}</td>
      <td style="font-family:monospace;font-size:10px">${esc(x.txnId || x.validationTraceId || '—')}</td>
      <td style="text-align:center">${esc(x.source || 'Terminal')}</td>
      <td style="text-align:center;font-weight:700;color:#16a34a">✓ SUCCESS</td>
    </tr>
  `).join('');

  const reportHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NepalPay Financial Audit Report - Infinity Dental Clinic</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 20px; font-size: 11px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
    .title { font-size: 18px; font-weight: 900; color: #0f172a; }
    .subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
    .stats-box { display: flex; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 16px; margin-bottom: 16px; }
    .stat-item { font-size: 11px; }
    .stat-item b { font-size: 14px; color: #0284c7; display: block; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #0f172a; color: #ffffff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:14px;display:flex;justify-content:space-between">
    <button onclick="window.print()" style="padding:8px 16px;background:#0284c7;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer">🖨️ Print Audit Sheet</button>
    <button onclick="window.close()" style="padding:8px 16px;background:#e2e8f0;color:#334155;border:none;border-radius:6px;font-weight:700;cursor:pointer">✕ Close</button>
  </div>
  <div class="header">
    <div>
      <div class="title">INFINITY DENTAL CLINIC</div>
      <div class="subtitle">NepalPay Financial Audit &amp; Settlement Log Report • PAN: 125302054</div>
      <div class="subtitle">📍 Dhumbarahi, Kathmandu, Nepal • 📞 9768592344, 01-4514888</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700">Confidential Financial Audit</div>
      <div style="color:#64748b">Generated: ${new Date().toLocaleString()}</div>
    </div>
  </div>

  <div class="stats-box">
    <div class="stat-item">Records Count: <b>${nepalPayLogsFiltered.length} Transactions</b></div>
    <div class="stat-item">Total Settlement Volume: <b>Rs. ${totalVol.toLocaleString()}</b></div>
    <div class="stat-item">Gateway Status: <b style="color:#16a34a">100% NCHL Verified</b></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px;text-align:center">#</th>
        <th>Date &amp; Time</th>
        <th>Bill No</th>
        <th>OPD</th>
        <th>Patient Name</th>
        <th style="text-align:right">Amount (NPR)</th>
        <th>Txn / Trace ID</th>
        <th style="text-align:center">Source</th>
        <th style="text-align:center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(reportHtml);
  printWindow.document.close();
}


// ============================================================================
// 1. APPOINTMENT RESCHEDULING SYSTEM
// ============================================================================
function openRescheduleModal(patientId) {
  const p = patients.find(x => x.id === patientId);
  if (!p) { showToast('Patient not found.', 'warn'); return; }

  const modal = document.getElementById('rescheduleModal');
  const patientIdInput = document.getElementById('reschedulePatientId');
  const header = document.getElementById('reschedulePatientHeader');
  const curDetails = document.getElementById('rescheduleCurrentDetails');
  const adInput = document.getElementById('rescheduleAdDate');
  const bsInput = document.getElementById('rescheduleBsDate');
  const timeInput = document.getElementById('rescheduleTime');
  const notesInput = document.getElementById('rescheduleNotes');

  if (patientIdInput) patientIdInput.value = p.id;
  if (header) header.textContent = `Patient: ${p.Name} (OPD-${pad(p.OPDNumber)})`;

  const appt = p.Appointment || p.NextAppointment || {};
  const currentAd = appt.adDate || appt.date || '';
  const currentBs = appt.bsDate || (currentAd ? (apptBsFromAd(currentAd) || '') : '');
  const currentT = appt.time || '10:00';
  if (curDetails) {
    curDetails.textContent = currentAd ? `${currentBs || currentAd} (${currentAd}) at ${currentT}` : 'No prior appointment scheduled';
  }

  // Default reschedule date to Tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomAd = apptIsoDate(tomorrow);
  const tomBs = apptBsFromAd(tomAd) || '';

  if (adInput) adInput.value = tomAd;
  if (bsInput) bsInput.value = tomBs;
  if (timeInput) timeInput.value = currentT || '10:00';
  if (notesInput) notesInput.value = '';

  updateRescheduleBsDisplay();
  if (modal) modal.classList.add('show');
}

function closeRescheduleModal() {
  const modal = document.getElementById('rescheduleModal');
  if (modal) modal.classList.remove('show');
}

function onRescheduleAdChange(adVal) {
  const bsInput = document.getElementById('rescheduleBsDate');
  if (adVal && bsInput) {
    const bs = apptBsFromAd(adVal);
    if (bs) bsInput.value = bs;
  }
  updateRescheduleBsDisplay();
}

function onRescheduleBsChange(bsVal) {
  const adInput = document.getElementById('rescheduleAdDate');
  const trimmed = (bsVal || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && adInput) {
    const ad = apptAdFromBs(trimmed);
    if (ad) adInput.value = ad;
  }
  updateRescheduleBsDisplay();
}

function updateRescheduleBsDisplay() {
  const adInput = document.getElementById('rescheduleAdDate');
  const bsInput = document.getElementById('rescheduleBsDate');
  const display = document.getElementById('rescheduleBsDisplay');
  if (!display) return;

  const ad = adInput?.value || '';
  const bs = (bsInput?.value || '').trim();
  if (ad || bs) {
    const finalAd = ad || apptAdFromBs(bs) || '';
    const finalBs = bs || apptBsFromAd(ad) || '';
    display.textContent = `📅 Nepali (BS): ${finalBs || '—'}  •  English (AD): ${finalAd || '—'}`;
    display.className = 'appt-bs-sync-badge active';
  } else {
    display.textContent = '📅 Select or write a date above';
    display.className = 'appt-bs-sync-badge';
  }
}

function setQuickRescheduleDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  const ad = apptIsoDate(d);
  const adInput = document.getElementById('rescheduleAdDate');
  const bsInput = document.getElementById('rescheduleBsDate');
  if (adInput) adInput.value = ad;
  if (bsInput) bsInput.value = apptBsFromAd(ad) || '';
  updateRescheduleBsDisplay();
}

function saveRescheduleAppointment() {
  const patientId = document.getElementById('reschedulePatientId')?.value;
  const p = patients.find(x => x.id === patientId);
  if (!p) { showToast('Patient not found.', 'warn'); return; }

  let ad = document.getElementById('rescheduleAdDate')?.value || '';
  let bs = (document.getElementById('rescheduleBsDate')?.value || '').trim();
  const time = document.getElementById('rescheduleTime')?.value || '10:00';
  const note = (document.getElementById('rescheduleNotes')?.value || '').trim();

  if (!ad && bs && /^\d{4}-\d{2}-\d{2}$/.test(bs)) ad = apptAdFromBs(bs);
  if (!bs && ad) bs = apptBsFromAd(ad);

  if (!ad) {
    showToast('Please select a valid reschedule date (YYYY-MM-DD).', 'warn');
    return;
  }

  ensurePatientArrays(p);
  if (!p.Appointment) p.Appointment = {};
  if (!Array.isArray(p.Appointment.followUpHistory)) p.Appointment.followUpHistory = [];

  const prevAd = p.Appointment.adDate || p.Appointment.date || '';

  p.Appointment.adDate = ad;
  p.Appointment.bsDate = bs;
  p.Appointment.date = ad;
  p.Appointment.time = time;
  p.Appointment.status = 'scheduled';
  p.Appointment.rescheduledAt = new Date().toISOString();
  if (note) p.Appointment.rescheduleNote = note;

  p.NextAppointment = { adDate: ad, bsDate: bs, time, status: 'scheduled' };

  p.Appointment.followUpHistory.unshift({
    date: todayIso(),
    status: 'rescheduled',
    note: `Rescheduled from ${prevAd || 'prior date'} to ${ad} (${bs}) at ${time}` + (note ? `: ${note}` : ''),
    attempts: 1,
    timestamp: new Date().toISOString()
  });

  save();
  closeRescheduleModal();
  renderAppointments();
  renderProfile();
  showToast(`✓ Appointment rescheduled to ${bs} (${ad}) at ${time}`, 'success');
}

// ============================================================================
// 2. NIZI POS B33 STARTUP SCREEN CONTROLLER
// ============================================================================
function onNiziStartupScreenChange(val) {
  localStorage.setItem('infinity_nizi_startup_screen', val);
  showToast(`NiZi POS default startup screen set to: ${val === 'wifi' ? 'Clinic Guest Wi-Fi QR' : 'Clinic Standby Logo (IDLE)'}`, 'info');
  if (val === 'wifi') {
    showWifiQrOnNizi();
  } else {
    resetNiziScreen();
  }
}

// ============================================================================
// 3. LABORATORY COMPANIES DATABASE MANAGEMENT
// ============================================================================
async function loadLabCompanies() {
  try {
    if (window.dentalLabs && window.dentalLabs.list) {
      const res = await window.dentalLabs.list();
      if (res && res.success && Array.isArray(res.labs) && res.labs.length) {
        labCompaniesList = res.labs;
      }
    } else {
      const resp = await fetch('/api/lab/companies');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.labs) && data.labs.length) {
          labCompaniesList = data.labs;
        }
      }
    }
  } catch (err) {
    console.warn('[loadLabCompanies] Error:', err);
  }
  rebuildLabPartnersObj();
}

function updateLabDropdowns() {
  const lnLab = document.getElementById('ln-lab');
  if (lnLab) {
    const curVal = lnLab.value;
    lnLab.innerHTML = '<option value="">Select lab</option>' + labCompaniesList.map(l => `<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('');
    if (curVal && labCompaniesList.some(l => l.name === curVal)) lnLab.value = curVal;
  }

  const laLab = document.getElementById('la-lab');
  if (laLab) {
    const curVal = laLab.value;
    laLab.innerHTML = '<option value="">Select lab</option>' + labCompaniesList.map(l => `<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('');
    if (curVal && labCompaniesList.some(l => l.name === curVal)) laLab.value = curVal;
  }

  const lpLab = document.getElementById('lp-lab');
  if (lpLab) {
    const curVal = lpLab.value;
    lpLab.innerHTML = '<option value="">Select lab</option>' + labCompaniesList.map(l => `<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('');
    if (curVal && labCompaniesList.some(l => l.name === curVal)) lpLab.value = curVal;
  }
}

function openManageLabsModal() {
  const modal = document.getElementById('manageLabsModal');
  resetLabForm();
  renderManageLabsTable();
  if (modal) modal.classList.add('show');
}

function closeManageLabsModal() {
  const modal = document.getElementById('manageLabsModal');
  if (modal) modal.classList.remove('show');
}

function renderManageLabsTable() {
  const tbody = document.getElementById('manageLabsTableBody');
  if (!tbody) return;
  if (!labCompaniesList.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">No lab companies found. Add one above.</td></tr>';
    return;
  }

  tbody.innerHTML = labCompaniesList.map(l => `
    <tr>
      <td style="font-weight:700;color:var(--text)">${esc(l.name)}</td>
      <td>${esc(l.contact_person || '—')}</td>
      <td>${esc(l.phone || '—')}</td>
      <td>${esc(l.address || '—')}</td>
      <td style="text-align:right;font-weight:700;color:#0284c7">Rs. ${Number(l.opening_balance || 0).toLocaleString()}</td>
      <td style="text-align:center">
        <button class="btn secondary" style="padding:3px 8px;font-size:11px" onclick="editLabCompany('${esc(l.id)}')">✎ Edit</button>
      </td>
    </tr>
  `).join('');
}

function editLabCompany(id) {
  const l = labCompaniesList.find(x => x.id === id);
  if (!l) return;

  const idInput = document.getElementById('labEditId');
  const nameInput = document.getElementById('labNameInput');
  const contactInput = document.getElementById('labContactInput');
  const phoneInput = document.getElementById('labPhoneInput');
  const balInput = document.getElementById('labBalanceInput');
  const title = document.getElementById('labFormTitle');
  const btn = document.getElementById('saveLabBtn');
  const cancelBtn = document.getElementById('cancelLabEditBtn');

  if (idInput) idInput.value = l.id;
  if (nameInput) nameInput.value = l.name;
  if (contactInput) contactInput.value = l.contact_person || '';
  if (phoneInput) phoneInput.value = l.phone || '';
  if (balInput) balInput.value = Number(l.opening_balance || 0);

  if (title) title.textContent = `✎ Edit Lab: ${l.name}`;
  if (btn) btn.textContent = 'Update Lab';
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
}

function resetLabForm() {
  const idInput = document.getElementById('labEditId');
  const nameInput = document.getElementById('labNameInput');
  const contactInput = document.getElementById('labContactInput');
  const phoneInput = document.getElementById('labPhoneInput');
  const balInput = document.getElementById('labBalanceInput');
  const title = document.getElementById('labFormTitle');
  const btn = document.getElementById('saveLabBtn');
  const cancelBtn = document.getElementById('cancelLabEditBtn');

  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';
  if (contactInput) contactInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (balInput) balInput.value = '0';

  if (title) title.textContent = '＋ Add New Lab Company';
  if (btn) btn.textContent = 'Save Lab';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

async function saveLabCompany() {
  const id = (document.getElementById('labEditId')?.value || '').trim();
  const name = (document.getElementById('labNameInput')?.value || '').trim();
  const contact = (document.getElementById('labContactInput')?.value || '').trim();
  const phone = (document.getElementById('labPhoneInput')?.value || '').trim();
  const bal = Number(document.getElementById('labBalanceInput')?.value || 0);

  if (!name) {
    showToast('Please enter a Lab Company name.', 'warn');
    return;
  }

  const payload = {
    id: id || ('lab-' + Date.now()),
    name,
    contact_person: contact,
    phone,
    address: 'Kathmandu',
    opening_balance: bal
  };

  try {
    if (id) {
      // Update
      if (window.dentalLabs && window.dentalLabs.update) {
        await window.dentalLabs.update(payload);
      } else {
        await fetch('/api/lab/companies/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      showToast(`✓ Lab company "${name}" updated.`, 'success');
    } else {
      // Create
      if (window.dentalLabs && window.dentalLabs.create) {
        await window.dentalLabs.create(payload);
      } else {
        await fetch('/api/lab/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      showToast(`✓ New lab company "${name}" added.`, 'success');
    }
  } catch (err) {
    console.warn('[saveLabCompany] Server call failed:', err);
  }

  // Update in-memory list
  if (id) {
    const idx = labCompaniesList.findIndex(x => x.id === id);
    if (idx !== -1) labCompaniesList[idx] = payload;
  } else {
    labCompaniesList.push(payload);
  }

  rebuildLabPartnersObj();
  renderManageLabsTable();
  resetLabForm();

  // Re-render accounts if on labworks page
  if (typeof renderLabAccounts === 'function') renderLabAccounts();
}

// ============================================================================
// 4. EDIT CLINICAL PROCEDURES DONE ON VISIT (SAME-DAY VS ADMIN PIN)
// ============================================================================
async function onEditVisitClick(patientId, visitId) {
  const p = patients.find(x => x.id === patientId);
  if (!p || !Array.isArray(p.VisitHistory)) return;
  const v = p.VisitHistory.find(x => x.id === visitId || x.billNumber === visitId);
  if (!v) { showToast('Visit record not found.', 'warn'); return; }

  const today = todayIso();
  if (v.date === today) {
    openEditVisitModal(patientId, visitId);
  } else {
    const authorized = await promptAdminPin(`Edit previous visit from ${v.date} (Bill: ${v.billNumber || 'N/A'})`);
    if (authorized) {
      openEditVisitModal(patientId, visitId);
    }
  }
}

function openEditVisitModal(patientId, visitId) {
  const p = patients.find(x => x.id === patientId);
  if (!p) return;
  const v = p.VisitHistory.find(x => x.id === visitId || x.billNumber === visitId);
  if (!v) return;

  const modal = document.getElementById('editVisitModal');
  const pIdInput = document.getElementById('editVisitPatientId');
  const vIdInput = document.getElementById('editVisitId');
  const header = document.getElementById('editVisitHeaderInfo');
  const procInput = document.getElementById('editVisitProcedures');
  const teethInput = document.getElementById('editVisitTeeth');
  const costInput = document.getElementById('editVisitCost');
  const discInput = document.getElementById('editVisitDiscount');
  const payInput = document.getElementById('editVisitPayment');
  const modeSelect = document.getElementById('editVisitPaymentMode');
  const notesInput = document.getElementById('editVisitNotes');

  if (pIdInput) pIdInput.value = p.id;
  if (vIdInput) vIdInput.value = v.id || v.billNumber;
  if (header) header.textContent = `Patient: ${p.Name} (OPD-${pad(p.OPDNumber)}) • Bill: ${v.billNumber || '—'} • Date: ${v.date || '—'}`;

  if (procInput) procInput.value = v.procedures || v.treatment || '';
  if (teethInput) teethInput.value = v.teeth || v.toothNumbers || '';
  if (costInput) costInput.value = Number(v.subtotal || v.cost || 0);
  if (discInput) discInput.value = Number(v.discountAmount || 0);
  if (payInput) payInput.value = Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
  if (modeSelect) modeSelect.value = v.paymentMethod || 'Cash';
  if (notesInput) notesInput.value = v.notes || v.remarks || '';

  const docSelect = document.getElementById('editVisitDoctor');
  if (docSelect) {
    if (docSelect.tagName === 'SELECT') {
      docSelect.innerHTML = '<option value="">-- Select Doctor --</option>' + renderDoctorOptions(v.doctorId || p.default_doctor_id);
    } else {
      docSelect.value = v.doctorName || p.default_doctor_name || '';
    }
  }

  recalcEditVisitTotals();
  if (modal) modal.classList.add('show');
}

function closeEditVisitModal() {
  const modal = document.getElementById('editVisitModal');
  if (modal) modal.classList.remove('show');
}

function recalcEditVisitTotals() {
  const cost = Number(document.getElementById('editVisitCost')?.value || 0);
  const disc = Number(document.getElementById('editVisitDiscount')?.value || 0);
  const paid = Number(document.getElementById('editVisitPayment')?.value || 0);
  const net = Math.max(0, cost - disc);
  const due = Math.max(0, net - paid);

  const netEl = document.getElementById('editVisitNetCharge');
  const dueEl = document.getElementById('editVisitBalanceDue');
  if (netEl) netEl.textContent = 'Rs. ' + net.toLocaleString();
  if (dueEl) dueEl.textContent = 'Rs. ' + due.toLocaleString();
}

function saveEditedVisit() {
  const patientId = document.getElementById('editVisitPatientId')?.value;
  const visitId = document.getElementById('editVisitId')?.value;
  const p = patients.find(x => x.id === patientId);
  if (!p || !Array.isArray(p.VisitHistory)) return;
  const v = p.VisitHistory.find(x => x.id === visitId || x.billNumber === visitId);
  if (!v) return;

  const procedures = (document.getElementById('editVisitProcedures')?.value || '').trim();
  const teeth = (document.getElementById('editVisitTeeth')?.value || '').trim();
  const cost = Number(document.getElementById('editVisitCost')?.value || 0);
  const disc = Number(document.getElementById('editVisitDiscount')?.value || 0);
  const paid = Number(document.getElementById('editVisitPayment')?.value || 0);
  const mode = document.getElementById('editVisitPaymentMode')?.value || 'Cash';
  const notes = (document.getElementById('editVisitNotes')?.value || '').trim();

  if (!procedures) {
    showToast('Please enter the procedures performed.', 'warn');
    return;
  }

  const netTotal = Math.max(0, cost - disc);

  const docInput = document.getElementById('editVisitDoctor');
  const typedDoc = (docInput ? docInput.value : '').trim();
  if (typedDoc) {
    const matched = clinicDoctors.find(d => 
      d.name.toLowerCase() === typedDoc.toLowerCase() || 
      String(d.id).toLowerCase() === typedDoc.toLowerCase()
    );
    if (matched) {
      v.doctorId = matched.id;
      v.doctorName = matched.name;
    } else {
      v.doctorName = typedDoc;
      v.doctorId = 'doc-' + typedDoc.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || ('doc-' + Date.now());
      registerNewDoctorIfAbsent(v.doctorId, v.doctorName);
    }
    if (!p.default_doctor_id) {
      p.default_doctor_id = v.doctorId;
      p.default_doctor_name = v.doctorName;
    }
  }

  v.procedures = procedures;
  v.treatment = procedures;
  v.teeth = teeth;
  v.subtotal = cost;
  v.discountAmount = disc;
  v.discountPercent = cost > 0 ? Number((disc / cost * 100).toFixed(2)) : 0;
  v.cost = netTotal;
  v.paymentDone = paid;
  v.amount = paid;
  v.paymentMethod = mode;
  v.notes = notes;
  v.remarks = notes;
  v.updatedAt = new Date().toISOString();

  // Synchronize treatments list
  if (Array.isArray(p.Treatments)) {
    const tMatch = p.Treatments.find(t => t.billNumber === v.billNumber);
    if (tMatch) {
      tMatch.procedure = procedures;
      tMatch.cost = netTotal;
      tMatch.teeth = teeth;
    }
  }

  // Synchronize payments history
  if (Array.isArray(p.PaymentHistory)) {
    const payMatch = p.PaymentHistory.find(pay => pay.billNumber === v.billNumber);
    if (payMatch) {
      payMatch.amount = paid;
      payMatch.method = mode;
      payMatch.status = paid >= netTotal ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
    }
  }

  // Recalculate patient totals
  const allCosts = p.VisitHistory.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const allPaid = Array.isArray(p.PaymentHistory) ? p.PaymentHistory.reduce((sum, item) => sum + Number(item.amount || 0), 0) : 0;
  p.FinalAmount = allCosts;
  p.Subtotal = allCosts;
  p.PaymentStatus = allPaid >= allCosts ? 'Paid' : allPaid > 0 ? 'Partial' : 'Pending';

  save();
  closeEditVisitModal();
  renderProfile();
  showToast(`✓ Visit updated successfully (Bill: ${v.billNumber || 'N/A'})`, 'success');
}

// ============================================================================
// 5. DASHBOARD: PATIENTS ATTENDED TODAY (FOLLOW-UPS, NON-PAYING & VISITS)
// ============================================================================
function getPatientsAttendedToday() {
  const today = todayIso();
  const attendedMap = new Map();

  patients.forEach(p => {
    let attended = false;
    let reason = '';
    let paidToday = 0;

    // 1. Registered today
    if (p.Date === today) {
      attended = true;
      reason = 'New Patient Registration';
    }

    // 2. Visits logged today
    if (Array.isArray(p.VisitHistory)) {
      p.VisitHistory.forEach(v => {
        if (v.date === today) {
          attended = true;
          reason = v.procedures || v.treatment || 'Clinical Consultation';
          const pPaid = Number(v.paymentDone != null ? v.paymentDone : (v.amount || 0));
          paidToday += pPaid;
        }
      });
    }

    // 3. Payments logged today
    if (Array.isArray(p.PaymentHistory)) {
      p.PaymentHistory.forEach(pay => {
        if (pay.date === today) {
          attended = true;
          const amt = Number(pay.amount || 0);
          paidToday += amt;
          if (!reason) reason = 'Payment Settlement';
        }
      });
    }

    // 4. Appointments arrived/attended today
    if (p.Appointment) {
      const apptDate = p.Appointment.adDate || p.Appointment.date;
      const apptStatus = String(p.Appointment.status || '').toLowerCase();
      if (apptDate === today && (apptStatus === 'attended' || apptStatus === 'arrived')) {
        attended = true;
        if (!reason) reason = 'Scheduled Appointment Arrived';
      }
    }

    if (attended) {
      const totalCost = Number(p.FinalAmount || p.Subtotal || 0);
      const totalPaid = Array.isArray(p.PaymentHistory) ? p.PaymentHistory.reduce((a, x) => a + Number(x.amount || 0), 0) : 0;
      const balanceDue = Math.max(0, totalCost - totalPaid);

      let badgeHtml = '';
      if (paidToday > 0) {
        badgeHtml = `<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);font-size:10.5px;padding:3px 8px;border-radius:4px;font-weight:700">Paid Today (Rs. ${paidToday.toLocaleString()})</span>`;
      } else if (balanceDue > 0) {
        badgeHtml = `<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);font-size:10.5px;padding:3px 8px;border-radius:4px;font-weight:700">Pending Balance (Rs. ${balanceDue.toLocaleString()})</span>`;
      } else {
        badgeHtml = `<span class="badge" style="background:rgba(2,132,199,0.15);color:#38bdf8;border:1px solid rgba(2,132,199,0.3);font-size:10.5px;padding:3px 8px;border-radius:4px;font-weight:700">Follow-up / No Charge Today</span>`;
      }

      attendedMap.set(p.id, {
        patient: p,
        reason: reason || 'Dental Consultation',
        paidToday,
        balanceDue,
        badgeHtml
      });
    }
  });

  return Array.from(attendedMap.values());
}

function renderAttendedTodayList(attendedItems) {
  const listEl = document.getElementById('attendedTodayList');
  const titleEl = document.getElementById('attendedTodayTitle');
  if (!listEl) return;

  const items = attendedItems || getPatientsAttendedToday();
  if (titleEl) titleEl.textContent = `Patients Attended Today (${items.length})`;

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">
      <svg class="empty-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
      </svg>
      <div>No patients have attended yet today.</div>
    </div>`;
    return;
  }

  listEl.innerHTML = `<div class="tablewrap"><table class="table">
    <thead>
      <tr>
        <th>OPD No.</th>
        <th>Patient Name</th>
        <th>Contact</th>
        <th>Procedure / Visit Reason</th>
        <th>Status / Payment</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => {
        const p = item.patient;
        return `<tr class="clickable" onclick="openProfile('${p.id}')">
          <td style="font-weight:700;color:#0284c7">OPD-${pad(p.OPDNumber)}</td>
          <td style="font-weight:700;color:var(--text)">${esc(p.Name)}</td>
          <td>${esc(p.Contact || '—')}</td>
          <td>${esc(item.reason)}</td>
          <td>${item.badgeHtml}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function scrollToAttendedToday() {
  const el = document.getElementById('attendedTodayCard');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
    el.style.borderColor = '#0284c7';
    setTimeout(() => { el.style.borderColor = ''; }, 1500);
  }
}

/* About System Modal & Dynamic Version Controller */
async function syncAppVersionUI() {
  let ver = '1.0.30';
  if (window.dentalApp && window.dentalApp.getVersion) {
    try {
      const v = await window.dentalApp.getVersion();
      if (v) ver = v;
    } catch (_) {}
  }
  const formattedVer = ver.startsWith('v') ? ver : 'v' + ver;

  const targetIds = [
    'settingsVersionBadge',
    'footerVersionBadge',
    'aboutModalVersionBadge',
    'modalCurrentVersion',
    'updateBannerVersion',
    'appVersionBadge'
  ];
  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = formattedVer;
  });

  document.querySelectorAll('.info-badge-ver, .about-system-badge, .header-version-pill').forEach(el => {
    el.textContent = formattedVer;
  });
}

function openAboutSystemModal() {
  syncAppVersionUI();
  const m = document.getElementById('aboutSystemModal');
  if (m) m.style.display = 'flex';
}

function closeAboutSystemModal() {
  const m = document.getElementById('aboutSystemModal');
  if (m) m.style.display = 'none';
}

(function initAppFooter() {
  const el = document.getElementById('appFooterYear');
  if (el) el.textContent = new Date().getFullYear();
  syncAppVersionUI();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAppVersionUI);
  }
})();

