const projects = [
  {id:'schafisheim', name:'Neubau Schafisheim', place:'Seetalstrasse 122 & 124, 5503 Schafisheim', work:'Elektroinstallationen für den Neubau eines Mehrfamilienhauses und von Reiheneinfamilienhäusern. Die Unterlagen zeigen den Potenzialausgleich, die Installationen im Unter- und Erdgeschoss sowie die Fassaden- und Treppenhausbeleuchtung.'},
  {id:'aarau', name:'Laurenzenvorstadt · AME-Mieterausbau', place:'Laurenzenvorstadt 9, 5000 Aarau', work:'Elektroarbeiten für den AME-Mieterausbau an der Laurenzenvorstadt. Für die Offerte stehen das Elektro-Leistungsverzeichnis, die Gebäudepläne und die objektspezifischen Bedingungen zur Verfügung.'},
  {id:'tegerfelden', name:'Schulhauserweiterung Tegerfelden', place:'Schulhausweg 5, 5306 Tegerfelden', work:'Elektroinstallationen für den Schulhausneubau und die Sanierung des Bestands. Die Unterlagen umfassen Geschosspläne, Einlagen im Überbeton und den Terminplan.'},
  {id:'cleverfit', name:'Clever Fit Basel', place:'Viaduktstrasse 42, 4051 Basel', work:'Elektroinstallationen für den Ausbau des Clever Fit in Basel. Die Bodeneinlagen sind bereits ausgeführt. Installationsplan und Leistungsverzeichnis bilden die Grundlage für die Offerte über die verbleibenden Arbeiten.'}
];
const recipients = 'info@navolta.ch,se@navolta.ch';
const projectDetails = {
  "schafisheim": {
    "contact": "Bekim Kabashi · Bauleiter · Konstantin Architektur AG",
    "email": "b.kabashi@konstantin-architektur.com",
    "phones": ["+41 43 421 52 35", "+41 78 934 50 40", "+41 43 545 22 11"],
    "phoneLabels": ["Direkt", "Mobil", "Zentrale"],
    "address": "Limmattalstrasse 124, CH-8049 Zürich",
    "website": "http://www.konstantin-architektur.com/",
    "start": "24.08.2026",
    "end": "22.06.2027",
    "basis": "Elektro (BKP 230), Bauterminplan vom 04.08.2026"
  },
  "aarau": {
    "contact": "Jonas Stadelmann · Bauleitung · Eloise C. Baumann",
    "email": "stadelmann@eloisecbaumann.ch",
    "phones": ["+41 44 223 25 93", "+41 78 450 25 65"],
    "address": "Badenerstrasse 658, 8048 Zürich",
    "availability": "Freitags abwesend.",
    "start": "14.09.2026",
    "end": "11.06.2027",
    "basis": "Elektroanlagen (BKP 23), Terminplan als Vorabzug"
  },
  "tegerfelden": {
    "contact": "Henner Mohr · Wölfli Bauplanung GmbH",
    "email": "hm@woelfli-bauplanung.ch",
    "phones": ["+41 44 535 22 22"],
    "website": "http://www.woelfli-bauplanung.ch/",
    "start": "August 2026 · Einlagen im Rohbau",
    "end": "Juni 2027 · Ende des allgemeinen Ausbaus",
    "basis": "Grobtermine gemäss Elektroausschreibung. Elektro-Endtermin separat zu bestätigen."
  },
  "cleverfit": {
    "contact": "Tanja Ammann · Bauleitung · METHABAU",
    "phones": ["+41 71 414 16 38", "+41 71 414 00 14"],
    "phoneLabels": ["Direkt", "Zentrale"],
    "address": "Fehlwiesstrasse 28, CH-8580 Amriswil",
    "website": "https://methabau.ch/",
    "start": "Ca. Ende August / September 2026",
    "end": "Gemäss Terminprogramm und Absprache mit der Bauleitung",
    "basis": "Vergabeverhandlung zum Werkvertrag Nr. 23011"
  }
};
const services = {
  "schafisheim": {
    "231": "Starkstromanlagen und PV",
    "232": "Starkstrominstallationen",
    "233": "Leuchtenlieferung und Montage",
    "236": "Schwachstrominstallationen",
    "238": "Provisorische Installationen",
    "239.3": "Planerische Leistungen"
  },
  "aarau": {
    "231": "Starkstromapparate",
    "232": "Starkstrominstallationen",
    "233": "Leuchten- und Lampenlieferung",
    "235": "Schwachstromapparate",
    "236": "Schwachstrominstallationen",
    "238": "Provisorien",
    "239": "Übrige Leistungen"
  },
  "tegerfelden": {
    "230": "Übergangspositionen",
    "231": "Starkstromapparate",
    "232": "Starkstrominstallationen und Einlagen",
    "233": "Leuchten- und Lampenlieferung",
    "235": "Schwachstromapparate",
    "236": "Schwachstrominstallationen",
    "237": "Gebäudeleitsystem",
    "238": "Bauprovisorium",
    "239": "Übrige Leistungen"
  },
  "cleverfit": {
    "231": "Starkstromapparate",
    "232": "Starkstrominstallationen",
    "233": "Leuchtenlieferungen",
    "235": "Schwachstromapparate",
    "236": "Schwachstrominstallationen",
    "238": "Provisorische Installationen"
  }
};
const projectList = document.querySelector('#projects');
const projectImages = {
  schafisheim: {plan: 'schafisheim-09.pdf', caption: 'Ostfassade des Mehrfamilienhauses'},
  aarau: {plan: 'aarau-04.pdf', caption: 'Fassadenansicht des AME-Gebäudes'},
  tegerfelden: {plan: 'tegerfelden-eg.pdf', caption: 'Elektroplan Erdgeschoss der Schulhauserweiterung'},
  cleverfit: {plan: 'cleverfit-01.pdf', caption: 'Elektro-Apparateplan des Fitnessstudios'}
};
const form = document.querySelector('#antwort form');
const selection = document.querySelector('#selection');
const status = document.querySelector('#status');
const offerDialog = document.querySelector('#offer-dialog');
const offerText = document.querySelector('#offer-text');

