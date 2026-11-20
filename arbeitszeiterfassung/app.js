"use strict";
const $ = id => document.getElementById(id);
const KEY = "navolta.arbeitszeiterfassung.v1";
const RECIPIENTS = ["info@navolta.ch", "se@navolta.ch"];
const MONTHS = Array.from({length:12}, (_, i) => new Intl.DateTimeFormat("de-CH", {month:"long", timeZone:"UTC"}).format(new Date(Date.UTC(2026,i,1))));
const WEEKDAYS = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const ABSENCES = ["Ferien", "Krankheit", "Unfall", "Feiertag", "Arzttermin", "Weiterbildung", "Militär / Zivildienst", "Mutterschaft / anderer Elternteil", "Kompensation", "Unbezahlter Urlaub", "Sonstige Abwesenheit"];
const now = new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Zurich",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const blank = () => ({slots:[], breakMinutes:0, absence:"", absenceMinutes:0, credited:false, off:false, note:"", breakStart:"", holiday:false, vorhol:0});
const pad = n => String(n).padStart(2, "0");
const duration = n => Math.floor(n / 60) + ":" + pad(n % 60);
const time = value => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const daysIn = (y,m) => new Date(Date.UTC(y,m,0)).getUTCDate();
const keyFor = (y,m,d) => y + "-" + pad(m) + "-" + pad(d);
let state = {employees:[], selected:"", year:Number(now.slice(0,4)), month:Number(now.slice(5,7))};
let storageAvailable = true;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) state = JSON.parse(saved);
  localStorage.setItem(KEY, JSON.stringify(state));
} catch (error) {
  storageAvailable = false;
}
let noticeTimer;
function notify(message, persistent = false) {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  if (!persistent) noticeTimer = setTimeout(() => { $("notice").textContent = ""; }, 6500);
}
function save(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    state = next;
    return true;
  } catch (error) {
    notify("Speichern fehlgeschlagen. Prüfen Sie die Browsereinstellungen oder den verfügbaren Speicher.", true);
    return false;
  }
}
const employee = () => state.employees.find(person => person.id === state.selected);
function net(entry) {
  return entry.slots.reduce((sum,[from,to]) => sum + time(to) - time(from), 0) - entry.breakMinutes;
}
function pauses(entry) {
  return entry.slots.reduce((sum,[from],i) => i ? sum+time(from)-time(entry.slots[i-1][1]) : sum, entry.breakMinutes);
}
function datesFor(person, year, month) {
  return Array.from({length:daysIn(year,month)}, (_,i) => {
    const day = i + 1;
    const date = keyFor(year,month,day);
    return {date, day, weekday:new Date(Date.UTC(year,month-1,day)).getUTCDay(), entry:person?.days[date]};
  });
}
function totalsFor(days) {
  const types = new Map();
  let work = 0, absence = 0, credit = 0;
  for (const {entry} of days) {
    if (!entry) continue;
    work += net(entry);
    absence += entry.absenceMinutes;
    if (entry.credited) credit += entry.absenceMinutes;
    if (entry.absence) {
      const subtotal = types.get(entry.absence) || [0,0];
      subtotal[0] += entry.absenceMinutes;
      if (entry.credited) subtotal[1] += entry.absenceMinutes;
      types.set(entry.absence, subtotal);
    }
  }
  return {work,absence,credit,total:work+credit,types};
}
function render() {
  const person = employee();
  $("employee").replaceChildren(new Option("Mitarbeiterprofil wählen", ""), ...state.employees.map(item => new Option(item.name,item.id)));
  $("employee").value = state.selected;
  $("month").value = state.month;
  $("year").value = state.year;
  $("renameEmployee").disabled = !person || !storageAvailable;
  $("newEmployee").disabled = !storageAvailable;
  $("period").textContent = MONTHS[state.month-1] + " " + state.year;
  const days = datesFor(person,state.year,state.month);
  const recorded = days.filter(day => day.entry).length;
  $("coverage").textContent = person ? recorded + " von " + days.length + " Kalendertagen erfasst" : "Für die Zeiterfassung ein Mitarbeiterprofil anlegen oder auswählen.";
  const sums = totalsFor(days);
  const gav = gavAccount(person,state.year,state.month,now);
  renderGav(person,gav);
  renderVacation(person);
  for (const [id,value] of Object.entries({workTotal:sums.work,absenceTotal:sums.absence,creditTotal:sums.credit,monthTotal:sums.total})) {
    $(id).textContent = duration(value) + " h";
  }
  $("pdf").disabled = $("mail").disabled = $("whatsapp").disabled = !recorded;
  $("days").innerHTML = days.map(({date,day,weekday,entry}) => {
    const weekend = [0,6].includes(weekday);
    const description = entry?.absence ? escapeHtml(entry.absence) + " · " + duration(entry.absenceMinutes) + " h" + (entry.credited ? " · angerechnet" : "") : (entry?.off ? "Arbeitsfrei" : "");
    const blocks = entry?.slots.length ? entry.slots.map(slot => escapeHtml(slot.join("–"))).join(" · ") : "";
    const calculated = gav?.days.get(date);
    const labels = gavLabels(calculated);
    const existingVorhol = entry?.vorhol ?? entry?.extra?.[2] ?? 0;
    if (!calculated && existingVorhol) labels.push("Vorholzeit · "+h(existingVorhol));
    const edit = person ? '<button type="button" class="secondary" data-date="'+ date +'" aria-label="'+pad(day)+'. '+MONTHS[state.month-1]+(entry?' bearbeiten':' erfassen')+'">'+(entry?'Ändern':'Erfassen')+'</button>' : "";
    return '<tr class="'+(weekend?"weekend ":"")+(date===now?"current-day":"")+'"><td><strong>'+pad(day)+'.'+pad(state.month)+'.</strong> <span class="muted">'+WEEKDAYS[weekday]+'</span></td><td>'+blocks+'</td><td>'+(entry?.slots.length ? duration(pauses(entry))+" h" : "")+'</td><td>'+(entry?.slots.length?'<strong>'+duration(net(entry))+' h</strong>':"")+'</td><td>'+(description?'<span class="pill">'+description+'</span>':(!entry?'<span class="muted">'+(weekend?'Wochenende':'Offen')+'</span>':""))+'</td><td class="note">'+escapeHtml(entry?.note || "")+'</td><td class="day-gav">'+labels.map(label=>'<span class="pill">'+escapeHtml(label)+'</span>').join('')+'</td><td>'+edit+'</td></tr>';
  }).join("");
}
function updateSelection(changes) {
  save({...state,...changes});
  render();
}
function openDialog(title, html) {
  $("dialogContent").innerHTML = '<h2 id="dialogTitle">'+escapeHtml(title)+'</h2>'+html;
  if (!$("dialog").open) $("dialog").showModal();
  $("closeDialog")?.addEventListener("click", () => $("dialog").close());
}
const closeButton = '<button id="closeDialog" type="button" class="secondary">Schliessen</button>';
const cancelButton = '<button id="closeDialog" type="button" class="secondary">Abbrechen</button>';
function profileEditor(existing) {
  openDialog(existing ? "Mitarbeiterprofil bearbeiten" : "Mitarbeiterprofil hinzufügen",
    '<form id="profileForm"><div class="field"><label for="fullName">Vor- und Nachname</label><input id="fullName" maxlength="80" required autocomplete="name" value="'+escapeHtml(existing?.name || "")+'"></div><p id="profileError" class="alert" role="alert"></p><div class="actions">'+cancelButton+'<button type="submit" class="primary">Speichern</button></div></form>');
  $("fullName").focus();
  $("profileForm").onsubmit = event => {
    event.preventDefault();
    const name = $("fullName").value.trim().replace(/\s+/g," ");
    if (!name) return;
    if (state.employees.some(item => item.id !== existing?.id && item.name.toLocaleLowerCase("de-CH") === name.toLocaleLowerCase("de-CH"))) {
      $("profileError").textContent = "Dieser Name ist bereits erfasst.";
      return;
    }
    const id = existing?.id || Date.now().toString(36) + Math.random().toString(36).slice(2);
    const employees = existing ? state.employees.map(item => item.id === id ? {...item,name} : item) : [...state.employees,{id,name,days:{}}];
    if (save({...state,employees,selected:id})) { $("dialog").close(); render(); }
  };
}
function editDay(date) {
  const person = employee();
  const entry = person.days[date] || blank();
  const prettyDate = swissDate(date);
  const year = Number(date.slice(0,4));
  const showGav = year>=2026 && year<=2029;
  const vacation = person.vacation?.[year];
  const slotHtml = Array.from({length:4}, (_,i) => {
    const [from,to] = entry.slots[i] || ["",""];
    return '<div class="slot"><label>Von '+(i+1)+'<input type="time" id="from'+i+'" value="'+from+'"></label><label>Bis '+(i+1)+'<input type="time" id="to'+i+'" value="'+(to === "24:00" ? "00:00" : to)+'"></label></div>';
  }).join("");
  openDialog(prettyDate + " · Tageserfassung",
    '<form id="dayForm"><label class="check"><input id="off" type="checkbox" '+(entry.off?"checked":"")+'> Arbeitsfreier Tag</label>'+
    '<div id="dayFields"><fieldset><legend>Arbeitsblöcke</legend><p class="intro">Pausen zwischen Arbeitsblöcken sind bereits abgezogen. Zusätzliche Pausen innerhalb eines Blocks separat erfassen.</p>'+slotHtml+
    '<div class="field"><label for="breakMinutes">Zusätzliche Pause (Minuten)</label><input type="number" id="breakMinutes" min="0" max="1439" value="'+entry.breakMinutes+'" required></div>'+
    '<div class="field"><label for="breakStart">Beginn der Zusatzpause</label><input type="time" id="breakStart" value="'+escapeHtml(entry.breakStart || "")+'"><small>Bei Arbeit über eine Zuschlagsgrenze bitte angeben.</small></div></fieldset>'+
    '<fieldset><legend>Abwesenheit</legend><div class="field"><label for="absence">Art</label><select id="absence"><option value="">Keine</option>'+ABSENCES.map(item=>'<option'+(item===entry.absence?' selected':'')+'>'+escapeHtml(item)+'</option>').join("")+'</select></div>'+
    '<div id="absenceFields" hidden><div class="grid"><div class="field"><label for="absHours">Stunden</label><input type="number" id="absHours" min="0" max="24" value="'+Math.floor(entry.absenceMinutes/60)+'"></div><div class="field"><label for="absMins">Minuten</label><input type="number" id="absMins" min="0" max="59" value="'+entry.absenceMinutes%60+'"></div></div>'+
    (vacation?'<div id="vacationPresets" class="group vacation-presets" hidden><button class="secondary" id="halfVacation" type="button">½ Ferientag</button><button class="secondary" id="fullVacation" type="button">1 Ferientag</button></div>':'')+
    '<p><label class="check"><input id="credited" type="checkbox" '+(entry.credited?"checked":"")+'> Im Monatstotal anrechnen</label></p></div></fieldset>'+
    '<fieldset'+(showGav?'':' hidden')+'><legend>GAV Elektro</legend><p class="intro">Überstunden, Überzeit und Zuschläge werden aus den erfassten Zeiten berechnet.</p>'+
    '<label class="check"><input id="holiday" type="checkbox" '+(entry.holiday?"checked":"")+'> Arbeit an einem anerkannten Feiertag</label>'+
    '<div class="field"><label for="vorhol">Vereinbarte Vorholzeit (Minuten)</label><input type="number" id="vorhol" min="0" max="1440" value="'+(entry.vorhol ?? entry.extra?.[2] ?? 0)+'"></div>'+
    (entry.extra?.slice(0,2).some(Boolean)?'<p class="intro">Bisher manuell erfasst: A '+duration(entry.extra[0])+' h · B '+duration(entry.extra[1])+' h</p>':'')+'</fieldset></div>'+
    '<div class="field"><label for="note">Bemerkung</label><textarea id="note" maxlength="160" rows="2">'+escapeHtml(entry.note)+'</textarea></div><p id="dayError" role="alert" class="alert"></p>'+
    '<div class="actions">'+(person.days[date]?'<button type="button" class="danger" id="removeDay">Eintrag löschen</button>':"")+(entry.slots.length?'<button class="secondary" type="button" id="copyDay">Auf Folgetage kopieren</button>':"")+cancelButton+'<button class="primary" type="submit">Speichern</button></div></form>');
  const toggle = () => {
    $("dayFields").hidden = $("off").checked;
    $("absenceFields").hidden = !$("absence").value;
    if ($("vacationPresets")) $("vacationPresets").hidden = $("absence").value!=="Ferien";
    $("dayFields").querySelectorAll("input, select").forEach(input => { input.disabled = $("off").checked || ($("absenceFields").contains(input) && !$("absence").value); });
  };
  if (vacation) {
    const setVacation = minutes => {
      $("absHours").value = Math.floor(minutes/60);
      $("absMins").value = minutes%60;
      $("credited").checked = true;
    };
    $("halfVacation").onclick = () => setVacation(Math.round(vacation.dailyMinutes/2));
    $("fullVacation").onclick = () => setVacation(vacation.dailyMinutes);
  }
  toggle();
  $("off").onchange = $("absence").onchange = toggle;
  const write = value => {
    const days = {...person.days};
    if (value) days[date] = value;
    else delete days[date];
    if (save({...state,employees:state.employees.map(item => item.id===person.id ? {...item,days} : item)})) {
      $("dialog").close();
      render();
      $("days").querySelector('button[data-date="'+date+'"]')?.focus();
    }
  };
  if ($("removeDay")) $("removeDay").onclick = () => {
    if (window.confirm("Tageseintrag für "+prettyDate+" löschen?")) write(null);
  };
  if ($("copyDay")) $("copyDay").onclick = () => copyDay(date,person);
  $("dayForm").onsubmit = event => {
    event.preventDefault();
    const value = {...blank(),off:$("off").checked,note:$("note").value.trim()};
    if (entry.extra?.slice(0,2).some(Boolean)) value.extra = entry.extra.slice();
    const error = message => { $("dayError").textContent = message; };
    if (value.off) return write(value);
    for (let i=0; i<4; i++) {
      const from = $("from"+i).value;
      const end = $("to"+i).value;
      const to = end === "00:00" && from && from !== "00:00" ? "24:00" : end;
      if (!from && !to) continue;
      if (!from || !to || time(to) <= time(from)) return error("Für jeden Block eine Endzeit nach der Startzeit erfassen. Bei Mitternacht den Block beim Tageswechsel aufteilen und die Endzeit 00:00 eingeben.");
      value.slots.push([from,to]);
    }
    value.slots.sort((a,b)=>a[0].localeCompare(b[0]));
    if (value.slots.some(([from],i)=>i>0 && from<value.slots[i-1][1])) return error("Arbeitsblöcke dürfen sich nicht überschneiden.");
    value.breakMinutes = Number($("breakMinutes").value);
    value.breakStart = value.breakMinutes ? $("breakStart").value : "";
    value.holiday = showGav && $("holiday").checked;
    value.vorhol = showGav ? Number($("vorhol").value || 0) : (entry.vorhol ?? entry.extra?.[2] ?? 0);
    if (net(value)<0 || (value.slots.length && net(value)===0)) return error("Die zusätzliche Pause muss kürzer als die erfasste Arbeitszeit sein.");
    value.absence = $("absence").value;
    if (value.absence) {
      value.absenceMinutes = Number($("absHours").value)*60+Number($("absMins").value);
      value.credited = $("credited").checked;
      if (!value.absenceMinutes || value.absenceMinutes + net(value) > 1440) return error("Eine positive Abwesenheitsdauer erfassen. Arbeits- und Abwesenheitszeit dürfen zusammen höchstens 24 Stunden betragen.");
    }
    if (value.breakStart && !value.slots.some(([from,to])=>time(from)<=time(value.breakStart) && time(value.breakStart)+value.breakMinutes<=time(to))) {
      return error("Die Zusatzpause muss vollständig innerhalb eines Arbeitsblocks liegen.");
    }
    const segments = showGav ? workSegments(value,date) : [];
    if (segments.some(segment=>segment.rate===null)) return error("Bitte den Beginn der Zusatzpause angeben, damit die Zuschläge korrekt berechnet werden.");
    if (showGav && value.vorhol>segments.reduce((sum,segment)=>sum+(segment.rate===0?segment.minutes:0),0)) {
      return error("Vorholzeit darf die normale Arbeitszeit an diesem Tag nicht überschreiten.");
    }
    if (!value.slots.length && !value.absence) return error("Arbeitszeiten, eine Abwesenheit oder einen arbeitsfreien Tag erfassen.");
    write(value);
  };
}

