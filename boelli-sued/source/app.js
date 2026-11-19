const groups={alpha:'Alpha-Plan AG',weiss:'Weiss weiss wie GmbH',navolta:'Navolta / Baupendenzen'};
const project='boelli';
const projectName='Bölli Süd · Niederlenz';
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatTime=value=>value?new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Zurich'}).format(new Date(value)):'';
const formatDate=value=>String(value||'').split('-').reverse().join('.');
let data, view='items', projectRows=[], filters={q:'',group:'',house:'',status:'Offen'}, listed=15;
let toastTimer;
const toast=message=>{$('toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4700);};
async function api(path,options={}){
 const res=await fetch(path,options);
 const body=await res.json();
 if(!res.ok)throw Error(body.error||'Die Anfrage ist fehlgeschlagen.');
 return body;
}
async function refresh(){
 data=await api('/api/state');
 projectRows=data.items.filter(item=>item.project===project&&!item.mergedInto);
 render();
}
async function change(path,body) {
 try{await api('/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:data.version,...body})});}
 catch(err){if(err.message.includes('inzwischen geändert'))await refresh();throw err;}
 await refresh();
}
async function upload(file,type){return (await api('/api/file',{method:'PUT',body:file,headers:{'content-type':type}})).key;}
function shown(){return projectRows.filter(x=>(!filters.group || x.group===filters.group)&&(!filters.house||x.house===filters.house)&&(!filters.status || (filters.status==='Offen'?x.status!=='Erledigt':x.status===filters.status))&&(!filters.q||[x.id,x.title,x.house,x.place,x.detail,x.remark].join(' ').toLowerCase().includes(filters.q.toLowerCase())));}
function opts(options,value){return options.map(([key,label])=>'<option value="'+escapeHTML(key)+'"'+(key===value?' selected':'')+'>'+escapeHTML(label)+'</option>').join('');}
function render(){
 for(const button of document.querySelectorAll('nav button')){button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-current',button.dataset.view===view?'page':'false');}
 if(view==='history'){
  const entries=data.history.filter(x=>x.project===project);
  $('content').innerHTML='<section class="simple">'+(entries.map(e=>'<div class="event"><strong>'+escapeHTML(e.action)+' · '+escapeHTML(e.title)+'</strong><br><small>'+escapeHTML(formatTime(e.at))+' · '+escapeHTML(e.actor)+(e.id?' · '+escapeHTML(e.id):'')+'</small>'+(e.info?'<div>'+escapeHTML(e.info)+'</div>':'')+'</div>').join('')||'<p>Noch keine Änderungen erfasst.</p>')+'</section>';
  return;
 }
 if(view==='docs'){
  const docs=data.docs.filter(x=>x.project===project);
  $('content').innerHTML='<div class="toolbar"><div><button class="primary" id="newDoc">Unterlage hinzufügen</button></div></div><section class="simple">'+docs.map(d=>'<div class="docrow">'+docLink(d.id,d.name)+'<br><small>'+escapeHTML(d.note||'')+'</small></div>').join('')+'</section>';
  $('newDoc').onclick=addDoc;
  return;
 }
 const houses=[...new Set(projectRows.map(x=>x.house).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de',{numeric:true}));
 const matches=shown();
 const open=projectRows.filter(x=>x.status!=='Erledigt').length;
 const focus=document.activeElement?.id==='query'?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;
 $('content').innerHTML='<div class="stats"><strong>'+open+' offen</strong><span>'+(projectRows.length-open)+' erledigt</span></div><div class="filters">'+
  '<label>Suchen<input id="query" type="search" placeholder="Mangel, Ort oder Nummer" value="'+escapeHTML(filters.q)+'"></label>'+
  '<label>Herkunft<select id="group">'+opts([['','Alle'],...Object.entries(groups)],filters.group)+'</select></label>'+
  '<label>Haus<select id="house">'+opts([['','Alle'],...houses.map(x=>[x,x])],filters.house)+'</select></label>'+
  '<label>Status<select id="status">'+opts([['Offen','Offen / in Arbeit'],['In Arbeit','In Arbeit'],['Erledigt','Erledigt'],['','Alle']],filters.status)+'</select></label></div>'+
  '<div class="toolbar"><small>'+matches.length+' Positionen</small><button id="newItem">Mangel hinzufügen</button></div>'+
  Object.entries(groups).map(([g,label])=>{
    const list=matches.filter(x=>x.group===g).sort((a,b)=>(a.house||'').localeCompare(b.house||'','de',{numeric:true})).slice(0,listed);
    return list.length?'<section class="group"><h2>'+label+'</h2>'+list.map(x=>'<button class="row" data-item="'+escapeHTML(x.id)+'"><span><span class="title">'+escapeHTML(x.title)+'</span><span class="meta">'+(x.house?'<span class="chip">'+escapeHTML(x.house)+'</span>':'')+escapeHTML([x.place,x.id].filter(Boolean).join(' · '))+(x.photos.length?' · '+x.photos.length+' Foto(s)':'')+(x.priority?' · '+escapeHTML(x.priority):'')+'</span></span><span class="badge '+(x.status==='Erledigt'?'done':x.status==='In Arbeit'?'progress':'')+'">'+x.status+'</span></button>').join('')+'</section>':'';
  }).join('')+(Object.keys(groups).some(g=>matches.filter(x=>x.group===g).length>listed)?'<button id="more">Weitere anzeigen</button>':'')+(!matches.length?'<div class="simple">Keine passenden Pendenzen.</div>':'');
 $('query').oninput=e=>{filters.q=e.target.value;listed=15;render();};
 if(focus){$('query').focus();$('query').setSelectionRange(...focus);}
 for(const key of ['group','house','status'])$(key).onchange=e=>{filters[key]=e.target.value;listed=15;render();$(key).focus();};
 document.querySelectorAll('[data-item]').forEach(button=>button.onclick=()=>showItem(projectRows.find(x=>x.id===button.dataset.item)));
 $('newItem').onclick=addItem;
 if($('more'))$('more').onclick=()=>{listed+=15;render();};
}
function docLink(id,fallback,page){
 const d=data.docs.findLast(x=>x.id===id);
 const suffix=page?' · S. '+page:'';
 const shown=escapeHTML(fallback+suffix);
 if(d?.key)return '<a href="/file/'+escapeHTML(d.key)+(page?'#page='+page:'')+'" target="_blank" rel="noopener">'+shown+'</a>';
 if(d?.url)return '<a href="'+'/document/'+escapeHTML(d.id)+(page?'#page='+page:'')+'" target="_blank" rel="noopener">'+shown+'</a>';
 return shown;
}
function dialog(title,body){
 $('dialogBody').innerHTML='<div class="dlghead"><h2>'+escapeHTML(title)+'</h2><button id="dismiss" aria-label="Schliessen">×</button></div>'+body;
 $('dismiss').onclick=()=>$('dialog').close();
 if(!$('dialog').open)$('dialog').showModal();
}
function showError(err){const element=$('dialogError');if(element)element.textContent=err.message;else toast(err.message);}
function showItem(item){
 let current=[...item.photos], busy=false;
 const sameHouse=projectRows.filter(x=>x.id!==item.id&&x.house===item.house);
 const plans=data.docs.filter(d=>d.project===project&&item.house&&d.name.includes('Pläne Haus '+item.house));
 const provenance=item.sources.map(s=>'<div class="meta">'+docLink(s.doc,s.name,s.page)+(s.row?' · Zeile '+s.row:'')+'</div>').join('');
 dialog(item.title,'<p class="meta">'+escapeHTML([item.id,item.house,item.place,groups[item.group]].filter(Boolean).join(' · '))+'</p>'+
  '<p class="details">'+escapeHTML(item.detail||'')+'</p><p class="meta">'+escapeHTML([item.priority,item.term||(item.due?'Frist '+formatDate(item.due):''),'Fotodokumentation: Bauleitung',item.updatedAt?'Bearbeitet '+formatTime(item.updatedAt)+' · '+item.updatedBy:''].filter(Boolean).join(' · '))+'</p>'+
  '<label class="field">Bemerkung<textarea rows="3" maxlength="2500" id="remark" placeholder="Was wurde gemacht oder festgestellt?">'+escapeHTML(item.remark||'')+'</textarea></label>'+
  '<div class="field"><strong>Erledigungsfotos <span class="meta">(freiwillig)</span></strong><div class="actions"><button id="take">Kamera</button><button id="pick">Galerie</button></div><input hidden id="camera" type="file" accept="image/*" capture="environment"><input hidden id="gallery" type="file" accept="image/*" multiple><div class="thumbs" id="shots"></div></div>'+
  '<div class="actions"><button id="keep">Speichern</button><button id="working">In Arbeit</button><button class="primary" id="done">'+(item.status==='Erledigt'?'Wieder öffnen':'Als erledigt abhaken')+'</button></div><p id="dialogError" class="error" role="alert"></p>'+
  '<details><summary>Quelle und Standort</summary>'+provenance+plans.map(d=>'<p>'+docLink(d.id,d.name)+'</p>').join('')+
  (item.reference.length?'<p class="meta">Originalfotos aus dem Mängelbericht</p><div class="thumbs">'+item.reference.map(k=>'<a href="/reference/'+k+'" target="_blank" rel="noopener"><img loading="lazy" src="/reference/'+k+'" alt="Referenzfoto"></a>').join('')+'</div>':'')+'</details>'+
  (sameHouse.length?'<details><summary>Mit Dublette zusammenführen</summary><p class="meta">Nur auswählen, wenn beide Einträge dieselbe Arbeit am selben Ort betreffen.</p><label>Eintrag behalten<select id="mergeTarget">'+opts([['','Bitte wählen'],...sameHouse.map(x=>[x.id,x.id+' · '+x.title])],'')+'</select></label><div class="actions"><button id="merge">Zusammenführen</button></div></details>':''));
 function photoList(){
  $('shots').innerHTML=current.map((key,i)=>'<figure><a href="/file/'+key+'" target="_blank" rel="noopener"><img src="/file/'+key+'" alt="Nachweisfoto '+(i+1)+'"></a><button data-remove="'+key+'" aria-label="Foto '+(i+1)+' entfernen">Entfernen</button></figure>').join('');
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{current=current.filter(x=>x!==b.dataset.remove);photoList();});
 }
 const lock=value=>{busy=value;for(const id of ['take','pick','keep','working','done','merge'])if($(id))$(id).disabled=value;};
 async function convert(file){
  const temp=URL.createObjectURL(file);
  try{
   const img=new Image(); img.src=temp;await img.decode();
   const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Das Foto konnte nicht verarbeitet werden.')),'image/jpeg',.77));
  }finally{URL.revokeObjectURL(temp);}
 }
 async function select(e){
  if(busy)return;
  const files=[...e.target.files];e.target.value='';if(!files.length)return;
  lock(true);$('dialogError').textContent='';
  try{for(const f of files.slice(0,10-current.length)){const key=await upload(await convert(f),'image/jpeg');if(!current.includes(key))current.push(key);}photoList();}
  catch{photoList();showError(Error('Das Foto konnte nicht geladen werden. Bitte ein anderes Bild versuchen.'));}
  finally{lock(false);}
 }
 async function save(status){
  lock(true);
  try{
   await change('item',{id:item.id,status,remark:$('remark').value,photos:current});
   $('dialog').close();toast('Pendenz gespeichert.');
   if(status==='Erledigt'&&item.status!=='Erledigt'&&projectRows.every(x=>x.status==='Erledigt'))showCloseout();
  }catch(err){showError(err);}finally{lock(false);}
 }
 photoList();
 $('take').onclick=()=>$('camera').click();$('pick').onclick=()=>$('gallery').click();
 $('camera').onchange=select;$('gallery').onchange=select;
 $('keep').onclick=()=>save(item.status);$('working').onclick=()=>save('In Arbeit');
 $('done').onclick=()=>save(item.status==='Erledigt'?'Offen':'Erledigt');
 if($('merge'))$('merge').onclick=async()=>{
  const target=$('mergeTarget').value;if(!target)return showError(Error('Bitte die Position wählen, die bestehen bleibt.'));
  lock(true);try{await change('merge',{id:item.id,target});$('dialog').close();toast('Dubletten zusammengeführt.');}catch(err){showError(err);}finally{lock(false);}
 };
}
function addItem(){
 dialog('Mangel hinzufügen','<form id="create"><label class="field">Herkunft<select name="group">'+opts(Object.entries(groups),filters.group||'alpha')+'</select></label><div class="detailGrid"><label>Haus<input name="house" placeholder="z. B. G1" value="'+escapeHTML(filters.house)+'" required></label><label>Ort<input name="place" placeholder="z. B. UG Technikraum" required maxlength="180"></label></div><label class="field">Mangel<input required maxlength="280" name="title"></label><label class="field">Beschreibung<textarea name="detail" rows="2" maxlength="2500"></textarea></label><label class="field">Quellnummer (freiwillig)<input name="refCode" maxlength="100"></label><button class="primary">Hinzufügen</button><p id="dialogError" class="error" role="alert"></p></form>');
 $('create').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{await change('add',{project,...Object.fromEntries(new FormData(e.target))});$('dialog').close();toast('Mangel erfasst.');}catch(err){showError(err);}finally{button.disabled=false;}
 };
}
function addDoc(){
 dialog('Unterlage hinzufügen','<form id="docForm"><label class="field">Datei<input name="file" type="file" accept=".pdf,.xlsx,.xls" required></label><label class="field">Beschreibung (freiwillig)<input name="note" maxlength="250" placeholder="z. B. Kontrollbericht Haus C2"></label><button class="primary">Unterlage speichern</button><p id="dialogError" class="error" role="alert"></p><p class="meta">Neue Mängel aus der Unterlage kannst du unter Pendenzen erfassen.</p></form>');
 $('docForm').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  const form=new FormData(e.target);const f=form.get('file');
  try{if(f.size>25*1024*1024)throw Error('Maximal 25 MB pro Unterlage.');const key=await upload(f,f.name.toLowerCase().endsWith('.pdf')?'application/pdf':'application/octet-stream');await change('document',{project,key,name:f.name,note:form.get('note')});$('dialog').close();toast('Unterlage gespeichert.');}catch(err){showError(err);}finally{button.disabled=false;}
 };
}
function showCloseout(){
 if(!data)return;
 const count=projectRows.filter(x=>x.status!=='Erledigt').length;
 const sent=data.sent[project];
 const ready=count===0&&projectRows.length;
 dialog(ready?'Projektabschluss':'Zwischenstand','<p>'+escapeHTML(projectName)+'</p><p>'+(ready?'Alle Pendenzen sind abgehakt.':count+' Pendenzen sind noch offen oder in Arbeit.')+'</p>'+
  (ready?'<p class="meta">'+(sent?'Versandstatus: '+escapeHTML(sent.status):data.mail?'Empfänger: projekt@example.com und bauleitung@example.com.':'Direktversand ist noch nicht verbunden. Die vorbereitete E-Mail enthält beide Anhänge und Empfänger.')+'</p>':'')+
  '<div class="actions"><button id="exportExcel">Excel</button><button id="exportPdf">PDF</button>'+(ready&&!sent?'<button id="exportSend" class="primary">'+(data.mail?'Per Outlook senden':'E-Mail mit Anhängen')+'</button>':'')+'</div><p id="dialogError" class="error" role="alert"></p>');
 async function run(mode){
  const controls=[...$('dialogBody').querySelectorAll('.actions button')];controls.forEach(b=>b.disabled=true);$('dialogError').textContent='';
  try{
   const label=ready?'Abschluss':'Zwischenstand';
   const info={label,project:projectName,rows:[...projectRows].sort((a,b)=>a.group.localeCompare(b.group)||a.house.localeCompare(b.house,'de',{numeric:true})||a.id.localeCompare(b.id)),groups,history:data.history.filter(x=>x.project===project),time:new Date(),mail:ready};
   const filename='Navolta_Boelli-Sued_'+label;
   if(mode==='xlsx'){Reports.save(await Reports.xlsx(info),filename+'.xlsx');return;}
   if(mode==='pdf'){Reports.save(await Reports.pdf(info),filename+'.pdf');return;}
   const [excel,pdf]=await Promise.all([Reports.xlsx(info),Reports.pdf(info)]);
   const files=await Promise.all([[excel,filename+'.xlsx'],[pdf,filename+'.pdf']].map(async ([file,name])=>({name,base64:await Reports.base64(file),type:file.type})));
   if(data.mail){await change('send',{project,files});$('dialog').close();toast('Microsoft 365 hat den Versand angenommen.');}
   else {Reports.save(Reports.eml(info,files),filename+'.eml');toast('E-Mail-Datei erstellt. In Outlook öffnen und senden.');}
  }catch(err){showError(err);}finally{controls.forEach(b=>b.disabled=false);}
 }
 $('exportExcel').onclick=()=>run('xlsx');$('exportPdf').onclick=()=>run('pdf');
 if($('exportSend'))$('exportSend').onclick=()=>run('send');
}
$('help').onclick=()=>dialog('Kurzanleitung für die Bauleitung','<ol class="help"><li>Wähle bei <strong>Pendenzen</strong> die Herkunft und das Haus aus. Öffne den Mangel, den du bearbeitest.</li><li>Halte unter <strong>Bemerkung</strong> fest, was du erledigt hast oder was noch fehlt.</li><li>Falls ein Bild hilft, tippe auf <strong>Kamera</strong> oder <strong>Galerie</strong>. Fotos sind freiwillig.</li><li>Tippe auf <strong>Als erledigt abhaken</strong>. Unter <strong>Verlauf</strong> siehst du, wer wann etwas geändert hat.</li><li>Wenn alle Punkte abgehakt sind, öffne <strong>Abschluss</strong>. Dort kannst du Excel und PDF erstellen und an die beiden Navolta-Adressen versenden.</li></ol>');
$('closeout').onclick=showCloseout;
document.querySelectorAll('nav [data-view]').forEach(button=>button.onclick=()=>{view=button.dataset.view;if(data)render();});
refresh().catch(err=>{$('content').textContent=err.message;});
