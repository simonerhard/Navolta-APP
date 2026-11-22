const egliseFolderUrl = 'https://navolta.sharepoint.com/sites/Egliseestrasse60/Shared%20Documents/Projektstatus';
const isEgliseProject = project => /^(?:sanierung mfh )?egliseestrasse 60(?:,? basel)?$/i.test(project.name.trim());
function projectFolder(project) {
  try {
    const url = new URL(project.folderUrl ?? (isEgliseProject(project) ? egliseFolderUrl : ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function renderDocuments(view) {
  const projects = state.projects.filter(project => !chosen() || project.id === chosen());
  const folders = projects.map(project => {
    const id = esc(project.id);
    const url = projectFolder(project);
    const count = state.files.filter(file => file.project === project.id).length;
    return `<article class="card"><h3>${esc(project.name)}</h3><p class="muted">${count} ${count === 1 ? 'Datei' : 'Dateien'} im Cockpit</p>
      <div class="actions">
        ${chosen() ? '' : `<button type="button" data-project-files="${id}">Dateien anzeigen</button>`}
        <button type="button" class="primary" data-upload-project="${id}">+ Dateien ablegen</button>
        ${url ? `<a class="button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ordner öffnen ↗</a>` : ''}
        <button type="button" data-project-folder="${id}">${url ? 'Ordnerlink bearbeiten' : 'Ordner verknüpfen'}</button>
      </div></article>`;
  }).join('');
  const files = state.files.filter(match);
  const rows = files.map(file => `<tr><td><a href="${esc(file.data)}" download="${esc(file.name)}">${esc(file.name)}</a><small>${(file.size / 1024).toFixed(0)} KB</small></td><td>${esc(projectName(file.project))}<small>${esc(parentName(file.parent))}</small></td><td><button type="button" data-file-ocr="${esc(file.id)}">Text / OCR</button> <button type="button" data-file-remove="${esc(file.id)}">Entfernen</button></td></tr>`).join('');
  view.innerHTML = `<div class="note">Cockpit-Dateien werden im Browser gespeichert und sind in der JSON-Sicherung enthalten. Für Unterlagen, die das Team gemeinsam nutzt, öffne den verknüpften Ordner und lade sie dort hoch.</div>
    <div class="grid">${folders}</div><h2>Dateien im Cockpit</h2>
    ${rows ? `<div class="tablewrap"><table><tr><th>Dokument</th><th>Projekt / Zuordnung</th><th>Verarbeitung</th></tr>${rows}</table></div>` : '<p class="muted">Keine Dateien für diese Auswahl.</p>'}
    <a class="button" href="assets/Vorlage.docx" download>Original-Wordvorlage</a>`;
  for (const [selector, key, action] of [
    ['[data-project-files]', 'projectFiles', id => { $('#project').value = id; render(); }],
    ['[data-upload-project]', 'uploadProject', uploadDialog],
    ['[data-project-folder]', 'projectFolder', editProjectFolder],
    ['[data-file-ocr]', 'fileOcr', processFile],
    ['[data-file-remove]', 'fileRemove', removeFile]
  ]) {
    view.querySelectorAll(selector).forEach(button => {
      button.onclick = () => action(button.dataset[key]);
    });
  }
}

function editProjectFolder(id) {
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  show(`<h2>Dateiordner · ${esc(project.name)}</h2><form id="projectFolderForm">
    ${input('folderUrl', 'Ordnerlink (HTTPS)', projectFolder(project), 'url')}
    <p class="muted">Füge einen Link zu einem bestehenden Ordner ein, zum Beispiel in SharePoint. Leere das Feld, um die Verknüpfung zu entfernen.</p>
    <button class="primary">Speichern</button></form>`);
  $('#projectFolderForm').onsubmit = async event => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem('folderUrl');
    const value = field.value.trim();
    if (value && !projectFolder({name: project.name, folderUrl: value})) {
      field.setCustomValidity('Bitte einen gültigen HTTPS-Ordnerlink eingeben.');
      field.reportValidity();
      field.oninput = () => field.setCustomValidity('');
      return;
    }
    const previous = project.folderUrl;
    project.folderUrl = value;
    try {
      await save();
    } catch {
      project.folderUrl = previous;
      return;
    }
    $('#modal').close();
    render();
    toast(value ? 'Ordnerlink gespeichert.' : 'Ordnerlink entfernt.');
  };
}

function uploadDialog(projectId) {
  if (!state.projects.some(project => project.id === projectId)) return;
  show(`<h2>Dateien ablegen</h2><form id="projectUploadForm">
    <label>Projekt<select name="project" required>${options(projectId)}</select></label>
    <label>Zuordnung<select name="parent"></select></label>
    <label>Dateien<input name="documents" type="file" multiple required></label>
    <p class="muted">Bis zu 25 MB je Datei. Die Dateien werden im Cockpit gespeichert.</p>
    <p role="status" id="projectUploadStatus"></p>
    <button class="primary">Ablegen</button></form>`);
  const form = $('#projectUploadForm');
  const projectField = form.elements.namedItem('project');
  const parentField = form.elements.namedItem('parent');
  const linked = [...state.tasks, ...state.entries, ...state.invoices, ...(state.materialOrders || [])];
  function updateParents() {
    parentField.innerHTML = '<option value="">Projektablage</option>' + linked
      .filter(item => item.project === projectField.value)
      .map(item => `<option value="${esc(item.id)}">${esc(item.title || item.number)}</option>`).join('');
  }
  projectField.onchange = updateParents;
  updateParents();
  form.onsubmit = async event => {
    event.preventDefault();
    const files = Array.from(form.elements.namedItem('documents').files);
    const project = projectField.value;
    const parent = parentField.value;
    const status = $('#projectUploadStatus');
    const submit = form.querySelector('button');
    const tooLarge = files.find(file => file.size > 25 * 1024 * 1024);
    if (tooLarge) {
      status.textContent = `${tooLarge.name} überschreitet 25 MB. Bitte passe die Dateiauswahl an.`;
      return;
    }
    submit.disabled = true;
    status.textContent = 'Dateien werden gespeichert …';
    let added = [];
    try {
      added = await Promise.all(files.map(async file => ({
        id: uid(), project, parent, name: file.name, size: file.size, type: file.type, data: await readData(file)
      })));
      state.files.push(...added);
      await save();
      $('#project').value = project;
      $('#search').value = '';
      $('#modal').close();
      render();
      toast(`${added.length} ${added.length === 1 ? 'Datei abgelegt' : 'Dateien abgelegt'}.`);
    } catch {
      state.files = state.files.filter(file => !added.includes(file));
      status.textContent = 'Dateien konnten nicht gespeichert werden. Bitte erneut versuchen.';
      submit.disabled = false;
    }
  };
}

function showEgliseImport() {
  const project = state.projects.find(isEgliseProject);
  if (!project) return;
  show(`<h2>Excel-Pendenzen · ${esc(project.name)}</h2>
    <p>Wähle die Projektstatus-Datei im Excel-Format. Der Import übernimmt offene, laufende und blockierte Aufgaben. Bereits importierte Nummern werden übersprungen.</p>
    <form id="egliseImportForm"><label>Projektstatus-Datei<input type="file" accept=".xlsx" required></label>
    <p role="status" id="egliseImportStatus"></p><button class="primary">Offene Pendenzen importieren</button></form>`);
  const form = $('#egliseImportForm');
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const status = $('#egliseImportStatus');
    const file = form.querySelector('input').files[0];
    button.disabled = true;
    status.textContent = 'Excel-Datei wird gelesen …';
    let additions = [];
    try {
      const rows = await readEgliseWorkbook(file);
      const existing = new Set(state.tasks.filter(task => task.project === project.id).map(task => task.excelRef));
      additions = rows.filter(row => !existing.has(row.excelRef))
        .map(row => ({...row, id: uid(), project: project.id, hours: 0, priority: 'Normal', depends: ''}));
      if (additions.length) {
        state.tasks.push(...additions);
        await save();
      }
      $('#project').value = project.id;
      $('#search').value = '';
      $('#modal').close();
      nav('Aufgaben');
      toast(`${additions.length} importiert · ${rows.length - additions.length} bereits vorhanden.`);
    } catch (error) {
      state.tasks = state.tasks.filter(task => !additions.includes(task));
      status.textContent = error.message || 'Import fehlgeschlagen.';
      button.disabled = false;
    }
  };
}