const swissDate = date => date.split("-").reverse().join(".");
const h = value => duration(value)+" h";
const signedHours = minutes => (minutes<0?"−":minutes>0?"+":"")+h(Math.abs(minutes));
function weekLabel(monday,week) {
  return swissDate(monday).slice(0,6)+"–"+swissDate(week.through);
}
function gavLabels(row, concise=false) {
  if (!row) return [];
  const labels = [25,50,100].flatMap(rate=>row.premiums[rate] ? [(concise?"Zuschlag ":"")+rate+" % · "+h(row.premiums[rate])] : []);
  if (row.over) labels.push((concise?"Überzeit prüfen":"Überzeit zur Prüfung")+" · "+h(row.over));
  if (row.vorhol) labels.push("Vorholzeit · "+h(row.vorhol));
  if (row.uncertain) labels.push("Zuordnung prüfen");
  return labels;
}
function gavReportLines(gav) {
  const {monthSums:sums} = gav;
  const lines = [
    "Monat Soll "+h(gav.monthTarget)+" · IST "+h(gav.monthActual)+" · Differenz "+signedHours(gav.monthDelta),
    "Jahreskonto bis "+swissDate(gav.cutoff)+": vorläufig "+signedHours(gav.yearDelta)+" · Jahres-/Vertragssoll "+h(gav.annualTarget)+" · Pensum "+gav.percent+" %",
    "Überzeit zur Prüfung "+h(sums.over)+" · Vorholzeit "+h(sums.vorhol),
    "Zuschlagsstunden 25 %: "+h(sums.premiums[25])+" · 50 %: "+h(sums.premiums[50])+" · 100 %: "+h(sums.premiums[100])
  ];
  if (gav.open || gav.uncertain) lines.push(gav.open+" offene Werktage im Erfassungszeitraum · "+gav.uncertain+" Tage mit unklarer Zuordnung");
  if (gav.beforeTracking) lines.push("Erfassung ab "+swissDate(gav.tracked)+" · hinterlegter Anfangssaldo berücksichtigt");
  if (gav.estimated) lines.push("Jahressoll kalenderbasiert. Publiziertes bzw. betriebliches Soll bei Bedarf hinterlegen.");
  return lines;
}
function renderGav(person,gav) {
  $("gavPanel").hidden = !person;
  if (!person) return;
  $("gavSettings").hidden = !gav;
  if (!gav) {
    $("gavStatus").textContent="Die automatische Berechnung gilt für die Vertragsperiode 2026–2029.";
    $("gavContent").replaceChildren();
    return;
  }
  const {monthSums:sums} = gav;
  $("gavStatus").textContent = "Stand "+swissDate(gav.cutoff)+" · "+gav.percent+" % Pensum"+
    (gav.open ? " · "+gav.open+" offene Werktage im Konto" : "")+(gav.uncertain ? " · "+gav.uncertain+" Tage mit unklarer Zuordnung" : "");
  const cards = [
    ["Monatsdifferenz",signedHours(gav.monthDelta),"Soll "+h(gav.monthTarget)+" · Ist "+h(gav.monthActual)],
    ["Jahressaldo vorläufig",signedHours(gav.yearDelta),"Jahres-/Vertragssoll "+h(gav.annualTarget)],
    ["Überzeit zur Prüfung",h(sums.over),"Mo–Sa · 06:00–23:00"],
    ["Vorholzeit im Monat",h(sums.vorhol),"Vereinbarte Vorholzeit"]
  ];
  const rows = Array.from(gav.weeks,([monday,week])=>'<tr><td>'+weekLabel(monday,week)+'</td><td>'+h(week.work)+'</td><td>'+h(week.above)+'</td><td>'+h(week.needsReview)+(week.uncertain?' · Zuordnung prüfen':'')+'</td></tr>').join("");
  $("gavContent").innerHTML = '<div class="gav-grid">'+cards.map(([label,amount,sub])=>'<div class="stat"><span>'+label+'</span><strong>'+amount+'</strong><small>'+sub+'</small></div>').join("")+'</div>'+
    '<div class="gav-premiums"><strong>Zuschlagsstunden im Monat</strong>'+[25,50,100].map(rate=>'<span class="pill">'+rate+' % · '+h(sums.premiums[rate])+'</span>').join("")+'</div>'+
    '<details class="gav-weeks"><summary>Kalenderwochen und Berechnungsgrundlage</summary><div class="table-wrap"><table><thead><tr><th scope="col">Kalenderwoche (Mo–So)</th><th scope="col">Nettozeit</th><th scope="col">Über 50 h</th><th scope="col">Überzeit zur Prüfung</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p>Der Jahressaldo vergleicht die anrechenbare Zeit mit dem bis zum Stichtag anteiligen Soll. Das Standard-Soll ist auf Montag bis Freitag verteilt. Für GAV-Überzeit ist die Anordnung oder Autorisierung durch die vorgesetzte Stelle massgebend. Bei Überlappung mit einem Zuschlag nach Art. 25 fällt kein zusätzlicher Überzeitzuschlag an. Wochenwerte enthalten die gespeicherten Tage aus angrenzenden Monaten.</p>'+
    (gav.beforeTracking?'<p>Erfassungsbeginn '+swissDate(gav.tracked)+' mit hinterlegtem Anfangssaldo.</p>':'')+
    (gav.estimated?'<p>Das Jahressoll ist kalenderbasiert. Sobald das GAV-Soll für dieses Jahr publiziert ist, kann es in den Einstellungen hinterlegt werden.</p>':'')+
    '<p><a href="'+GAV_SOURCE+'" target="_blank" rel="noopener noreferrer">Berechnungsgrundlagen der PLK Elektro</a></p></details>';
}
function editGavSettings() {
  const person = employee(), year = state.year;
  const settings = person.gav?.[year] || {};
  const first = year+"-01-01", last = year+"-12-31";
  const dateInput = (id,label,value) => '<div class="field"><label for="'+id+'">'+label+'</label><input type="date" id="'+id+'" min="'+first+'" max="'+last+'" value="'+(value || "")+'"></div>';
  openDialog("GAV-Einstellungen · "+year,
    '<p class="intro">'+escapeHtml(person.name)+' · Standard 100 % und Sollverteilung Montag bis Freitag. Unterjährige Anstellungen werden nach Arbeitstagen berechnet.</p>'+
    '<form id="gavForm"><div class="grid"><div class="field"><label for="pensum">Vertragliches Pensum (%)</label><input id="pensum" type="number" min="0.1" max="100" step="0.1" value="'+(settings.percent || 100)+'" required></div>'+
    '<div class="field"><label for="annualTarget">Abweichendes Vertragssoll (Stunden)</label><input id="annualTarget" type="number" min="0" max="3650" step="0.01" value="'+(settings.target==null?"":Number((settings.target/60).toFixed(2)))+'" placeholder="Automatisch"></div>'+
    dateInput("employmentBegin","Anstellung ab",settings.begin || first)+dateInput("employmentEnd","Anstellung bis",settings.end || last)+
    dateInput("trackingBegin","Erfassung in der App ab",settings.tracked || "")+
    '<div class="field"><label for="openingBalance">Saldo am Vortag (±Std:Min)</label><input id="openingBalance" maxlength="9" placeholder="0:00" value="'+(settings.opening?(settings.opening<0?"-":"")+duration(Math.abs(settings.opening)):"")+'"></div></div>'+
    '<p class="intro">Bei einem späteren Erfassungsbeginn den bestätigten Saldo des laufenden Jahres am Vortag einsetzen. Das abweichende Vertragssoll gilt für den ganzen Anstellungszeitraum im gewählten Jahr.</p>'+
    '<p id="gavError" class="alert" role="alert"></p><div class="actions">'+cancelButton+'<button class="primary" type="submit">Speichern</button></div></form>');
  $("gavForm").onsubmit = event => {
    event.preventDefault();
    const begin=$("employmentBegin").value || first, end=$("employmentEnd").value || last;
    const tracked=$("trackingBegin").value || begin, raw=$("openingBalance").value.trim();
    if (begin>end || tracked<begin || tracked>end) {
      $("gavError").textContent="Der Erfassungsbeginn muss innerhalb der Anstellung liegen.";
      return;
    }
    if (raw && !/^[+-]?\d{1,5}:[0-5]\d$/.test(raw)) {
      $("gavError").textContent="Den Anfangssaldo im Format Stunden:Minuten eingeben, zum Beispiel -8:30.";
      return;
    }
    const opening=raw ? (raw.startsWith("-")?-1:1)*time(raw.replace(/^[+-]/,"")) : 0;
    const target=$("annualTarget").value===""?null:Math.round(Number($("annualTarget").value)*60);
    const config={begin,end,tracked,opening,target,percent:Number($("pensum").value)};
    const employees=state.employees.map(item=>item.id===person.id ? {...item,gav:{...item.gav,[year]:config}} : item);
    if (save({...state,employees})) { $("dialog").close(); render(); }
  };
}
function copyDay(date,person) {
  const source=person.days[date];
  const first=dateShift(date,1);
  openDialog("Auf Folgetage kopieren",
    '<p class="intro">Übernimmt die gespeicherten Arbeitsblöcke, die Pause und die Bemerkung vom '+swissDate(date)+'. Einträge auf Zieltagen bleiben erhalten.</p>'+
    '<form id="copyForm"><div class="grid"><div class="field"><label for="copyStart">Erster Zieltag</label><input id="copyStart" type="date" required min="'+first+'" max="2099-12-31" value="'+first+'"></div>'+
    '<div class="field"><label for="copyEnd">Letzter Zieltag</label><input id="copyEnd" type="date" required min="'+first+'" max="2099-12-31" value="'+first+'"></div></div>'+
    '<p><label class="check"><input id="copyWeekend" type="checkbox"> Samstag und Sonntag einschliessen</label></p>'+
    '<p id="copyStatus" role="status"></p><div class="actions">'+cancelButton+'<button id="copySubmit" class="primary" type="submit">Kopieren</button></div></form>');
  function selection() {
    const start=$("copyStart").value, end=$("copyEnd").value;
    if (!start || !end || start<first || start>end || end>dateShift(start,30) || end>"2099-12-31") return null;
    return dateRange(start,end).filter(day=>$("copyWeekend").checked || isWeekday(day));
  }
  function preview() {
    const dates=selection();
    const skipped=dates?.filter(day=>person.days[day]).length || 0;
    const count=dates ? dates.length-skipped : 0;
    $("copySubmit").disabled=!count;
    $("copyStatus").textContent=dates ? count+" freie Zieltage · "+skipped+" bereits erfasst" : "Bitte einen gültigen Zeitraum von höchstens 31 Kalendertagen wählen.";
  }
  $("copyStart").onchange = () => {
    if ($("copyStart").value>$("copyEnd").value) $("copyEnd").value=$("copyStart").value;
    preview();
  };
  $("copyStart").oninput = preview;
  $("copyEnd").oninput = $("copyEnd").onchange = $("copyWeekend").onchange = preview;
  preview();
  $("copyForm").onsubmit = event => {
    event.preventDefault();
    const dates=selection();
    const latest=state.employees.find(item=>item.id===person.id);
    if (!dates || !latest) return;
    const days={...latest.days};
    const targets=dates.filter(day=>!days[day]);
    if (!targets.length) return;
    for (const target of targets) days[target]={...blank(),slots:source.slots.map(slot=>slot.slice()),breakMinutes:source.breakMinutes,breakStart:source.breakStart || "",note:source.note};
    const employees=state.employees.map(item=>item.id===person.id ? {...item,days} : item);
    if (save({...state,employees})) {
      $("dialog").close();
      render();
      notify(targets.length===1?"Arbeitszeit auf einen Folgetag kopiert.":"Arbeitszeit auf "+targets.length+" Folgetage kopiert.");
    }
  };
}

