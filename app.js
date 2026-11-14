const KEY='infinity_dental_patients_v1';
const DB_NAME='InfinityDentalClinicStorage';
const DB_STORE='settings';
let patients=JSON.parse(localStorage.getItem(KEY)||'[]'); let selectedId=null;
let dataDirectoryHandle=null;
let dataFolderName='Browser Storage';

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
    .catch(() => {});
}

function save(){
  localStorage.setItem(KEY,JSON.stringify(patients));
  updateAll();
  if(window.dentalDB?.save) {
    window.dentalDB.save(patients).catch(err=>console.warn('SQLite save failed:',err));
  } else {
    fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patients)
    }).catch(err=>console.warn('Localhost SQLite API save error:',err.message));
  }
  if(dataDirectoryHandle) savePatientsToFolder().catch(err=>console.warn('Folder save failed:',err));
}

function openSettingsDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function storeDirectoryHandle(handle){try{const db=await openSettingsDB();await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(handle,'dataDirectory');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}catch(e){console.warn('Could not remember data folder',e)}}
async function getStoredDirectoryHandle(){try{const db=await openSettingsDB();const h=await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readonly');const q=tx.objectStore(DB_STORE).get('dataDirectory');q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)});db.close();return h}catch(e){return null}}
async function ensureFolderPermission(handle){if(!handle)return false;try{let p=await handle.queryPermission({mode:'readwrite'});if(p!=='granted')p=await handle.requestPermission({mode:'readwrite'});return p==='granted'}catch(e){return false}}
async function savePatientsToFolder(){
  if(!dataDirectoryHandle)return;
  const ok=await ensureFolderPermission(dataDirectoryHandle); if(!ok)return;
  const file=await dataDirectoryHandle.getFileHandle('patients.json',{create:true});
  const writable=await file.createWritable();
  await writable.write(JSON.stringify(patients,null,2)); await writable.close();
  const backups=await dataDirectoryHandle.getDirectoryHandle('Backups',{create:true});
  const backup=await backups.getFileHandle('patients_latest.json',{create:true});
  const bw=await backup.createWritable(); await bw.write(JSON.stringify(patients,null,2)); await bw.close();
}
async function loadPatientsFromFolder(handle){
  const ok=await ensureFolderPermission(handle); if(!ok)throw new Error('Folder permission was not granted.');
  try{const file=await handle.getFileHandle('patients.json');const f=await file.getFile();const text=await f.text();const data=JSON.parse(text);if(Array.isArray(data))patients=data;}
  catch(e){await savePatientsToFolder();}
  localStorage.setItem(KEY,JSON.stringify(patients));
}
async function selectDataFolder(){
  if(!window.showDirectoryPicker){alert('Folder selection requires Google Chrome or Microsoft Edge. Please use one of these browsers.');return}
  try{
    const handle=await window.showDirectoryPicker({mode:'readwrite'});
    const ok=await ensureFolderPermission(handle); if(!ok){alert('Permission to use this folder was not granted.');return}
    dataDirectoryHandle=handle; dataFolderName=handle.name||'Selected Folder';
    await storeDirectoryHandle(handle);
    await loadPatientsFromFolder(handle);
    updateDataFolderStatus(); updateAll(); renderProfile();
    alert('Patient database is now connected to: '+dataFolderName+'\n\nA patients.json file and Backups folder will be kept there.');
  }catch(e){if(e?.name!=='AbortError')alert('Could not connect the folder.\n'+e.message)}
}
async function reconnectStoredDataFolder(){
  const h=await getStoredDirectoryHandle(); if(!h)return;
  dataDirectoryHandle=h; dataFolderName=h.name||'Selected Folder';
  if(await ensureFolderPermission(h)){try{await loadPatientsFromFolder(h)}catch(e){console.warn(e)}}
  updateDataFolderStatus(); updateAll(); renderProfile();
}
function updateDataFolderStatus(){const el=document.getElementById('dataFolderStatus');if(el)el.textContent=dataDirectoryHandle?'Database folder: '+dataFolderName:'Database: Browser storage (select a local folder)'}

function nextNumber(){return Math.max(1000,patients.filter(p=>!p.AppointmentOnly).reduce((m,p)=>Math.max(m,Number(p.OPDNumber)||0),0))+1}
function registeredPatients(){return patients.filter(p=>!p.AppointmentOnly)}
function pad(n){return String(n).padStart(4,'0')}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function registerPatient(){const name=document.getElementById('name').value.trim();const contact=document.getElementById('contact').value.trim();const gender=document.getElementById('gender').value;if(!name){alert('Please enter the patient name.');document.getElementById('name').focus();return}if(!contact){alert('Please enter the contact number.');document.getElementById('contact').focus();return}if(!gender){alert('Please select gender.');document.getElementById('gender').focus();return}const now=new Date();const p={id:crypto.randomUUID(),OPDNumber:nextNumber(),Name:name,Address:document.getElementById('address').value.trim(),Age:document.getElementById('age').value.trim(),Gender:gender,Contact:contact,Date:now.toISOString().slice(0,10),Time:now.toTimeString().slice(0,8),Treatments:[],Subtotal:0,DiscountPercent:0,DiscountAmount:0,FinalAmount:0,PaymentStatus:'Pending',PaymentMethod:'',BillNumber:'',Documents:[],VisitHistory:[],PaymentHistory:[]};patients.push(p);save();clearForm();selectedId=p.id;showPage('profile');renderProfile();localStorage.removeItem('infinity_dental_registration_draft_v1');alert('Patient registered successfully. OPD Number: '+pad(p.OPDNumber))}
function clearForm(){['name','contact','address','age'].forEach(id=>document.getElementById(id).value='');document.getElementById('gender').value=''}
function saveRegistrationDraft(){}
function loadRegistrationDraft(){}
function savePageInputs(){}
function saveVisitInputs(){}
function loadVisitDraft(){}
function renderPatients(){const q=(document.getElementById('search')?.value||'').trim().toLowerCase();const list=registeredPatients().filter(p=>!q||[p.OPDNumber,p.Name,p.Contact].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>b.OPDNumber-a.OPDNumber);document.getElementById('patientRows').innerHTML=list.length?list.map(p=>`<tr class="clickable" onclick="openProfile('${p.id}')"><td>${pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact)}</td><td>${esc(p.Date)}</td><td>${esc(p.PaymentStatus||'Pending')}</td></tr>`).join(''):`<tr><td colspan="5" class="empty">No patients found.</td></tr>`}
function openProfile(id){selectedId=id;const recent=JSON.parse(localStorage.getItem('infinity_dental_recent_patients_v1')||'[]').filter(x=>x!==id);recent.unshift(id);localStorage.setItem('infinity_dental_recent_patients_v1',JSON.stringify(recent.slice(0,8)));showPage('profile');renderProfile()}
let PROCEDURES=[];
function priceText(x){
  if(x.price!=null)return 'Rs. '+Number(x.price).toLocaleString()+(x.unit?' '+x.unit:'');
  if(x.min!=null&&x.max!=null)return 'Rs. '+Number(x.min).toLocaleString()+' – '+Number(x.max).toLocaleString();
  return 'Enter price';
}
function procedureDefault(x){return Number(x.price!=null?x.price:(x.min!=null?x.min:0))}
async function loadPriceList(){
  if(window.dentalDB?.loadPrices){
    try{const data=await window.dentalDB.loadPrices();if(Array.isArray(data))PROCEDURES=data;}catch(e){console.warn('Price list load failed:',e)}
  } else {
    try {
      const res = await fetch('/api/prices');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) PROCEDURES = json.data;
      }
    } catch(e) {
      console.warn('Price API load error:', e);
    }
  }
  if(!PROCEDURES.length)PROCEDURES=[{name:'OPD Card',price:100}];
}
function renderProcedureOptions(){return PROCEDURES.map((x,i)=>`<option value="${i}" data-cost="${procedureDefault(x)}" data-min="${x.min??''}" data-max="${x.max??''}">${esc(x.name)} — ${esc(priceText(x))}</option>`).join('')}
function addCustomProcedure(){const name=prompt('Enter custom procedure name:');if(!name||!name.trim())return;const raw=prompt('Enter custom price (Rs.):');if(raw===null)return;const cost=Number(raw);if(!Number.isFinite(cost)||cost<=0){alert('Please enter a valid price.');return}pendingProcedures.push({procedure:name.trim(),cost});renderPendingProcedures()}
function ensurePatientArrays(p){p.VisitHistory=p.VisitHistory||[];p.PaymentHistory=p.PaymentHistory||[];p.Documents=p.Documents||[];p.Treatments=p.Treatments||[]}
let pendingProcedures=[];
function addPendingProcedure(){const sel=document.getElementById('visitProcedure');const opt=sel.options[sel.selectedIndex];if(!opt||!opt.value){alert('Please select a procedure first.');return}const item=PROCEDURES[Number(opt.value)];const cost=Number(document.getElementById('visitCost')?.value)||0;if(!item||cost<=0){alert('Please enter a valid treatment amount.');return}pendingProcedures.push({procedure:item.name,cost});renderPendingProcedures();sel.value='';document.getElementById('visitCost').value='0'}
function removePendingProcedure(i){pendingProcedures.splice(i,1);renderPendingProcedures()}
function renderPendingProcedures(){const box=document.getElementById('pendingProcedures'),btn=document.getElementById('addVisitBtn'),hint=document.getElementById('visitHint');if(!box)return;const total=pendingProcedures.reduce((a,x)=>a+x.cost,0);box.innerHTML=pendingProcedures.length?`<table class="mini-table"><thead><tr><th>Procedure</th><th>Cost</th><th></th></tr></thead><tbody>${pendingProcedures.map((x,i)=>`<tr><td>${esc(x.procedure)}</td><td>Rs. ${x.cost.toLocaleString()}</td><td><button class="btn danger" onclick="removePendingProcedure(${i})">REMOVE</button></td></tr>`).join('')}</tbody><tfoot><tr><th>Total</th><th>Rs. ${total.toLocaleString()}</th><th></th></tr></tfoot></table>`:'<div class="muted">No procedures added yet. Add one or more procedures above.</div>';if(btn)btn.disabled=!pendingProcedures.length;if(hint)hint.textContent=pendingProcedures.length?'Ready to add visit.':'Add at least one procedure to enable Add Visit.';updatePaymentChoice();}
function getVisitSubtotal(){return pendingProcedures.reduce((a,x)=>a+Number(x.cost||0),0)}
function updateDiscountFromPercent(){const subtotal=getVisitSubtotal();const pct=Math.max(0,Math.min(100,Number(document.getElementById('discountPercent')?.value)||0));const amt=subtotal*pct/100;const a=document.getElementById('discountAmount');if(a)a.value=amt.toFixed(2);updatePaymentChoice()}
function updateDiscountFromAmount(){const subtotal=getVisitSubtotal();const amt=Math.max(0,Math.min(subtotal,Number(document.getElementById('discountAmount')?.value)||0));const pct=subtotal?amt/subtotal*100:0;const p=document.getElementById('discountPercent');if(p)p.value=pct.toFixed(2);updatePaymentChoice()}
function updatePaymentChoice(){const subtotal=getVisitSubtotal();const discount=Math.max(0,Math.min(subtotal,Number(document.getElementById('discountAmount')?.value)||0));const total=Math.max(0,subtotal-discount);const choice=document.querySelector('input[name=paymentType]:checked')?.value||'total';const paidEl=document.getElementById('visitPaid');const hint=document.getElementById('paymentHint');const totalEl=document.getElementById('discountedTotal');if(totalEl)totalEl.textContent='Rs. '+total.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});if(!paidEl)return;if(choice==='total'){paidEl.value=total.toFixed(2);paidEl.readOnly=true;paidEl.placeholder='Total amount';if(hint)hint.textContent='Total payment selected — discounted final amount is filled automatically.';}else{paidEl.readOnly=false;paidEl.placeholder='Enter partial amount';if(hint)hint.textContent='Partial payment selected — enter the amount paid manually (up to Rs. '+total.toLocaleString()+').';}}
function addVisit(){
 const p=patients.find(x=>x.id===selectedId);if(!p)return;ensurePatientArrays(p);
 if(!pendingProcedures.length){alert('Please add at least one procedure before adding a visit.');return}
 const subtotal=getVisitSubtotal(),discountAmount=Math.max(0,Math.min(subtotal,Number(document.getElementById('discountAmount')?.value)||0)),discountPercent=subtotal?discountAmount/subtotal*100:0,total=Math.max(0,subtotal-discountAmount),choice=document.querySelector('input[name=paymentType]:checked')?.value||'total';
 if(choice==='total')document.getElementById('visitPaid').value=total.toFixed(2);
 const paid=Number(document.getElementById('visitPaid').value)||0;
 if(paid<0||paid>total){alert('Payment amount cannot be more than the final total of Rs. '+total.toLocaleString()+'.');return}
 const mode=document.getElementById('visitPaymentMode').value;
 if(!mode){alert('Please select a payment mode: Cash, NepalPay QR or MPOS.');return}
 const now=new Date(),date=now.toISOString().slice(0,10),time=now.toTimeString().slice(0,8);
 const visitNo=(p.VisitHistory.length||0)+1;
 const billNo='B-'+date.replaceAll('-','')+'-'+pad(p.OPDNumber)+'-'+String(visitNo).padStart(3,'0');
 const procNames=pendingProcedures.map(x=>x.procedure).join(', ');

 function completeSaveVisit(payMethod, payDone, txnId){
   const visit={id:crypto.randomUUID(),date,time,procedures:procNames,paymentDone:payDone,amount:payDone,paymentMethod:payMethod,txnId:txnId||'',subtotal,discountPercent:Number(discountPercent.toFixed(2)),discountAmount:Number(discountAmount.toFixed(2)),cost:total,billNumber:billNo,procedureItems:pendingProcedures.map(x=>({procedure:x.procedure,cost:x.cost}))};
   p.VisitHistory.unshift(visit);
   pendingProcedures.forEach(x=>p.Treatments.push({procedure:x.procedure,cost:x.cost,date,time,billNumber:billNo}));
   p.PaymentHistory.unshift({date,time,billNumber:billNo,amount:payDone,method:payMethod,txnId:txnId||'',status:payDone>=total?'Paid':payDone>0?'Partial':'Pending'});
   p.PaymentStatus=payDone>=total?'Paid':payDone>0?'Partial':'Pending';p.PaymentMethod=payMethod;
   p.Subtotal=(Number(p.Subtotal)||0)+subtotal;p.FinalAmount=(Number(p.FinalAmount)||0)+total;
   pendingProcedures=[];save();renderProfile();
   if(confirm('Visit saved. Bill No. '+billNo+'\n\nWould you like to print this bill now?')) printBill(billNo);
 }

 if((mode==='NepalPay QR'||mode==='Scan') && paid>0){
   openNepalPayModal({
     amount: paid,
     billNumber: billNo,
     patientName: p.Name,
     patientContact: p.Contact,
     opdNumber: p.OPDNumber,
     remarks: procNames.slice(0, 30),
     onSuccess: (eventData)=>{
       completeSaveVisit('NepalPay QR', paid, eventData.txnId);
     }
   });
 } else {
   completeSaveVisit(mode, paid);
 }
}
function findBillForPatient(billNo){
 const p=patients.find(x=>x.id===selectedId);if(!p)return null;ensurePatientArrays(p);
 const v=p.VisitHistory.find(x=>x.billNumber===billNo)||p.VisitHistory[0];if(!v)return null;
 return {p,v};
}
function code39Svg(value){
 const patterns={"0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn","A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn","K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn","U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"};
 const text='*'+String(value).toUpperCase().replace(/[^0-9A-Z.\- $/+%]/g,'')+'*';let x=4,bars='';for(const ch of text){const pat=patterns[ch]||patterns['0'];for(let i=0;i<pat.length;i++){const wide=pat[i]==='w',w=wide?3:1;const black=i%2===0;bars+=`<rect x="${x}" y="8" width="${w}" height="58" fill="${black?'#111':'white'}"/>`;x+=w}x+=1}return `<svg xmlns="http://www.w3.org/2000/svg" width="${x+4}" height="86" viewBox="0 0 ${x+4} 86" aria-label="Barcode ${esc(value)}">${bars}<text x="${(x+4)/2}" y="82" text-anchor="middle" font-family="Arial" font-size="12">${esc(value)}</text></svg>`;
}
async function printSticker(){
 const p=patients.find(x=>x.id===selectedId);if(!p){alert('No patient selected.');return}
 const w=window.open('','_blank','width=620,height=420');if(!w){alert('Please allow pop-ups to preview the sticker.');return}
 const logoUrl = clinicLogoDataUrl || (location.href.substring(0,location.href.lastIndexOf('/')+1)+'assets/clinic-logo.png');
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
 </style></head><body><div class="sticker"><div class="head"><img class="logo" src="${logoUrl}" onerror="this.style.display='none'"><div class="clinic">INFINITY DENTAL CLINIC<br><small>Endless Care, Beautiful Smiles</small></div></div><div class="details"><div><b>Name</b><span>: ${esc(p.Name)}</span></div><div><b>Age/Gender</b><span>: ${esc(p.Age||'—')} / ${esc(p.Gender||'—')}</span></div><div><b>Address</b><span>: ${esc(p.Address||'—')}</span></div><div><b>Phone</b><span>: ${esc(p.Contact||'—')}</span></div><div><b>OPD No.</b><span>: OPD-${pad(p.OPDNumber)}</span></div></div><div class="barcode">${code39Svg('OPD-'+pad(p.OPDNumber))}</div></div><button class="print" onclick="window.print()">PRINT STICKER</button></body></html>`);w.document.close();w.focus();
}
function printBill(billNo){
 const found=findBillForPatient(billNo);if(!found){alert('No bill found for this patient.');return}
 const {p,v}=found,items=v.procedureItems||String(v.procedures||'').split(', ').map(name=>({procedure:name,cost:0}));
 const subtotal=Number(v.subtotal||v.cost||items.reduce((a,x)=>a+Number(x.cost||0),0));
 const discountAmount=Number(v.discountAmount||0),discountPercent=Number(v.discountPercent||0);
 const showDiscount=discountAmount>0;
 const total=Math.max(0,subtotal-discountAmount);
 const paid=Number(v.paymentDone||v.amount||0),due=Math.max(0,total-paid);
 const billWindow=window.open('','_blank','width=820,height=1000');if(!billWindow){alert('Please allow pop-ups to print the bill.');return}
 const rows=items.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.procedure)}</td><td>1</td><td>${Number(x.cost||0).toLocaleString()}</td><td>${Number(x.cost||0).toLocaleString()}</td></tr>`).join('');
 const billLogoUrl = clinicLogoDataUrl || (location.href.substring(0,location.href.lastIndexOf('/')+1)+'assets/clinic-logo.png');
 billWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Patient Bill - ${esc(v.billNumber||'')}</title><style>
 @page{size:A5 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:10.5pt;line-height:1.35}.bill{width:100%}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1.5px solid #111;padding-bottom:8px}.logo{width:120px;height:auto;filter:grayscale(1)}.clinic{text-align:right}.clinic h1{font-size:19pt;margin:0 0 2px;letter-spacing:.5px}.clinic .slogan{font-size:9.5pt}.bill-title{text-align:center;font-size:17pt;font-weight:700;margin:12px 0 9px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.box{border:1px solid #222;padding:7px}.line{display:flex;justify-content:space-between;gap:10px;margin:2px 0}.label{font-weight:700}.table{width:100%;border-collapse:collapse;margin-top:8px}.table th,.table td{border:1px solid #222;padding:5px 4px}.table th{font-weight:700;text-align:center}.table td:nth-child(1),.table td:nth-child(3){text-align:center}.table td:nth-child(4),.table td:nth-child(5){text-align:right}.total td{font-weight:700}.payment{margin-top:10px;border-top:1px solid #111;padding-top:8px}.payment-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 20px}.thank{text-align:center;border-top:1px solid #111;margin-top:14px;padding-top:10px;font-size:13pt;font-weight:700}.thank small{display:block;font-size:9.5pt;font-weight:400;margin-top:2px}.print-actions{text-align:center;margin:10px 0}@media print{.print-actions{display:none}}
 </style></head><body><div class="bill"><div class="top"><img class="logo" src="${billLogoUrl}"><div class="clinic"><h1>INFINITY DENTAL CLINIC</h1><div class="slogan">Endless Care, Beautiful Smiles</div></div></div>
 <div class="bill-title">PATIENT BILL</div><div class="meta"><div class="box"><div class="line"><span class="label">Patient Name</span><span>${esc(p.Name)}</span></div><div class="line"><span class="label">Contact</span><span>${esc(p.Contact||'—')}</span></div><div class="line"><span class="label">Age / Gender</span><span>${esc(p.Age||'—')} / ${esc(p.Gender||'—')}</span></div></div><div class="box"><div class="line"><span class="label">Bill No.</span><span>${esc(v.billNumber||'—')}</span></div><div class="line"><span class="label">OPD No.</span><span>OPD-${pad(p.OPDNumber)}</span></div><div class="line"><span class="label">Date</span><span>${esc(v.date||'—')}</span></div><div class="line"><span class="label">Time</span><span>${esc(v.time||'—')}</span></div></div></div>
 <table class="table"><thead><tr><th>S.N.</th><th>Procedure / Treatment</th><th>Qty</th><th>Rate (NPR)</th><th>Amount (NPR)</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4" style="text-align:right">Subtotal (NPR)</td><td>${subtotal.toLocaleString()}</td></tr>${showDiscount?`<tr><td colspan="4" style="text-align:right">Discount ${discountPercent?`(${discountPercent.toFixed(2)}%)`:``}</td><td>- ${discountAmount.toLocaleString()}</td></tr>`:``}<tr class="total"><td colspan="4" style="text-align:right">${showDiscount?'Total After Discount':'Total'} (NPR)</td><td>${total.toLocaleString()}</td></tr></tfoot></table>
 <div class="payment"><div class="payment-grid"><div><span class="label">Payment Method:</span> ${esc(v.paymentMethod||'—')}</div><div><span class="label">Amount Paid:</span> NPR ${paid.toLocaleString()}</div><div><span class="label">Payment Status:</span> ${paid>=total?'Paid':paid>0?'Partial':'Pending'}</div><div><span class="label">Balance Due:</span> NPR ${due.toLocaleString()}</div></div></div>
 <div class="thank">Thank You!<small>Endless Care, Beautiful Smiles</small></div><div class="print-actions"><button onclick="window.print()">PRINT</button></div></div></body></html>`);billWindow.document.close();billWindow.focus();setTimeout(()=>billWindow.print(),400);
}

function updateVisitCost(){const sel=document.getElementById('visitProcedure'),opt=sel?.options[sel.selectedIndex],cost=document.getElementById('visitCost');if(!cost)return;if(!opt||!opt.value){cost.value='0';cost.placeholder='Enter amount';return}cost.value=opt.dataset.cost||0;cost.placeholder='Actual amount charged'}
function updateAppointmentAd(){const out=document.getElementById('appointmentAdDate'),ad=document.getElementById('appointmentAdDateHidden')?.value||'';if(!out)return;if(ad){out.textContent='English (AD): '+ad}else{out.textContent='English date will appear here'}}
function initNepaliAppointmentPicker(p){const el=document.getElementById('appointmentBsDate');if(!el||!window.NepaliFunctions)return;try{if(el._ndpReady)return;el.nepaliDatePicker({dateFormat:'YYYY-MM-DD',unicodeDate:false,readOnlyInput:true,ndpEnglishInput:'appointmentAdDateHidden',ndpTriggerButton:true,ndpTriggerButtonText:'📅',ndpYear:true,ndpMonth:true,onChange:function(){updateAppointmentAd()}});el._ndpReady=true;if(p&&p.Appointment&&p.Appointment.bsDate){el.value=p.Appointment.bsDate;try{document.getElementById('appointmentAdDateHidden').value= p.Appointment.adDate||NepaliFunctions.BS2AD(p.Appointment.bsDate)}catch(e){}}updateAppointmentAd()}catch(e){console.warn('Nepali datepicker init failed',e)}}
function setTodayBsAppointment(){if(window.NepaliFunctions){const x=NepaliFunctions.GetCurrentBsDate();document.getElementById('appointmentBsDate').value=x.year+'-'+String(x.month).padStart(2,'0')+'-'+String(x.date).padStart(2,'0');try{document.getElementById('appointmentAdDateHidden').value=NepaliFunctions.BS2AD(document.getElementById('appointmentBsDate').value)}catch(e){}updateAppointmentAd()}else{alert('Nepali calendar could not be loaded.')}}
function saveAppointment(){const p=patients.find(x=>x.id===selectedId);if(!p)return;const bs=(document.getElementById('appointmentBsDate').value||'').trim(),ad=(document.getElementById('appointmentAdDateHidden')?.value||'').trim(),t=document.getElementById('appointmentTime').value;if(!bs||!t){alert('Please select appointment date and time.');return}if(!ad){alert('Please select the appointment date from the Nepali calendar.');return}p.Appointment={bsDate:bs,adDate:ad,time:t,status:'scheduled'};save();alert('Appointment saved for BS '+bs+' ('+ad+') at '+t);renderProfile()}
// --- Patient Pictures, Photos, Dental X-Rays & Scanned Documents ---
function uploadPatientDocument(input){
  const p=patients.find(x=>x.id===selectedId);
  if(!p||!input.files.length)return;
  ensurePatientArrays(p);

  const files=Array.from(input.files);
  let processed=0;

  files.forEach(file=>{
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|tif|tiff)$/i.test(file.name);
    const isPdf = file.type==='application/pdf' || /\.pdf$/i.test(file.name);

    if(!isImage && !isPdf){
      alert(`File "${file.name}" is not supported.\nPlease select an image (JPG, PNG, WEBP, BMP) or a PDF document.`);
      return;
    }

    if(file.size > 20*1024*1024){
      alert(`File "${file.name}" is larger than 20MB. Please select a smaller photo or PDF.`);
      return;
    }

    const reader=new FileReader();
    reader.onload=()=>{
      p.Documents.unshift({
        name: file.name,
        size: file.size,
        type: file.type || (isImage?'image/jpeg':'application/pdf'),
        isImage: isImage,
        data: reader.result,
        date: new Date().toISOString()
      });
      processed++;
      if(processed===files.length){
        save();
        renderProfile();
      }
    };
    reader.readAsDataURL(file);
  });
  input.value='';
}

// Backward-compatible alias
function uploadPatientPdf(input){ uploadPatientDocument(input); }

function openPatientDocument(index){
  const p=patients.find(x=>x.id===selectedId);
  const d=p?.Documents?.[index];
  if(!d)return;
  const isImg = d.isImage || d.type?.startsWith('image/') || String(d.data||'').startsWith('data:image/');
  if(isImg){
    openImageViewer(d.name, d.data);
  } else {
    const w=window.open();
    if(w){
      w.document.write(`<title>${esc(d.name)}</title><iframe src="${d.data}" style="width:100%;height:100vh;border:0"></iframe>`);
      w.document.close();
    }
  }
}
function openPatientPdf(index){ openPatientDocument(index); }

function downloadPatientDocument(index){
  const p=patients.find(x=>x.id===selectedId);
  const d=p?.Documents?.[index];
  if(!d||!d.data)return;
  const a=document.createElement('a');
  a.href=d.data;
  a.download=d.name||'patient-document';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function deletePatientDocument(index){
  const p=patients.find(x=>x.id===selectedId);
  if(!p)return;
  const d=p.Documents?.[index];
  const typeName=(d?.isImage || d?.type?.startsWith('image/'))?'picture / X-ray':'scanned document';
  if(confirm(`Remove this ${typeName} from the patient record?`)){
    p.Documents.splice(index,1);
    save();
    renderProfile();
  }
}
function deletePatientPdf(index){ deletePatientDocument(index); }

// --- Lightbox High-Resolution Viewer for Dental Photos & Radiographs ---
let activeLightboxImage = null;
let activeImageScale = 1;
let activeImageRotation = 0;

function openImageViewer(name, dataUrl){
  activeLightboxImage = { name, dataUrl };
  activeImageScale = 1;
  activeImageRotation = 0;
  const modal = document.getElementById('imageLightboxModal');
  const img = document.getElementById('lightboxImg');
  const title = document.getElementById('lightboxTitle');
  if(title) title.textContent = name || 'Dental Picture / X-Ray Viewer';
  if(img){
    img.src = dataUrl;
    applyImageTransform();
  }
  if(modal) modal.classList.add('active');
}

function closeImageViewer(){
  const modal = document.getElementById('imageLightboxModal');
  if(modal) modal.classList.remove('active');
  const img = document.getElementById('lightboxImg');
  if(img) img.src = '';
  activeLightboxImage = null;
}

function zoomImage(delta){
  activeImageScale = Math.max(0.2, Math.min(5, activeImageScale + delta));
  applyImageTransform();
}

function rotateImage(deg){
  activeImageRotation = (activeImageRotation + deg) % 360;
  applyImageTransform();
}

function resetImageTransform(){
  activeImageScale = 1;
  activeImageRotation = 0;
  applyImageTransform();
}

function applyImageTransform(){
  const img = document.getElementById('lightboxImg');
  if(img){
    img.style.transform = `scale(${activeImageScale}) rotate(${activeImageRotation}deg)`;
  }
}

function printActiveImage(){
  if(!activeLightboxImage||!activeLightboxImage.dataUrl)return;
  const w=window.open('','_blank','width=850,height=900');
  if(!w){alert('Please allow pop-ups to print the picture.');return;}
  w.document.write(`<!doctype html><html><head><title>${esc(activeLightboxImage.name)}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff}img{max-width:95%;max-height:95vh;object-fit:contain}</style></head><body><img src="${activeLightboxImage.dataUrl}"><script>window.onload=function(){window.print();window.close();}<\/script></body></html>`);
  w.document.close();
}

function downloadActiveImage(){
  if(!activeLightboxImage||!activeLightboxImage.dataUrl)return;
  const a=document.createElement('a');
  a.href=activeLightboxImage.dataUrl;
  a.download=activeLightboxImage.name||'dental-photo.jpg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function setPaymentMode(mode){}
function editPatientInfo(){
 const p=patients.find(x=>x.id===selectedId); if(!p)return;
 const el=document.getElementById('profileContent');
 el.innerHTML=`<div class="card"><div class="profile-head"><div><div class="section-title">Edit Patient Information</div><span class="badge">OPD ${pad(p.OPDNumber)} (cannot be changed)</span></div><button class="btn secondary" onclick="renderProfile()">CANCEL</button></div>
 <div class="formgrid" style="margin-top:16px">
   <div class="field"><label>Patient Name</label><input id="editPatientName" type="text" value="${esc(p.Name||'')}"></div>
   <div class="field"><label>Contact Number</label><input id="editPatientContact" type="text" value="${esc(p.Contact||'')}"></div>
   <div class="field"><label>Age</label><input id="editPatientAge" type="text" value="${esc(p.Age||'')}"></div>
   <div class="field"><label>Gender</label><select id="editPatientGender"><option value="">Select Gender</option><option value="Male" ${p.Gender==='Male'?'selected':''}>Male</option><option value="Female" ${p.Gender==='Female'?'selected':''}>Female</option><option value="Other" ${p.Gender==='Other'?'selected':''}>Other</option></select></div>
   <div class="field" style="grid-column:1/-1"><label>Address</label><input id="editPatientAddress" type="text" value="${esc(p.Address||'')}"></div>
 </div>
 <div class="actions" style="margin-top:16px"><button class="btn primary" onclick="savePatientInfo()">SAVE CHANGES</button><button class="btn secondary" onclick="renderProfile()">CANCEL</button></div></div>`;
 document.getElementById('editPatientName')?.focus();
}
function savePatientInfo(){
 const p=patients.find(x=>x.id===selectedId); if(!p)return;
 const name=(document.getElementById('editPatientName')?.value||'').trim();
 const contact=(document.getElementById('editPatientContact')?.value||'').trim();
 const age=(document.getElementById('editPatientAge')?.value||'').trim();
 const gender=document.getElementById('editPatientGender')?.value||'';
 const address=(document.getElementById('editPatientAddress')?.value||'').trim();
 if(!name){alert('Please enter the patient name.');document.getElementById('editPatientName')?.focus();return}
 if(!contact){alert('Please enter the contact number.');document.getElementById('editPatientContact')?.focus();return}
 if(!gender){alert('Please select gender.');document.getElementById('editPatientGender')?.focus();return}
 p.Name=name;p.Contact=contact;p.Age=age;p.Gender=gender;p.Address=address;
 save();renderProfile();renderPatients();renderRecentPatients();alert('Patient information updated successfully.');
}
function renderProfile(){
 const p=patients.find(x=>x.id===selectedId);const el=document.getElementById('profileContent');
 if(!p){el.innerHTML='<div class="card empty">No patient selected.</div>';return}ensurePatientArrays(p);
 const visits=p.VisitHistory,pays=p.PaymentHistory,docs=p.Documents;
 el.innerHTML=`<div class="card"><div class="profile-head"><div><div class="section-title">${esc(p.Name)}</div><span class="badge">OPD ${pad(p.OPDNumber)}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" onclick="showPage('patients')">BACK TO PATIENTS</button><button class="btn secondary" onclick="editPatientInfo()">EDIT PATIENT INFO</button><button class="btn secondary" onclick="printSticker()">PRINT STICKER</button><button class="btn primary" onclick="printLatestBill()">PRINT BILL</button></div></div>
    <div class="profile-info-row"><div class="patient-details"><div class="section-title">Patient Details</div><div class="details-grid"><div><b>Name:</b> ${esc(p.Name)}</div><div><b>OPD No:</b> ${pad(p.OPDNumber)}</div><div><b>Contact:</b> ${esc(p.Contact)||'—'}</div><div><b>Age / Gender:</b> ${esc(p.Age)||'—'} / ${esc(p.Gender)||'—'}</div><div><b>Address:</b> ${esc(p.Address)||'—'}</div><div><b>Registered:</b> ${esc(p.Date)} ${esc(p.Time)}</div></div></div>
    <div class="documents-compact">
      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>Patient Pictures &amp; Documents</span>
        <span class="badge" style="font-size:10px;padding:2px 7px">${docs.length} ${docs.length===1?'file':'files'}</span>
      </div>
      <div class="muted" style="font-size:11px;margin-bottom:6px">X-Rays, dental photos, reports, or PDFs</div>
      <div class="doc-upload"><input type="file" multiple accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.bmp" onchange="uploadPatientDocument(this)"></div>
      ${docs.length?docs.map((d,i)=>{
        const isImg = d.isImage || d.type?.startsWith('image/') || String(d.data||'').startsWith('data:image/');
        return `
        <div class="doc-item">
          <div class="doc-left">
            ${isImg?`
              <img class="doc-thumb" src="${d.data}" onclick="openImageViewer('${esc(d.name)}','${d.data}')" title="Click to view full size photo" alt="Photo">
            `:`
              <div class="doc-pdf-icon">PDF</div>
            `}
            <div class="doc-meta">
              <span class="pill" style="${isImg?'background:#e0f2fe;color:#0369a1':'background:#fee2e2;color:#991b1b'}">${isImg?'📷 PHOTO / X-RAY':'📄 PDF'}</span>
              <b title="${esc(d.name)}">${esc(d.name)}</b>
              <div class="muted">${new Date(d.date).toLocaleString()} • ${(d.size/1024/1024).toFixed(2)} MB</div>
            </div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn secondary" style="padding:4px 8px;font-size:10px" onclick="openPatientDocument(${i})">VIEW</button>
            <button class="btn secondary" style="padding:4px 8px;font-size:10px" onclick="downloadPatientDocument(${i})" title="Download">⬇</button>
            <button class="btn danger" style="padding:4px 8px;font-size:10px" onclick="deletePatientDocument(${i})" title="Remove">✕</button>
          </div>
        </div>
        `;
      }).join(''):'<div class="muted" style="padding:8px 0;text-align:center">No pictures or documents uploaded yet.</div>'}
    </div>
  </div>
 <div class="grid2 profile-main-grid" style="margin-top:18px">
   <div class="card"><div class="section-title">Add Visit / Procedure</div><div class="muted" style="margin-bottom:10px"><b>Price List:</b> loaded from C:\Infiinity Dental Clinic\price-list.json. Select a treatment, then enter the actual amount charged if needed.</div><div class="procedure-row"><select id="visitProcedure" onchange="updateVisitCost()"><option value="">Select procedure</option>${renderProcedureOptions()}</select><input id="visitCost" type="number" min="0" step="0.01" value="0" title="Actual amount charged"><button class="btn secondary" onclick="addPendingProcedure()">ADD PROCEDURE</button><button class="btn secondary" onclick="addCustomProcedure()">CUSTOM PROCEDURE</button></div><div id="pendingProcedures" class="card" style="margin-top:10px;background:#f8fafb"><div class="muted">No procedures added yet. Add one or more procedures above.</div></div><div class="card" style="margin-top:12px;background:#f8fafb"><div class="section-title">Discount</div><div class="muted" style="margin-bottom:8px">Discount is decided separately for each visit.</div><div class="formgrid"><div class="field"><label>Discount %</label><input id="discountPercent" type="number" min="0" max="100" step="0.01" value="0" oninput="updateDiscountFromPercent()"></div><div class="field"><label>Discount Amount (Rs.)</label><input id="discountAmount" type="number" min="0" step="0.01" value="0" oninput="updateDiscountFromAmount()"></div></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid #dfe7ed"><span class="muted">Final Total After Discount</span><strong id="discountedTotal">Rs. 0</strong></div></div><div class="card" style="margin-top:12px;background:#f8fafb"><div class="section-title">Payment Done</div><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><label style="display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer"><input type="radio" name="paymentType" value="total" checked onchange="updatePaymentChoice()"> Total Payment</label><label style="display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer"><input type="radio" name="paymentType" value="partial" onchange="updatePaymentChoice()"> Partial Payment</label></div><div class="formgrid"><div class="field"><label>Amount Paid (Rs.)</label><input id="visitPaid" type="number" min="0" placeholder="Total amount" readonly></div><div class="field"><label>Payment Method</label><div class="payment-modes"><button type="button" class="payment-mode" data-mode="Cash" onclick="selectVisitPaymentMode('Cash')">CASH</button><button type="button" class="payment-mode" data-mode="NepalPay QR" onclick="selectVisitPaymentMode('NepalPay QR')">NEPALPAY QR</button><button type="button" class="payment-mode" data-mode="MPOS" onclick="selectVisitPaymentMode('MPOS')">MPOS</button></div><input id="visitPaymentMode" type="hidden" value=""></div></div><div id="paymentHint" class="muted" style="margin-top:8px">Total payment selected — discounted final amount is filled automatically.</div></div><div class="card" style="margin-top:12px;background:#f8fafb"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div class="section-title" style="margin:0">Next Appointment</div><span class="muted" style="font-size:11px">English (AD) &amp; Nepali (BS) Synchronized</span></div><div class="formgrid"><div class="field"><label>English Date (AD) — Click to pick or type</label><input id="appointmentAdDate" type="date" onclick="this.showPicker &amp;&amp; this.showPicker()" onchange="onAppointmentAdChange(this.value)"></div><div class="field"><label>Nepali Date (BS) — Write / Edit</label><input id="appointmentBsDateInput" placeholder="YYYY-MM-DD (e.g. 2083-05-27)" oninput="onAppointmentBsChange(this.value)"></div></div><div id="appointmentBsDateDisplay" class="appt-bs-sync-badge" style="margin-top:8px">📅 Select or write a date above</div><div style="margin-top:10px"><div class="muted" style="font-size:11px;font-weight:700;margin-bottom:6px">QUICK DATE PRESETS:</div><div class="quick-dates" style="flex-wrap:wrap"><button type="button" class="btn secondary quick-date" data-days="0" onclick="setQuickAppointment(0,this)">TODAY</button><button type="button" class="btn secondary quick-date" data-days="1" onclick="setQuickAppointment(1,this)">TOMORROW</button><button type="button" class="btn secondary quick-date" data-days="3" onclick="setQuickAppointment(3,this)">AFTER 3 DAYS</button><button type="button" class="btn secondary quick-date" data-days="7" onclick="setQuickAppointment(7,this)">AFTER 1 WEEK</button><button type="button" class="btn secondary quick-date" data-days="14" onclick="setQuickAppointment(14,this)">AFTER 2 WEEKS</button><button type="button" class="btn secondary quick-date" data-days="30" onclick="setQuickAppointment(30,this)">AFTER 1 MONTH</button></div></div><div class="formgrid" style="margin-top:12px;align-items:flex-end"><div class="field"><label>Appointment Time</label><input id="appointmentTime" type="time" onclick="this.showPicker &amp;&amp; this.showPicker()" value="10:00"></div><div class="field"><label class="muted" style="font-size:11px">Common Time Slots:</label><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('10:00')">10:00 AM</button><button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('11:30')">11:30 AM</button><button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('14:00')">02:00 PM</button><button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('16:00')">04:00 PM</button><button type="button" class="btn secondary" style="padding:6px 10px;font-size:11px" onclick="setQuickTime('17:30')">05:30 PM</button></div></div></div><div class="actions" style="margin-top:12px"><button class="btn primary" onclick="saveAppointment()">SAVE APPOINTMENT</button></div></div><div style="margin-top:12px"><button id="addVisitBtn" class="btn primary" onclick="addVisit()" disabled>ADD VISIT</button><span id="visitHint" class="muted" style="margin-left:10px">Add at least one procedure to enable Add Visit.</span></div></div>
 </div>
 <div class="grid2" style="margin-top:18px"><div class="card"><div class="section-title">Visit History</div>${visits.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Time</th><th>Procedures Done</th><th>Payment Done</th></tr></thead><tbody>${visits.map(v=>`<tr><td>${esc(v.date||'—')}</td><td>${esc(v.time||'—')}</td><td>${esc(v.procedures||v.treatment||'—')}<div class="muted">Cost: Rs. ${Number(v.cost||0).toLocaleString()}</div></td><td>Rs. ${Number(v.paymentDone||v.amount||0).toLocaleString()}${v.paymentMethod?`<div class="muted">${esc(v.paymentMethod)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No visits recorded yet.</div>'}</div><div class="card"><div class="section-title">Payment History</div>${pays.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Bill</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>${pays.map(v=>`<tr><td>${esc(v.date)}</td><td>${esc(v.billNumber)}</td><td>Rs. ${Number(v.amount||0).toLocaleString()}</td><td>${esc(v.method)}</td><td>${esc(v.status)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No payments recorded yet.</div>'}</div></div>`;
 restoreAppointmentFields(p);renderPendingProcedures();updatePaymentChoice();
}
function restoreAppointmentFields(p){
  const d=document.getElementById('appointmentAdDate'),t=document.getElementById('appointmentTime');
  const bsInput=document.getElementById('appointmentBsDateInput');
  if(!d||!t)return;
  if(p&&p.Appointment){
    d.value=p.Appointment.adDate||p.Appointment.date||'';
    if(bsInput) bsInput.value=p.Appointment.bsDate||(d.value?(apptBsFromAd(d.value)||''):'');
    t.value=p.Appointment.time||'10:00';
    updateAppointmentBsDisplay();
  }else{
    d.value='';
    if(bsInput) bsInput.value='';
    t.value='10:00';
    updateAppointmentBsDisplay();
  }
  document.querySelectorAll('.quick-date').forEach(b=>b.classList.remove('primary'));
}

function onAppointmentAdChange(adVal){
  const bsInput=document.getElementById('appointmentBsDateInput');
  if(adVal){
    const bs=apptBsFromAd(adVal);
    if(bs && bsInput) bsInput.value=bs;
  }
  updateAppointmentBsDisplay();
}

function onAppointmentBsChange(bsVal){
  const adInput=document.getElementById('appointmentAdDate');
  const clean=(bsVal||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(clean)){
    const ad=apptAdFromBs(clean);
    if(ad && adInput) adInput.value=ad;
  }
  updateAppointmentBsDisplay();
}

function updateAppointmentBsDisplay(){
  const el=document.getElementById('appointmentBsDateDisplay');
  const d=document.getElementById('appointmentAdDate')?.value;
  const bsInput=document.getElementById('appointmentBsDateInput');
  if(!el)return;
  if(d){
    const bs=apptBsFromAd(d);
    if(bs){
      if(bsInput && !bsInput.value) bsInput.value=bs;
      const parts=bs.split('-').map(Number);
      const mName=(typeof APPT_BS_MONTHS_NP!=='undefined'&&APPT_BS_MONTHS_NP[parts[1]-1])||'';
      const enMName=(typeof APPT_BS_MONTHS!=='undefined'&&APPT_BS_MONTHS[parts[1]-1])||'';
      el.innerHTML=`📅 <b>Nepali (BS):</b> ${bs} (${mName} ${parts[2]}, ${parts[0]} • ${enMName}) &nbsp;·&nbsp; <b>English (AD):</b> ${d}`;
      return;
    }
  }
  if(bsInput?.value && /^\d{4}-\d{2}-\d{2}$/.test(bsInput.value.trim())){
    const ad=apptAdFromBs(bsInput.value.trim());
    if(ad){
      el.innerHTML=`📅 <b>Nepali (BS):</b> ${bsInput.value.trim()} &nbsp;·&nbsp; <b>English (AD):</b> ${ad}`;
      return;
    }
  }
  el.textContent='📅 Pick an English date or type a Nepali BS date above.';
}

function setQuickAppointment(days,btn){
  const d=new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()+Number(days));
  const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const el=document.getElementById('appointmentAdDate');
  const bsInput=document.getElementById('appointmentBsDateInput');
  if(el) el.value=iso;
  if(bsInput) bsInput.value=apptBsFromAd(iso)||'';
  document.querySelectorAll('.quick-date').forEach(b=>b.classList.remove('primary'));
  if(btn) btn.classList.add('primary');
  updateAppointmentBsDisplay();
}

function setQuickTime(val){
  const t=document.getElementById('appointmentTime');
  if(t) t.value=val;
}

function selectVisitPaymentMode(mode){const hidden=document.getElementById('visitPaymentMode');if(hidden)hidden.value=mode;document.querySelectorAll('.payment-mode').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));}
function updateVisitCost(){const sel=document.getElementById('visitProcedure'),opt=sel?.options[sel.selectedIndex],cost=document.getElementById('visitCost');if(!cost)return;if(!opt||!opt.value){cost.value='0';cost.placeholder='Enter amount';return}cost.value=opt.dataset.cost||0;cost.placeholder='Actual amount charged'}
function updateAppointmentAd(){}
function initNepaliAppointmentPicker(){}
function setTodayBsAppointment(){setQuickAppointment(0,null)}

function saveAppointment(){
  const p=patients.find(x=>x.id===selectedId);
  if(!p)return;
  let ad=document.getElementById('appointmentAdDate')?.value||'';
  let bs=(document.getElementById('appointmentBsDateInput')?.value||'').trim();
  let t=document.getElementById('appointmentTime')?.value||'10:00';
  if(!ad && bs && /^\d{4}-\d{2}-\d{2}$/.test(bs)){
    ad=apptAdFromBs(bs)||'';
  }
  if(!bs && ad){
    bs=apptBsFromAd(ad)||'';
  }
  if(!ad){
    alert('Please choose or enter an appointment date.');
    return;
  }
  p.Appointment={adDate:ad,bsDate:bs,time:t,status:'scheduled',date:ad};
  save();
  updateAll();
  alert('Appointment saved for '+(bs?'BS '+bs+' ('+ad+')':ad)+' at '+t);
  renderProfile();
}
function printLatestBill(){const p=patients.find(x=>x.id===selectedId);if(!p||!p.VisitHistory?.length){alert('No saved bill/visit found for this patient yet.');return}printBill(p.VisitHistory[0].billNumber)}

function updateAll(){const now=new Date();const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');const registered=registeredPatients();document.getElementById('statPatients').textContent=registered.length;document.getElementById('statToday').textContent=registered.filter(p=>p.Date===today).length;document.getElementById('statOpd').textContent=pad(nextNumber());document.getElementById('nextOpd').textContent=pad(nextNumber());document.getElementById('statPending').textContent=registered.filter(p=>(p.PaymentStatus||'Pending')==='Pending').length;document.getElementById('statAppointments').textContent=patients.filter(p=>p.Appointment&&p.Appointment.adDate===today).length;const todayAppointments=patients.filter(p=>p.Appointment&&p.Appointment.adDate===today).sort((a,b)=>String(a.Appointment.time||'').localeCompare(String(b.Appointment.time||'')));document.getElementById('todayAppointments').innerHTML=todayAppointments.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Time</th><th>OPD</th><th>Patient</th><th>Contact</th><th>Appointment</th></tr></thead><tbody>${todayAppointments.map(p=>`<tr><td><strong>${esc(p.Appointment.time||'')}</strong></td><td>${p.AppointmentOnly?'Not registered':pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact||'')}</td><td>${esc(p.Appointment.bsDate||p.Appointment.adDate||'')}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty"><svg class="empty-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg><div>No appointments scheduled for today.</div></div>`;renderPatients();renderRecentPatients()}
let transactionRange='today';
function getTransactions(){const out=[];registeredPatients().forEach(p=>{ensurePatientArrays(p);(p.PaymentHistory||[]).forEach((tx,i)=>{out.push({id:p.id,date:tx.date||'',time:tx.time||'',opd:p.OPDNumber,name:p.Name,bill:tx.billNumber||('VIS-'+pad(p.OPDNumber)+'-'+String(i+1).padStart(3,'0')),amount:Number(tx.amount||0),method:tx.method||p.PaymentMethod||'',status:tx.status||p.PaymentStatus||'Pending'});});});return out.sort((a,b)=>(b.date+' '+b.time).localeCompare(a.date+' '+a.time));}
function dateOnly(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function transactionMatches(tx){if(transactionRange==='all')return true;const now=dateOnly(new Date()),d=new Date(tx.date+'T00:00:00');if(transactionRange==='today')return d.getTime()===now.getTime();if(transactionRange==='week'){const day=now.getDay();const diff=day===0?6:day-1;const start=new Date(now);start.setDate(now.getDate()-diff);return d>=start&&d<=now;}if(transactionRange==='month')return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();return true;}
const TRANSACTION_PIN='2468';
let pendingSecureRange=null;

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
    } catch (_) {}
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
  } catch (_) {}
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
  } catch (_) {}
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
    } catch (_) {}
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

async function submitLoginForm() {
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
    if (errBox) {
      errBox.textContent = err.message || 'Login failed. Please check credentials.';
      errBox.style.display = 'block';
    }
  } finally {
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
  } catch (_) {}
  applyLoggedOutState();
}

function applyLoggedInState() {
  const loginContainer = document.getElementById('loginContainer');
  if (loginContainer) loginContainer.classList.add('hidden');

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
  if (loginContainer) loginContainer.classList.remove('hidden');

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

function secureTransactionRange(range){
  if (currentUser?.role === 'superadmin') {
    setTransactionRange(range);
    return;
  }
  pendingSecureRange=range;
  const label=range==='week'?'This Week':range==='month'?'This Month':'All Transactions';
  document.getElementById('adminAuthTitle').textContent='Requires Super Admin Authorization';
  document.getElementById('adminAuthText').textContent='Enter Super Admin Password or 4-digit PIN (2468) to view '+label+'.';
  document.getElementById('adminPin').value='';
  document.getElementById('adminPin').type='password';
  document.getElementById('adminPin').maxLength=30;
  document.getElementById('adminPin').pattern='.*';
  document.getElementById('adminPinError').textContent='';
  document.getElementById('adminAuthModal').classList.add('show');
  setTimeout(()=>document.getElementById('adminPin').focus(),50);
}
function closeAdminAuth(){pendingSecureRange=null;document.getElementById('adminAuthModal').classList.remove('show');document.getElementById('adminPin').value=''}
async function authorizeTransaction(){
  const val=document.getElementById('adminPin').value.trim();
  if(!val){
    document.getElementById('adminPinError').textContent='Please enter Super Admin password or PIN.';
    return;
  }
  if(val===TRANSACTION_PIN){
    const range=pendingSecureRange;
    closeAdminAuth();
    if(range)setTransactionRange(range);
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
  } catch (_) {}
  document.getElementById('adminPinError').textContent='Incorrect credentials. Authorization denied.';
  document.getElementById('adminPin').select();
}

function setTransactionRange(range){transactionRange=range;['today','week','month','all'].forEach(x=>{const b=document.getElementById('tx'+x.charAt(0).toUpperCase()+x.slice(1));if(b)b.className='btn '+(x===range?'primary':'secondary')});renderTransactions();}
function renderTransactions(){
  const all=getTransactions(),list=all.filter(transactionMatches);
  const total=list.reduce((a,x)=>a+x.amount,0),
        cash=list.filter(x=>x.method==='Cash').reduce((a,x)=>a+x.amount,0),
        digital=list.filter(x=>x.method==='Scan'||x.method==='MPOS').reduce((a,x)=>a+x.amount,0);
  const elCount = document.getElementById('txCount');
  if (elCount) elCount.textContent = list.length;
  const elTotal = document.getElementById('txTotal');
  if (elTotal) elTotal.textContent = 'Rs. ' + total.toLocaleString();
  const elCash = document.getElementById('txCash');
  if (elCash) elCash.textContent = 'Rs. ' + cash.toLocaleString();
  const elDigital = document.getElementById('txDigital');
  if (elDigital) elDigital.textContent = 'Rs. ' + digital.toLocaleString();
  const elTitle = document.getElementById('txTitle');
  if (elTitle) elTitle.textContent = transactionRange==='today' ? "Today's Transactions" : transactionRange==='week' ? "This Week's Transactions" : transactionRange==='month' ? "This Month's Transactions" : "All Transactions";
  const elRows = document.getElementById('transactionRows');
  if (elRows) elRows.innerHTML = list.length ? list.map(x=>`<tr class="clickable" onclick="openProfile('${x.id}')"><td>${esc(x.date)}</td><td>${esc(x.time||'—')}</td><td>${pad(x.opd)}</td><td>${esc(x.name)}</td><td>${esc(x.bill)}</td><td>Rs. ${x.amount.toLocaleString()}</td><td>${esc(x.method||'—')}</td><td>${esc(x.status)}</td></tr>`).join('') : `<tr><td colspan="8" class="empty">No transactions found for this period.</td></tr>`;
}
function renderRecentPatients(){const el=document.getElementById('recentPatients');if(!el)return;const ids=JSON.parse(localStorage.getItem('infinity_dental_recent_patients_v1')||'[]');const list=ids.map(id=>patients.find(p=>p.id===id)).filter(p=>p&&!p.AppointmentOnly);el.innerHTML=list.length?`<div class="tablewrap"><table class="table"><thead><tr><th>OPD</th><th>Patient</th><th>Contact</th></tr></thead><tbody>${list.map(p=>`<tr class="clickable" onclick="openProfile('${p.id}')"><td>${pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact||'')}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty"><svg class="empty-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg><div>No recently opened patients.</div></div>`}
function populateBillingPatients(){const sel=document.getElementById('billingPatient');if(!sel)return;const current=sel.value;sel.innerHTML='<option value="">Select patient</option>'+registeredPatients().slice().sort((a,b)=>b.OPDNumber-a.OPDNumber).map(p=>`<option value="${p.id}">${pad(p.OPDNumber)} — ${esc(p.Name)}</option>`).join('');if(current)sel.value=current;if(selectedId&&patients.some(p=>p.id===selectedId))sel.value=selectedId;renderBillingForPatient()}
function selectBillingPatient(id){selectedId=id||selectedId;renderBillingForPatient()}
function renderBillingForPatient(){const sel=document.getElementById('billingPatient'),sum=document.getElementById('billingSummary'),list=document.getElementById('billingBills');if(!sum||!list)return;if(sel&&selectedId&&patients.some(p=>p.id===selectedId))sel.value=selectedId;const p=patients.find(x=>x.id===(sel?.value||selectedId));if(!p){sum.textContent='Select a patient to see their latest bill.';list.innerHTML='';return}ensurePatientArrays(p);const visits=p.VisitHistory||[];sum.innerHTML=`<b>${esc(p.Name)}</b> • OPD ${pad(p.OPDNumber)} • ${esc(p.Contact||'')}`;list.innerHTML=visits.length?visits.map((v,i)=>`<div class="card" style="margin-top:8px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><b>${esc(v.billNumber||'Bill')}</b><div class="muted">${esc(v.date||'')} ${esc(v.time||'')} • Rs. ${Number(v.cost||0).toLocaleString()} • ${esc(v.paymentMethod||'')}</div></div><button class="btn primary" onclick="printBill('${esc(v.billNumber||'')}')">PRINT A5 BILL</button></div></div>`).join(''):'<div class="empty">No saved visits/bills for this patient yet.</div>'}

function showPage(id){
  if (id === 'staff' && currentUser?.role !== 'superadmin') {
    alert('Access restricted to Super Admin only.');
    id = 'dashboard';
  }
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  const p = document.getElementById(id);
  if (p) p.classList.add('active');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===id));
  if(id==='patients')renderPatients();
  if(id==='profile')renderProfile();
  if(id==='transactions')renderTransactions();
  if(id==='billing'){populateBillingPatients();}
  if(id==='dashboard')renderRecentPatients();
  if(id==='staff'){loadStaffAccounts();}
  if(id==='nepalpay'){loadSoundboxPorts(false); autoConnectNiziUsb(true);}
  if(id==='labworks'){loadLabData();loadPatientsDatalist();}
  if(id==='purchases'){loadPurchasesData();}
  if(id==='stocks'){loadStockData();refreshPhoneNetworkQr();}
}
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));

