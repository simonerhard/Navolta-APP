async function readEgliseWorkbook(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  async function xml(path, optional = false) {
    const entry = zip.file(path);
    if (!entry && optional) return null;
    if (!entry) throw new Error('Die Excel-Datei enthält kein gültiges Arbeitsbuch.');
    const doc = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Die Excel-Datei ist beschädigt.');
    return doc;
  }
  const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  const book = await xml('xl/workbook.xml');
  const sheet = elements(book, 'sheet').find(node => node.getAttribute('name') === 'Projektstatus');
  if (!sheet) throw new Error('Das Blatt «Projektstatus» wurde in der Excel-Datei nicht gefunden.');
  const relations = await xml('xl/_rels/workbook.xml.rels');
  const rid = Array.from(sheet.attributes).find(attribute => attribute.localName === 'id')?.value;
  const target = elements(relations, 'Relationship').find(node => node.getAttribute('Id') === rid)?.getAttribute('Target');
  if (!target) throw new Error('Das Blatt «Projektstatus» kann nicht gelesen werden.');
  const path = new URL(target, 'https://xlsx.invalid/xl/workbook.xml').pathname.slice(1);
  const sheetXml = await xml(path);
  const stringsXml = await xml('xl/sharedStrings.xml', true);
  const collectText = node => elements(node, 't').map(text => text.textContent).join('');
  const strings = stringsXml ? elements(stringsXml, 'si').map(collectText) : [];
  const epoch = /^[1t]/.test(elements(book, 'workbookPr')[0]?.getAttribute('date1904') ?? '')
    ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const rows = elements(sheetXml, 'row').map(row => Object.fromEntries(elements(row, 'c').map(cell => {
    const type = cell.getAttribute('t');
    const value = elements(cell, 'v')[0]?.textContent ?? '';
    const column = cell.getAttribute('r').replace(/\d+$/, '');
    const text = type === 's' ? strings[Number(value)] : type === 'inlineStr' ? collectText(cell) : value;
    return [column, String(text ?? '').trim()];
  })));
  const normalized = text => (text || '').replace(/\s+/g, ' ').toLowerCase();
  const headers = rows.findIndex(row => normalized(row.B) === 'mangel / aufgabe' && normalized(row.G) === 'projektstatus');
  if (headers < 0) throw new Error('Die Spalten «Mangel / Aufgabe» und «Projektstatus» wurden nicht gefunden.');
  const statuses = new Map([['offen', 'Offen'], ['in bearbeitung', 'In Arbeit'], ['in arbeit', 'In Arbeit'], ['blockiert', 'Blockiert']]);
  function excelDate(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return value.slice(0, 10);
    const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
    if (swiss) return [swiss[3], swiss[2].padStart(2, '0'), swiss[1].padStart(2, '0')].join('-');
    const serial = Number(value);
    return Number.isFinite(serial) && serial >= 0 && serial < 2958466
      ? new Date(epoch + Math.floor(serial) * 86400000).toISOString().slice(0, 10) : '';
  }
  const output = [];
  const refs = new Set();
  for (const row of rows.slice(headers + 1)) {
    if (!row.A || !row.B) continue;
    const status = statuses.get(normalized(row.G));
    if (!status) continue;
    const reference = /^\d+$/.test(row.A) ? row.A.replace(/^0+(?=\d)/, '') : row.A.toLowerCase();
    const excelRef = 'eglise-projektstatus:' + reference;
    if (refs.has(excelRef)) throw new Error(`Die Excel-Nummer ${row.A} kommt mehrfach vor.`);
    refs.add(excelRef);
    const recorded = excelDate(row.E);
    const notes = [`Excel-Nr. ${row.A}`, row.C && 'Ort: ' + row.C,
      recorded && 'Aufgenommen: ' + fmt(recorded), row.H].filter(Boolean);
    output.push({excelRef, title: row.B, status, start: '', end: excelDate(row.F), owner: row.D || '', note: notes.join(' · ')});
  }
  return output;
}
