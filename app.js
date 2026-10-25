const KEY='infinity_dental_patients_v1';
const DB_NAME='InfinityDentalClinicStorage';
const DB_STORE='settings';
let patients=JSON.parse(localStorage.getItem(KEY)||'[]'); let selectedId=null;
let dataDirectoryHandle=null;
let dataFolderName='Browser Storage';

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
   <div class="card"><div class="section-title">Add Visit / Procedure</div><div class="muted" style="margin-bottom:10px"><b>Price List:</b> loaded from C:\Infiinity Dental Clinic\price-list.json. Select a treatment, then enter the actual amount charged if needed.</div><div class="procedure-row"><select id="visitProcedure" onchange="updateVisitCost()"><option value="">Select procedure</option>${renderProcedureOptions()}</select><input id="visitCost" type="number" min="0" step="0.01" value="0" title="Actual amount charged"><button class="btn secondary" onclick="addPendingProcedure()">ADD PROCEDURE</button><button class="btn secondary" onclick="addCustomProcedure()">CUSTOM PROCEDURE</button></div><div id="pendingProcedures" class="card" style="margin-top:10px;background:#f8fafb"><div class="muted">No procedures added yet. Add one or more procedures above.</div></div><div class="card" style="margin-top:12px;background:#f8fafb"><div class="section-title">Discount</div><div class="muted" style="margin-bottom:8px">Discount is decided separately for each visit.</div><div class="formgrid"><div class="field"><label>Discount %</label><input id="discountPercent" type="number" min="0" max="100" step="0.01" value="0" oninput="updateDiscountFromPercent()"></div><div class="field"><label>Discount Amount (Rs.)</label><input id="discountAmount" type="number" min="0" step="0.01" value="0" oninput="updateDiscountFromAmount()"></div></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid #dfe7ed"><span class="muted">Final Total After Discount</span><strong id="discountedTotal">Rs. 0</strong></div></div><div class="card" style="margin-top:12px;background:#f8fafb"><div class="section-title">Payment Done</div><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><label style="display:flex;align-items:center;gap:6px;font-weight:600"><input type="radio" name="paymentType" value="total" checked onchange="updatePaymentChoice()"> Total Payment</label><label style="display:flex;align-items:center;gap:6px;font-weight:600"><input type="radio" name="paymentType" value="partial" onchange="updatePaymentChoice()"> Partial Payment</label></div><div class="procedure-row" style="margin:0"><label class="muted">Amount Paid</label><input id="visitPaid" type="number" min="0" placeholder="Total amount" readonly><div class="payment-modes"><button type="button" class="payment-mode" data-mode="Cash" onclick="selectVisitPaymentMode('Cash')">CASH</button><button type="button" class="payment-mode" data-mode="NepalPay QR" onclick="selectVisitPaymentMode('NepalPay QR')">NEPALPAY QR</button><button type="button" class="payment-mode" data-mode="MPOS" onclick="selectVisitPaymentMode('MPOS')">MPOS</button></div><input id="visitPaymentMode" type="hidden" value=""></div><div id="paymentHint" class="muted" style="margin-top:7px">Total payment selected — full procedure amount will be filled automatically.</div></div><div class="card" style="margin-top:12px;background:#f8fafb"><div class="section-title">Next Appointment</div><div class="formgrid"><div class="field"><label>Appointment Date</label><input id="appointmentAdDate" type="date"><div id="appointmentBsDateDisplay" class="muted">Nepali BS date will appear here</div></div><div class="field"><label>Appointment Time</label><input id="appointmentTime" type="time"></div></div><div class="quick-dates"><button type="button" class="btn secondary quick-date" data-days="3" onclick="setQuickAppointment(3,this)">AFTER 3 DAYS</button><button type="button" class="btn secondary quick-date" data-days="7" onclick="setQuickAppointment(7,this)">AFTER 1 WEEK</button><button type="button" class="btn secondary quick-date" data-days="30" onclick="setQuickAppointment(30,this)">AFTER 1 MONTH</button></div><div class="actions"><button class="btn primary" onclick="saveAppointment()">SAVE APPOINTMENT</button></div></div><div style="margin-top:12px"><button id="addVisitBtn" class="btn primary" onclick="addVisit()" disabled>ADD VISIT</button><span id="visitHint" class="muted" style="margin-left:10px">Add at least one procedure to enable Add Visit.</span></div></div>
 </div>
 <div class="grid2" style="margin-top:18px"><div class="card"><div class="section-title">Visit History</div>${visits.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Time</th><th>Procedures Done</th><th>Payment Done</th></tr></thead><tbody>${visits.map(v=>`<tr><td>${esc(v.date||'—')}</td><td>${esc(v.time||'—')}</td><td>${esc(v.procedures||v.treatment||'—')}<div class="muted">Cost: Rs. ${Number(v.cost||0).toLocaleString()}</div></td><td>Rs. ${Number(v.paymentDone||v.amount||0).toLocaleString()}${v.paymentMethod?`<div class="muted">${esc(v.paymentMethod)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No visits recorded yet.</div>'}</div><div class="card"><div class="section-title">Payment History</div>${pays.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Bill</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>${pays.map(v=>`<tr><td>${esc(v.date)}</td><td>${esc(v.billNumber)}</td><td>Rs. ${Number(v.amount||0).toLocaleString()}</td><td>${esc(v.method)}</td><td>${esc(v.status)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No payments recorded yet.</div>'}</div></div>`;
 restoreAppointmentFields(p);renderPendingProcedures();updatePaymentChoice();
}
function restoreAppointmentFields(p){const d=document.getElementById('appointmentAdDate'),t=document.getElementById('appointmentTime');if(!d||!t)return;if(p&&p.Appointment){d.value=p.Appointment.adDate||p.Appointment.date||'';t.value=p.Appointment.time||'';updateAppointmentBsDisplay()}else{d.value='';t.value='';updateAppointmentBsDisplay()}document.querySelectorAll('.quick-date').forEach(b=>b.classList.remove('primary'));}
function updateAppointmentBsDisplay(){const el=document.getElementById('appointmentBsDateDisplay'),d=document.getElementById('appointmentAdDate')?.value;if(!el)return;if(!d){el.textContent='Nepali BS date will appear here';return}el.textContent='BS conversion will be added with the calendar sync module.'}
function setQuickAppointment(days,btn){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+days);const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const el=document.getElementById('appointmentAdDate');if(el)el.value=iso;document.querySelectorAll('.quick-date').forEach(b=>b.classList.remove('primary'));if(btn)btn.classList.add('primary');updateAppointmentBsDisplay()}
function selectVisitPaymentMode(mode){const hidden=document.getElementById('visitPaymentMode');if(hidden)hidden.value=mode;document.querySelectorAll('.payment-mode').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));}
function updateVisitCost(){const sel=document.getElementById('visitProcedure'),opt=sel?.options[sel.selectedIndex],cost=document.getElementById('visitCost');if(!cost)return;if(!opt||!opt.value){cost.value='0';cost.placeholder='Enter amount';return}cost.value=opt.dataset.cost||0;cost.placeholder='Actual amount charged'}
function updateAppointmentAd(){}
function initNepaliAppointmentPicker(){}
function setTodayBsAppointment(){const d=new Date();d.setHours(0,0,0,0);const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const el=document.getElementById('appointmentAdDate');if(el)el.value=iso;updateAppointmentBsDisplay()}
function saveAppointment(){const p=patients.find(x=>x.id===selectedId);if(!p)return;const ad=document.getElementById('appointmentAdDate')?.value||'',t=document.getElementById('appointmentTime')?.value||'';if(!ad||!t){alert('Please select appointment date and time.');return}p.Appointment={adDate:ad,time:t};save();alert('Appointment saved for '+ad+' at '+t);renderProfile()}
function printLatestBill(){const p=patients.find(x=>x.id===selectedId);if(!p||!p.VisitHistory?.length){alert('No saved bill/visit found for this patient yet.');return}printBill(p.VisitHistory[0].billNumber)}

function updateAll(){const now=new Date();const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');const registered=registeredPatients();document.getElementById('statPatients').textContent=registered.length;document.getElementById('statToday').textContent=registered.filter(p=>p.Date===today).length;document.getElementById('statOpd').textContent=pad(nextNumber());document.getElementById('nextOpd').textContent=pad(nextNumber());document.getElementById('statPending').textContent=registered.filter(p=>(p.PaymentStatus||'Pending')==='Pending').length;document.getElementById('statAppointments').textContent=patients.filter(p=>p.Appointment&&p.Appointment.adDate===today).length;const todayAppointments=patients.filter(p=>p.Appointment&&p.Appointment.adDate===today).sort((a,b)=>String(a.Appointment.time||'').localeCompare(String(b.Appointment.time||'')));document.getElementById('todayAppointments').innerHTML=todayAppointments.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Time</th><th>OPD</th><th>Patient</th><th>Contact</th><th>Appointment</th></tr></thead><tbody>${todayAppointments.map(p=>`<tr><td><strong>${esc(p.Appointment.time||'')}</strong></td><td>${p.AppointmentOnly?'Not registered':pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact||'')}</td><td>${esc(p.Appointment.bsDate||p.Appointment.adDate||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No appointments scheduled for today.</div>';renderPatients();renderRecentPatients()}
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

  if (userWrap) userWrap.style.display = 'flex';

  const isSuperAdmin = currentUser?.role === 'superadmin';

  if (userBadge) {
    if (isSuperAdmin) {
      userBadge.innerHTML = `🛡️ <b>Super Admin</b> (${esc(currentUser.username)})`;
      userBadge.style.background = 'rgba(245, 158, 11, 0.25)';
      userBadge.style.borderColor = 'rgba(245, 158, 11, 0.5)';
      userBadge.style.color = '#fef3c7';
    } else {
      userBadge.innerHTML = `👤 <b>Manager</b> (${esc(currentUser.username)} • ${esc(currentUser.name)})`;
      userBadge.style.background = 'rgba(14, 165, 233, 0.25)';
      userBadge.style.borderColor = 'rgba(14, 165, 233, 0.5)';
      userBadge.style.color = '#e0f2fe';
    }
  }

  if (staffBtn) staffBtn.style.display = isSuperAdmin ? 'inline-block' : 'none';
  if (navStaff) navStaff.style.display = isSuperAdmin ? 'block' : 'none';

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

  const navStaff = document.getElementById('navStaff');
  if (navStaff) navStaff.style.display = 'none';

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
function renderTransactions(){const all=getTransactions(),list=all.filter(transactionMatches);const total=list.reduce((a,x)=>a+x.amount,0),cash=list.filter(x=>x.method==='Cash').reduce((a,x)=>a+x.amount,0),digital=list.filter(x=>x.method==='Scan'||x.method==='MPOS').reduce((a,x)=>a+x.amount,0);document.getElementById('txCount').textContent=list.length;document.getElementById('txTotal').textContent='Rs. '+total.toLocaleString();document.getElementById('txCash').textContent='Rs. '+cash.toLocaleString();document.getElementById('txDigital').textContent='Rs. '+digital.toLocaleString();document.getElementById('txTitle').textContent=transactionRange==='today'?"Today's Transactions":transactionRange==='week'?"This Week's Transactions":transactionRange==='month'?"This Month's Transactions":"All Transactions";document.getElementById('transactionRows').innerHTML=list.length?list.map(x=>`<tr class="clickable" onclick="openProfile('${x.id}')"><td>${esc(x.date)}</td><td>${esc(x.time||'—')}</td><td>${pad(x.opd)}</td><td>${esc(x.name)}</td><td>${esc(x.bill)}</td><td>Rs. ${x.amount.toLocaleString()}</td><td>${esc(x.method||'—')}</td><td>${esc(x.status)}</td></tr>`).join(''):`<tr><td colspan="8" class="empty">No transactions found for this period.</td></tr>`}
function renderRecentPatients(){const el=document.getElementById('recentPatients');if(!el)return;const ids=JSON.parse(localStorage.getItem('infinity_dental_recent_patients_v1')||'[]');const list=ids.map(id=>patients.find(p=>p.id===id)).filter(p=>p&&!p.AppointmentOnly);el.innerHTML=list.length?`<div class="tablewrap"><table class="table"><thead><tr><th>OPD</th><th>Patient</th><th>Contact</th></tr></thead><tbody>${list.map(p=>`<tr class="clickable" onclick="openProfile('${p.id}')"><td>${pad(p.OPDNumber)}</td><td>${esc(p.Name)}</td><td>${esc(p.Contact||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No recently opened patients.</div>'}
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
function applyTheme(){const dark=localStorage.getItem('infinity_dental_theme')==='dark';document.body.classList.toggle('dark',dark);const b=document.getElementById('themeToggle');if(b)b.textContent=dark?'☀️ Light Mode':'🌙 Dark Mode'}
function toggleTheme(){const dark=!document.body.classList.contains('dark');localStorage.setItem('infinity_dental_theme',dark?'dark':'light');applyTheme()}
applyTheme();
loadRegistrationDraft();function tick(){document.getElementById('clock').textContent=new Date().toLocaleString(undefined,{dateStyle:'medium',timeStyle:'medium'});setTimeout(tick,1000)}tick();updateAll();renderTransactions();initializeClinicDatabase();

// --- Hardware USB Serial & GitHub Updates Auto-Initialization ---
if (typeof navigator !== 'undefined' && navigator.serial) {
  navigator.serial.addEventListener('connect', (event) => {
    console.log('[WebSerial] USB device hot-plugged:', event.port);
    const pill = document.getElementById('niziHardwareStatusPill');
    if (pill) pill.textContent = 'USB Plugged In - Connecting...';
    autoConnectNiziUsb(true, event.port);
  });

  navigator.serial.addEventListener('disconnect', (_event) => {
    console.log('[WebSerial] USB device disconnected');
    handleNiziUsbDisconnect();
  });
}

if (window.dentalApp && window.dentalApp.onSerialDeviceChanged) {
  window.dentalApp.onSerialDeviceChanged((data) => {
    console.log('[Electron] Serial device change detected:', data);
    if (data.action === 'added') {
      autoConnectNiziUsb(true);
    } else if (data.action === 'removed') {
      handleNiziUsbDisconnect();
    }
  });
}

// Auto-detect and connect to NiZi POS USB and check updates on app startup
if (window.dentalApp && window.dentalApp.getVersion) {
  window.dentalApp.getVersion().then(v => {
    const headerBadge = document.getElementById('appVersionBadge');
    if (headerBadge) headerBadge.textContent = 'v' + v;
  });
}
setTimeout(() => {
  autoConnectNiziUsb(true);
  checkAppUpdates(false);
}, 1500);

// --- GitHub Client Updates ---
function openUpdateModal() {
  const modal = document.getElementById('updateModal');
  if (modal) modal.classList.add('show');
  const storedRepo = localStorage.getItem('infinity_dental_github_repo') || 'Sankalpannt/dental-';
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
  const repo = (input?.value || localStorage.getItem('infinity_dental_github_repo') || 'Sankalpannt/dental-').trim();
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

  // If in web browser or electron helper not available, fallback to external download
  if (!window.dentalApp || !window.dentalApp.downloadUpdate) {
    downloadAppUpdate(downloadUrl);
    return;
  }

  isDownloadingUpdate = true;
  const downloadArea = document.getElementById('updateDownloadArea');
  const statusText = document.getElementById('downloadStatusText');
  const percentText = document.getElementById('downloadPercentText');
  const bytesText = document.getElementById('downloadBytesText');
  const progressBar = document.getElementById('updateProgressBar');
  const inAppBtn = document.getElementById('inAppDownloadBtn');
  const checkBtn = document.getElementById('checkUpdateBtn');
  const closeBtn = document.getElementById('updateModalCloseBtn');
  const installArea = document.getElementById('installActionsArea');

  if (downloadArea) downloadArea.style.display = 'block';
  if (inAppBtn) inAppBtn.disabled = true;
  if (checkBtn) checkBtn.disabled = true;
  if (installArea) installArea.style.display = 'none';

  if (statusText) statusText.textContent = 'Downloading update directly inside the app...';
  if (progressBar) progressBar.style.width = '0%';
  if (percentText) percentText.textContent = '0%';
  if (bytesText) bytesText.textContent = 'Connecting...';

  // Listen to download progress
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
    if (inAppBtn) inAppBtn.disabled = false;
  } finally {
    isDownloadingUpdate = false;
    if (checkBtn) checkBtn.disabled = false;
  }
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
const APPT_BS_LENGTHS={2083:[31,31,32,31,31,31,30,29,30,29,30,30]};
const APPT_BS_ANCHOR={y:2083,m:5,d:27,ad:'2026-09-12'};
let appointmentMode='BS';
let appointmentSelectedAD='2026-09-12';
let appointmentView={y:2083,m:5};
function apptPad(n){return String(n).padStart(2,'0')}
function apptIsoDate(d){return d.getFullYear()+'-'+apptPad(d.getMonth()+1)+'-'+apptPad(d.getDate())}
function apptParseIso(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]);return d.getFullYear()==+m[1]&&d.getMonth()==+m[2]-1&&d.getDate()==+m[3]?d:null}
function apptBsToIndex(y,m,d){let idx=0;for(let yy=2083;yy<y;yy++){const lens=APPT_BS_LENGTHS[yy];if(!lens)return null;idx+=lens.reduce((x,v)=>x+v,0)}for(let mm=1;mm<m;mm++)idx+=APPT_BS_LENGTHS[y]?.[mm-1]||0;return idx+(d-1)}
function apptAdFromBs(bs){const parts=String(bs).split('-').map(Number);if(parts.length!==3)return null;const [y,m,d]=parts,lens=APPT_BS_LENGTHS[y];if(!lens||m<1||m>12||d<1||d>lens[m-1])return null;const anchorBs=apptBsToIndex(2083,5,27),target=apptBsToIndex(y,m,d);if(anchorBs==null||target==null)return null;const base=new Date(2026,8,12);base.setDate(base.getDate()+target-anchorBs);return apptIsoDate(base)}
function apptBsFromAd(ad){const date=apptParseIso(ad);if(!date)return null;const base=new Date(2026,8,12);const diff=Math.round((date-base)/86400000);let target=apptBsToIndex(2083,5,27)+diff,y=2083,m=1;while(true){const lens=APPT_BS_LENGTHS[y];if(!lens)return null;const total=lens.reduce((x,v)=>x+v,0);if(target<total)break;target-=total;y++;}while(target>=APPT_BS_LENGTHS[y][m-1]){target-=APPT_BS_LENGTHS[y][m-1];m++;if(m>12)return null}return y+'-'+apptPad(m)+'-'+apptPad(target+1)}
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
  }
};

/* --- NepalPay Dynamic QR & NiZi POS Controller --- */
let niziSerialPort = null;
let niziSerialWriter = null;
let activeQrTransaction = null;
let qrCountdownTimer = null;
let onActiveQrSuccessCallback = null;
let recentNepalPayTransactions = [];

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
let niziSerialReader = null;
let niziIsConnecting = false;

async function autoConnectNiziUsb(silent = false, specificPort = null) {
  if (!navigator.serial) {
    if (!silent) {
      alert('Web Serial is supported on Google Chrome, Microsoft Edge, and the desktop Electron app.\nPlease use one of these to connect directly to the USB soundbox.');
    }
    return;
  }
  if (niziSerialPort && niziSerialPort.readable && niziSerialWriter) {
    if (!silent) alert('NiZi POS B33 is already connected via USB!');
    return;
  }
  if (niziIsConnecting) return;
  niziIsConnecting = true;

  try {
    let port = specificPort;
    if (!port) {
      const ports = await navigator.serial.getPorts();
      if (ports && ports.length > 0) {
        port = ports[0];
      }
    }

    if (!port) {
      if (silent) {
        niziIsConnecting = false;
        return;
      }
      try {
        port = await navigator.serial.requestPort();
      } catch (reqErr) {
        console.warn('requestPort result:', reqErr);
        if (!silent) {
          alert('No USB device selected.\n\nPlease connect the NiZi POS B33 USB cable to this PC, ensure the power is on, and try again.');
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
      await port.open({ baudRate: 115200 });
    } catch (openErr) {
      console.log('Port already open or status:', openErr.message);
    }

    if (port.writable) {
      niziSerialWriter = port.writable.getWriter();
    }
    niziSerialPort = port;

    const statusPill = document.getElementById('niziHardwareStatusPill');
    if (statusPill) {
      statusPill.textContent = 'USB Connected (115200)';
      statusPill.className = 'status-pill live';
    }
    const label = document.getElementById('niziPortLabel');
    if (label) label.textContent = 'Hardware Connected via USB (Auto-detected)';
    const btn = document.getElementById('niziUsbConnectBtn');
    if (btn) {
      btn.textContent = '✓ USB CONNECTED';
      btn.className = 'btn primary';
    }

    readNiziSerialLoop(port);
    sendNiziCommand({ command: 'display_logo', title: 'Infinity Dental' });

    if (!silent) {
      alert('NiZi POS B33 connected successfully via USB!');
    }
  } catch(e) {
    console.error('NiZi USB connection error:', e);
    if (!silent && e.name !== 'AbortError') {
      alert('Could not connect NiZi POS device:\n' + e.message);
    }
  } finally {
    niziIsConnecting = false;
  }
}

async function connectNiziUsb() {
  await autoConnectNiziUsb(false);
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
    statusPill.textContent = 'Disconnected / Offline';
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
      const data = new TextEncoder().encode(JSON.stringify(cmd) + '\n');
      await niziSerialWriter.write(data);
    } catch(e) {
      console.warn('NiZi serial write error:', e);
    }
  }
  try {
    fetch('/api/nizi/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    }).catch(() => {});
  } catch(e) {}
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
    setTimeout(() => {
      const wrap = document.getElementById('niziDeviceQrWrap');
      if (wrap && window.QRCode) {
        new QRCode(wrap, {
          text: cmd.payload,
          width: 136,
          height: 136,
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    }, 40);
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

function testNiziChime() {
  speakVoicePayment(1500);
}

function testNiziSuccessScreen() {
  sendNiziCommand({
    command: 'success',
    amount: 1500,
    currency: 'NPR',
    payload: 'Payment of 1500 rupees received successfully'
  });
}

function testNiziQr() {
  sendNiziCommand({
    command: 'show_qr',
    payload: '00020101021226580011np.nchl.www01100000250102112501F6MCTZZ52045541530352454071500.005802NP5915Infinity Dental6009Kathmandu62200109B-TEST0010709Terminal16304',
    amount: 1500,
    currency: 'NPR',
    billNumber: 'B-TEST001',
    title: 'Infinity Dental'
  });
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

  amountEl.textContent = 'Rs. ' + Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
  infoEl.textContent = `Patient: ${patientName || 'Walk-in'} | Bill: ${billNumber || '—'} | OPD: ${opdNumber ? pad(opdNumber) : '—'}`;
  canvasWrap.innerHTML = '<div style="padding:40px;color:var(--muted)">Generating NepalPay QR...</div>';
  statusPill.textContent = 'Connecting to NCHL ConnectIPS...';
  statusPill.className = 'status-pill live';
  modal.classList.add('show');

  try {
    const res = await fetch('/api/nepalpay/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, billNumber, remarks, patientName, patientContact, opdNumber })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not generate QR');

    activeQrTransaction = data;
    canvasWrap.innerHTML = '';

    if (window.QRCode) {
      new QRCode(canvasWrap, {
        text: data.qrString,
        width: 190,
        height: 190,
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    statusPill.textContent = 'Awaiting Payment on NepalPay WebSocket';
    statusPill.className = 'status-pill live';

    sendNiziCommand({
      command: 'show_qr',
      payload: data.qrString,
      amount: amount,
      currency: 'NPR',
      billNumber: billNumber,
      title: 'Infinity Dental'
    });

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
      traceId: data.validationTraceId,
      billNumber: billNumber,
      patientName: patientName,
      amount: amount,
      status: 'PENDING',
      time: new Date().toLocaleTimeString()
    });

  } catch(e) {
    canvasWrap.innerHTML = `<div style="padding:20px;color:#b91c1c">Failed to generate QR: ${e.message}</div>`;
    statusPill.textContent = 'Generation Failed';
    statusPill.className = 'status-pill disconnected';
  }
}

function closeNepalPayModal() {
  if (qrCountdownTimer) clearInterval(qrCountdownTimer);
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
    if (!data.success) throw new Error(data.error || 'Simulation failed');
  } catch(e) {
    alert('Simulate payment error: ' + e.message);
  }
}

function handlePaymentReceivedEvent(eventData) {
  const found = recentNepalPayTransactions.find(t => t.traceId === eventData.traceId);
  if (found) {
    found.status = 'SUCCESS';
    found.txnId = eventData.txnId;
    renderNepalPayTxnTable();
  }

  if (activeQrTransaction && activeQrTransaction.validationTraceId === eventData.traceId) {
    const cb = onActiveQrSuccessCallback;
    closeNepalPayModal();
    if (cb) cb(eventData);
    else {
      alert(`Payment of Rs. ${Number(eventData.amount||0).toLocaleString()} received successfully!\nTxn ID: ${eventData.txnId}`);
    }
  }
}

function setupSseListener() {
  try {
    const sse = new EventSource('/api/events');
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'payment_received') {
          handlePaymentReceivedEvent(data);
        } else if (data.type === 'nizi_command') {
          updateNiziDeviceDisplay(data.command);
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
  const bill = (document.getElementById('testQrBillNo')?.value || ('B-' + Date.now())).trim();
  const rem = (document.getElementById('testQrRemarks')?.value || 'Dental Treatment').trim();

  openNepalPayModal({
    amount: amt,
    billNumber: bill,
    patientName: patient,
    remarks: rem,
    onSuccess: (data) => {
      alert(`Demo payment confirmed!\nAmount: Rs. ${amt}\nTxn ID: ${data.txnId}`);
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