async function initializeClinicDatabase(){
  await loadPriceList();
  if(window.dentalDB?.load){
    try{const data=await window.dentalDB.load();if(Array.isArray(data))patients=data;const path=await window.dentalDB.path();const el=document.getElementById('dataFolderStatus');if(el)el.textContent=path?'SQLite Database: '+path:'SQLite Database';}
    catch(e){console.warn('SQLite load failed:',e)}
  }else{
    try{
      const res=await fetch('/api/patients');
      if(res.ok){
        const json=await res.json();
        if(json.success && Array.isArray(json.data)){
          patients=json.data;
          const el=document.getElementById('dataFolderStatus');
          if(el)el.textContent='SQLite Database: '+(json.dbPath||'Localhost Server Connected');
        }
      }
    }catch(err){
      console.log('Falling back to local browser storage:',err);
      reconnectStoredDataFolder();
    }
  }
  setupSseListener();
  updateAll();renderTransactions();renderNepalPayTxnTable();
  checkAuthSession();
}
function applyTheme(){
  const dark = localStorage.getItem('infinity_dental_theme') === 'dark';
  document.body.classList.toggle('dark', dark);
  const themeLabel = document.getElementById('settingsThemeLabel');
  if (themeLabel) themeLabel.textContent = dark ? 'Light Mode' : 'Dark Mode';
  const b = document.getElementById('themeToggle');
  if (b) b.textContent = dark ? 'Light Mode' : 'Dark Mode';
}
function toggleTheme(){const dark=!document.body.classList.contains('dark');localStorage.setItem('infinity_dental_theme',dark?'dark':'light');applyTheme()}
applyTheme();
loadRegistrationDraft();function tick(){document.getElementById('clock').textContent=new Date().toLocaleString(undefined,{dateStyle:'medium',timeStyle:'medium'});setTimeout(tick,1000)}tick();updateAll();renderTransactions();initializeClinicDatabase();

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
      const badge = document.getElementById('modalCurrentVersion');
      if (badge) badge.textContent = 'v' + v;
      const headerBadge = document.getElementById('appVersionBadge');
      if (headerBadge) headerBadge.textContent = 'v' + v;
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
          <div style="color:#166534;font-weight:700;font-size:14px;margin-bottom:6px">🎉 New Version v${esc(result.latestVersion)} is Available!</div>
          <div class="muted" style="font-size:11px;margin-bottom:8px">Published: ${result.publishedAt ? new Date(result.publishedAt).toLocaleDateString() : 'Recently'}</div>
          ${result.releaseNotes ? `<div style="background:#fff;padding:8px 12px;border-radius:6px;font-size:12px;max-height:100px;overflow-y:auto;white-space:pre-wrap;margin-bottom:12px;border:1px solid #dcfce7">${esc(result.releaseNotes)}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button id="inAppDownloadBtn" class="btn primary" style="background:#16a34a;padding:9px 18px;font-weight:800" onclick="startInAppUpdate('${esc(result.downloadUrl || result.htmlUrl)}')">⬇ DOWNLOAD &amp; INSTALL UPDATE (IN-APP)</button>
            <a href="${esc(result.downloadUrl || result.htmlUrl)}" target="_blank" download class="btn secondary" style="font-size:12px;padding:9px 14px;text-decoration:none;display:inline-flex;align-items:center">📥 Direct Setup (.exe)</a>
            <button class="btn secondary" style="font-size:11px;padding:8px 12px" onclick="openExternalUrl('${esc(result.htmlUrl)}')">View Release Details</button>
          </div>
        `;
      }
      if (manual) openUpdateModal();
    } else if (result && result.success && !result.hasUpdate) {
      if (statusArea && manual) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#f0fdf4';
        statusArea.style.border = '1px solid #bbf7d0';
        statusArea.innerHTML = `<div style="color:#15803d;font-weight:700">✓ Infinity Dental Clinic is up to date! (v${esc(result.currentVersion)})</div><div class="muted" style="font-size:11px;margin-top:4px">You are running the latest official version.</div>`;
      }
    } else {
      if (statusArea && manual) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#fef2f2';
        statusArea.style.border = '1px solid #fecaca';
        statusArea.innerHTML = `<div style="color:#b91c1c;font-weight:700">Could not check updates</div><div class="muted" style="font-size:11px;margin-top:4px">${esc(result?.error || 'Unknown error')}</div>`;
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

async function startInAppUpdate(downloadUrl) {
  if (isDownloadingUpdate) return;

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
        bytesText.textContent = `${dlMb} MB / ${totalMb} MB`;
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
      if (statusText) {
        statusText.innerHTML = `⚠️ Download failed: ${esc(err.message)}`;
        statusText.style.color = '#b91c1c';
      }
      if (bytesText) {
        bytesText.innerHTML = `<a href="${esc(downloadUrl)}" target="_blank" download style="color:var(--primary);font-weight:700">Click here to download setup file directly</a>`;
      }
      if (inAppBtn) {
        inAppBtn.disabled = false;
        inAppBtn.innerHTML = '⬇ RETRY IN-APP UPDATE';
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
  } catch (_) {}

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
  openExternalUrl(url);
}

function openExternalUrl(url) {
  if (window.dentalApp && window.dentalApp.openExternal) {
    window.dentalApp.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

/* Appointments section */
const APPT_BS_MONTHS=['Baisakh','Jestha','Asar','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];
const APPT_BS_MONTHS_NP=['बैशाख','जेठ','असार','श्रावण','भाद्र','आश्विन','कार्तिक','मंसिर','पौष','माघ','फाल्गुण','चैत्र'];
const APPT_BS_DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const APPT_BS_LENGTHS={
  2080:[31,31,32,31,31,31,30,29,30,29,30,30],
  2081:[31,31,32,32,31,30,30,30,29,30,29,31],
  2082:[31,32,31,32,31,30,30,30,29,30,30,30],
  2083:[31,31,32,31,31,31,30,29,30,29,30,30],
  2084:[31,31,32,31,31,31,30,30,30,29,30,30],
  2085:[31,32,31,32,31,31,30,29,30,29,30,30]
};
const APPT_BS_START_YEAR=2080;
const APPT_BS_ANCHOR={y:2083,m:5,d:27,ad:'2026-09-12'};
let appointmentMode='BS';
let appointmentSelectedAD='2026-09-12';
let appointmentView={y:2083,m:5};
function apptPad(n){return String(n).padStart(2,'0')}
function apptIsoDate(d){return d.getFullYear()+'-'+apptPad(d.getMonth()+1)+'-'+apptPad(d.getDate())}
function apptParseIso(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return d.getFullYear()==+m[1]&&d.getMonth()==+m[2]-1&&d.getDate()==+m[3]?d:null}
function apptBsToIndex(y,m,d){let idx=0;for(let yy=APPT_BS_START_YEAR;yy<y;yy++){const lens=APPT_BS_LENGTHS[yy];if(!lens)return null;idx+=lens.reduce((x,v)=>x+v,0)}for(let mm=1;mm<m;mm++)idx+=APPT_BS_LENGTHS[y]?.[mm-1]||0;return idx+(d-1)}
function apptAdFromBs(bs){const parts=String(bs).split('-').map(Number);if(parts.length!==3)return null;const [y,m,d]=parts,lens=APPT_BS_LENGTHS[y];if(!lens||m<1||m>12||d<1||d>lens[m-1])return null;const anchorBs=apptBsToIndex(2083,5,27),target=apptBsToIndex(y,m,d);if(anchorBs==null||target==null)return null;const base=new Date(2026,8,12);base.setDate(base.getDate()+target-anchorBs);return apptIsoDate(base)}
function apptBsFromAd(ad){const date=apptParseIso(ad);if(!date)return null;const base=new Date(2026,8,12);const diff=Math.round((date-base)/86400000);let target=apptBsToIndex(2083,5,27)+diff,y=APPT_BS_START_YEAR,m=1;while(true){const lens=APPT_BS_LENGTHS[y];if(!lens)return null;const total=lens.reduce((x,v)=>x+v,0);if(target<total)break;target-=total;y++;}while(target>=APPT_BS_LENGTHS[y][m-1]){target-=APPT_BS_LENGTHS[y][m-1];m++;if(m>12)return null}return y+'-'+apptPad(m)+'-'+apptPad(target+1)}
function apptBsValid(bs){return !!apptAdFromBs(bs)}
function appointmentToday(){const d=new Date();appointmentSelectedAD=apptIsoDate(d);appointmentSetViewForAD(appointmentSelectedAD);renderAppointments()}
function appointmentTomorrow(){const d=new Date();d.setDate(d.getDate()+1);appointmentSelectedAD=apptIsoDate(d);appointmentSetViewForAD(appointmentSelectedAD);renderAppointments()}
function appointmentSetViewForAD(ad){const bs=apptBsFromAd(ad);if(appointmentMode==='BS'&&bs){const [y,m]=bs.split('-').map(Number);appointmentView={y,m}}else{const d=apptParseIso(ad);appointmentView={y:d.getFullYear(),m:d.getMonth()+1}}}
function setAppointmentCalendarMode(mode){appointmentMode=mode;appointmentSetViewForAD(appointmentSelectedAD);renderAppointments()}
function toggleAppointmentGoto(){const el=document.getElementById('appointmentGoto');if(!el)return;el.style.display=el.style.display==='none'?'flex':'none';const input=document.getElementById('appointmentGotoInput');if(input){input.placeholder=appointmentMode==='BS'?'2083-05-27':'2026-09-12';input.focus()}}
function goAppointmentTypedDate(){const input=document.getElementById('appointmentGotoInput');const value=(input?.value||'').trim();let ad=null;if(appointmentMode==='BS')ad=apptAdFromBs(value);else if(apptParseIso(value))ad=value;if(!ad){alert('Invalid date. Please use YYYY-MM-DD.');return}appointmentSelectedAD=ad;appointmentSetViewForAD(ad);const box=document.getElementById('appointmentGoto');if(box)box.style.display='none';renderAppointments()}
function appointmentPrevMonth(){if(appointmentMode==='BS'){let {y,m}=appointmentView;m--;if(m<1){m=12;y--}if(!APPT_BS_LENGTHS[y])return;appointmentView={y,m}}else{let {y,m}=appointmentView;m--;if(m<1){m=12;y--}appointmentView={y,m}}renderAppointments()}
function appointmentNextMonth(){if(appointmentMode==='BS'){let {y,m}=appointmentView;m++;if(m>12){m=1;y++}if(!APPT_BS_LENGTHS[y])return;appointmentView={y,m}}else{let {y,m}=appointmentView;m++;if(m>12){m=1;y++}appointmentView={y,m}}renderAppointments()}
function appointmentPatientsForAD(ad){return patients.filter(p=>p.Appointment&&p.Appointment.adDate===ad).sort((a,b)=>String(a.Appointment.time||'').localeCompare(String(b.Appointment.time||'')))}
function toggleNewAppointmentForm(show){const form=document.getElementById('newAppointmentForm');if(!form)return;const opening=show===undefined?form.style.display==='none':!!show;form.style.display=opening?'block':'none';if(opening){document.getElementById('newApptDate').value=appointmentSelectedAD||apptIsoDate(new Date());document.getElementById('newApptName').focus()}}
function addAppointmentFromSection(){const name=document.getElementById('newApptName').value.trim(),phone=document.getElementById('newApptPhone').value.trim(),ad=document.getElementById('newApptDate').value,time=document.getElementById('newApptTime').value;if(!name){alert('Please enter the patient name.');document.getElementById('newApptName').focus();return}if(!phone){alert('Please enter the phone number.');document.getElementById('newApptPhone').focus();return}if(!apptParseIso(ad)){alert('Please select a valid appointment date.');return}if(!time){alert('Please select an appointment time.');document.getElementById('newApptTime').focus();return}const existing=registeredPatients().find(p=>String(p.Contact||'').replace(/\D/g,'')===phone.replace(/\D/g,'')&&String(p.Name||'').trim().toLowerCase()===name.toLowerCase());const record=existing||{id:crypto.randomUUID(),AppointmentOnly:true,Name:name,Contact:phone,Appointment:null};record.Name=name;record.Contact=phone;record.Appointment={adDate:ad,bsDate:apptBsFromAd(ad)||'',time,status:'scheduled'};if(!existing)patients.push(record);save();appointmentSelectedAD=ad;appointmentSetViewForAD(ad);document.getElementById('newApptName').value='';document.getElementById('newApptPhone').value='';document.getElementById('newApptTime').value='';toggleNewAppointmentForm(false);renderAppointments();alert('Appointment saved for '+name+'. '+(existing?'Linked to the existing registered patient.':'This person remains unregistered and has not been assigned an OPD number.'))}
function registerAppointmentGuest(id){const p=patients.find(x=>x.id===id&&x.AppointmentOnly);if(!p)return;const now=new Date();p.AppointmentOnly=false;if(p.Appointment)p.Appointment.status='attended';p.OPDNumber=nextNumber();p.Address='';p.Age='';p.Gender='';p.Date=now.toISOString().slice(0,10);p.Time=now.toTimeString().slice(0,8);p.Treatments=[];p.Subtotal=0;p.DiscountPercent=0;p.DiscountAmount=0;p.FinalAmount=0;p.PaymentStatus='Pending';p.PaymentMethod='';p.BillNumber='';p.Documents=[];p.VisitHistory=[];p.PaymentHistory=[];save();selectedId=p.id;showPage('profile');renderProfile();alert('Patient registered successfully. OPD Number: '+pad(p.OPDNumber))}
function appointmentStatusFor(p){const a=p&&p.Appointment;if(!a)return 'scheduled';if(a.status==='attended')return 'attended';if(a.adDate<apptIsoDate(new Date()))return 'no-show';return 'scheduled'}
function markAppointmentArrived(id){const p=patients.find(x=>x.id===id&&x.Appointment);if(!p)return;p.Appointment.status='attended';p.Appointment.arrivedAt=new Date().toISOString();save();renderAppointments();alert('Appointment marked as arrived for '+p.Name+'.')}
function saveAppointmentFollowUp(id){const p=patients.find(x=>x.id===id&&x.Appointment);if(!p)return;const a=p.Appointment;const status=document.getElementById('followStatus_'+id)?.value||'not-called';const date=document.getElementById('followDate_'+id)?.value||apptIsoDate(new Date());const attempts=Math.max(0,Number(document.getElementById('followAttempts_'+id)?.value)||0);const note=(document.getElementById('followNote_'+id)?.value||'').trim();a.followUpStatus=status;a.followUpDate=date;a.followUpAttempts=attempts;a.followUpNotes=note;if(!Array.isArray(a.followUpHistory))a.followUpHistory=[];a.followUpHistory.push({status,date,attempts,note,savedAt:new Date().toISOString()});save();renderAppointments();alert('Follow-up details saved. This does not change the appointment attendance status.');}
function followUpLabel(status){return ({'not-called':'NOT CALLED YET','interested':'WANTS TO COME','call-back':'CALL BACK LATER','no-answer':'NO ANSWER','declined':'DECLINED'})[status]||'NOT CALLED YET'}
function followUpClass(status){return ({'not-called':'fu-not-called','interested':'fu-interested','call-back':'fu-call-back','no-answer':'fu-no-answer','declined':'fu-declined'})[status]||'fu-not-called'}
function renderAppointmentList(){const list=document.getElementById('appointmentList'),title=document.getElementById('appointmentListTitle'),sub=document.getElementById('appointmentListSub');if(!list)return;const ad=appointmentSelectedAD,bs=apptBsFromAd(ad),items=appointmentPatientsForAD(ad);title.textContent=ad===apptIsoDate(new Date())?'Today\'s Appointments':'Appointments';sub.textContent=(appointmentMode==='BS'&&bs?bs+' BS':'AD '+ad)+' • '+items.length+' appointment'+(items.length===1?'':'s');list.innerHTML=items.length?items.map(p=>{const a=p.Appointment,status=appointmentStatusFor(p),label=status==='attended'?'ARRIVED':status==='no-show'?'DID NOT COME':'SCHEDULED',fs=a.followUpStatus||'not-called',hist=Array.isArray(a.followUpHistory)?a.followUpHistory:[],recent=hist.slice(-2).reverse();return `<div class="appt-row appt-${status}"><div class="appt-main"><div class="appt-name">${esc(p.Name)} <span class="appt-status">${label}</span> <span class="follow-status ${followUpClass(fs)}">CALL: ${followUpLabel(fs)}</span></div><div class="appt-meta">${p.AppointmentOnly?'Not registered':('OPD '+pad(p.OPDNumber))} • ${esc(p.Contact||'')} • ${esc(a.time||'')}</div><div class="followup-panel"><div class="followup-heading">Follow-up call tracking</div><div class="followup-fields"><label>Call outcome<select id="followStatus_${p.id}"><option value="not-called" ${fs==='not-called'?'selected':''}>Not called yet</option><option value="interested" ${fs==='interested'?'selected':''}>Wants to come / interested</option><option value="call-back" ${fs==='call-back'?'selected':''}>Call back later</option><option value="no-answer" ${fs==='no-answer'?'selected':''}>No answer</option><option value="declined" ${fs==='declined'?'selected':''}>Declined / not interested</option></select></label><label>Call date<input id="followDate_${p.id}" type="date" value="${esc(a.followUpDate||apptIsoDate(new Date()))}"></label><label>Call attempts<input id="followAttempts_${p.id}" type="number" min="0" max="999" step="1" value="${Number(a.followUpAttempts)||0}"></label><label class="follow-note-field">Notes<textarea id="followNote_${p.id}" rows="2" placeholder="e.g. Try calling again in the evening.">${esc(a.followUpNotes||'')}</textarea></label></div><div class="followup-actions"><button class="btn secondary" onclick="saveAppointmentFollowUp('${p.id}')">SAVE FOLLOW-UP</button>${hist.length?`<span class="muted">${hist.length} saved update${hist.length===1?'':'s'}</span>`:''}</div>${recent.length?`<details class="followup-history"><summary>Previous follow-up history (${hist.length})</summary>${recent.map(h=>`<div class="followup-history-item"><strong>${esc(h.date||'')}</strong> · ${esc(followUpLabel(h.status))} · ${Number(h.attempts)||0} attempts${h.note?' — '+esc(h.note):''}</div>`).join('')}</details>`:''}</div></div><div class="appt-actions">${p.AppointmentOnly?`<button class="btn secondary" onclick="registerAppointmentGuest('${p.id}')">REGISTER & ARRIVED</button>`:status!=='attended'?`<button class="btn secondary" onclick="markAppointmentArrived('${p.id}')">MARK ARRIVED</button><button class="btn secondary" onclick="openProfile('${p.id}')">OPEN</button>`:`<button class="btn secondary" onclick="openProfile('${p.id}')">OPEN</button>`}</div></div>`}).join(''):'<div class="appointment-empty">No appointments scheduled for this date.</div>'}
function renderAppointmentCalendar(){const wrap=document.getElementById('appointmentCalendar'),title=document.getElementById('appointmentMonthTitle'),sub=document.getElementById('appointmentMonthSub');if(!wrap)return;let y=appointmentView.y,m=appointmentView.m;if(appointmentMode==='BS'){const lens=APPT_BS_LENGTHS[y];if(!lens)return;title.textContent=APPT_BS_MONTHS_NP[m-1]+' '+y;sub.textContent=APPT_BS_MONTHS[m-1]+' • '+m+'th month';const firstAd=apptAdFromBs(y+'-'+apptPad(m)+'-01'),first=apptParseIso(firstAd);const start=first.getDay();const days=lens[m-1];let cells='';for(let i=0;i<start;i++)cells+='<td></td>';for(let d=1;d<=days;d++){const bs=y+'-'+apptPad(m)+'-'+apptPad(d),ad=apptAdFromBs(bs),selected=ad===appointmentSelectedAD?' selected':'',today=ad===apptIsoDate(new Date())?' today':'',count=appointmentPatientsForAD(ad).length;cells+=`<td><button class="cal-day${selected}${today}" onclick="selectAppointmentBS('${bs}')"><div class="daynum">${d}</div>${count?`<div class="appt-dot">${count} appt</div>`:''}</button></td>`;if((start+d)%7===0){cells+='</tr><tr>'}}wrap.innerHTML=`<table class="bs-cal"><thead><tr>${APPT_BS_DAYS.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`}else{const first=new Date(y,m-1,1),start=first.getDay(),days=new Date(y,m,0).getDate();title.textContent=first.toLocaleString(undefined,{month:'long',year:'numeric'});sub.textContent='Gregorian / AD';let cells='';for(let i=0;i<start;i++)cells+='<td></td>';for(let d=1;d<=days;d++){const ad=y+'-'+apptPad(m)+'-'+apptPad(d),selected=ad===appointmentSelectedAD?' selected':'',today=ad===apptIsoDate(new Date())?' today':'',count=appointmentPatientsForAD(ad).length;cells+=`<td><button class="cal-day${selected}${today}" onclick="selectAppointmentAD('${ad}')"><div class="daynum">${d}</div>${count?`<div class="appt-dot">${count} appt</div>`:''}</button></td>`;if((start+d)%7===0)cells+='</tr><tr>'}wrap.innerHTML=`<table class="bs-cal"><thead><tr>${APPT_BS_DAYS.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`}}
function selectAppointmentBS(bs){const ad=apptAdFromBs(bs);if(!ad)return;appointmentSelectedAD=ad;appointmentSetViewForAD(ad);renderAppointments()}
function selectAppointmentAD(ad){if(!apptParseIso(ad))return;appointmentSelectedAD=ad;appointmentSetViewForAD(ad);renderAppointments()}
function renderAppointments(){const p=document.getElementById('appointments');if(!p)return;document.getElementById('appointmentModeAD')?.classList.toggle('primary',appointmentMode==='AD');document.getElementById('appointmentModeBS')?.classList.toggle('primary',appointmentMode==='BS');document.getElementById('appointmentModeAD')?.classList.toggle('secondary',appointmentMode!=='AD');document.getElementById('appointmentModeBS')?.classList.toggle('secondary',appointmentMode!=='BS');renderAppointmentCalendar();renderAppointmentList()}
const originalShowPage=showPage;
showPage=function(id){
  originalShowPage(id);
  if(id==='appointments'){
    if(!appointmentSelectedAD)appointmentSelectedAD=apptIsoDate(new Date());
    appointmentSetViewForAD(appointmentSelectedAD);
    renderAppointments();
  }
  if(id==='nepalpay'){
    renderNepalPayTxnTable();
    updateNiziClock();
    setTimeout(testNiziQr, 50);
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
  } catch(e) {
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
  } catch(e) {
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
        } catch (_) {}
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
  } catch(e) {
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
      niziSerialPort.close().catch(() => {});
      niziSerialPort = null;
    }
  } catch(e) {}

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
    } catch(err) {
      break;
    } finally {
      if (niziSerialReader) {
        try { niziSerialReader.releaseLock(); } catch(e) {}
        niziSerialReader = null;
      }
    }
  }
}

