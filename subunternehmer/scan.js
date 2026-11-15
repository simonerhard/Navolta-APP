const scans = (() => {
  const files = [];
  const list = document.querySelector('#scan-list');
  const status = document.querySelector('#scan-status');
  const downloadButton = document.querySelector('#scan-download');
  const encoder = new TextEncoder();
  const isPdf = file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  function render() {
    list.replaceChildren();
    let pageNumber = 0;
    for (const [index, file] of files.entries()) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = isPdf(file) ? file.name : `Fotoseite ${++pageNumber} · ${file.name}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Entfernen';
      remove.setAttribute('aria-label', `${name.textContent} entfernen`);
      remove.onclick = () => {
        files.splice(index, 1);
        render();
        (list.querySelector('button') ?? document.querySelector('#scan-files')).focus();
      };
      row.append(name, remove);
      list.append(row);
    }
    downloadButton.hidden = !files.length;
    status.textContent = files.length ? `${files.length} Datei${files.length === 1 ? '' : 'en'} ausgewählt.` : '';
  }

  for (const id of ['scan-camera', 'scan-files']) {
    document.getElementById(id).addEventListener('change', event => {
      const selection = Array.from(event.target.files);
      const supported = selection.filter(file => isPdf(file) || file.type.startsWith('image/'));
      files.push(...supported);
      event.target.value = '';
      render();
      if (selection.length !== supported.length) status.textContent = 'Bitte wählen Sie PDF- oder Bilddateien.';
    });
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function jpeg(file) {
    let image;
    try {
      image = await createImageBitmap(file);
    } catch {
      throw new Error(`«${file.name}» konnte nicht als Foto gelesen werden. Verwenden Sie JPG, PNG oder einen PDF-Scan.`);
    }
    try {
      const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d', {alpha:false});
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
      if (!blob) throw new Error('Das Foto konnte nicht für den PDF-Scan vorbereitet werden.');
      return {blob, width:canvas.width, height:canvas.height};
    } finally {
      image.close();
    }
  }

  async function photosToPdf(photos) {
    const chunks = [];
    const offsets = [0];
    let length = 0;
    function append(part) {
      const chunk = typeof part === 'string' ? encoder.encode(part) : part;
      chunks.push(chunk);
      length += chunk.size ?? chunk.byteLength;
    }
    function object(id, ...parts) {
      offsets[id] = length;
      append(`${id} 0 obj\n`);
      parts.forEach(append);
      append('\nendobj\n');
    }
    append('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const kids = photos.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
    object(2, `<< /Type /Pages /Count ${photos.length} /Kids [${kids}] >>`);
    for (const [index, photo] of photos.entries()) {
      const {blob, width, height} = await jpeg(photo);
      const id = 3 + index * 3;
      const size = width > height ? [842, 595] : [595, 842];
      const scale = Math.min((size[0] - 36) / width, (size[1] - 36) / height);
      const dimensions = [width * scale, height * scale];
      const origin = size.map((side, axis) => (side - dimensions[axis]) / 2);
      const [w, h, x, y] = [...dimensions, ...origin].map(value => value.toFixed(3));
      const content = `q ${w} 0 0 ${h} ${x} ${y} cm /Photo Do Q\n`;
      object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.join(' ')}] /Resources << /XObject << /Photo ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
      object(id + 1, `<< /Length ${content.length} >>\nstream\n${content}endstream`);
      object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${blob.size} >>\nstream\n`, blob, '\nendstream');
    }
    const start = length;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
    return new File(chunks, 'Offerte_Fotoscan.pdf', {type:'application/pdf'});
  }

  async function pdfs() {
    const selection = [...files];
    const pdfFiles = selection.filter(isPdf);
    const photos = selection.filter(file => !isPdf(file));
    for (const file of pdfFiles) {
      const header = await file.slice(0, 1024).text();
      if (!header.includes('%PDF-')) throw new Error(`«${file.name}» ist keine lesbare PDF-Datei.`);
    }
    if (photos.length) pdfFiles.push(await photosToPdf(photos));
    return pdfFiles;
  }

  function encode(bytes) {
    let result = '';
    for (let index = 0; index < bytes.length; index += 57) {
      result += btoa(String.fromCharCode(...bytes.subarray(index, index + 57))) + '\r\n';
    }
    return result;
  }

  async function downloadEmail(to, subject, body, attachments) {
    const boundary = `navolta-${crypto.randomUUID()}`;
    // Split on Unicode characters so encoded words never break a UTF-8 sequence.
    const subjectChars = Array.from(subject);
    const words = [];
    for (let index = 0; index < subjectChars.length; index += 12) {
      const chunk = subjectChars.slice(index, index + 12).join('');
      words.push(`=?UTF-8?B?${encode(encoder.encode(chunk)).trim()}?=`);
    }
    const parts = [
      `To: ${to}\r\nSubject: ${words.join('\r\n ')}\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`,
      `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`,
      encode(encoder.encode(body.replace(/\r?\n/g, '\r\n')))
    ];
    for (const [index, file] of attachments.entries()) {
      const name = `Offerte_${index + 1}.pdf`;
      parts.push(`--${boundary}\r\nContent-Type: application/pdf; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n`,
        encode(new Uint8Array(await file.arrayBuffer())));
    }
    parts.push(`--${boundary}--\r\n`);
    download(new Blob(parts, {type:'message/rfc822'}), 'Navolta_Offerte.eml');
  }

  downloadButton.addEventListener('click', async () => {
    downloadButton.disabled = true;
    status.textContent = 'PDF wird vorbereitet …';
    try {
      const attachments = await pdfs();
      // One click per file also works in browsers that block multiple downloads.
      status.replaceChildren();
      for (const attachment of attachments) {
        const link = document.createElement('button');
        link.type = 'button';
        link.textContent = `${attachment.name} herunterladen`;
        link.onclick = () => download(attachment, attachment.name);
        status.append(link);
      }
      if (attachments.length === 1) download(attachments[0], attachments[0].name);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      downloadButton.disabled = false;
    }
  });

  return {hasFiles: () => files.length > 0, pdfs, downloadEmail};
})();
