(function(){
'use strict';
const cfg=window.NAVOLTA_SP_CONFIG;
const root=document.createElement('div');root.id='navolta-sharepoint-sync';root.style.cssText='position:fixed;bottom:12px;left:12px;z-index:999999;background:#fff;color:#16334e;padding:12px;border:1px solid #b9cadd;border-radius:12px;box-shadow:0 5px 25px #0003;max-width:360px;font:13px Arial,sans-serif';
root.innerHTML='<strong>SharePoint-Synchronisierung</strong><div id="nvsp-status" style="margin:7px 0">Nicht verbunden</div><div style="display:flex;gap:5px;flex-wrap:wrap"><button id="nvsp-login">Microsoft anmelden</button><button id="nvsp-pull">Von SharePoint laden</button><button id="nvsp-push">Nach SharePoint sichern</button></div><small>Manuelle Synchronisierung · keine automatische Zusammenführung</small>';
document.body.appendChild(root);
const status=document.getElementById('nvsp-status');
const msg=(s)=>{status.textContent=s};
const buttons=root.querySelectorAll('button');buttons.forEach(b=>b.style.cssText='background:#14568c;color:white;border:0;border-radius:5px;padding:7px;cursor:pointer');
let client=null,account=null,remoteEtag=null;
const configured=cfg&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(cfg.clientId)&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(cfg.tenantId);
async function init(){
 if(!configured)throw Error('Microsoft Entra Client-ID und Tenant-ID in sharepoint-config.js eintragen.');
 if(!window.msal)throw Error('Microsoft-Anmeldebibliothek nicht geladen. Internetverbindung prüfen.');
 if(!client){client=new msal.PublicClientApplication({auth:{clientId:cfg.clientId,authority:'https://login.microsoftonline.com/'+cfg.tenantId,redirectUri:'https://simonerhard.github.io/Navolta-APP/'},cache:{cacheLocation:'sessionStorage'}});await client.initialize();account=client.getAllAccounts()[0]||null}
 return client;
}
async function token(){await init();if(!account){const r=await client.loginPopup({scopes:['User.Read','Files.ReadWrite.All','Sites.ReadWrite.All']});account=r.account}
 try{return (await client.acquireTokenSilent({scopes:['Files.ReadWrite.All','Sites.ReadWrite.All'],account})).accessToken}catch(e){return (await client.acquireTokenPopup({scopes:['Files.ReadWrite.All','Sites.ReadWrite.All'],account})).accessToken}
}
const url='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(cfg.driveId)+'/root:/'+encodeURIComponent(cfg.snapshotFile)+':';
async function graph(path,options={}){const t=await token();const res=await fetch(path,{...options,headers:{Authorization:'Bearer '+t,...options.headers}});if(!res.ok){let detail='';try{detail=(await res.text()).slice(0,250)}catch(e){}throw Error('Microsoft Graph '+res.status+': '+detail)}return res}
async function meta(){try{const r=await graph(url);return await r.json()}catch(e){if(String(e.message).includes('Graph 404'))return null;throw e}}
const keys=['navolta-v1','navolta-detailed-time-v1'];
function snapshot(){const values={};for(const k of keys)values[k]=localStorage.getItem(k);return {schema:'navolta-local-snapshot-v1',savedAt:new Date().toISOString(),values}}
function valid(data){return data&&data.schema==='navolta-local-snapshot-v1'&&data.values&&typeof data.values==='object'&&keys.every(k=>data.values[k]===null||typeof data.values[k]==='string')}
function downloadBackup(){const b=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='navolta-lokal-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function pull(){msg('Lese SharePoint ...');const m=await meta();if(!m)throw Error('Noch keine Synchronisierungsdatei in der bestehenden Bibliothek. Zuerst eine Sicherung hochladen.');const r=await graph(url+':/content');const data=await r.json();if(!valid(data))throw Error('Datei hat nicht das erwartete Navolta-Datenformat.');if(!confirm('ACHTUNG: SharePoint-Daten ersetzen die lokalen Projekt- und Zeiterfassungsdaten in diesem Browser. Vorher lokales Backup herunterladen? OK = fortfahren, Abbrechen = nichts ändern.')){msg('Abgebrochen');return}downloadBackup();for(const k of keys){if(data.values[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,data.values[k])}remoteEtag=m.eTag;msg('Daten übernommen. Seite wird neu geladen.');location.reload()}
async function push(){msg('Prüfe SharePoint-Version ...');const m=await meta();if(m&&(!remoteEtag||m.eTag!==remoteEtag)){throw Error('Es existiert bereits eine SharePoint-Version, die in dieser Sitzung nicht geladen wurde oder inzwischen geändert wurde. Zuerst SharePoint laden und Änderungen abgleichen. Kein Überschreiben.')}if(!confirm('Lokalen Datenstand als zentrale SharePoint-Sicherung speichern? Andere Benutzer können ihre Änderungen verlieren, wenn sie später eine ältere Version hochladen.')){msg('Abgebrochen');return}
const body=JSON.stringify(snapshot());const headers={'Content-Type':'application/json'};if(m)headers['If-Match']=m.eTag;else headers['If-None-Match']='*';const r=await graph(url+':/content',{method:'PUT',headers,body});const saved=await r.json();remoteEtag=saved.eTag||null;msg('SharePoint-Sicherung gespeichert: '+new Date().toLocaleString('de-CH'))}
async function run(fn){try{await fn()}catch(e){console.error(e);msg('Fehler: '+e.message)}}
document.getElementById('nvsp-login').onclick=()=>run(async()=>{await token();msg('Microsoft-Konto verbunden: '+(account?.username||''));const m=await meta();remoteEtag=m?.eTag||null;if(m)msg('Verbunden. SharePoint-Datei vorhanden. Vor dem Sichern zuerst laden.');else msg('Verbunden. Noch keine SharePoint-Sicherungsdatei.')});
document.getElementById('nvsp-pull').onclick=()=>run(pull);
document.getElementById('nvsp-push').onclick=()=>run(push);
if(!configured)msg('Einrichtung erforderlich: Entra-App-ID eintragen');
})();
