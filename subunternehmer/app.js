const projects = [
  {id:'schafisheim', name:'Neubau Schafisheim', place:'Seetalstrasse 122 & 124, 5503 Schafisheim', work:'Elektroinstallationen für den Neubau eines Mehrfamilienhauses und von Reiheneinfamilienhäusern. Die Unterlagen zeigen den Potenzialausgleich, die Installationen im Unter- und Erdgeschoss sowie die Fassaden- und Treppenhausbeleuchtung.', schedule:'Bauterminplan vom 04.08.2026 und Vorabzug vom 20.01.2026'},
  {id:'aarau', name:'Laurenzenvorstadt · AME-Mieterausbau', place:'Laurenzenvorstadt 9, 5000 Aarau', work:'Elektroarbeiten für den AME-Mieterausbau an der Laurenzenvorstadt. Für die Offerte stehen das Elektro-Leistungsverzeichnis, die Gebäudepläne und die objektspezifischen Bedingungen zur Verfügung.', schedule:'Terminplan als Vorabzug'},
  {id:'egl60', name:'Egliseestrasse 60', place:'Egliseestrasse 60, 4058 Basel', work:'Elektroinstallationen und Brandmeldeanlage beim Umbau eines bestehenden Wohnhauses. Die Apparatepläne dokumentieren die Installationen vom Untergeschoss bis zum Dach.', schedule:'Terminplan vom 02.06.2026 · Index 04 (Vorabzug)'},
  {id:'cleverfit', name:'Clever Fit Basel', place:'Viaduktstrasse 42, 4051 Basel', work:'Elektroinstallationen für den Ausbau des Clever Fit in Basel. Die Bodeneinlagen sind bereits ausgeführt. Installationsplan und Leistungsverzeichnis bilden die Grundlage für die Offerte über die verbleibenden Arbeiten.', schedule:'Terminplan folgt'}
];
const recipients = 'info@navolta.ch,se@navolta.ch';
const cutoff = '18.11.2026';
const projectList = document.querySelector('#projects');
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
  const pick = element('label', '', 'pick');
  const check = element('input');
  check.type = 'checkbox';
  check.value = project.id;
  pick.append(check, 'Projekt auswählen');
  card.append(element('h3', project.name), element('p', project.place, 'place'),
    element('p', project.work), element('p', project.schedule, 'schedule'), pick);
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
  const ids = Array.from(projectList.querySelectorAll('input:checked'), input => input.value);
  return projects.filter(project => ids.includes(project.id));
}

projectList.addEventListener('change', () => {
  const selected = chosen();
  selection.textContent = selected.length ? selected.map(project => project.name).join(' · ') : 'Wählen Sie mindestens ein Projekt aus.';
  status.textContent = '';
});

function response() {
  const selected = chosen();
  if (!selected.length) {
    status.textContent = 'Bitte wählen Sie zuerst mindestens ein Projekt aus.';
    projectList.querySelector('input').focus();
    return null;
  }
  if (!form.reportValidity()) return null;
  const data = new FormData(form);
  return {
    company: data.get('company').trim(),
    contact: [data.get('person'), data.get('email'), data.get('phone')].filter(Boolean).join(' · '),
    projects: selected.map(project => `• ${project.name} – ${project.place}`).join('\n'),
    capacity: data.get('capacity').trim(),
    scope: data.get('scope').trim(),
    terms: data.get('terms').trim()
  };
}

document.querySelector('#draft').addEventListener('click', () => {
  const data = response();
  if (!data) return;
  offerText.value = `Offerte an Navolta AG\nEinreichfrist: ${cutoff}\n\n${data.company}\n${data.contact}\n\nProjekte\n${data.projects}\n\nPersonal und Verfügbarkeit\n${data.capacity}\n\nLeistungsumfang und Abgrenzungen\n${data.scope}\n\nAusführungstermine und Gültigkeit\n${data.terms}\n\nOrt, Datum und Unterschrift\n`;
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
