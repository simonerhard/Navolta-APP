(()=>{'use strict';
const KEY='navolta-order-confirmations-v1';let docs=[];const get=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}},save=x=>localStorage.setItem(KEY,JSON.stringify(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css=document.createElement('style');css.textContent=`#nv-ab-launch{position:fixed;right:0;top:42%;z-index:900000;background:#0d5c9d;color:#fff;border:0;border-radius:10px 0 0 10px;padding:14px 12px;box-shadow:0 4px 16px #0004;cursor:pointer;writing-mode:vertical-rl;font-weight:700}#nv-ab-modal{position:fixed;inset:0;z-index:950000;background:#071a33bb;display:none;align-items:center;justify-content:center;padding:15px}#nv-ab-modal.open{display:flex}#nv-ab-main{width:min(1120px,98vw);max-height:94vh;overflow:auto;background:#f7faff;border-radius:15px;padding:22px;color:#132a42;font:14px Arial,sans-serif}#nv-ab-main h2{margin:0 0 8px}#nv-ab-main .ab-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}#nv-ab-main label{font-weight:600;display:block;margin:9px 0 4px}#nv-ab-main input,#nv-ab-main textarea,#nv-ab-main select{width:100%;padding:9px;border:1px solid #b9cbdc;border-radius:7px;background:#fff;font:inherit}#nv-ab-main textarea{min-height:72px}#nv-ab-main button{border:0;background:#125b96;color:#fff;padding:9px 12px;border-radius:7px;cursor:pointer;margin:4px 5px 4px 0}#nv-ab-main button.alt{background:#64748b}#nv-ab-main .ab-card{background:white;border:1px solid #dbe5ef;border-radius:10px;padding:14px;margin:12px 0}#nv-ab-main .ab-note{font-size:12px;color:#5b7088}#nv-ab-main .ab-warning{background:#fff4da;border-left:4px solid #d18a1a;padding:10px;margin:9px 0}`;document.head.appendChild(css);
const btn=document.createElement('button');btn.id='nv-ab-launch';btn.textContent='Auftragsbestätigungen';document.body.appendChild(btn);
const modal=document.createElement('div');modal.id='nv-ab-modal';modal.innerHTML=`<div id="nv-ab-main" role="dialog" aria-modal="true" aria-label="Auftragsbestätigungen"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Auftragsbestätigungen</h2><button class="alt" id="ab-close">Schliessen ×</button></div><p class="ab-note">Bestellung und Angebot einlesen, bestehende Bestätigung kopieren oder neue Bestätigung manuell erfassen. PDF-Layout nach Navolta_Auftragsbestaetigung_Vorlage.docx (11.11.2026). Alle Werte vor dem Versand kontrollieren.</p><div class="ab-card"><b>PDF-Dokumente einlesen</b><div class="ab-grid"><div><label>Bestellung (PDF)</label><input type="file" id="ab-po-file" accept="application/pdf"></div><div><label>Angebot (PDF)</label><input type="file" id="ab-offer-file" accept="application/pdf"></div><div><label>Vorhandene Auftragsbestätigung (PDF)</label><input type="file" id="ab-old-file" accept="application/pdf"></div></div><button id="ab-extract">PDFs analysieren und Formular ausfüllen</button><span id="ab-scan-status" class="ab-note"></span><div class="ab-note">Textbasierte PDFs werden automatisch gelesen. Bildscans ohne Textschicht benötigen OCR; Werte können jederzeit manuell ergänzt werden.</div></div><div class="ab-card"><b>Gespeicherte Auftragsbestätigungen</b><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select id="ab-saved" style="max-width:430px"></select><button id="ab-copy">Auswahl kopieren</button><button id="ab-load">Bearbeiten</button><button id="ab-new">Neu erstellen</button></div></div><div id="ab-warning" class="ab-warning" hidden></div><div class="ab-card"><div class="ab-grid"><div><label>Bestellnummer</label><input id="ab-po" placeholder="4800038844"></div><div><label>Auftrags-/Projektnummer</label><input id="ab-project" placeholder="1260040"></div><div><label>Angebotsnummer</label><input id="ab-offer" placeholder="2600231"></div><div><label>Datum</label><input type="date" id="ab-date"></div><div><label>Kunde</label><input id="ab-client" value="Bachem AG"></div><div><label>Kundenadresse</label><input id="ab-address" value="Hauptstrasse 147, CH-4416 Bubendorf"></div><div><label>Kundenkontakt</label><input id="ab-contact" value="Mathias Schindler"></div><div><label>Projektleiter</label><input id="ab-manager" value="Simon Erhard"></div><div><label>Liefer-/Leistungsdatum</label><input type="date" id="ab-delivery"></div><div><label>Zahlungsbedingungen</label><input id="ab-payment" value="60 Tage netto"></div><div><label>Netto CHF (exkl. MwSt.)</label><input type="number" step="0.01" id="ab-net" value="0"></div><div><label>Rabatt CHF</label><input type="number" step="0.01" id="ab-discount" value="0"></div><div><label>MwSt.-Satz %</label><input type="number" step="0.1" id="ab-vat" value="8.1"></div><div><label>Bestätigungsempfänger</label><input id="ab-email" placeholder="E-Mail nur falls bekannt"></div></div><label>Leistungsbeschreibung</label><textarea id="ab-description"></textarea><label>Bemerkungen / abweichende Bedingungen</label><textarea id="ab-notes"></textarea><div id="ab-totals" style="font-weight:bold;margin:10px 0"></div><button id="ab-save">Bestätigung speichern</button><button id="ab-print">PDF erstellen / Drucken</button><button class="alt" id="ab-json">JSON exportieren</button><span id="ab-save-status" class="ab-note"></span></div></div>`;document.body.appendChild(modal);
const el=id=>document.getElementById('ab-'+id);const fields=['po','project','offer','date','client','address','contact','manager','delivery','payment','net','discount','vat','email','description','notes'];let editing=null;
const val=id=>el(id).value;const fill=o=>{fields.forEach(k=>{if(o[k]!==undefined)el(k).value=o[k]});totals()};const values=()=>Object.fromEntries(fields.map(k=>[k,val(k)]));const money=x=>Number(x||0).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2});const calc=()=>{const net=+val('net')||0,disc=+val('discount')||0,vat=+val('vat')||0;return {base:Math.max(0,net-disc),tax:Math.round((Math.max(0,net-disc)*vat/100)*100)/100,total:Math.max(0,net-disc)+Math.round((Math.max(0,net-disc)*vat/100)*100)/100}};
function totals(){const x=calc();el('totals').textContent=`Netto nach Rabatt: CHF ${money(x.base)} · MwSt.: CHF ${money(x.tax)} · Total: CHF ${money(x.total)}`}
function list(){const arr=get();el('saved').innerHTML='<option value="">Bitte auswählen</option>'+arr.map(x=>`<option value="${esc(x.id)}">${esc(x.po||'ohne Nummer')} · ${esc(x.client)} · ${esc(x.date)}</option>`).join('')}
function fresh(){editing=null;fields.forEach(k=>el(k).value='');fill({date:new Date().toISOString().slice(0,10),client:'Bachem AG',address:'Hauptstrasse 147, CH-4416 Bubendorf',contact:'Mathias Schindler',manager:'Simon Erhard',payment:'60 Tage netto',net:0,discount:0,vat:8.1,email:''});el('warning').hidden=true}
btn.onclick=()=>{modal.classList.add('open');list()};el('close').onclick=()=>modal.classList.remove('open');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});el('new').onclick=fresh;el('load').onclick=()=>{const x=get().find(x=>x.id===val('saved'));if(x){editing=x.id;fill(x)}};el('copy').onclick=()=>{const x=get().find(x=>x.id===val('saved'));if(x){editing=null;fill(x);el('save-status').textContent='Kopie geladen – Bestellnummer und Datum prüfen.'}};
['net','discount','vat'].forEach(x=>el(x).addEventListener('input',totals));
el('save').onclick=()=>{if(!val('po').trim()){el('save-status').textContent='Bitte Bestellnummer eintragen.';return}const a=get(),o={...values(),id:editing||('ab-'+Date.now()),updated:new Date().toISOString()};const i=a.findIndex(x=>x.id===o.id);if(i>=0)a[i]=o;else a.unshift(o);save(a);editing=o.id;list();el('saved').value=o.id;el('save-status').textContent='Lokal gespeichert. Für SharePoint die Datensicherung der App separat auslösen.'};
el('json').onclick=()=>{const blob=new Blob([JSON.stringify(values(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Auftragsbestaetigung_'+(val('po')||'neu')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
const pdfText=async file=>{if(!file)return '';if(!window.pdfjsLib){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const doc=await lib.getDocument({data:await file.arrayBuffer()}).promise;let result='';for(let p=1;p<=Math.min(doc.numPages,12);p++){const page=await doc.getPage(p),content=await page.getTextContent();result+='\n'+content.items.map(x=>x.str).join(' ')}return result};
const match=(s,r)=>s.match(r)?.[1]?.trim()||'';const num=s=>s.replace(/[’'`\s]/g,'').replace(/,/g,'');
el('extract').onclick=async()=>{el('scan-status').textContent='PDF wird eingelesen …';try{const [po,offer,old]=await Promise.all(['po-file','offer-file','old-file'].map(async k=>el(k).files[0]?pdfText(el(k).files[0]):''));if(!po&&!offer&&!old)throw Error('Keine lesbaren Textdaten gefunden. Bei Bildscans bitte manuell erfassen.');let o={};if(po){o.po=match(po,/Bestellung\s+(\d{8,12})/i)||match(po,/(4800\d{6})/);o.client='Bachem AG';o.address='Hauptstrasse 147, CH-4416 Bubendorf';o.delivery=(()=>{let d=match(po,/Lieferdatum\s+(\d{2}\.\d{2}\.\d{4})/i);return d?d.split('.').reverse().join('-'):''})();o.contact=match(po,/Bachem Kontakt:\s*([A-ZÄÖÜ][a-zäöü]+\s+[A-ZÄÖÜ][a-zäöü]+)/i)||'Mathias Schindler';o.payment=match(po,/Zahlungsbedingungen\s+(\d+\s*Tage\s*netto)/i)||'60 Tage netto';let sum=match(po,/Gesamtwert\s+([\d',.]+)/i)||match(po,/Nettowert inkl Rab\.\s+([\d',.]+)/i);if(sum)o.net=num(sum).replace(/,(?=\d{2}$)/,'.');o.description=match(po,/(Support Netzbetreiberaufgaben Elektro)/i)||'';}
if(offer){o.offer=match(offer,/Dokument-Nr\.?:\s*(\d{6,})/i)||match(offer,/Angebot\s+(\d{6,})/i);o.project=match(offer,/Projekt-Nr\.?:\s*(\d{6,})/i);if(!o.description)o.description=match(offer,/Projekt:\s*([^\n]+)/i)||'Unterstützung Netzbetreiberaufgaben';}
if(old){o.po=o.po||match(old,/(4800\d{6})/);o.project=o.project||match(old,/Auftragsnummer\s*\/\s*Projekt:\s*(\d+)/i)}
fill(o);const warnings=[];if(po&&offer){const p=match(po,/Projektstunden:\s*(\d+)/i),a=match(offer,/Auftragsumfang:\s*(\d+)/i);if(p&&a&&p!==a)warnings.push(`Stundenumfang unterschiedlich: Bestellung ${p} h, Angebot ${a} h.`);const ordered=match(po,/Gesamtwert\s+([\d',.]+)/i),quoted=match(offer,/Summe exkl\.\s*MWST\s+([\d',.]+)/i);if(ordered&&quoted&&num(ordered)!==num(quoted))warnings.push(`Beträge unterscheiden sich: Bestellung CHF ${ordered}, Angebot CHF ${quoted}. Die Bestellwerte wurden übernommen.`)}el('warning').hidden=!warnings.length;el('warning').textContent=warnings.join(' ');el('scan-status').textContent='Einlesen abgeschlossen. Bitte sämtliche Werte und Abweichungen prüfen.';}catch(e){el('scan-status').textContent='Einlesen nicht möglich: '+e.message}};
el('print').onclick=()=>{
if(!val('po').trim()){alert('Bitte Bestellnummer eintragen.');return}
const x=values(),c=calc(),net=Number(x.net)||0,discount=Number(x.discount)||0;
const h=esc, amt=money, useConditions=false;
const logo=new URL('ab-logo-original.jpeg',location.href).href;
const corner=new URL('ab-ecke-original.png',location.href).href;
const sign=new URL('ab-unterschrift-original.png',location.href).href;
const displayDate=x.date?x.date.split('-').reverse().join('.'):'', contact=(x.contact||'').trim();
const salutation=contact?('Sehr geehrter Herr '+contact.replace(/^Hr\.?\s*/i,'').split(/\s+/).slice(-1).join('')):'Sehr geehrte Damen und Herren';
const recipient=(x.address||'').replace(/,\s*/g,'\n');
const project=(x.project||'').trim(), description=(x.description||'').trim();
const conditions=[
['Preisstabilität','Die vereinbarten Preise bleiben bis zur Bauvollendung unverändert.'],
['Vertragsgrundlage','Grundlage der Ausführung und Lieferung ist das bestätigte Angebot inkl. Leistungsbeschrieb'],
['Leistungsanpassungen','Änderungen oder Zusatzleistungen bedürfen der vorherigen Abstimmung und werden bei Bestätigung – schriftlich – als beauftragt betrachtet. Die Abrechnung von Nachträgen erfolgt erst nach Abschluss des Gesamtprojekts.'],
['Mengen- und Ausführungsspezifikationen','In Abhängigkeit vom Baufortschritt können sowohl die angebotenen Mengen als auch die Ausführungsspezifikationen angepasst werden.'],
['Verzögerungen','Bei Verspätung oder Falschlieferung haftet der Lieferant für sämtliche daraus entstehende Kosten, Schäden und Vertragsstrafen.'],
['Materialabrufe und Lieferadresse','Die Navolta AG bestimmt Zeitpunkt und Ort der Lieferung; Abweichungen sind nicht zulässig.'],
['AGB','Es wird ausdrücklich auf die AGB der Navolta AG hingewiesen, welche strikt einzuhalten sind.'],
['Gerichtsstand','Für sämtliche Streitigkeiten aus dem Vertragsverhältnis gilt Basel als ausschliesslicher Gerichtsstand.'],
['Auftragsreferenz','Auftragsnummern sind auf allen Dokumenten zwingend; fehlende Angaben berechtigen die Navolta AG zur Zahlungsverweigerung.'],
['Gültigkeit der Auftragserteilung','Die Bestellung erlangt erst durch das Gegenzeichnen dieser Auftragserteilung ihre Gültigkeit.']];
const yPositions=[508,526,544,570,588,605,623,641,658,676];
const condHtml=useConditions?`<div class="fixed bold" style="left:71pt;top:484pt">Rahmenbedingungen:</div>${conditions.map(([a,b],i)=>`<div class="condition" style="top:${yPositions[i]}pt"><b class="n">${i+1}.</b><b class="ct">${h(a)}</b><div class="cd">${h(b)}</div></div>`).join('')}`:'';
const sigY=589;
const introText='Herzlichen Dank für die Auftragserteilung und Ihr Vertrauen! Wir bestätigen den Erhalt des Auftrags gemäss beigefügtem Angebot sowie den vereinbarten Konditionen und werden die Arbeiten entsprechend ausführen.';
const row=(y,label,name,amount,bold=false)=>`<div class="fixed ${bold?'bold':''}" style="left:71pt;top:${y}pt;width:141pt">${label}</div><div class="fixed ${bold?'bold':''}" style="left:220pt;top:${y}pt;width:232pt">${name}</div><div class="fixed ${bold?'bold':''}" style="left:459pt;top:${y}pt;width:94pt;display:flex;justify-content:space-between"><span>CHF</span><span style="min-width:57pt;text-align:right">${amt(amount)}</span></div>`;
const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Auftragsbestätigung ${h(x.po)}</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9pt}
.page{width:595.28pt;height:841.89pt;position:relative;overflow:hidden;background:#fff;margin:0 auto}
.fixed{position:absolute;font-size:9pt;line-height:1.23;white-space:normal}.bold{font-weight:700}.addr{white-space:pre-line;font-size:9pt;line-height:11.5pt}
.logo{position:absolute;left:305pt;top:48.5pt;width:229pt;height:54pt;object-fit:contain}
.corner{position:absolute;right:0;top:0;width:67pt;height:54pt;object-fit:fill}
.column{position:absolute;top:132pt;font-size:9pt;line-height:1.12}.column b{display:block;font-weight:700}.projectdesc{font-size:9pt;line-height:1.12;max-height:50pt;overflow:hidden}
.heading{position:absolute;left:71pt;top:228.5pt;font-size:11pt;font-weight:700;line-height:13pt}
.salutation{position:absolute;left:71pt;top:254pt;font-size:9pt;line-height:11pt}.intro{position:absolute;left:71pt;right:41pt;top:266pt;line-height:11.2pt;font-size:9pt;max-height:34pt;overflow:hidden}
.amountline{position:absolute;left:212.6pt}.condition{position:absolute;left:89pt;right:51pt;font-size:7pt;line-height:8.7pt;min-height:17pt}
.condition .n{position:absolute;left:0;top:0}.condition .ct{position:absolute;left:18pt;right:0;top:0}.condition .cd{position:absolute;left:18pt;right:0;top:8.7pt;max-height:18pt;overflow:hidden}
.signImage{position:absolute;width:116.95pt;height:32.4pt;object-fit:fill}.foot{position:absolute;top:797pt;font-size:9pt;line-height:11pt}
@media screen{html,body{background:#dee4eb;padding:18px}.page{box-shadow:0 3px 18px #0003}}
@media print{html,body{padding:0;background:#fff}.page{box-shadow:none}}
</style></head><body><div class="page">
<img class="corner" src="${corner}" alt=""><img class="logo" src="${logo}" alt="Navolta AG">
<div class="fixed addr" style="left:71pt;top:49pt">${h(x.client||'Bachem AG')}\n${h(recipient)}</div>
<div class="column" style="left:71pt;width:142pt"><b>Ihre Referenz</b>${h(contact)}</div>
<div class="column" style="left:220pt;width:94pt"><b>Unsere Referenz</b>${h(x.manager)}</div>
<div class="column" style="left:321pt;width:150pt"><b>Auftragsnummer/Projekt</b>${h(project)}<b>Projektnummer des Kunden</b>${h(x.po)}<div class="projectdesc">${h(description)}</div></div>
<div class="column" style="left:475pt;width:93pt"><b>Ort und Datum</b>Aesch,<br>${h(displayDate)}</div>
<div class="heading">Auftragsbestätigung</div>
<div class="salutation">${h(salutation)}</div>
<div class="intro">${h(introText)}</div>
<div class="fixed bold" style="left:71pt;top:299pt">Dienstleistungen</div><div class="fixed bold" style="left:220pt;top:299pt">Ihre Bestellnummer:</div><div class="fixed bold" style="right:42pt;top:299pt;text-align:right">${h(x.po)}</div>
${row(323.5,'Vereinbarte Konditionen','Bruttopreis exkl. MwSt.',net,true)}
${row(343.5,'','Rabatt',discount)}
${row(363.5,'','Objektrabatt',0)}
${row(383.5,'',`Mehrwertsteuer (${h(x.vat)} %)`,c.tax)}
${row(403.5,'','Nettopreis inkl. MwSt.',c.total,true)}
<div class="fixed bold" style="left:71pt;top:446pt">Zahlungsbedingungen</div><div class="fixed bold" style="left:220pt;top:446pt">${h(x.payment)}</div>
<div class="fixed bold" style="left:71pt;top:467pt">Bestellung</div><div class="fixed bold" style="left:220pt;top:467pt">${h(x.po)}</div>
<div class="fixed bold" style="left:71pt;top:488pt">Zuständiger Projektleiter</div><div class="fixed" style="left:220pt;top:488pt">Hr. ${h(x.manager.replace(/^Hr\.?\s*/i,''))}</div>
<div class="fixed bold" style="left:71pt;top:509pt">Kontaktperson des Kunden</div><div class="fixed" style="left:220pt;top:509pt">${contact?'Hr. '+h(contact.replace(/^Hr\.?\s*/i,'')):''}</div>
<div class="fixed" style="left:71pt;top:568pt">Unterschriften:</div>
<div class="fixed bold" style="left:71pt;top:589pt">Navolta AG</div>
<div class="fixed" style="left:71pt;top:601pt">Geschäftsleitung / Verwaltungsrat</div>
<div class="fixed" style="left:71pt;top:612pt">P. Blum / S. Erhard</div>
<div style="position:absolute;left:71pt;top:655pt;width:125pt;border-top:0.5pt solid #222"></div>
<div class="foot" style="left:71pt">Auftragsbestätigung Navolta AG</div><div class="foot" style="right:41pt">Seite 1/1</div>
</div></body></html>`;
const w=window.open('','_blank');if(!w){alert('Bitte Pop-ups für die Druckvorschau zulassen.');return}
w.document.open();w.document.write(html);w.document.close();
const images=[...w.document.images];let printed=false;const doPrint=()=>{if(printed)return;printed=true;w.focus();w.print()};
Promise.all(images.map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))).then(()=>setTimeout(doPrint,250));setTimeout(doPrint,3000);
};

fresh();
})();
