/* Navolta AG: Standard-Druckvorlage aus Vorlage_leer (1).docx. Nicht für Auftragsbestätigungen. */
(function(){
"use strict";
const logo=new URL("navolta-logo.png",location.href).href;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isAB=t=>/auftragsbestätigung|auftragsbestaetigung/i.test(String(t||""));
const svg=(path)=>'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1280bb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
const header='<div class="nv-letter-header"><img src="'+logo+'" alt="Navolta AG"></div>';
const footer='<div class="nv-letter-footer"><span>'+svg('<path d="M5 4h3l2 5-2 2c1 2 3 4 5 5l2-2 5 2v3c-8 2-17-7-17-15z"/>')+' +41 61 751 75 55</span><span>'+svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"/>')+' navolta.ch</span><span>'+svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>')+' info@navolta.ch</span><span>'+svg('<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2"/>')+' Fiechtenweg 4, 4147 Aesch BL, Schweiz</span></div>';
function css(landscape){
return '@page{size:A4'+(landscape?' landscape':'')+';margin:'+(landscape?'36mm 13mm 22mm 18mm':'42mm 14mm 22mm 20mm')+'}'+
'html,body{font-family:Arial,Helvetica,sans-serif!important;color:#111!important}body{font-size:12pt!important;line-height:1.35!important;margin:0!important}'+
'h1{font:700 16pt Arial,Helvetica,sans-serif!important;color:#111!important;margin:0 0 14pt!important}h2{font:700 14pt Arial,Helvetica,sans-serif!important;color:#111!important;margin:12pt 0 8pt!important}h3{font:700 12pt Arial,Helvetica,sans-serif!important}p,li{font:12pt/1.35 Arial,Helvetica,sans-serif!important}'+
'table{width:100%;border-collapse:collapse;font:10pt Arial,sans-serif;margin:12pt 0}tr{break-inside:avoid}thead{display:table-header-group}th,td{font-family:Arial,sans-serif;padding:6pt 4pt;border-bottom:1px solid #d3dfe8;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf5fb}'+
'.nv-letter-header{position:fixed!important;top:-37mm;right:0;width:83mm;height:28mm;display:flex;align-items:center;justify-content:flex-end;background:#fff!important;z-index:9999}.nv-letter-header img{width:78mm;height:25mm;object-fit:contain}'+
'.nv-letter-footer{position:fixed!important;bottom:-17mm;left:0;right:0;border-top:.7px solid #555;padding-top:5mm;display:flex;justify-content:space-between;gap:2mm;align-items:center;font:7.6pt Arial,sans-serif;color:#38434e;background:#fff!important;z-index:9999}.nv-letter-footer span{display:flex;align-items:center;gap:1.2mm;white-space:nowrap}.nv-letter-footer svg{flex-shrink:0}'+
'.report-header,.report-footer{display:none!important}'+
'@media screen{body.nv-letter-preview{max-width:210mm;min-height:297mm;padding:42mm 14mm 24mm 20mm!important;margin:12px auto!important;background:white!important;box-shadow:0 3px 20px #0003}body.nv-letter-preview .nv-letter-header{position:absolute!important;top:8mm!important;right:14mm!important}body.nv-letter-preview .nv-letter-footer{position:relative!important;bottom:auto!important;margin-top:25mm!important}}'+
'@media print{.print,.nv-no-print,button{display:none!important}}';
}
function brandHtml(markup){
markup=String(markup||"");if(!/<html[\s>]|<body[\s>]/i.test(markup))return markup;
const doc=new DOMParser().parseFromString(markup,"text/html");
if(isAB(doc.title)||doc.querySelector(".nv-letter-header"))return markup;
const style=doc.createElement("style");style.textContent=css(/@page\s*\{[^}]*landscape/i.test(markup));doc.head.appendChild(style);
doc.querySelectorAll(".report-header,.report-footer").forEach(x=>x.remove());
const first=doc.body.firstElementChild;if(first&&first.tagName==="IMG"&&/navolta.logo|navolta-logo/i.test(first.getAttribute("src")||""))first.remove();
const hd=doc.createElement("div");hd.innerHTML=header;doc.body.insertBefore(hd.firstElementChild,doc.body.firstChild);
const ft=doc.createElement("div");ft.innerHTML=footer;doc.body.appendChild(ft.firstElementChild);
doc.body.classList.add("nv-letter-preview");return "<!doctype html>\n"+doc.documentElement.outerHTML;
}
function build(title,body,subtitle){
const html='<!doctype html><html lang="de"><head><meta charset="utf-8"><title>'+esc(title)+' – Navolta AG</title></head><body><h1>'+esc(title)+'</h1>'+(subtitle?'<h2>'+esc(subtitle)+'</h2>':'')+body+'<button class="print nv-no-print" onclick="window.print()" style="margin:20px 0;background:#1467a1;color:white;border:0;padding:9px 14px;cursor:pointer">Drucken / Als PDF speichern</button></body></html>';
return brandHtml(html);
}
function openDoc(title,body,subtitle){
const w=window.open("","_blank");if(!w){alert("Bitte Pop-ups für den PDF-Export erlauben.");return null}
w.document.open();w.document.write(build(title,body,subtitle));w.document.close();return w;
}
window.NV_PRINT={brandHtml,build,openDoc,css};
window.printReport=function(title,body,subject){
if(isAB(title))return;
return openDoc(title,'<div style="font-size:9pt;color:#506172;margin-bottom:13pt">Betreff: '+esc(subject||title)+' · Erstellt: '+esc(new Date().toLocaleString("de-CH"))+'</div>'+String(body||""));
};
const mainStyle=document.createElement("style");mainStyle.id="nv-letter-main-print";
mainStyle.textContent='@media print{'+css(false)+'header,.sidebar,nav,#navolta-sharepoint-sync,#nvsp-cover,#nv-ab-launch{display:none!important}}';
document.head.appendChild(mainStyle);
let head=null,foot=null;
window.addEventListener("beforeprint",()=>{if(isAB(document.title))return;
if(!head){const e=document.createElement("div");e.innerHTML=header;head=e.firstElementChild;document.body.appendChild(head)}
if(!foot){const e=document.createElement("div");e.innerHTML=footer;foot=e.firstElementChild;document.body.appendChild(foot)}
});
window.addEventListener("afterprint",()=>{head?.remove();foot?.remove();head=foot=null});
})();