function vacationAccount(person,year,month) {
  const settings = person.vacation?.[year];
  const monthStart = keyFor(year,month,1), through = keyFor(year,month,daysIn(year,month));
  const yearStart = keyFor(year,1,1);
  let monthUsed=0, yearUsed=0;
  for (const [date,entry] of Object.entries(person.days)) {
    if (entry.absence!=="Ferien" || date<yearStart || date>through) continue;
    yearUsed += entry.absenceMinutes;
    if (date>=monthStart) monthUsed += entry.absenceMinutes;
  }
  const daily = settings?.dailyMinutes;
  const entitlement = settings ? Math.round(settings.entitlementDays*daily) : null;
  const carry = settings ? Math.round(settings.carryDays*daily) : null;
  return {settings,daily,entitlement,carry,monthUsed,yearUsed,through,remaining:settings ? entitlement+carry-yearUsed : null};
}
const formatVacationDays = new Intl.NumberFormat("de-CH",{maximumFractionDigits:2,useGrouping:false});
function vacationDays(amount,daily) {
  const days = amount/daily;
  return formatVacationDays.format(days)+(Math.abs(days)===1?" Tag":" Tage");
}
function vacationAmount(amount,daily) {
  const hours = amount<0 ? signedHours(amount) : h(amount);
  return daily ? vacationDays(amount,daily)+" ("+hours+")" : hours;
}
function renderVacation(person) {
  $("vacationPanel").hidden=!person;
  if (!person) return;
  const {settings,daily,entitlement,carry,monthUsed,yearUsed,remaining,through}=vacationAccount(person,state.year,state.month);
  $("vacationStatus").textContent = "Stand "+swissDate(through)+(settings ? " · 1 Ferientag entspricht "+h(daily) : " · Jahresanspruch noch erfassen");
  const cards = [
    ["Jahresanspruch",entitlement,settings?"Übertrag / Korrektur "+vacationAmount(carry,daily):""],
    ["Ferienbezug im Monat",monthUsed,""],
    ["Ferienbezug im Jahr",yearUsed,"Bis Ende des gewählten Monats"],
    ["Restguthaben",remaining,"Anspruch und Übertrag abzüglich Bezug"]
  ];
  $("vacationContent").innerHTML=cards.map(([label,amount,sub],i)=>'<div class="stat'+(i===3?' vacation-balance':'')+'"><span>'+label+'</span><strong>'+
    (amount===null?"–":daily?vacationDays(amount,daily):h(amount))+'</strong>'+
    (daily && amount!==null?'<small>'+(amount<0?signedHours(amount):h(amount))+'</small>':'')+
    (sub?'<small>'+sub+'</small>':'')+'</div>').join("");
}
function editVacationSettings() {
  const person = employee(), year=state.year;
  const current = person.vacation?.[year];
  openDialog("Ferienkonto bearbeiten · "+year,
    '<p class="intro">'+escapeHtml(person.name)+' · Vertraglichen Jahresanspruch, bestätigten Übertrag und die vereinbarte Dauer eines Ferientags eintragen.</p>'+
    '<form id="vacationForm"><div class="grid"><div class="field"><label for="vacationEntitlement">Jahresanspruch (Tage)</label><input id="vacationEntitlement" required type="number" min="0" max="366" step="0.01" value="'+(current?.entitlementDays ?? "")+'"></div>'+
    '<div class="field"><label for="vacationCarry">Übertrag / Korrektur (Tage)</label><input id="vacationCarry" required type="number" min="-366" max="366" step="0.01" value="'+(current?.carryDays ?? 0)+'"></div></div>'+
    '<div class="field"><label for="vacationDaily">Dauer eines Ferientags (Std:Min)</label><input id="vacationDaily" maxlength="5" required value="'+duration(current?.dailyMinutes ?? 480)+'"></div>'+
    '<p class="intro">Bei Teilzeit die vereinbarte Tagesdauer und den persönlichen Anspruch eintragen. Der Übertrag kann auch negativ sein.</p>'+
    '<p id="vacationError" class="alert" role="alert"></p><div class="actions">'+cancelButton+'<button class="primary" type="submit">Speichern</button></div></form>');
  $("vacationForm").onsubmit=event=>{
    event.preventDefault();
    const raw = $("vacationDaily").value.trim();
    const dailyMinutes = /^\d{1,2}:[0-5]\d$/.test(raw) ? time(raw) : 0;
    if (dailyMinutes<1 || dailyMinutes>1440) {
      $("vacationError").textContent="Die Dauer im Format Stunden:Minuten bis 24:00 eingeben, zum Beispiel 8:00.";
      return;
    }
    const config = {dailyMinutes,entitlementDays:Number($("vacationEntitlement").value),carryDays:Number($("vacationCarry").value)};
    const employees=state.employees.map(item=>item.id===person.id ? {...item,vacation:{...item.vacation,[year]:config}} : item);
    if (save({...state,employees})) { $("dialog").close(); render(); }
  };
}

