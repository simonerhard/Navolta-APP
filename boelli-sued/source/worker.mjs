const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});
const allowed=new Set(['Offen','In Arbeit','Erledigt']);
const clean=(value,limit=2500)=>String(value??'').trim().slice(0,limit);
const norm=value=>clean(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fingerprint=row=>[row.project,row.group,norm(row.house),norm(row.place),norm(row.title)].join('|');
const visible=row=> !(row.group==='weiss' && row.project==='boelli' && /^(?:haus\s+)?[defgh]\d*(?:\b|$)/i.test(clean(row.house)));
const bodyKey='navolta-state-v1';
const kindFor={'/':'text/html; charset=utf-8','/app.js':'application/javascript; charset=utf-8','/reports.js':'application/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/pdf.js':'application/javascript','/zip.js':'application/javascript'};
const recipients=['projekt@example.com','bauleitung@example.com'];
const validProject=value=>value==='boelli';

async function read(env) {
 const object=await env.BUCKET.get(bodyKey);
 return {state:object?await object.json():{version:0,patches:{},added:[],docs:[],history:[],sent:{}},etag:object?.etag};
}
function rows(state) {
 return [...SEED.items,...state.added].map(row=>({...row,...state.patches[row.id]})).filter(visible);
}
function reportConfig(env) {
 return ['GRAPH_TENANT_ID','GRAPH_CLIENT_ID','GRAPH_CLIENT_SECRET','GRAPH_SENDER'].every(key=>Boolean(env[key]));
}
function decode(s) {return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function describe(action,item,info='') {return {action,project:item.project,id:item.id,title:item.title,info};}

export default {async fetch(request,env) {
 try {
  const path=new URL(request.url).pathname;
  if(request.method==='PUT' && path.startsWith('/api/bootstrap/')){
   if(!env.NAVOLTA_IMPORT_SECRET || request.headers.get('x-navolta-import')!==env.NAVOLTA_IMPORT_SECRET)return json({error:'Kein Zugriff.'},403);
   const id=path.split('/')[3];
   const known=SEED.docs.find(doc=>doc.id===id);
   if(!known)return json({error:'Unterlage unbekannt.'},404);
   const bytes=await request.arrayBuffer();
   if(bytes.byteLength!==known.size)return json({error:'Ungültige Dateigrösse.'},400);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(hash!==id)return json({error:'Datei stimmt nicht mit der Quelle überein.'},400);
   await env.BUCKET.put('file/'+id,bytes,{httpMetadata:{contentType:'application/pdf'}});
   return json({ok:true});
  }
  if(!request.headers.get('oai-authenticated-user-id'))return new Response('Anmeldung für das Navolta-Cockpit erforderlich.',{status:401});
  const actor=request.headers.get('oai-authenticated-user-email')||'Bauleitung';
  if(request.method==='GET' && kindFor[path])return new Response(ASSETS[path],{headers:{'content-type':kindFor[path],'cache-control':'private, no-cache','x-content-type-options':'nosniff'}});
  if(request.method==='GET' && path==='/logo.png')return new Response(decode(SEED.logo),{headers:{'content-type':'image/png','cache-control':'private, max-age=3600'}});
  if(request.method==='GET' && path.startsWith('/reference/')){
   const raw=REFERENCE[path.split('/')[2]];
   return raw?new Response(decode(raw),{headers:{'content-type':'image/jpeg','cache-control':'private, max-age=3600'}}):json({error:'Foto fehlt.'},404);
  }
  if(!env.BUCKET)return json({error:'Der Projektspeicher ist nicht verfügbar.'},503);
  if(request.method==='GET' && path.startsWith('/document/')){
   const id=path.split('/')[2];
   const doc=SEED.docs.find(x=>x.id===id);
   if(!doc)return json({error:'Unterlage fehlt.'},404);
   const file=await env.BUCKET.get('file/'+id);
   return file?new Response(file.body,{headers:{'content-type':'application/pdf','x-content-type-options':'nosniff','content-disposition':"inline; filename*=UTF-8''"+encodeURIComponent(doc.name)}}):Response.redirect(doc.url,302);
  }
  if(request.method==='GET' && path.startsWith('/file/')){
   const id=path.split('/')[2];
   if(!/^[a-f0-9]{64}$/.test(id))return json({error:'Datei fehlt.'},404);
   const file=await env.BUCKET.get('file/'+id);
   if(!file)return json({error:'Datei fehlt.'},404);
   const type=file.httpMetadata?.contentType||'application/octet-stream';
   return new Response(file.body,{headers:{'content-type':type,'x-content-type-options':'nosniff','cache-control':'private, max-age=3600',...(type==='application/octet-stream'?{'content-disposition':'attachment'}:{})}});
  }
  if(request.method==='PUT' && path==='/api/file'){
   const type=request.headers.get('content-type');
   const data=await request.arrayBuffer();
   if(!['image/jpeg','application/pdf','application/octet-stream'].includes(type)||!data.byteLength||data.byteLength>25*1024*1024)return json({error:'Dateiformat oder Dateigrösse ungültig.'},400);
   const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
   await env.BUCKET.put('file/'+key,data,{httpMetadata:{contentType:type}});
   return json({key,size:data.byteLength});
  }
  const {state,etag}=await read(env);
  if(request.method==='GET' && path==='/api/state')return json({items:rows(state),docs:[...SEED.docs,...state.docs],history:state.history,version:state.version,mail:reportConfig(env),sent:state.sent});
  if(request.method!=='POST') return json({error:'Unbekannte Anfrage.'},404);
  const input=await request.json();
  if(input.version!==state.version)return json({error:'Die Liste wurde inzwischen geändert. Bitte neu laden und den Schritt wiederholen.'},409);
  const items=rows(state);
  const item=items.find(x=>x.id===input.id && !x.mergedInto);
  let event;
  if(path==='/api/item' && item) {
   if(!allowed.has(input.status))return json({error:'Ungültiger Status.'},400);
   const selected=Array.isArray(input.photos)?input.photos.slice(0,10):[];
   if(!selected.every(key=>/^[a-f0-9]{64}$/.test(key)))return json({error:'Ungültiges Foto.'},400);
   const checks=await Promise.all(selected.map(key=>env.BUCKET.head('file/'+key)));
   if(checks.some(x=>x?.httpMetadata?.contentType!=='image/jpeg'))return json({error:'Ein ausgewähltes Foto ist nicht verfügbar.'},400);
   const remark=clean(input.remark);
   state.patches[item.id]={...state.patches[item.id],status:input.status,remark,photos:[...new Set(selected)],updatedAt:new Date().toISOString(),updatedBy:actor,historic:item.historic && item.status===input.status};
   const changes=[];
   if(item.status!==input.status)changes.push(item.status+' → '+input.status);
   if((item.remark||'')!==remark)changes.push(remark?'Bemerkung: '+remark:'Bemerkung entfernt');
   if(JSON.stringify(item.photos)!==JSON.stringify(selected))changes.push('Fotonachweise aktualisiert ('+selected.length+')');
   if(!changes.length)return json({ok:true});
   delete state.sent[item.project];
   event=describe('Bearbeitet',item,changes.join(' · '));
  } else if(path==='/api/add'){
   if(!validProject(input.project)||!['weiss','alpha','navolta'].includes(input.group)||!clean(input.title)||!clean(input.place))return json({error:'Titel, Ort und Herkunft sind erforderlich.'},400);
   const entry={id:'NV-'+crypto.randomUUID().slice(0,8).toUpperCase(),project:input.project,group:input.group,house:clean(input.house,40).toUpperCase(),place:clean(input.place,180),title:clean(input.title,280),detail:clean(input.detail),refCode:clean(input.refCode,100),status:'Offen',owner:input.project==='boelli'?'Bauleitung':'Bauleitung',photos:[],reference:[],sources:[]};
   if(entry.project==='boelli'&&!entry.house)return json({error:'Bitte Haus angeben.'},400);
   if(!visible(entry))return json({error:'Dieses Haus ist für Weiss weiss wie GmbH aufgrund der SiNa-Ausnahme ausgeschlossen.'},400);
   const duplicate=items.find(x=>!x.mergedInto&&(fingerprint(x)===fingerprint(entry)||(entry.refCode&&x.project===entry.project&&x.group===entry.group&&[x.id,x.refCode].some(v=>norm(v)===norm(entry.refCode)))));
   if(duplicate)return json({error:'Bereits erfasst unter '+duplicate.id+'.'},409);
   state.added.push(entry);
   delete state.sent[entry.project];
   event=describe('Erfasst',entry);
  } else if(path==='/api/merge' && item){
   const target=items.find(x=>x.id===input.target && x.id!==item.id && x.project===item.project && x.house===item.house && !x.mergedInto);
   if(!target)return json({error:'Bitte eine andere Position im selben Haus wählen.'},400);
   state.patches[item.id]={...state.patches[item.id],mergedInto:target.id};
   const byKey=new Map([...target.sources,...item.sources].map(s=>[s.doc+'|'+s.page,s]));
   state.patches[target.id]={...state.patches[target.id],sources:[...byKey.values()],reference:[...new Set([...target.reference,...item.reference])],photos:[...new Set([...target.photos,...item.photos])].slice(0,10),remark:[target.remark,item.remark].filter(Boolean).join('\n')};
   delete state.sent[item.project];
   event=describe('Dubletten zusammengeführt',item,'Zusammengeführt in '+target.id);
  } else if(path==='/api/document'){
   if(!validProject(input.project)||!clean(input.name)||!/^[a-f0-9]{64}$/.test(input.key||''))return json({error:'Unterlage ungültig.'},400);
   const exists=[...SEED.docs,...state.docs].find(x=>x.id===input.key);
   if(exists?.key)return json({error:'Unterlage ist bereits erfasst.'},409);
   const stored=await env.BUCKET.head('file/'+input.key);
   if(!stored)return json({error:'Datei fehlt.'},400);
   state.docs.push({id:input.key,key:input.key,name:clean(input.name,250),project:input.project,note:clean(input.note,250),size:stored.size});
   event={action:'Unterlage abgelegt',project:input.project,title:clean(input.name,250),info:clean(input.note,250)};
  } else if(path==='/api/send'){
   return await send(env,state,etag,actor,input,items);
  } else return json({error:'Position oder Funktion fehlt.'},404);
  state.history.unshift({...event,actor,at:new Date().toISOString()});
  state.version++;
  if(!await env.BUCKET.put(bodyKey,JSON.stringify(state),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}}))return json({error:'Die Liste wurde inzwischen geändert. Bitte neu laden und nochmals speichern.'},409);
  return json({ok:true});
 } catch(error){console.error(String(error));return json({error:'Vorgang fehlgeschlagen. Bitte erneut versuchen.'},500);}
}};

