const SEED = {items: [], docs: []};
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});
const allowed=new Set(['Offen','In Arbeit','Erledigt']);
const clean=(value,limit=2500)=>String(value??'').trim().slice(0,limit);
const norm=value=>clean(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fingerprint=row=>[row.project,row.group,norm(row.house),norm(row.place),norm(row.title)].join('|');
const visible=row=> !(row.group==='weiss' && row.project==='boelli' && /^(?:haus\s+)?[defgh]\d*(?:\b|$)/i.test(clean(row.house)));
const bodyKey='navolta-state-v1';
const validProject=value=>value==='boelli';

async function read(env) {
 const object=await env.BUCKET.get(bodyKey);
 return {state:object?await object.json():{version:0,patches:{},added:[],docs:[],history:[],sent:{}},etag:object?.etag};
}
function rows(state) {
 return [...SEED.items,...state.added].map(row=>({...row,...state.patches[row.id]})).filter(visible);
}
function describe(action,item,info='') {return {action,project:item.project,id:item.id,title:item.title,info};}

export function loadSeed(seed) { SEED.items=seed.items; SEED.docs=seed.docs; }
export default {async fetch(request,env) {
 try {
  const path=new URL(request.url).pathname;
  const actor='Bauleitung (lokal)';
  if(request.method==='PUT' && path==='/api/file'){
   const type=request.headers.get('content-type');
   const data=await request.arrayBuffer();
   if(!['image/jpeg','application/pdf','application/octet-stream'].includes(type)||!data.byteLength||data.byteLength>25*1024*1024)return json({error:'Dateiformat oder Dateigrösse ungültig.'},400);
   const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
   await env.BUCKET.put('file/'+key,data,{httpMetadata:{contentType:type}});
   return json({key,size:data.byteLength});
  }
  const {state,etag}=await read(env);
  if(request.method==='GET' && path==='/api/state')return json({items:rows(state),docs:[...SEED.docs,...state.docs],history:state.history,version:state.version,mail:false,sent:state.sent});
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
  } else return json({error:'Position oder Funktion fehlt.'},404);
  state.history.unshift({...event,actor,at:new Date().toISOString()});
  state.version++;
  if(!await env.BUCKET.put(bodyKey,JSON.stringify(state),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}}))return json({error:'Die Liste wurde inzwischen geändert. Bitte neu laden und nochmals speichern.'},409);
  return json({ok:true});
 } catch(error){console.error(String(error));return json({error:'Vorgang fehlgeschlagen. Bitte erneut versuchen.'},500);}
}};