async function sendNiziCommand(cmd) {
  updateNiziDeviceDisplay(cmd);
  if (niziSerialWriter) {
    try {
      // Official NiZi B30/B33 Command Framing (per B30Sdk.py & dynamic_qr_commands.html)
      let officialStr = '';
      if (cmd.command === 'show_qr' || cmd.command === 'qr') {
        const amtStr = (cmd.amount != null && !isNaN(Number(cmd.amount))) ? Number(cmd.amount).toFixed(2) : '0.00';
        const msg = cmd.message || 'SCAN TO PAY';
        officialStr = `QR**Rs. ${amtStr}**${msg}**${cmd.payload || ''}\n`;
      } else if (cmd.command === 'success' || cmd.command === 'payment_success') {
        const title = cmd.title || 'SUCCESS!';
        const msg = cmd.message || (cmd.amount ? `Rs. ${cmd.amount} received` : 'Payment successful');
        officialStr = `PASS**${title}**${msg}\n`;
      } else if (cmd.command === 'show_wifi') {
        officialStr = `QR**FREE WI-FI**${cmd.ssid || 'Scan to Connect'}**${cmd.payload || ''}\n`;
      } else if (cmd.command === 'idle' || cmd.command === 'display_logo') {
        officialStr = 'IDLE\n';
      } else if (cmd.command === 'wake') {
        officialStr = 'WAKE\n';
      } else if (cmd.command === 'reset') {
        officialStr = 'RESET\n';
      } else if (cmd.command === 'clear') {
        officialStr = 'CLEAR\n';
      }

      if (officialStr) {
        await niziSerialWriter.write(new TextEncoder().encode(officialStr));
        console.log('[NiZi USB Tx Official Protocol]:', officialStr.trim());
      }
    } catch(e) {
      console.warn('[NiZi USB] Serial write warning:', e.message);
    }
  }

  // Forward directly to local NiZi POS Connector application on port 9121 if running
  try {
    fetch('http://127.0.0.1:9121/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      mode: 'no-cors'
    }).catch(() => {});
  } catch(e) {}

  // Forward via localhost backend proxy
  try {
    fetch('/api/nizi/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    }).catch(() => {});
  } catch(e) {}
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
      <div class="nizi-price">Rs. ${Number(cmd.amount||0).toLocaleString()}</div>
      <div class="nizi-sub">${esc(cmd.title||'Infinity Dental')}</div>
      <div class="nizi-sub" style="font-size:9px;color:#38bdf8">${esc(cmd.billNumber||'Scan & Pay')}</div>
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
      <div class="nizi-price" style="color:#86efac;font-size:22px">Rs. ${Number(cmd.amount||0).toLocaleString()}</div>
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
    resetNiziScreen();
  }
}

