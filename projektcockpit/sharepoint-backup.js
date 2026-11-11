(function(){
'use strict';
const cfg=window.NAVOLTA_SP_CONFIG?.projectCockpit;
const statusEl=document.getElementById('sp-backup-status');
const connectButton=document.getElementById('sp-connect');
const scopes=['User.Read','Files.ReadWrite.All','Sites.ReadWrite.All'];
const redirectUri=cfg?.redirectUri||'https://simonerhard.github.io/Navolta-APP/';
let client=null,account=null,readyPromise=null,latestState=null,timer=null,uploading=false,rerun=false;

function status(text){if(statusEl)statusEl.textContent=text}
function localDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich'}).format(new Date())}
function filename(){return 'Navolta-Cockpit-'+localDate()+'.json'}
async function init(){
 if(!cfg||!window.NAVOLTA_SP_CONFIG?.clientId||!window.NAVOLTA_SP_CONFIG?.tenantId)throw Error('SharePoint-Konfiguration fehlt.');
 if(!window.msal)throw Error('Microsoft-Anmeldung konnte nicht geladen werden.');
 if(!readyPromise)readyPromise=(async()=>{
  client=new msal.PublicClientApplication({
   auth:{clientId:window.NAVOLTA_SP_CONFIG.clientId,authority:'https://login.microsoftonline.com/'+window.NAVOLTA_SP_CONFIG.tenantId,redirectUri,navigateToLoginRequestUrl:false},
   cache:{cacheLocation:'sessionStorage'}
  });
  await client.initialize();
  const result=await client.handleRedirectPromise();
  account=result?.account||client.getAllAccounts()[0]||null;
  if(account)client.setActiveAccount(account);
 })().catch(e=>{readyPromise=null;throw e});
 await readyPromise;
 return client;
}
async function accessToken(interactive=false){
 await init();
 if(!account){
  if(!interactive)throw Error('SharePoint einmal verbinden.');
  const login=await client.loginPopup({scopes,redirectUri});
  account=login.account;client.setActiveAccount(account);
  return login.accessToken;
 }
 try{return (await client.acquireTokenSilent({scopes,account})).accessToken}
 catch(e){
  if(interactive){
   const result=await client.acquireTokenPopup({scopes,account,redirectUri});
   account=result.account||account;client.setActiveAccount(account);
   return result.accessToken;
  }
  throw e;
 }
}
async function graph(url,options,token){
 const res=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,...(options?.headers||{})}});
 if(!res.ok){let detail='';try{detail=(await res.text()).slice(0,350)}catch{}throw Error('Microsoft Graph '+res.status+(detail?': '+detail:''))}
 return res;
}
function targetUrl(name,action='content'){
 const drive=encodeURIComponent(cfg.driveId),folder=encodeURIComponent(cfg.backupFolderId),file=encodeURIComponent(name);
 return 'https://graph.microsoft.com/v1.0/drives/'+drive+'/items/'+folder+':/'+file+':/'+action;
}
async function uploadLarge(url,blob,token){
 const session=await graph(url.replace(/\/content$/,'/createUploadSession'),{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({item:{name:filename(),'@microsoft.graph.conflictBehavior':'replace'}})
 },token);
 const {uploadUrl}=await session.json();
 if(!uploadUrl)throw Error('SharePoint hat keine Upload-Sitzung bereitgestellt.');
 const chunkSize=320*1024*10;
 for(let start=0;start<blob.size;start+=chunkSize){
  const end=Math.min(start+chunkSize,blob.size)-1;
  const response=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Range':'bytes '+start+'-'+end+'/'+blob.size},body:blob.slice(start,end+1)});
  if(!response.ok&&response.status!==202){let detail='';try{detail=(await response.text()).slice(0,250)}catch{}throw Error('SharePoint-Upload '+response.status+(detail?': '+detail:''))}
 }
}
async function uploadSnapshot(state,interactive=false){
 const token=await accessToken(interactive);
 const snapshot={schema:1,exported:new Date().toISOString(),state:JSON.parse(JSON.stringify(state))};
 const blob=new Blob([JSON.stringify(snapshot)],{type:'application/json'});
 const url=targetUrl(filename());
 if(blob.size<=3_500_000)await graph(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:blob},token);
 else await uploadLarge(url,blob,token);
 status('SharePoint-Sicherung aktuell · '+new Date().toLocaleTimeString('de-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'}));
}
async function runUpload(interactive=false){
 if(!latestState)return;
 if(uploading){rerun=true;return}
 uploading=true;rerun=false;status('Sicherung wird in SharePoint gespeichert …');
 try{await uploadSnapshot(latestState,interactive)}
 catch(e){
  console.error('Navolta SharePoint backup:',e);
  status(/Interaktion|login_required|consent_required|interaction_required|SharePoint einmal verbinden/i.test(String(e))?'Bitte SharePoint verbinden oder Anmeldung erneuern.':'SharePoint-Sicherung fehlgeschlagen · '+e.message);
 }finally{
  uploading=false;
  if(rerun){rerun=false;clearTimeout(timer);timer=setTimeout(()=>runUpload(false),1000)}
 }
}
function queue(state){
 try{latestState=JSON.parse(JSON.stringify(state))}catch(e){status('Sicherung konnte nicht vorbereitet werden.');return}
 if(!account){status('Automatische Sicherung bereit · SharePoint einmal verbinden.');return}
 clearTimeout(timer);timer=setTimeout(()=>runUpload(false),8000);
}
async function connect(){
 if(connectButton)connectButton.disabled=true;
 status('Verbinde mit SharePoint …');
 try{
  await init();
  if(account)await accessToken(true);
  else await accessToken(true);
  if(latestState)await runUpload(false);
  else status('SharePoint verbunden · nächste Änderung wird automatisch gesichert.');
 }catch(e){console.error('Navolta SharePoint connection:',e);status('SharePoint-Verbindung fehlgeschlagen · '+e.message)}
 finally{if(connectButton)connectButton.disabled=false}
}
if(connectButton)connectButton.addEventListener('click',connect);
window.navoltaSharePointBackup={queue,connect,backupNow:()=>runUpload(true)};
init().then(()=>{
 if(account){status('SharePoint verbunden · automatische Sicherung aktiv.');if(latestState)queue(latestState)}
 else status('Automatische Sicherung bereit · SharePoint einmal verbinden.');
 setInterval(()=>{if(account&&latestState)runUpload(false)},15*60*1000);
}).catch(e=>status('SharePoint nicht verfügbar · '+e.message));
})();