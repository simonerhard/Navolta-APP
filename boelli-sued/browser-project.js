import api, { loadSeed } from './project-api.js';

const databaseName = 'navolta-boelli-sued-browser-v1';
const storeName = 'objects';
const packageKey = 'project-package';
const storedURLs = new Map();
let database;
let imported = false;

function readRequest(request) {
 return new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
 });
}
function done(transaction) {
 return new Promise((resolve, reject) => {
  transaction.oncomplete = resolve;
  transaction.onabort = () => reject(transaction.error || Error('Lokales Speichern wurde abgebrochen.'));
 });
}
function objectStore(mode = 'readonly') {
 return database.transaction(storeName, mode).objectStore(storeName);
}
function registerURL(id, blob) {
 if (!storedURLs.has(id)) storedURLs.set(id, URL.createObjectURL(blob));
}
function objectRecord(value, type) {
 return { body:value, etag:crypto.randomUUID(), size:typeof value==='string'?new TextEncoder().encode(value).length:value.size, httpMetadata:{contentType:type} };
}
async function get(key) {
 const object = await readRequest(objectStore().get(key));
 return object ? {...object, json:async()=>JSON.parse(object.body)} : null;
}
const bucket = {
 get,
 head:get,
 async put(key, value, options = {}) {
  const store = objectStore('readwrite');
  const completed = done(store.transaction);
  const previous = await readRequest(store.get(key));
  const {etagMatches,etagDoesNotMatch} = options.onlyIf ?? {};
  if ((etagMatches && previous?.etag !== etagMatches) || (etagDoesNotMatch === '*' && previous)) {
   await completed;
   return null;
  }
  const type = options.httpMetadata?.contentType;
  const body = value instanceof ArrayBuffer ? new Blob([value], {type}) : value;
  const record = objectRecord(body, type);
  store.put(record, key);
  await completed;
  if (key.startsWith('file/')) registerURL(key.slice(5), body);
  return record;
 }
};
async function open() {
 const request = indexedDB.open(databaseName, 1);
 request.onupgradeneeded = () => request.result.createObjectStore(storeName);
 database = await readRequest(request);
 const saved = await get(packageKey);
 if(saved) {
  loadSeed(await saved.json());
  imported = true;
 }
 const cursor = objectStore().openCursor();
 await new Promise((resolve, reject) => {
  cursor.onerror = () => reject(cursor.error);
  cursor.onsuccess = () => {
   const entry = cursor.result;
   if (!entry) return resolve();
   if (entry.key.startsWith('file/') || entry.key.startsWith('reference/')) registerURL(entry.key.split('/')[1], entry.value.body);
   entry.continue();
  };
 });
}

const docId = /^[a-f0-9]{64}$/;
const imageId = /^[a-f0-9]{24}$/;
const itemId = /^[A-Za-z0-9._-]{1,100}$/;
const groups = new Set(['weiss','alpha','navolta']);
const statuses = new Set(['Offen','In Arbeit','Erledigt']);
async function bytes(zip, path, max) {
 const entry=zip.file(path);
 if(!entry || entry.dir || entry._data.uncompressedSize > max) throw Error('Projektpaket ist unvollständig oder eine Datei ist zu gross.');
 const value=await entry.async('uint8array');
 if(!value.length || value.length>max) throw Error('Dateigrösse ist ungültig.');
 return value;
}
async function digest(value) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)), b=>b.toString(16).padStart(2,'0')).join('');
}
async function loadPackage(file) {
 if(imported) throw Error('Das Projektpaket ist bereits in diesem Browser geladen.');
 if(file.size>60*1024*1024) throw Error('Das Projektpaket ist zu gross.');
 if(!window.JSZip) throw Error('Der ZIP-Import konnte nicht geladen werden. Prüfe die Internetverbindung.');
 const zip=await window.JSZip.loadAsync(file);
 const original=JSON.parse(new TextDecoder().decode(await bytes(zip,'projekt.json',2*1024*1024)));
 if(original.format!=='navolta-boelli-v1' || !Array.isArray(original.items) || !Array.isArray(original.docs) ||
  original.items.length>2000 || original.docs.length>100) throw Error('Bitte ein gültiges Bölli-Süd-Projektpaket wählen.');
 const docs=original.docs.map(d=>{
  if(!docId.test(d.id)||d.key!==d.id||typeof d.name!=='string')throw Error('Unterlagennummer im Projektpaket ist ungültig.');
  return {...d,project:'boelli'};
 });
 if(new Set(docs.map(d=>d.id)).size!==docs.length)throw Error('Unterlagennummern sind doppelt vorhanden.');
 const items=original.items.map(item=>{
  if(!itemId.test(item.id)||!groups.has(item.group)||!statuses.has(item.status)||typeof item.house!=='string'||typeof item.title!=='string'||
   !Array.isArray(item.reference)||!item.reference.every(key=>imageId.test(key))||!Array.isArray(item.sources))throw Error('Pendenz im Projektpaket ist ungültig.');
  return {...item,project:'boelli',photos:[]};
 });
 if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('Pendenznummern sind doppelt vorhanden.');
 const assets=[];
 let total=0;
 for(const d of docs){
  const raw=await bytes(zip,'docs/'+d.id+'.pdf',25*1024*1024);
  if(await digest(raw)!==d.id || new TextDecoder().decode(raw.subarray(0,5))!=='%PDF-')throw Error('Eine Originalunterlage stimmt nicht mit dem Projektpaket überein.');
  assets.push(['file/'+d.id, new Blob([raw],{type:'application/pdf'})]);total+=raw.length;
  if(total>85*1024*1024)throw Error('Die entpackten Unterlagen sind zu gross.');
 }
 const referenceIDs = new Set(items.flatMap(item=>item.reference));
 if(referenceIDs.size>2000) throw Error('Das Projektpaket enthält zu viele Fotos.');
 for(const id of referenceIDs){
  const raw=await bytes(zip,'photos/'+id+'.jpg',2*1024*1024);
  if(raw[0]!==255 || raw[1]!==216)throw Error('Ein Referenzfoto ist ungültig.');
  assets.push(['reference/'+id,new Blob([raw],{type:'image/jpeg'})]);total+=raw.length;
  if(total>85*1024*1024)throw Error('Die entpackten Fotos und Unterlagen sind zu gross.');
 }
 const store=objectStore('readwrite');
 const completed=done(store.transaction);
 const existing=await readRequest(store.get(packageKey));
 if(existing) {await completed;throw Error('Das Projektpaket ist bereits in diesem Browser geladen.');}
 const seed={items,docs};
 store.put(objectRecord(JSON.stringify(seed)),packageKey);
 for(const [key, blob] of assets) store.put(objectRecord(blob,blob.type),key);
 await completed;
 for(const [key, blob] of assets) registerURL(key.split('/')[1],blob);
 loadSeed(seed);
 imported=true;
 return items.length;
}

export const BrowserProject={
 open,loadPackage,
 get imported(){return imported;},
 url:key=>storedURLs.get(key)||'',
 request:(path,options)=>api.fetch(new Request(new URL(path,location.origin),options),{BUCKET:bucket})
};
window.navoltaPhotoURL=BrowserProject.url;
