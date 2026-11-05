import {inputs,range,values,money,amount,filename,swiss,iso} from './model.js';
import {importReport,renderPdf} from './pdf.js';

const content=document.querySelector('#content');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={dashboard:'Übersicht',editor:'Rapporteditor',people:'Mitarbeitende',files:'Dokumente',guide:'Anleitung'};
let screen='dashboard',state={reports:[],people:[],docs:[]},draft=null,query='',project='',uploadFor=null,busy=false,toastTimer,previewURL;
const dbPromise=new Promise((resolve,reject)=>{
 const req=indexedDB.open('navolta-rapportstudio',1);
 req.onupgradeneeded=()=>req.result.createObjectStore('workspace');
 req.onsuccess=()=>resolve(req.result);
 req.onerror=()=>reject(req.error);
});
async function transaction(mode,run){
 const db=await dbPromise;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('workspace',mode);
  const req=run(tx.objectStore('workspace'));
  tx.oncomplete=()=>resolve(req.result);
  tx.onabort=tx.onerror=()=>reject(tx.error||req.error);
 });
}
async function persist(next){
 await transaction('readwrite',store=>store.put(next,'data'));
 state=next;
}
function notify(s,hold=false){
 clearTimeout(toastTimer);
 document.querySelector('#toast').textContent=s;
 if(!hold)toastTimer=setTimeout(()=>document.querySelector('#toast').textContent='',5200);
}
const id=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const dateNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich'}).format(new Date());
const btn=(label,action,style='secondary',arg='')=>'<button type="button" class="button '+style+'" data-action="'+action+'" data-id="'+esc(arg)+'">'+label+'</button>';
const noRows=(title,desc,extra='')=>'<div class="empty"><strong>'+title+'</strong><p>'+desc+'</p>'+extra+'</div>';
const header=(over,title,sub,actions='')=>'<div class="page-head"><div><p class="eyebrow">'+over+'</p><h1>'+title+'</h1><p>'+sub+'</p></div><div class="actions">'+actions+'</div></div>';
const field=(label,key,type='text',extra='')=>'<label class="field '+extra+'">'+label+control(key,label,type)+'</label>';
const control=(k,label,type='text')=>'<input aria-label="'+esc(label)+'" data-field="'+k+'" type="'+type+'" '+(type==='number'?'step="any" inputmode="decimal" ':'')+'value="'+esc(draft.data[k])+'">';
const lineData=(r)=>values(r.data);
const titleOf=r=>r.data.number||r.data.order||'Entwurf';
const report=r=>state.reports.find(x=>x.id===r);
const docFor=r=>state.docs.filter(x=>x.reportId===r);
function render(){
 document.querySelector('#crumb').textContent=names[screen];
 document.querySelectorAll('[data-nav]').forEach(b=>b.dataset.nav===screen?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
 content.innerHTML=({dashboard,editor,people,files,guide}[screen])();
}
function go(s){screen=s;if(s==='editor'&&!draft)draft=blank();render();refreshTotals();window.scrollTo(0,0);}
function blank(data={}){return {id:id(),data:{date:dateNow(),...data},reviewed:true,source:null};}
function dashboard(){
 const projects=[...new Set(state.reports.map(r=>r.data.order).filter(Boolean))].sort();
 const filtered=state.reports.filter(r=>(!project||r.data.order===project)&&(!query||[r.data.number,r.data.order,r.data.project,r.data.client,r.data.location,r.data.lead,...range(5).map(i=>r.data['people.'+i+'.name'])].join(' ').toLowerCase().includes(query.toLowerCase())));
 const approved=filtered.filter(r=>r.reviewed);
 const summed=approved.reduce((s,r)=>{const v=lineData(r);return {total:s.total+v.total,hours:s.hours+v.hours}}, {total:0,hours:0});
 const metrics=[['Gesamtbetrag','CHF '+money(summed.total/100),'Geprüfte Rapporte'],['Arbeitsstunden',money(summed.hours)+' h','Normal- und Überstunden'],['Rapporte',filtered.length,approved.length+' geprüft'],['Einzelbelege',state.docs.length,'Dateien im Dokumentenarchiv']];
 return '<section class="hero"><div><p class="eyebrow">PROJEKTCONTROLLING</p><h1>Regierapporte</h1><p>Rapporte erfassen, bestehende Vorlagen einlesen und Beträge pro Auftrag zusammenzählen.</p></div><div class="actions">'+btn('+ Neuer Rapport','new','primary')+btn('↑ PDF oder Scan','import')+'</div></section>'+
 '<div class="metrics">'+metrics.map(([a,b,c])=>'<div class="metric"><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></div>').join('')+'</div>'+
 '<section class="panel"><div class="panel-title"><h2>Rapportliste</h2><div class="actions">'+btn('Kamera-Scan','camera')+btn('Summenliste CSV','csv')+'</div></div>'+
 '<div class="filters"><input type="search" id="query" aria-label="Rapporte suchen" placeholder="Rapport, Projekt, Kunde oder Mitarbeiter suchen" value="'+esc(query)+'"><select id="project" aria-label="Auftrag filtern"><option value="">Alle Aufträge</option>'+projects.map(x=>'<option '+(x===project?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div><div id="report-list">'+reportTable(filtered)+'</div></section>';
}
function reportTable(rows){
 if(!rows.length)return noRows(state.reports.length?'Keine Treffer':'Noch keine Rapporte',state.reports.length?'Suchbegriff oder Auftragsfilter ändern.':'Starte mit einem neuen Rapport oder importiere ein vorhandenes PDF.',state.reports.length?'':btn('+ Neuer Rapport','new','primary'));
 return '<div class="table-scroll"><table class="table"><thead><tr><th>Rapport</th><th>Projekt / Kunde</th><th>Datum</th><th>Status</th><th class="num">Betrag CHF</th><th>Aktion</th></tr></thead><tbody>'+[...rows].reverse().map(r=>'<tr><td><strong>'+esc(titleOf(r))+'</strong></td><td>'+esc(r.data.project||r.data.location||'')+'<br><span class="subtle">'+esc(r.data.client||'')+'</span></td><td class="nowrap">'+esc(swiss(r.data.date||''))+'</td><td><span class="badge '+(!r.reviewed?'warn':'')+'">'+(r.reviewed?'Erfasst':'Prüfen')+'</span></td><td class="num">'+money(lineData(r).total/100)+'</td><td>'+btn('Öffnen','edit','secondary',r.id)+'</td></tr>').join('')+'</tbody></table></div>';
}
const flags=['Regie','Vertrag','Garantie','Arbeit fertig','Arbeit nicht fertig'];
const basics=[['Auftragsnummer','order'],['Rapportnummer','number'],['Kennwort / Projekt','project'],['Rapportdatum','date','date'],['Termin / Zeitraum','period'],['Projektleiter/in','lead']];
const clients=[['Kunde','client'],['Strasse','clientStreet'],['PLZ / Ort','clientCity'],['Ansprechperson','clientContact'],['Telefon','clientPhone']];
const sites=[['Arbeitsort','location'],['Strasse','siteStreet'],['PLZ / Ort','siteCity'],['Ansprechperson','siteContact'],['Telefon','sitePhone']];
function editor(){
 const d=draft.data, source=draft.source;
 const note=source?'<section class="notice"><strong>Import · '+esc(source.mode)+'</strong><p>Originalbetrag: '+(source.sourceTotal?'CHF '+esc(source.sourceTotal):'nicht erkannt')+'. Prüfe Namen, Tagesstunden, Ansätze und Material am Original.</p><div class="actions">'+btn('Original öffnen','show-doc','secondary',source.docId)+'</div>'+(source.raw?'<details><summary>Erkannten Text anzeigen</summary><pre>'+esc(source.raw)+'</pre></details>':'')+'<label class="checks"><input type="checkbox" id="reviewed" '+(draft.reviewed?'checked':'')+'> Ich habe die importierten Felder mit dem Original abgeglichen.</label></section>':'';
 const work=range(7).map(i=>d['work.'+i]||'').join('\n').trimEnd();
 return header('ERFASSUNG',esc(d.number||'Neuer Rapport'),'Originalformular · 5 Mitarbeitende · 8 Tagesfelder · 16 Materialpositionen und Kleinmaterial',(report(draft.id)?btn('Als neuen Rapport kopieren','duplicate','secondary',draft.id):'')+btn('Vorschau','pdf-preview')+btn('PDF herunterladen','pdf','primary'))+
 note+'<section class="panel"><h2>1 · Auftrag</h2><div class="grid">'+basics.map(x=>field(...x)).join('')+'</div><div class="checks">'+flags.map((x,i)=>'<label><input type="checkbox" data-field="flag.'+i+'" '+(d['flag.'+i]?'checked':'')+'>'+x+'</label>').join('')+'</div></section>'+
 '<section class="panel"><h2>2 · Kunde</h2><div class="grid">'+clients.map(x=>field(...x)).join('')+'</div></section>'+
 '<section class="panel"><h2>3 · Einsatz und Arbeiten</h2><div class="grid">'+sites.map(x=>field(...x)).join('')+field('Anlage','system','text','wide')+'<label class="field wide">Arbeiten (maximal 7 Formularzeilen)<textarea id="work" rows="3">'+esc(work)+'</textarea></label></div></section>'+
 '<section class="panel"><div class="panel-title"><h2>4 · Stunden und Geräte</h2><span class="subtle">Überstunden zum separat eingegebenen Ansatz</span></div><datalist id="team">'+state.people.map(p=>'<option value="'+esc(p.name)+'"></option>').join('')+'</datalist><div class="table-scroll"><table class="table worktable"><thead><tr><th>Monteur / Gerät</th><th>Typ</th>'+range(8).map(i=>'<th>'+control('days.'+i,'Datum Tag '+(i+1),'date')+'</th>').join('')+'<th class="num">Menge</th><th class="num">Ansatz</th><th class="num">CHF</th></tr></thead><tbody>'+range(13).map(workRow).join('')+'</tbody></table></div></section>'+
 '<section class="panel"><h2>5 · Material</h2><div class="table-scroll"><table class="table material-table"><thead><tr><th>Bezeichnung</th><th>Menge</th><th>Einheitspreis CHF</th><th class="num">Total CHF</th></tr></thead><tbody>'+range(17).map(i=>{
 const k='mat.'+i;
 return '<tr><td>'+(i===16?'Kleinmaterial':control(k+'.name','Materialposition '+(i+1)))+'</td><td>'+control(k+'.qty','Menge '+(i+1),'number')+'</td><td>'+control(k+'.rate','Einheitspreis '+(i+1),'number')+'</td><td class="num" data-calc="'+k+'.total"></td></tr>';
 }).join('')+'</tbody></table></div></section>'+
 '<section class="panel"><div class="panel-title"><h2>6 · Dokumente zum Rapport</h2>'+btn('+ Einzelbeleg hochladen','upload','secondary',draft.id)+'</div>'+docsTable(docFor(draft.id),false)+'</section>'+
 '<section class="panel summary"><div><span class="subtle">Arbeit CHF <b data-calc="labor"></b> · Material CHF <b data-calc="material"></b></span><br><strong>Total CHF <span data-calc="total"></span></strong></div><div class="actions">'+(report(draft.id)?btn('Löschen','delete','danger',draft.id):'')+btn('Rapport speichern','save','primary')+'</div></section>';
}
function workRow(i){
 const k='lab.'+i, slot='people.'+Math.floor(i/2)+'.name';
 let label=i<10?'':i===10?'Servicewagen':i===11?'Installationsprüfgerät':control('special','Spezialwerkzeug');
 if(i<10&&i%2===0)label='<input list="team" aria-label="Monteur '+(Math.floor(i/2)+1)+'" data-field="'+slot+'" placeholder="Name eingeben" value="'+esc(draft.data[slot])+'">';
 return '<tr><td>'+label+'</td><td class="nowrap">'+(i<10?(i%2?'Überstd.':'Norm.Std.'):i===10?'Pauschal':'Std.')+'</td>'+range(8).map(j=>'<td>'+control(k+'.days.'+j,'Menge Zeile '+(i+1)+', Tag '+(j+1),'number')+'</td>').join('')+'<td class="num" data-calc="'+k+'.qty"></td><td>'+control(k+'.rate','Ansatz Zeile '+(i+1),'number')+'</td><td class="num" data-calc="'+k+'.total"></td></tr>';
}
function refreshTotals(){
 if(screen!=='editor'||!draft)return;
 const {v}=values(draft.data);
 content.querySelectorAll('[data-calc]').forEach(x=>x.textContent=v[x.dataset.calc]||'');
}
function people(){
 return header('STAMMDATEN','Mitarbeitende','Namen und Ansätze individuell pflegen. Gespeicherte Rapporte behalten ihre eigenen Ansätze.',btn('+ Person hinzufügen','person-add','primary'))+
 '<section class="panel"><h2>Personenliste</h2>'+(!state.people.length?noRows('Noch keine Mitarbeitenden','Personen können hier oder direkt im Rapport erfasst werden.'): '<div class="table-scroll"><table class="table"><thead><tr><th>Name</th><th>Normal CHF/h</th><th>Überstunden CHF/h</th><th>Aktion</th></tr></thead><tbody>'+state.people.map(p=>'<tr data-person="'+p.id+'"><td><input aria-label="Name" data-p="name" value="'+esc(p.name)+'"></td><td><input aria-label="Normalansatz" type="number" step="any" data-p="rate" value="'+esc(p.rate)+'"></td><td><input aria-label="Überstundenansatz" type="number" step="any" data-p="overtime" value="'+esc(p.overtime)+'"></td><td><div class="actions">'+btn('Speichern','person-save','primary',p.id)+btn('Entfernen','person-delete','danger',p.id)+'</div></td></tr>').join('')+'</tbody></table></div>')+'</section>';
}
function docsTable(docs,all){
 if(!docs.length)return noRows('Keine Dokumente','PDFs, Scans und weitere Belege können einzeln abgelegt werden.');
 return '<div class="table-scroll"><table class="table"><thead><tr><th>Datei</th><th>Grösse</th>'+(all?'<th>Zuordnung</th>':'')+'<th>Aktion</th></tr></thead><tbody>'+[...docs].reverse().map(d=>'<tr><td>'+esc(d.name)+'</td><td class="nowrap">'+Math.max(1,Math.round(d.file.size/1024))+' KB</td>'+(all?'<td><select aria-label="Rapport zuordnen" data-doc-link="'+d.id+'"><option value="">Ohne Zuordnung</option>'+state.reports.map(r=>'<option value="'+r.id+'" '+(r.id===d.reportId?'selected':'')+'>'+esc(titleOf(r))+'</option>').join('')+'</select></td>':'')+'<td><div class="actions">'+btn('Öffnen','show-doc','secondary',d.id)+btn('Download','download-doc','secondary',d.id)+btn('Entfernen','delete-doc','danger',d.id)+'</div></td></tr>').join('')+'</tbody></table></div>';
}
function files(){
 return header('ABLAGE','Dokumente','Einzelne PDFs, Fotos und weitere Belege hochladen und einem Rapport zuordnen.',btn('+ Dokument hochladen','upload','primary'))+'<section class="panel"><h2>Dokumentenarchiv</h2>'+docsTable(state.docs,true)+'</section>';
}
function guide(){
 return header('KURZANLEITUNG','So arbeitest du mit dem Rapportstudio','Erfassen, prüfen, benennen und ablegen.')+
 '<section class="panel guide"><h2>Neuen Rapport erstellen</h2><ol><li>Wähle <b>Neuer Rapport</b>. Erfasse Auftragsnummer, fortlaufende Rapportnummer, Kunde, Arbeitsort und das Datum, das im Rapport stehen soll.</li><li>Trage Tage, Mitarbeitende, Stunden, Ansätze und Material ein. Stunden und Ansätze werden je Zeile multipliziert und auf Rappen gerundet. Für Überstunden gilt der separat erfasste CHF-Stundenansatz. Die Vorlage weist keine separate MWST aus.</li><li>Prüfe den Rapport in der <b>Vorschau</b>, speichere ihn und lade das PDF herunter.</li></ol></section>'+
 '<section class="panel guide"><h2>Vorhandenen Rapport scannen oder importieren</h2><ol><li>Wähle <b>Rapport importieren</b> für ein einseitiges PDF oder ein Foto. Auf dem Handy öffnet <b>Kamera-Scan</b> die Kamera, sofern der Browser das unterstützt. Fotografiere die ganze Seite möglichst gerade und ohne Schatten.</li><li>Die App liest PDF-Text oder versucht die Texterkennung im Raster der Originalvorlage. Vergleiche Nummer, Datum, Namen, Tagesstunden, Ansätze und Beträge mit dem angehängten Original. Korrigiere Abweichungen im Editor.</li><li>Setze die Prüfbestätigung und speichere den Rapport. Erst dann fliesst er in die Übersicht ein. Wenn du eine neue Version mit anderer Nummer brauchst, nutze die Kopierfunktion nach dem Speichern.</li></ol><p>Mehrseitige oder anders formatierte Rapporte kannst du als Dokument ablegen und die Werte im Editor erfassen.</p></section>'+
 '<section class="panel guide"><h2>Dateien benennen</h2><p><b>Rapport:</b> <code>Auftragsnummer_Laufnummer_Regierapport_Arbeitsort_JJJJ-MM-TT.pdf</code></p><p>Beispiel: <code>1260025_002_Regierapport_Mieterausbau_AME_2026-09-30.pdf</code>. Die Nummer auf dem Formular lautet <code>1260025.002</code>. Die App erzeugt den Dateinamen aus dem Rapportdatum. Führe die Laufnummer pro Auftrag dreistellig weiter.</p><p><b>Einzelbeleg:</b> <code>1260025_002_Beleg_Lieferschein_2026-09-25.pdf</code>. Benenne die Datei vor dem Upload und lade jeden Beleg separat hoch.</p></section>'+
 '<section class="panel guide"><h2>Ablage und Datensicherung</h2><p>Rapporte und Dateien werden in diesem Browserprofil gespeichert. Die Übersicht summiert die geprüften Rapporte im aktiven Filter. Eine Sicherung enthält Rapporte, Mitarbeitende und Belege. Beim Wiederherstellen ersetzt sie den aktuellen Arbeitsbereich.</p><div class="actions">'+btn('Sicherung exportieren','backup','primary')+btn('Sicherung einlesen','restore')+'</div></section>';
}
function saveBlob(file,name){
 const url=URL.createObjectURL(file);
 const a=document.createElement('a');a.href=url;a.download=name;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function showBlob(file,label){
 const dlg=document.querySelector('#preview');
 if(previewURL)URL.revokeObjectURL(previewURL);
 previewURL=URL.createObjectURL(file);
 document.querySelector('#preview-label').textContent=label;
 dlg.querySelector('iframe').src=previewURL;
 if(!dlg.open)dlg.showModal();
}
document.querySelector('#preview').addEventListener('close',()=>{
 document.querySelector('#preview iframe').removeAttribute('src');
 if(previewURL)URL.revokeObjectURL(previewURL);
 previewURL=null;
});
function validate(){
 const {data:d}=draft;
 const work=document.querySelector('#work')?.value.trimEnd().split('\n')||[];
 if(work.length>7)throw Error('Die Originalvorlage hat sieben Zeilen für den Arbeitstext.');
 if(content.querySelector('input:invalid'))throw Error('Bitte prüfe die Zahlen- und Datumsfelder.');
 if(!d.order?.trim()||!d.number?.trim()||!d.date)throw Error('Auftragsnummer, Rapportnummer und Datum sind erforderlich.');
}
async function saveReport(){
 if(draft.reviewed||!draft.source)validate();
 if(draft.data.number&&state.reports.some(r=>r.id!==draft.id&&r.data.order===draft.data.order&&r.data.number===draft.data.number))throw Error('Diese Rapportnummer ist für den Auftrag bereits erfasst. Öffne den bestehenden Rapport oder vergib eine neue Laufnummer.');
 const updated=structuredClone(draft);
 await persist({...state,reports:[...state.reports.filter(r=>r.id!==updated.id),updated]});
 render();refreshTotals();notify('Rapport gespeichert.');
}
function numCSV(value){return String(value).replace('.',',');}
function csvCell(value){
 let t=String(value??'');
 if(/^[=+@\-]/.test(t)&&!/^[-+]?\d+([.,]\d+)?$/.test(t))t="'"+t;
 return '"'+t.replace(/"/g,'""')+'"';
}
function saveCSV(){
 const rows=state.reports.filter(r=>r.reviewed&&(!project||r.data.order===project)&&(!query||[r.data.number,r.data.order,r.data.project,r.data.client,r.data.location,r.data.lead,...range(5).map(i=>r.data['people.'+i+'.name'])].join(' ').toLowerCase().includes(query.toLowerCase())));
 const totals={work:0,materials:0,total:0,hours:0};
 const lines=[['Auftrag','Rapport','Projekt','Datum','Stunden','Arbeit CHF','Material CHF','Total CHF']];
 for(const r of rows){
  const v=values(r.data);
  Object.keys(totals).forEach(k=>totals[k]+=v[k]);
  lines.push([r.data.order,r.data.number,r.data.project,r.data.date,numCSV(v.hours),numCSV((v.work/100).toFixed(2)),numCSV((v.materials/100).toFixed(2)),numCSV((v.total/100).toFixed(2))]);
 }
 lines.push(['','GESAMT','','',numCSV(totals.hours),numCSV((totals.work/100).toFixed(2)),numCSV((totals.materials/100).toFixed(2)),numCSV((totals.total/100).toFixed(2))]);
 saveBlob(new Blob(['\ufeff'+lines.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'Navolta_Rapportsummen_'+dateNow()+'.csv');
}
async function execute(action,key){
 switch(action){
  case 'new': draft=blank();go('editor');break;
  case 'edit': draft=structuredClone(report(key));go('editor');refreshTotals();break;
  case 'import': document.querySelector('#import-file').click();break;
  case 'camera': document.querySelector('#camera-file').click();break;
  case 'upload': uploadFor=key||null;document.querySelector('#doc-file').click();break;
  case 'save': await saveReport();break;
  case 'csv': saveCSV();break;
  case 'pdf':
  case 'pdf-preview':{
   validate();
   if(action==='pdf'&&!draft.reviewed)throw Error('Bitte prüfe den Import vor dem PDF-Export.');
   const blob=new Blob([await renderPdf(draft.data)],{type:'application/pdf'});
   if(action==='pdf')saveBlob(blob,filename(draft.data));
   else showBlob(blob,filename(draft.data));
   break;
  }
  case 'close-preview':document.querySelector('#preview').close();break;
  case 'delete':
   if(confirm('Rapport löschen? Die zugeordneten Belege bleiben im Archiv.')){
    await persist({...state,reports:state.reports.filter(r=>r.id!==key),docs:state.docs.map(d=>d.reportId===key?{...d,reportId:null}:d)});
    draft=null;go('dashboard');notify('Rapport gelöscht.');
   }break;
  case 'person-add':{
   const p={id:id(),name:'',rate:'',overtime:''};
   await persist({...state,people:[...state.people,p]});render();content.querySelector('[data-person="'+p.id+'"] input').focus();break;
  }
  case 'person-save':{
   const row=content.querySelector('[data-person="'+key+'"]');
   const p={id:key,...Object.fromEntries([...row.querySelectorAll('[data-p]')].map(x=>[x.dataset.p,x.value.trim()]))};
   if(!p.name)throw Error('Bitte gib einen Namen ein.');
   if(state.people.some(x=>x.id!==key&&x.name.toLowerCase()===p.name.toLowerCase()))throw Error('Diese Person ist bereits erfasst.');
   await persist({...state,people:state.people.map(x=>x.id===key?p:x)});notify('Mitarbeiterdaten gespeichert.');break;
  }
  case 'person-delete':
   if(confirm('Person aus den Stammdaten entfernen?')){
    await persist({...state,people:state.people.filter(p=>p.id!==key)});render();
   }break;
  case 'show-doc':
  case 'download-doc':{
   const d=state.docs.find(x=>x.id===key);
   if(!d)throw Error('Das Original ist im Dokumentenarchiv nicht mehr vorhanden.');
   if(action==='show-doc'&&/^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(d.file.type))showBlob(d.file,d.name);
   else saveBlob(d.file,d.name);
   break;
  }
  case 'delete-doc':
   if(confirm('Dieses Dokument aus dem Archiv entfernen?')){
    await persist({...state,docs:state.docs.filter(d=>d.id!==key)});render();refreshTotals();
   }break;
  case 'backup':{
   const docs=await Promise.all(state.docs.map(d=>new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve({...d,file:r.result});r.onerror=reject;r.readAsDataURL(d.file);
   })));
   saveBlob(new Blob([JSON.stringify({...state,docs,version:1})],{type:'application/json'}),'Navolta_Rapporte_Sicherung_'+dateNow()+'.json');break;
  }
  case 'restore':document.querySelector('#restore-file').click();break;
  case 'duplicate':{
   const source=report(key);
   const d={...source.data};
   const tail=d.number?.match(/\.(\d+)$/);
   const num=tail?Number(tail[1])+1:1;
   let next=num;
   while(state.reports.some(r=>r.data.order===d.order&&r.data.number===d.order+'.'+String(next).padStart(3,'0')))next++;
   d.number=d.order?d.order+'.'+String(next).padStart(3,'0'):'';
   draft=blank({...d,date:dateNow()});go('editor');refreshTotals();notify('Kopie erstellt. Passe Datum und Angaben für den neuen Rapport an.');break;
  }
 }
}
function updateSearch(){
 const active=document.activeElement;
 const type=active?.id;
 const index=active?.selectionStart;
 render();
 const next=type&&document.getElementById(type);
 if(next){
  next.focus();
  if(type==='query'&&index!==null)next.setSelectionRange(index,index);
 }
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-nav],[data-action]');
 if(!button||busy)return;
 try{
  if(button.dataset.nav){go(button.dataset.nav);refreshTotals();}
  else{
   busy=true;button.disabled=true;
   await execute(button.dataset.action,button.dataset.id);
  }
 }catch(err){notify(err.message||'Vorgang fehlgeschlagen.');}
 finally{busy=false;button.disabled=false;}
});
content.addEventListener('input',e=>{
 const x=e.target;
 if(x.id==='query'){query=x.value;updateSearch();return;}
 if(x.id==='work'){
  const lines=x.value.split('\n');range(7).forEach(i=>draft.data['work.'+i]=lines[i]||'');return;
 }
 if(x.id==='reviewed'){draft.reviewed=x.checked;return;}
 const k=x.dataset.field;
 if(k){draft.data[k]=x.type==='checkbox'?(x.checked?'x':''):x.value;refreshTotals();}
});
content.addEventListener('change',async e=>{
 const x=e.target;
 if(x.id==='project'){project=x.value;updateSearch();}
 if(x.dataset.field?.startsWith('people.')&&!busy){
  const p=state.people.find(p=>p.name===x.value);
  if(p){
   const i=Number(x.dataset.field.split('.')[1])*2;
   for(const [j,rate] of [[i,p.rate],[i+1,p.overtime]]){
    const key='lab.'+j+'.rate';
    if(draft.data[key]===undefined||draft.data[key]===''){
     draft.data[key]=rate;content.querySelector('[data-field="'+key+'"]').value=rate;
    }
   }
   refreshTotals();
  }
 }
 if(x.dataset.docLink&&!busy){
  busy=true;
  try{
   await persist({...state,docs:state.docs.map(d=>d.id===x.dataset.docLink?{...d,reportId:x.value||null}:d)});
   notify('Zuordnung gespeichert.');
  }catch(err){notify(err.message);render();}
  finally{busy=false;}
 }
});
async function selected(input,fn){
 input.addEventListener('change',async()=>{
  const file=input.files[0];input.value='';
  if(!file||busy)return;
  busy=true;
  try{if(file.size>25*1024*1024&&input.id!=='restore-file')throw Error('Maximal 25 MB pro Datei.');await fn(file);}
  catch(err){notify(err.message||'Datei konnte nicht verarbeitet werden.');}
  finally{busy=false;}
 });
}
async function readImport(file){
 notify('Rapport wird eingelesen …',true);
 const imported=await importReport(file,s=>notify(s,true));
 const newDraft=blank({...imported.data,date:imported.data.date||''});
 const existing=state.reports.find(r=>newDraft.data.number&&r.data.order===newDraft.data.order&&r.data.number===newDraft.data.number);
 if(existing)throw Error('Dieser Rapport ist bereits erfasst. Öffne den vorhandenen Eintrag, um ihn zu bearbeiten.');
 const doc={id:id(),name:file.name,file,reportId:newDraft.id};
 newDraft.reviewed=false;
 newDraft.source={mode:imported.mode,sourceTotal:imported.sourceTotal,raw:imported.raw,docId:doc.id};
 await persist({...state,reports:[...state.reports,newDraft],docs:[...state.docs,doc]});
 draft=structuredClone(newDraft);go('editor');refreshTotals();notify('Import gespeichert. Bitte mit dem Original abgleichen.');
}
selected(document.querySelector('#import-file'),readImport);
selected(document.querySelector('#camera-file'),readImport);
selected(document.querySelector('#doc-file'),async file=>{
 await persist({...state,docs:[...state.docs,{id:id(),name:file.name,file,reportId:uploadFor}]});
 render();refreshTotals();notify('Dokument abgelegt.');
});
selected(document.querySelector('#restore-file'),async file=>{
 const data=JSON.parse(await file.text());
 if(data.version!==1||!Array.isArray(data.reports)||!Array.isArray(data.people)||!Array.isArray(data.docs)||
 data.reports.some(r=>!r||typeof r.id!=='string'||!r.data||typeof r.data!=='object'||typeof r.reviewed!=='boolean')||
 data.people.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string')||
 data.docs.some(d=>!d||typeof d.id!=='string'||typeof d.name!=='string'||typeof d.file!=='string'||!d.file.startsWith('data:')))throw Error('Ungültige Sicherungsdatei.');
 if(!confirm('Diese Sicherung ersetzt alle derzeitigen Rapporte, Personen und Belege in diesem Browser. Fortfahren?'))return;
 const docs=await Promise.all(data.docs.map(async d=>({...d,file:await (await fetch(d.file)).blob()})));
 await persist({reports:data.reports,people:data.people,docs});draft=null;go('dashboard');notify('Sicherung wiederhergestellt.');
});
try{
 const stored=await transaction('readonly',store=>store.get('data'));
 if(stored)state=stored;
}catch{notify('Browser-Speicher nicht verfügbar. Speichern kann fehlschlagen.',true);}
render();