function resetNiziScreen() {
  const screen = document.getElementById('niziScreen');
  if (!screen) return;
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
    } catch (_) {}
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
    } catch (_) {}

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

  const cmd = {
    command: 'show_wifi',
    payload,
    ssid,
    password,
    security: currentWifiConfig.security || 'WPA',
    title: 'Guest Wi-Fi',
    subtitle: 'Scan to Connect'
  };

  sendNiziCommand(cmd);

  try {
    await fetch('/api/wifi/show-on-nizi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentWifiConfig)
    });
  } catch (_) {}

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
  } catch (_) {}
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
  const amt = getActiveTestQrAmount();
  speakVoicePayment(amt);
}

function testNiziSuccessScreen() {
  const amt = getActiveTestQrAmount();
  sendNiziCommand({
    command: 'success',
    amount: amt,
    currency: 'NPR',
    payload: `Payment of ${amt} rupees received successfully`
  });
}

function testNiziQr() {
  const amt = getActiveTestQrAmount();
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
  });

  sendNiziCommand({
    command: 'show_qr',
    payload: qrString,
    amount: amt,
    currency: 'NPR',
    billNumber: bill,
    title: 'Infinity Dental'
  });

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
  canvasWrap.innerHTML = '<div style="padding:40px;color:var(--muted)">Generating NepalPay QR...</div>';
  statusPill.textContent = 'Connecting to NCHL ConnectIPS...';
  statusPill.className = 'status-pill live';

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
        if (countdownEl) countdownEl.textContent = `Expires in: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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

  } catch(e) {
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
  } catch (_) {}

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
        alert(`🎉 Payment of Rs. ${Number(eventData.amount||0).toLocaleString()} confirmed successfully!\nTxn ID: ${eventData.txnId}\nPayer: ${eventData.payerName || 'connectIPS Customer'}`);
      }
    }, 1200);
  }
}

let localFrontendWs = null;
function setupRealtimeWebsocket() {
  if (typeof WebSocket === 'undefined') return;
  try {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${location.host}/ws`;
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
      } catch (_) {}
    };

    localFrontendWs.onclose = () => {
      setTimeout(setupRealtimeWebsocket, 4000);
    };

    localFrontendWs.onerror = () => {
      try { localFrontendWs.close(); } catch (_) {}
    };
  } catch (err) {
    console.warn('Realtime WS setup warning:', err);
  }
}

