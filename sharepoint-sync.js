/* Navolta AG – automatische SharePoint-Zentralsynchronisierung (Graph/MSAL).
   Browser-only: Synchronisierung funktioniert, solange die Anwendung geöffnet und
   Internet/Microsoft-Anmeldung verfügbar sind. Konflikte werden NICHT überschrieben. */
(function () {
"use strict";
const cfg=window.NAVOLTA_SP_CONFIG||{};
const SCOPE=["User.Read","Files.ReadWrite.All","Sites.ReadWrite.All"];
const K=["navolta-v1","navolta-detailed-time-v1","navolta-order-confirmations-v1",
"navolta-material-v1","navolta-documents-v3","navolta-material-delivery-docs",
"navolta-task-documents","navolta-theme-v2","navolta-ui-background-v1","navolta-dashboard-folds-v1"];
const tracked=new Set(K);
const BASE_ID="baseline", DB_NAME="navolta-sp-sync-state-v2", schema="navolta-local-snapshot-v2";
let client=null,account=null,drive=null,folder=null,filePath=null,lastEtag=null;
let busy=false,dirty=false,suspend=false,initialized=false,ready=false,blocked=false,redirecting=false;
let pending=null,dbPromise=null,authPromise=null,lastSynced="";
const $=id=>document.getElementById(id);
const nativeSet=Storage.prototype.setItem;
const nativeRemove=Storage.prototype.removeItem;
const nativeClear=Storage.prototype.clear;
function values(){const v={};for(const k of K)v[k]=localStorage.getItem(k);return v}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
const snap=(v)=>({schema, savedAt:new Date().toISOString(),savedBy:account?.username||"",values:v||values()});
function valid(d){return d&&["navolta-local-snapshot-v1",schema].includes(d.schema)&&d.values&&typeof d.values==="object"&&K.every(k=>d.values[k]===undefined||d.values[k]===null||typeof d.values[k]==="string")}
function normalize(d){const v={};for(const k of K)v[k]=d?.values?.[k]??null;return v}
function status(t,kind=""){const e=$("nvsp-status");if(e){e.textContent=t;e.dataset.kind=kind}const dot=$("nvsp-dot");if(dot)dot.textContent=kind==="err"?"●":kind==="ok"?"●":"◌"}
function pause(msg){blocked=true;ready=false;const e=$("nvsp-cover");if(e)e.hidden=false;status(msg,"err")}
function enable(){blocked=false;ready=true;const e=$("nvsp-cover");if(e)e.hidden=true}
function fmtErr(e){return String(e?.message||e).slice(0,420)}
const h=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const box=document.createElement("div");
box.id="navolta-sharepoint-sync";
box.innerHTML='<div class="nvsp-row"><strong><span id="nvsp-dot">◌</span> SharePoint Sync</strong><button id="nvsp-toggle" type="button" title="Details öffnen">▾</button></div><div id="nvsp-detail"><div id="nvsp-status">Microsoft-Verbindung wird vorbereitet…</div><div class="nvsp-actions"><button id="nvsp-login" type="button">Microsoft anmelden</button><button id="nvsp-pull" type="button">Jetzt abgleichen</button><button id="nvsp-push" type="button">Jetzt sichern</button><button id="nvsp-backup" type="button">JSON-Backup</button></div><small>Automatisch nach Änderungen · alle 15 Minuten · beim Öffnen. Keine stillschweigende Überschreibung bei Konflikten.</small></div>';
const style=document.createElement("style");
style.textContent='#navolta-sharepoint-sync{position:fixed;right:11px;bottom:11px;z-index:1000000;font:12px Arial,sans-serif;background:#fff;color:#193753;border:1px solid #c4d3e0;box-shadow:0 4px 18px #0002;border-radius:10px;width:min(345px,92vw)}#navolta-sharepoint-sync .nvsp-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px}#navolta-sharepoint-sync #nvsp-dot{color:#1f79b2}#navolta-sharepoint-sync #nvsp-status[data-kind=err]{color:#a62828}#navolta-sharepoint-sync #nvsp-status[data-kind=ok]{color:#20733e}#navolta-sharepoint-sync #nvsp-detail{padding:0 10px 10px}#navolta-sharepoint-sync #nvsp-status{margin:5px 0 9px;overflow-wrap:anywhere}#navolta-sharepoint-sync .nvsp-actions{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}#navolta-sharepoint-sync button{border:0;border-radius:5px;background:#16578b;color:#fff;padding:6px 8px;font:inherit;cursor:pointer}#navolta-sharepoint-sync #nvsp-toggle{padding:3px 8px}#navolta-sharepoint-sync small{color:#5d7285}#navolta-sharepoint-sync.nv-collapsed{width:auto}#navolta-sharepoint-sync.nv-collapsed #nvsp-detail{display:none}#nvsp-cover{position:fixed;inset:0;z-index:999998;background:#f2f7fbf5;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#193753;padding:15px}#nvsp-cover[hidden]{display:none}#nvsp-cover .card{width:min(490px,96vw);background:white;padding:27px;border-radius:15px;box-shadow:0 10px 38px #0f31513b;text-align:center}#nvsp-cover button{background:#16578b;color:white;border:0;border-radius:8px;padding:11px 16px;cursor:pointer;margin:6px}#nvsp-cover small{display:block;color:#678;line-height:1.4;margin-top:10px}';
document.head.appendChild(style);
document.body.appendChild(box);
const cover=document.createElement("div");cover.id="nvsp-cover";
cover.innerHTML='<div class="card"><h2>Navolta Projektcontrolling</h2><p id="nvsp-cover-text">Microsoft-Anmeldung und aktueller SharePoint-Datenstand werden geladen …</p><button id="nvsp-cover-login" type="button">Mit Microsoft 365 anmelden / erneut prüfen</button><button id="nvsp-cover-backup" type="button">Lokale JSON sichern</button><small>Die App wird erst nach dem Datenabgleich freigegeben. Bei Fehlern gehen lokale Änderungen nicht verloren.</small></div>';
document.body.appendChild(cover);
const headerStatus=t=>{const p=$("nvsp-cover-text");if(p)p.textContent=t};
let folded=true;box.classList.add("nv-collapsed");
$("nvsp-toggle").onclick=()=>{folded=!folded;box.classList.toggle("nv-collapsed",folded);$("nvsp-toggle").textContent=folded?"▾":"▴"};
function storeDB(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("state"))r.result.createObjectStore("state")};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return dbPromise}
async function dbGet(k){const db=await storeDB();return new Promise((res,rej)=>{const t=db.transaction("state","readonly"),r=t.objectStore("state").get(k);r.onsuccess=()=>res(r.result??null);r.onerror=()=>rej(r.error)})}
async function dbPut(k,v){const db=await storeDB();return new Promise((res,rej)=>{const t=db.transaction("state","readwrite");t.objectStore("state").put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
async function backupLocal(){const v=values();await dbPut("backup-"+new Date().toISOString(),snap(v));return v}
function download(){const blob=new Blob([JSON.stringify(snap(),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="navolta-sicherung-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
$("nvsp-backup").onclick=download;$("nvsp-cover-backup").onclick=download;
function replaceValues(v){suspend=true;try{for(const k of K){if(v[k]==null)nativeRemove.call(localStorage,k);else nativeSet.call(localStorage,k,v[k])}}finally{suspend=false}}
function markDirty(){if(suspend)return;dirty=true;if(ready&&!blocked){clearTimeout(pending);pending=setTimeout(()=>run(false),cfg.debounceMs||1800)}}
Storage.prototype.setItem=function(k,v){const previous=this===localStorage&&tracked.has(String(k))?this.getItem(k):null;const r=nativeSet.call(this,k,v);if(this===localStorage&&tracked.has(String(k))&&previous!==String(v))markDirty();return r};
Storage.prototype.removeItem=function(k){const had=this===localStorage&&tracked.has(String(k))&&this.getItem(k)!==null;const r=nativeRemove.call(this,k);if(had)markDirty();return r};
Storage.prototype.clear=function(){const had=this===localStorage&&K.some(k=>this.getItem(k)!==null);const r=nativeClear.call(this);if(had)markDirty();return r};
window.addEventListener("storage",e=>{if((e.key===null||tracked.has(e.key))&&e.storageArea===localStorage)markDirty()});
async function login(){if(authPromise)return authPromise;authPromise=(async()=>{
 if(!window.msal)throw Error("MSAL-Bibliothek nicht geladen. Bitte Internetverbindung prüfen.");
 client=new msal.PublicClientApplication({auth:{clientId:cfg.clientId,authority:"https://login.microsoftonline.com/"+cfg.tenantId,redirectUri:cfg.redirectUri,navigateToLoginRequestUrl:false},cache:{cacheLocation:"localStorage"}});
 await client.initialize();const result=await client.handleRedirectPromise();
 account=result?.account||client.getActiveAccount()||client.getAllAccounts()[0]||null;
 if(account)client.setActiveAccount(account);return account;
 })().catch(e=>{authPromise=null;throw e});return authPromise}
async function signIn(){await login();if(!account){if(redirecting)return;redirecting=true;headerStatus("Weiterleitung zu Microsoft 365 …");await client.loginRedirect({scopes:SCOPE,prompt:"select_account"});return false}return true}
async function token(){await login();if(!account)throw Error("Microsoft-Anmeldung erforderlich");try{return(await client.acquireTokenSilent({account,scopes:SCOPE})).accessToken}catch(e){if(e instanceof msal.InteractionRequiredAuthError||/interaction_required|login_required|consent_required/i.test(e?.errorCode||"")){if(!redirecting){redirecting=true;await client.acquireTokenRedirect({account,scopes:SCOPE})}throw Error("Microsoft-Anmeldung/Einwilligung erforderlich")}throw e}}
async function graph(url,options={}){const tok=await token();const r=await fetch(url,{...options,headers:{Authorization:"Bearer "+tok,...(options.headers||{})}});if(!r.ok){const txt=(await r.text()).slice(0,320);const e=new Error("Graph "+r.status+": "+txt);e.status=r.status;throw e}return r}
function shareId(url){const b64=btoa(unescape(encodeURIComponent(url))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");return "u!"+b64}
async function resolveFolder(){
 if(filePath)return filePath;
 const raw=cfg.folderShareUrl;
 if(!raw)throw Error("Kein SharePoint-Ordnerlink konfiguriert");
 // Graph /shares resolves the precise user-provided folder. Never silently fall back to root.
 let item=null,firstError=null;
 for(const link of [raw,raw.split("?")[0]]){
 try{const r=await graph("https://graph.microsoft.com/v1.0/shares/"+shareId(link)+"/driveItem");item=await r.json();break}catch(e){firstError=e}}
 if(!item)throw Error("Freigegebener Geschäftsleitungs-Ordner konnte nicht aufgelöst werden. Zugriff auf den Ordner prüfen. "+fmtErr(firstError));
 if(!item.folder)throw Error("Der SharePoint-Link zeigt nicht auf einen Ordner.");
 drive=item.parentReference?.driveId||cfg.driveId;folder=item.id;
 if(drive!==cfg.driveId)throw Error("SharePoint-Ordner liegt nicht in der erwarteten GL-Dokumentbibliothek.");
 filePath="https://graph.microsoft.com/v1.0/drives/"+encodeURIComponent(drive)+"/items/"+encodeURIComponent(folder)+":/"+encodeURIComponent(cfg.snapshotFile)+":";
 return filePath;
}
async function metadata(){const u=await resolveFolder();try{const r=await graph(u);return await r.json()}catch(e){if(e.status===404)return null;throw e}}
async function remoteState(){const m=await metadata();if(!m)return {meta:null,state:null};const r=await graph((await resolveFolder())+"/content");const d=await r.json();if(!valid(d))throw Error("Zentrale JSON-Datei ist nicht im erwarteten Navolta-Format. Keine Daten wurden überschrieben.");return {meta:m,state:normalize(d)}}
async function saveRemote(v,oldMeta){const headers={"Content-Type":"application/json"};if(oldMeta)headers["If-Match"]=oldMeta.eTag;else headers["If-None-Match"]="*";const r=await graph((await resolveFolder())+"/content",{method:"PUT",headers,body:JSON.stringify(snap(v))});const m=await r.json();lastEtag=m.eTag||null;await dbPut(BASE_ID,v);lastSynced=new Date().toLocaleTimeString("de-CH");dirty=false;status("Gesichert um "+lastSynced+" · "+(account?.username||""),"ok")}
const isObj=v=>v&&typeof v==="object"&&!Array.isArray(v);
function merge(base,a,b,path,errors){
 if(same(a,b))return a;
 if(same(a,base))return b;
 if(same(b,base))return a;
 if(isObj(a)&&isObj(b)&&(isObj(base)||base==null)){const out={};for(const k of new Set([...Object.keys(base||{}),...Object.keys(a),...Object.keys(b)])){const v=merge(base?.[k],a[k],b[k],path+"."+k,errors);if(v!==undefined)out[k]=v}return out}
 if(Array.isArray(a)&&Array.isArray(b)&&(Array.isArray(base)||base==null)){
  const identity=v=>v&&typeof v==="object"?(v.id??v._id??v.uuid??v.key??null):null;
  const arrays=[...(base||[]),...a,...b],ids=arrays.map(identity);
  if(arrays.every((v,i)=>ids[i]!=null)&&[base||[],a,b].every(list=>new Set(list.map(identity)).size===list.length)){
   const old=new Map((base||[]).map(v=>[identity(v),v])),left=new Map(a.map(v=>[identity(v),v])),right=new Map(b.map(v=>[identity(v),v]));
   const order=[...new Set([...b,...a,...base||[]].map(identity))],out=[];
   for(const k of order){const v=merge(old.get(k),left.get(k),right.get(k),path+"["+k+"]",errors);if(v!==undefined)out.push(v)}return out;
  }
 }
 errors.push(path);return a
}
function mergeStates(base,local,remote){
 const errors=[],out={};
 for(const k of K){
 const b=base?.[k]??null,a=local[k]??null,r=remote[k]??null;
 if(a===r)out[k]=a;
 else if(a===b)out[k]=r;
 else if(r===b)out[k]=a;
 else try{const v=merge(b===null?null:JSON.parse(b),a===null?null:JSON.parse(a),r===null?null:JSON.parse(r),k,errors);out[k]=v===null?null:JSON.stringify(v)}catch(e){errors.push(k+": JSON-Konflikt");out[k]=a}
 }
 return {out,errors}
}
function reloadForData(v){const current=values();if(same(current,v))return false;replaceValues(v);sessionStorage.setItem("navolta-sp-last-reload",new Date().toISOString());status("Aktueller SharePoint-Datenstand geladen. Anwendung wird aktualisiert …","ok");enable();location.reload();return true}
async function sync(isStartup=false){
 if(busy||redirecting)return;busy=true;
 try{
  if(!await signIn())return;
  status("Abgleich mit Geschäftsleitung SharePoint …");
  const {meta,state:remote}=await remoteState();const local=values();let baseline=null;
  try{baseline=await dbGet(BASE_ID)}catch(e){throw Error("Lokaler Synchronisationsspeicher nicht verfügbar: "+fmtErr(e))}
  if(!meta){
   // First writer creates central file. Subsequent writers read the already-created file.
   await saveRemote(local,null);initialized=true;enable();return;
  }
  lastEtag=meta.eTag;
  if(!baseline){
   // New browser/device: cloud is source of truth. A local recovery copy is kept.
   if(!same(local,remote)){await backupLocal();await dbPut(BASE_ID,remote);initialized=true;if(reloadForData(remote))return}
   else await dbPut(BASE_ID,remote);
   initialized=true;dirty=false;status("Aktueller Datenstand geladen · "+(account?.username||""),"ok");enable();return;
  }
  const merged=mergeStates(baseline,local,remote);
  if(merged.errors.length){
   const m="Konflikt mit Änderungen von anderer Person: "+merged.errors.slice(0,3).join(", ")+". Keine Daten wurden überschrieben. JSON-Backup erstellen und Konflikt klären.";
   status(m,"err");headerStatus(m);blocked=true;if(isStartup)pause(m);return;
  }
  if(!same(merged.out,remote)){
   // Save only against fetched ETag. A concurrent modification yields 412, never overwriting.
   await saveRemote(merged.out,meta);
  }else{await dbPut(BASE_ID,remote);dirty=false;status("Synchron · "+(account?.username||"")+" · "+new Date().toLocaleTimeString("de-CH"),"ok")}
  initialized=true;
  if(reloadForData(merged.out))return;
  enable();
 }catch(e){
  console.error("[Navolta AutoSync]",e);
  const m="SharePoint-Abgleich nicht möglich: "+fmtErr(e);
  status(m,"err");headerStatus(m);
  if(isStartup||!initialized)pause(m);
  // Optimistic concurrency: retry a short time after an HTTP 412 from another editor.
  if(e?.status===412&&navigator.onLine)setTimeout(()=>run(!initialized),2500);
 }finally{busy=false}
}
async function run(first=false){await sync(first)}
$("nvsp-login").onclick=()=>run(!initialized);$("nvsp-pull").onclick=()=>run(!initialized);$("nvsp-push").onclick=()=>run(!initialized);
$("nvsp-cover-login").onclick=()=>run(true);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&initialized)run(false)});
window.addEventListener("focus",()=>{if(initialized&&!busy)run(false)});
window.addEventListener("online",()=>run(!initialized));
setInterval(()=>run(!initialized),cfg.intervalMs||900000);
if(!cfg.clientId||!cfg.tenantId||!cfg.folderShareUrl){pause("Microsoft/SharePoint-Konfiguration fehlt.");return}
run(true);
})();