function reportForSelection() {
  const person = employee();
  const days = datesFor(person,state.year,state.month);
  const month = MONTHS[state.month-1]+" "+state.year;
  const basename = person.name.normalize("NFKD").replace(/\p{Mark}/gu,"").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_|_$/g,"") || "Mitarbeiter";
  return {name:person.name,month,days,sums:totalsFor(days),gav:gavAccount(person,state.year,state.month,now),vacation:vacationAccount(person,state.year,state.month),filename:"Navolta_Arbeitszeit_"+state.year+"-"+pad(state.month)+"_"+basename+".pdf",open:days.filter(day=>!day.entry && ![0,6].includes(day.weekday)).length};
}
const splitLines = (value, limit) => String(value).split(/\r?\n/).flatMap(line => {
  const lines = [];
  let rest = line;
  while (rest.length > limit) {
    const space = rest.lastIndexOf(" ",limit);
    const cut = space > 0 ? space : limit;
    lines.push(rest.slice(0,cut));
    rest = rest.slice(cut).trimStart();
  }
  return [...lines,rest];
});
const winAnsi = {"€":128,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"…":133};
function pdfString(value) {
  return Array.from(String(value).normalize("NFC"), char => {
    if (char === "−") return "-";
    const code = winAnsi[char] ?? char.charCodeAt(0);
    if (code >= 32 && code <= 126) return /[()\\]/.test(char) ? "\\"+char : char;
    return code >= 160 && code <= 255 || winAnsi[char] ? "\\"+code.toString(8).padStart(3,"0") : "?";
  }).join("");
}
const bytesFromBinary = str => Uint8Array.from(str,ch=>ch.charCodeAt(0));
async function makePdf(report) {
  const image = $("logo");
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d").drawImage(image,0,0);
  const jpeg = atob(canvas.toDataURL("image/jpeg",.92).split(",")[1]);
  const objects = ["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /XObject /Subtype /Image /Width "+canvas.width+" /Height "+canvas.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n"+jpeg+"\nendstream"];
  const navy = ".04 .16 .26";
  const muted = ".25 .35 .42";
  const grey = ".94 .96 .98";
  let commands = [];
  let y;
  const pages = [];
  const text = (value,x,top,size=9,bold=false,color=navy) => commands.push("BT /"+(bold?"B":"R")+" "+size+" Tf "+color+" rg 1 0 0 1 "+x+" "+(842-top)+" Tm ("+pdfString(value)+") Tj ET");
  const rect = (x,top,w,h,color) => commands.push(color+" rg "+x+" "+(842-top-h)+" "+w+" "+h+" re f");
  function startPage() {
    commands = [];
    pages.push(commands);
    commands.push("q 142 0 0 "+(142*canvas.height/canvas.width).toFixed(2)+" 419 781 cm /Logo Do Q");
    text("Arbeitszeiterfassung",35,60,24,true);
    text(report.month,36,83,14,true);
    for (const [i,line] of splitLines(report.name,64).entries()) text(line,36,103+i*14,11);
    y = 131;
  }
  const xs = [43,87,108,268,317,433];
  const headings = ["Datum","WT","Arbeitsblöcke","Netto","Abwesenheit / Status","Bemerkung"];
  function tableHead() {
    rect(35,y,525,22,".87 .93 .97");
    headings.forEach((head,i)=>text(head,xs[i],y+14,8,true));
    y += 22;
  }
  startPage();
  const summary = [["Arbeit netto",report.sums.work],["Abwesend erfasst",report.sums.absence],["Davon angerechnet",report.sums.credit],["Monatstotal angerechnet",report.sums.total]];
  summary.forEach(([label,value],i)=>{
    const x=35+i*132;
    rect(x,y,129,42,i===3?".85 .93 .98":grey);
    text(label,x+8,y+15,8,true); text(duration(value)+" h",x+8,y+33,14,true);
  });
  y += 47;
  text("Angaben in Stunden und Minuten. Pausen zwischen Arbeitsblöcken sind bereits abgezogen.",36,y+11,8,false,muted);
  y += 20;
  if (report.gav) {
    const lines = gavReportLines(report.gav);
    rect(35,y,525,34+lines.length*12,grey);
    text("GAV Elektro 2026–2029 · separater Ausweis",43,y+16,10,true);
    lines.forEach((line,i)=>text(line,43,y+31+i*12,8));
    y += 43+lines.length*12;
  }
  if (report.vacation.settings || report.vacation.yearUsed) {
    const {settings,daily,entitlement,carry,monthUsed,yearUsed,remaining} = report.vacation;
    const balance = settings ? " · Restguthaben "+vacationAmount(remaining,daily) : " · Jahresanspruch noch offen";
    rect(35,y,525,settings ? 52 : 38,grey);
    text("Ferienkonto bis "+swissDate(report.vacation.through),43,y+14,10,true);
    text("Monatsbezug "+vacationAmount(monthUsed,daily)+" · Jahresbezug "+vacationAmount(yearUsed,daily)+balance,43,y+29,8);
    if (settings) text("Jahresanspruch "+vacationAmount(entitlement,daily)+" · Übertrag / Korrektur "+vacationAmount(carry,daily)+" · 1 Ferientag = "+h(daily),43,y+43,8);
    y += settings ? 59 : 45;
  }
  tableHead();
  for (const {date,weekday,entry} of report.days) {
    const weekend = [0,6].includes(weekday);
    const pairs = entry?.slots.map(slot=>slot.join("–")) || [];
    const blocks = [pairs.slice(0,2).join("   "),pairs.slice(2).join("   ")].filter(Boolean);
    if (entry?.slots.length && pauses(entry)) blocks.push("Pausen gesamt "+duration(pauses(entry))+" h"+(entry.breakMinutes ? " (davon "+duration(entry.breakMinutes)+" h zusätzlich)" : ""));
    const calculated = report.gav?.days.get(date);
    blocks.push(...gavLabels(calculated, true));
    const existingVorhol = entry?.vorhol ?? entry?.extra?.[2] ?? 0;
    if (!calculated && existingVorhol) blocks.push("Vorholzeit · "+h(existingVorhol));
    if (entry?.extra?.slice(0,2).some(Boolean)) blocks.push("Früher manuell: A "+duration(entry.extra[0])+" h / B "+duration(entry.extra[1])+" h");
    const absence = entry?.absence ? splitLines(entry.absence,22) : [entry?.off ? "Arbeitsfrei" : (!entry ? (weekend ? "Wochenende" : "Offen") : "")];
    if (entry?.absence) absence.push(duration(entry.absenceMinutes)+" h "+(entry.credited?"angerechnet":"ohne Anrechnung"));
    const notes = splitLines(entry?.note || "",25);
    const height = Math.max(blocks.length,absence.length,notes.length,1)*10+8;
    if (y+height > 783) { startPage(); tableHead(); }
    if (weekend) rect(35,y,525,height,grey);
    rect(35,y+height-1,525,.5,".86 .90 .93");
    text(date.slice(8)+"."+date.slice(5,7)+".",xs[0],y+12,8,true);
    text(WEEKDAYS[weekday],xs[1],y+12,8);
    blocks.forEach((line,i)=>text(line,xs[2],y+12+10*i,8));
    if (pairs.length) text(duration(net(entry))+" h",xs[3],y+12,8,true);
    absence.forEach((line,i)=>text(line,xs[4],y+12+10*i,8));
    notes.forEach((line,i)=>text(line,xs[5],y+12+10*i,8));
    y += height;
  }
  if (report.gav) {
    const weeks = [...report.gav.weeks];
    if (y+49+weeks.length*13 > 783) startPage();
    y += 19;
    text("Kalenderwochen (Mo–So)",36,y,11,true);
    for (const [monday,week] of weeks) {
      y += 13;
      text(weekLabel(monday,week)+" · netto "+duration(week.work)+" h · über 50 h "+duration(week.above)+" h · Überzeit zur Prüfung "+duration(week.needsReview)+" h",36,y,8);
    }
  }
  const types = Array.from(report.sums.types, ([label,values]) => label+" · "+duration(values[0])+" h erfasst · "+duration(values[1])+" h angerechnet");
  if (types.length) {
    if (y+26+types.length*13 > 783) startPage();
    y += 19;
    text("Abwesenheiten nach Art",36,y,11,true);
    for (const type of types) { y += 13; text(type,36,y,9); }
  }
  pages.forEach((content,index)=>{
    commands=content;
    rect(35,800,525,.65,".78 .84 .89");
    text("Navolta AG · Monatsrapport",36,816,8,false,muted);
    text("Seite "+(index+1)+" / "+pages.length,508,816,8,false,muted);
  });
  const pageIds = pages.map(content=>{
    const stream=content.join("\n");
    objects.push("<< /Length "+stream.length+" >>\nstream\n"+stream+"\nendstream");
    const ref=objects.length;
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /R 3 0 R /B 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents "+ref+" 0 R >>");
    return objects.length+" 0 R";
  });
  objects[0]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[1]="<< /Type /Pages /Kids ["+pageIds.join(" ")+"] /Count "+pages.length+" >>";
  let output="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = ["0000000000 65535 f \n"];
  objects.forEach((object,i)=>{
    offsets.push(String(output.length).padStart(10,"0")+" 00000 n \n");
    output+=(i+1)+" 0 obj\n"+object+"\nendobj\n";
  });
  const xref=output.length;
  output+="xref\n0 "+offsets.length+"\n"+offsets.join("")+"trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  return bytesFromBinary(output);
}
function download(contents,filename,mime) {
  const url=URL.createObjectURL(new Blob([contents],{type:mime}));
  const anchor=document.createElement("a");
  anchor.href=url; anchor.download=filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const base64 = bytes => {
  let value="";
  for (let start=0; start<bytes.length; start+=8192) value+=String.fromCharCode(...bytes.subarray(start,start+8192));
  return btoa(value);
};
const subjectFor = report => "Arbeitszeiterfassung "+report.month+" – "+report.name;
const bodyFor = report => "Guten Tag\n\nIm Anhang sende ich Ihnen meine Arbeitszeiterfassung für "+report.month+" mit den erfassten Arbeitszeiten und Abwesenheiten.\n\nMit freundlichen Grüssen\n"+report.name;

const utfBase64 = value => base64(new TextEncoder().encode(value));
const fold = value => value.match(/.{1,76}/g)?.join("\r\n") || "";
function saveEml(report,pdf) {
  const boundary="Navolta-Monatsrapport-"+Date.now();
  const subject=Array.from(subjectFor(report)).reduce((chunks,char,i)=>{
    if (i%18===0) chunks.push("");
    chunks[chunks.length-1]+=char;
    return chunks;
  },[]).map(chunk=>"=?UTF-8?B?"+utfBase64(chunk)+"?=").join("\r\n ");
  const eml=[
    "X-Unsent: 1",
    "To: "+RECIPIENTS.join(", "),
    "Subject: "+subject,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="'+boundary+'"',
    "",
    "--"+boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    fold(utfBase64(bodyFor(report).replace(/\n/g,"\r\n"))),
    "--"+boundary,
    'Content-Type: application/pdf; name="'+report.filename+'"',
    'Content-Disposition: attachment; filename="'+report.filename+'"',
    "Content-Transfer-Encoding: base64",
    "",
    fold(base64(pdf)),
    "--"+boundary+"--",
    ""
  ].join("\r\n");
  download(eml,report.filename.replace(/\.pdf$/,".eml"),"message/rfc822");
}
function openMail() {
  const report=reportForSelection();
  const mailto="mailto:"+RECIPIENTS.join(",")+"?subject="+encodeURIComponent(subjectFor(report))+"&body="+encodeURIComponent(bodyFor(report).replace(/\n/g,"\r\n"));
  openDialog("Per E-Mail senden",
    '<p><strong>An</strong><br>'+RECIPIENTS.join(", ")+'</p>'+
    '<p>Die E-Mail-Datei enthält Betreff, Nachricht und den PDF-Anhang. Öffne sie in deiner Mail-App und sende sie mit deinem eigenen Konto.</p>'+
    '<p id="emailStatus" role="status">E-Mail-Datei wird erstellt …</p>'+
    '<details><summary>Über die Standard-Mail-App</summary><p>Falls deine Mail-App die E-Mail-Datei ohne Sendefunktion öffnet, öffne eine neue Nachricht mit den vorausgefüllten Empfängern. Das PDF wird heruntergeladen und kann angefügt werden.</p>'+
    '<p><a id="standardMail" href="'+escapeHtml(mailto)+'" hidden>Mail-App öffnen und PDF herunterladen</a></p></details>'+
    '<div class="actions">'+closeButton+'<button id="downloadEmail" class="primary" type="button">E-Mail-Datei herunterladen</button></div>');
  const button=$("downloadEmail"), status=$("emailStatus"), standard=$("standardMail");
  let pdf;
  button.onclick=async()=>{
    button.disabled=true;
    try {
      pdf ||= await makePdf(report);
      saveEml(report,pdf);
      standard.hidden=false;
      status.textContent="E-Mail-Datei mit PDF-Anhang zum Download bereit.";
    } catch { status.textContent="Die E-Mail-Datei konnte nicht erstellt werden. Bitte erneut versuchen."; }
    finally { button.disabled=false; }
  };
  standard.onclick=()=>download(pdf,report.filename,"application/pdf");
  button.click();
}
function openWhatsApp() {
  const report=reportForSelection();
  const message=bodyFor(report);
  const url="https://wa.me/?text="+encodeURIComponent(message);
  openDialog("Per WhatsApp senden",
    '<p id="whatsappStatus" role="status">PDF wird erstellt …</p>'+
    '<p><a id="whatsappWeb" href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer" hidden>WhatsApp öffnen und PDF herunterladen</a></p>'+
    '<div class="actions">'+closeButton+'<button id="shareWhatsApp" class="primary" type="button" hidden>PDF teilen</button></div>');
  const status=$("whatsappStatus"), native=$("shareWhatsApp"), web=$("whatsappWeb");
  void (async()=>{
    let pdf;
    try { pdf=await makePdf(report); }
    catch { status.textContent="Das PDF konnte nicht erstellt werden. Bitte die Seite neu laden und erneut versuchen."; return; }
    const shareData={files:[new File([pdf],report.filename,{type:"application/pdf"})],title:subjectFor(report),text:message};
    const canShare=typeof navigator.share==="function" && navigator.canShare?.(shareData);
    web.hidden=false;
    native.hidden=!canShare;
    status.textContent=canShare ? "«PDF teilen» wählen und im Teilen-Menü WhatsApp und den gewünschten Chat auswählen." : "WhatsApp öffnen, den gewünschten Chat auswählen und das heruntergeladene PDF anfügen.";
    web.onclick=()=>download(pdf,report.filename,"application/pdf");
    if (canShare) native.onclick=async()=>{
      native.disabled=true;
      try {
        await navigator.share(shareData);
        status.textContent="Den Versand im ausgewählten Chat abschliessen.";
      } catch(error) {
        if (error.name!=="AbortError") status.textContent="Das Teilen-Menü konnte nicht geöffnet werden. WhatsApp über den Link öffnen und das PDF anfügen.";
      } finally { native.disabled=false; }
    };
  })();
}
$("month").replaceChildren(...MONTHS.map((month,index)=>new Option(month,index+1)));
$("employee").onchange=event=>updateSelection({selected:event.target.value});
$("month").onchange=event=>updateSelection({month:Number(event.target.value)});
$("year").replaceChildren(...Array.from({length:100},(_,i)=>new Option(2000+i,2000+i)));
$("year").onchange=event=>updateSelection({year:Number(event.target.value)});
$("today").onclick=()=>updateSelection({year:Number(now.slice(0,4)),month:Number(now.slice(5,7))});
$("newEmployee").onclick=()=>profileEditor();
$("renameEmployee").onclick=()=>profileEditor(employee());
$("days").onclick=event=>{
  const button=event.target.closest("button[data-date]");
  if (button) editDay(button.dataset.date);
};
$("pdf").onclick=async event=>{
  const button=event.currentTarget;
  const report=reportForSelection();
  button.disabled=true;
  try { download(await makePdf(report),report.filename,"application/pdf"); }
  catch { notify("Das PDF konnte nicht erstellt werden. Bitte die Seite neu laden und erneut versuchen.",true); }
  finally { render(); }
};
$("mail").onclick=openMail;
$("whatsapp").onclick=openWhatsApp;
$("gavSettings").onclick=editGavSettings;
$("vacationSettings").onclick=editVacationSettings;
$("help").onclick=()=>openDialog("Anleitung",
  '<ol><li>Mit dem Plus ein Mitarbeiterprofil mit Vor- und Nachnamen erstellen. Anschliessend Monat und Jahr auswählen.</li><li>Beim gewünschten Datum <strong>Erfassen</strong> wählen. Bis zu vier Arbeitsblöcke angeben. Unterbrüche zwischen den Blöcken fliessen automatisch in die Nettozeit ein. Pausen innerhalb eines Blocks als zusätzliche Minuten eintragen.</li><li>Ferien, Krankheit oder andere Abwesenheiten mit Dauer erfassen. Mit <strong>Im Monatstotal anrechnen</strong> festlegen, ob die Stunden zum Monatstotal zählen. Arbeitsfreie Tage entsprechend markieren.</li><li>Für wiederkehrende Tätigkeiten einen gespeicherten Tag öffnen und <strong>Auf Folgetage kopieren</strong> wählen.</li><li>Unter <strong>GAV-Einstellungen</strong> bei Bedarf Pensum, Anstellungszeitraum und den erfassten Zeitraum anpassen. Der GAV-Ausweis zeigt den vorläufigen Jahressaldo, die Wochenwerte und die Zuschläge separat.</li><li>Unter <strong>Ferienkonto bearbeiten</strong> den Anspruch pro Jahr, den Übertrag und die Stunden pro Ferientag hinterlegen. Als Ferien erfasste Abwesenheiten werden automatisch abgezogen.</li><li>Monat kontrollieren. Das PDF führt sämtliche Kalendertage, Arbeitsblöcke, Pausen, Nettozeiten, Abwesenheiten und Monatssummen auf.</li><li><strong>Per E-Mail</strong> wählen. Die heruntergeladene E-Mail-Datei enthält das PDF und beide Navolta-Adressen. In der eigenen Mail-App öffnen und auf <strong>Senden</strong> klicken.</li><li><strong>Per WhatsApp</strong> wählen. Mit <strong>PDF teilen</strong> öffnest du das Teilen-Menü und wählst WhatsApp und den Chat. Falls das Teilen-Menü fehlt, WhatsApp über den angezeigten Link öffnen und das heruntergeladene PDF anfügen.</li></ol><p>Die Einträge sind in diesem Browser auf diesem Gerät gespeichert. Für Nachweise den Monatsrapport als PDF ablegen.</p><div class="actions">'+closeButton+'</div>');
render();
if (!storageAvailable) notify("Der Browser blockiert die lokale Speicherung. Bitte den Link in einem normalen Browserfenster öffnen.",true);