async function send(env,state,etag,actor,input,items){
 if(!reportConfig(env))return json({error:'Der automatische Outlook-Versand ist noch nicht verbunden.'},503);
 if(!validProject(input.project)||!items.some(x=>x.project===input.project && !x.historic && !x.mergedInto) || items.some(x=>x.project===input.project && !x.mergedInto && x.status!=='Erledigt'))return json({error:'Das Projekt enthält noch offene Pendenzen.'},409);
 if(state.sent[input.project])return json({error:'Für diesen Projektstand wurde bereits ein Versand erfasst.'},409);
 const files=input.files;
 if(!Array.isArray(files)||files.length!==2||!files.every((f,i)=>f.name?.endsWith(i?'.pdf':'.xlsx')&&typeof f.base64==='string'&&f.base64.length<3900000))return json({error:'Die Dateien sind für den Direktversand zu gross. Bitte die vorbereitete E-Mail verwenden.'},400);
 const lock={status:'In Bearbeitung',at:new Date().toISOString()};
 state.sent[input.project]=lock;
 state.version++;
 const saved=await env.BUCKET.put(bodyKey,JSON.stringify(state),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});
 if(!saved)return json({error:'Der Projektstand hat sich geändert.'},409);
 let result, failure, attempted=false;
 try{
  const tokenResponse=await fetch('https://login.microsoftonline.com/'+encodeURIComponent(env.GRAPH_TENANT_ID)+'/oauth2/v2.0/token',{method:'POST',body:new URLSearchParams({client_id:env.GRAPH_CLIENT_ID,client_secret:env.GRAPH_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'})});
  if(!tokenResponse.ok)throw new Error('Microsoft 365 hat die Versandverbindung abgelehnt.');
  const {access_token}=await tokenResponse.json();
  const attachments=files.map((f,i)=>({'@odata.type':'#microsoft.graph.fileAttachment',name:f.name,contentType:i?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBytes:f.base64}));
  attempted=true;
  result=await fetch('https://graph.microsoft.com/v1.0/users/'+encodeURIComponent(env.GRAPH_SENDER)+'/sendMail',{method:'POST',headers:{authorization:'Bearer '+access_token,'content-type':'application/json'},body:JSON.stringify({message:{subject:input.project==='boelli'?'Abschlussprotokoll · Bölli Süd':'Abschlussprotokoll · Egliseestrasse 60',body:{contentType:'Text',content:'Guten Tag\n\nIm Anhang findet ihr das Navolta-Abschlussprotokoll und die Excel-Liste.\n\nFreundliche Grüsse\nNavolta AG'},toRecipients:recipients.map(address=>({emailAddress:{address}})),attachments},saveToSentItems:true})});
  if(result.status!==202)throw new Error('Microsoft 365 hat den Versand abgelehnt.');
 }catch(err){failure=err.message;}
 for(let i=0;i<5;i++){
  const current=await read(env);
  if(current.state.sent[input.project]?.at===lock.at){
   if(failure && (!attempted||result))delete current.state.sent[input.project];
   else current.state.sent[input.project]={...lock,status:failure?'Unklar':'Von Microsoft 365 angenommen'};
  }
  if(!failure)current.state.history.unshift({action:'Versand angenommen',project:input.project,title:'Abschlussprotokoll und Excel',info:recipients.join(', '),actor,at:new Date().toISOString()});
  current.state.version++;
  if(await env.BUCKET.put(bodyKey,JSON.stringify(current.state),{onlyIf:{etagMatches:current.etag}}))break;
 }
 return failure?json({error:failure},502):json({ok:true});
}