function setupSseListener() {
  setupRealtimeWebsocket();
  try {
    const sse = new EventSource('/api/events');
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
      } catch(err) {}
    };
  } catch(e) {
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
      <td>${esc(t.billNumber||'—')}</td>
      <td>${esc(t.patientName||'Walk-in')}</td>
      <td>Rs. ${Number(t.amount||0).toLocaleString()}</td>
      <td>NepalPay QR</td>
      <td><span class="status-pill ${t.status==='SUCCESS'?'live':'simulated'}">${esc(t.status)}</span></td>
      <td>
        ${t.status==='PENDING' ? `<button class="btn secondary" style="font-size:10px;padding:4px 8px" onclick="simulateSpecificPayment('${t.traceId}')">Simulate Pay</button>` : `<span class="muted" style="font-size:11px">Completed</span>`}
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
  } catch(e) {
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
  } catch(_) {}
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
const todayIso = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

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
const LAB_PARTNERS = {
  'Smile Lab': { name: 'Smile Lab', open: 8000 },
  'Dental Craft': { name: 'Dental Craft', open: 0 },
  'Precision Dental Lab': { name: 'Precision Dental Lab', open: 5000 }
};

const PURCHASE_CATEGORIES = ['Consumables', 'Dental materials', 'Medicines', 'Instruments', 'Orthodontic materials'];
const PURCHASE_UNITS = ['Box', 'Piece', 'Bottle', 'Pack', 'Syringe', 'Cartridge'];
const optHtml = a => a.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');