function element(name, value, className) {
  const node = document.createElement(name);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
}

for (const project of projects) {
  const card = element('article', '', 'card');
  const projectImage = projectImages[project.id];
  const preview = element('figure', '', 'project-preview');
  const plan = element('a');
  plan.href = documents[project.id].find(file => file.url.endsWith('/' + projectImage.plan)).url;
  plan.target = '_blank';
  plan.rel = 'noopener';
  const image = element('img');
  image.src = 'https://navolta-subunternehmer.fizzysiren1027.chatgpt.site/project-images/' + project.id + '.webp';
  image.alt = projectImage.caption + ' · ' + project.name + ' (PDF öffnen)';
  image.width = 1200;
  image.height = 720;
  image.loading = 'lazy';
  image.decoding = 'async';
  plan.append(image);
  preview.append(plan, element('figcaption', projectImage.caption));
  const details = projectDetails[project.id];
  const contact = element(details.email ? 'a' : 'span', details.contact);
  if (details.email) contact.href = 'mailto:' + details.email;
  const contactLine = element('p', 'Ansprechperson: ', 'place');
  contactLine.append(contact);
  if (details.phones) {
    const channels = element('span');
    if (details.email) {
      const email = element('a', details.email);
      email.href = contact.href;
      channels.append(element('br'), email);
    }
    for (const [index, phone] of details.phones.entries()) {
      const label = details.phoneLabels?.[index];
      const phoneLink = element('a', label ? label + ' ' + phone : phone);
      phoneLink.href = 'tel:' + phone.replaceAll(' ', '');
      channels.append(element('br'), phoneLink);
    }
    if (details.website) {
      const website = element('a', new URL(details.website).hostname);
      website.href = details.website;
      channels.append(element('br'), website);
    }
    for (const note of [details.address, details.availability].filter(Boolean)) {
      channels.append(element('br'), note);
    }
    contactLine.append(channels);
  }
  const timing = element('dl', '', 'timing');
  timing.append(element('dt', 'Ausführungsbeginn'), element('dd', details.start),
    element('dt', 'Ausführungsende'), element('dd', details.end));
  const choices = element('fieldset', '', 'scope-options');
  choices.dataset.project = project.id;
  choices.append(element('legend', 'Leistungen nach BKP'));
  const all = element('input');
  all.type = 'checkbox';
  all.className = 'all-services';
  const allLabel = element('label', '', 'pick');
  allLabel.append(all, 'Alles auswählen');
  choices.append(allLabel);
  for (const [code, description] of Object.entries(services[project.id])) {
    const check = element('input');
    check.type = 'checkbox';
    check.value = code;
    check.className = 'service';
    const label = element('label', '', 'pick');
    label.append(check, `BKP ${code} · ${description}`);
    choices.append(label);
  }
  card.append(element('h3', project.name), element('p', project.place, 'place'),
    preview, element('p', project.work), contactLine, timing, element('p', details.basis, 'schedule'), choices);
  const files = element('details');
  files.append(element('summary', `Unterlagen ansehen · ${documents[project.id].length} PDFs`));
  for (const category of ['Terminplan','Pläne','Weitere Unterlagen']) {
    const entries = documents[project.id].filter(file => file.category === category);
    if (!entries.length) continue;
    const list = element('ul');
    files.append(element('h4', category), list);
    for (const file of entries) {
      const item = element('li');
      const link = element('a', file.label);
      link.href = file.url;
      link.target = '_blank';
      link.rel = 'noopener';
      const download = element('a', 'PDF laden', 'download');
      download.href = file.url;
      download.download = file.label + '.pdf';
      download.setAttribute('aria-label', file.label + ' herunterladen');
      item.append(link, download);
      list.append(item);
    }
  }
  card.append(files);
  projectList.append(card);
}