// =========================================================================
// 1. ADMIN PIN VERIFICATION BACKEND ENDPOINT
// =========================================================================
async function verifyAdminPin(actionDescription) {
  const enteredPin = prompt(`Authorize ${actionDescription}?\nThis action is permanent and cannot be undone.\nEnter 4-digit Admin PIN:`);
  if (enteredPin === null) return false;
  if (!enteredPin.trim()) {
    alert('Admin PIN cannot be empty.');
    return false;
  }

  try {
    const res = await fetch('/api/admin/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin.trim() })
    });
    const data = await res.json();
    if (res.ok && data.success && data.authorized) {
      return true;
    } else {
      alert('Incorrect Admin PIN. Action cancelled.');
      return false;
    }
  } catch (err) {
    // Fallback if offline
    if (enteredPin.trim() === '1234' || enteredPin.trim() === 'admin123') return true;
    alert('Verification failed: ' + err.message);
    return false;
  }
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
  } catch (_) {}

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
    } catch (_) {}
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
  } catch (_) {}
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
document.addEventListener('click', function(e) {
  const flyout = document.getElementById('settingsFlyout');
  const btn = document.getElementById('sidebarSettingsBtn');
  if (flyout && flyout.style.display !== 'none') {
    if (!flyout.contains(e.target) && !btn?.contains(e.target)) {
      closeSettingsMenu();
    }
  }
});

// Escape key listener to close settings flyout
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeSettingsMenu();
  }
});