function chosen() {
  return projects.map(project => {
    const group = projectList.querySelector(`[data-project="${project.id}"]`);
    const codes = Array.from(group.querySelectorAll('.service:checked'), input => input.value);
    return { ...project, codes };
  }).filter(project => project.codes.length);
}

projectList.addEventListener('change', event => {
  const group = event.target.closest('.scope-options');
  if (!group) return;
  const all = group.querySelector('.all-services');
  const boxes = Array.from(group.querySelectorAll('.service'));
  if (event.target === all) boxes.forEach(check => { check.checked = all.checked; });
  const count = boxes.filter(check => check.checked).length;
  all.checked = count === boxes.length;
  all.indeterminate = count > 0 && count < boxes.length;
  const selected = chosen();
  selection.textContent = selected.length
    ? selected.map(project => `${project.name}: ${project.codes.length} BKP`).join(' · ')
    : 'Wählen Sie mindestens eine BKP-Leistung aus.';
  status.textContent = '';
});

function response() {
  const selected = chosen();
  if (!selected.length) {
    status.textContent = 'Bitte wählen Sie zuerst mindestens eine BKP-Leistung aus.';
    projectList.querySelector('input').focus();
    return null;
  }
  if (!form.reportValidity()) return null;
  const data = new FormData(form);
  return {
    company: data.get('company').trim(),
    contact: [data.get('person'), data.get('email'), data.get('phone')].filter(Boolean).join(' · '),
    projects: selected.map(project => [
      `• ${project.name} – ${project.place}`,
      ...project.codes.map(code => `  BKP ${code} – ${services[project.id][code]}`)
    ].join('\n')).join('\n\n'),
    capacity: data.get('capacity').trim(),
    scope: data.get('scope').trim(),
    terms: data.get('terms').trim()
  };
}

document.querySelector('#draft').addEventListener('click', () => {
  const data = response();
  if (!data) return;
  offerText.value = `Offerte an Navolta AG\n\n${data.company}\n${data.contact}\n\nProjekte\n${data.projects}\n\nPersonal und Verfügbarkeit\n${data.capacity}\n\nLeistungsumfang und Abgrenzungen\n${data.scope}\n\nAusführungstermine und Gültigkeit\n${data.terms}\n\nOrt, Datum und Unterschrift\n`;
  offerDialog.showModal();
});

document.querySelector('#download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([offerText.value], {type:'text/plain;charset=utf-8'}));
  const link = element('a');
  link.href = url;
  link.download = 'Navolta_Offertentwurf.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.querySelector('#print').addEventListener('click', () => {
  document.querySelector('#print-offer').textContent = offerText.value;
  window.print();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = response();
  if (!data) return;
  const offer = event.submitter?.value === 'offer';
  const subject = `${offer ? 'Offerte' : 'Projektauswahl'} | ${data.company}`;
  const details = !offer ? [data.capacity && `Kapazität: ${data.capacity}`, data.scope && `Leistungsumfang: ${data.scope}`, data.terms && `Termine und Gültigkeit: ${data.terms}`].filter(Boolean).join('\n\n') : '';
  const body = ['Guten Tag', offer ? 'Im Anhang finden Sie unsere Offerte für folgende Projekte:' : 'Für folgende Projekte können wir Kapazität anbieten:', data.projects, details, `Freundliche Grüsse\n${data.company}\n${data.contact}`].filter(Boolean).join('\n\n');
  const mail = `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (offer && scans.hasFiles()) {
    const button = event.submitter;
    button.disabled = true;
    status.textContent = 'E-Mail-Entwurf wird vorbereitet …';
    try {
      const files = await scans.pdfs();
      await scans.downloadEmail(recipients, subject, body, files);
      status.replaceChildren(document.createTextNode('Öffnen Sie den heruntergeladenen E-Mail-Entwurf und senden Sie ihn. '));
      const fallback = element('a', 'E-Mail öffnen und Scan manuell anhängen');
      fallback.href = mail;
      status.append(fallback);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
    return;
  }
  status.replaceChildren(document.createTextNode(offer ? 'Bitte Offerte als PDF anhängen und die E-Mail senden. ' : 'Bitte die erstellte E-Mail prüfen und senden. '));
  const retry = element('a', 'E-Mail erneut öffnen');
  retry.href = mail;
  status.append(retry);
  window.location.href = mail;
});
