const Reports=(()=>{
 const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const recipients='projekt@example.com, bauleitung@example.com';
 const time=dt=>new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Zurich'}).format(new Date(dt));
 const source=row=>row.sources.map(s=>s.name+(s.page?' S. '+s.page:'')).join(' | ');
 const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const prefix='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const pkg='http://schemas.openxmlformats.org/package/2006/relationships';
 const style='<styleSheet xmlns="'+ns+'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF102E42"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
 const letter=i=>String.fromCharCode(65+i);
 function sheet(rows,widths){
  const last=letter(widths.length-1);
  return prefix+'<worksheet xmlns="'+ns+'"><dimension ref="A1:'+last+rows.length+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>'<c r="'+letter(j)+(i+1)+'" t="inlineStr"'+(i?'':' s="1"')+'><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData><autoFilter ref="A1:'+last+rows.length+'"/></worksheet>';
 }
 async function xlsx(info){
  const titles=['Pendenzen','Verlauf','Protokoll'];
  const zip=new JSZip();
  zip.file('[Content_Types].xml',prefix+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+titles.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>');
  zip.file('_rels/.rels',prefix+'<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml',prefix+'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets>'+titles.map((n,i)=>'<sheet name="'+n+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels',prefix+'<Relationships xmlns="'+pkg+'">'+titles.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId4" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml',prefix+style);
  zip.file('xl/worksheets/sheet1.xml',sheet([['Nr.','Herkunft','Haus','Ort','Mangel','Beschreibung','Frist','Status','Bemerkung','Fotos','Bearbeitet am','Bearbeitet von','Quellen'],...info.rows.map(x=>[x.id,info.groups[x.group],x.house,x.place,x.title,x.detail,x.term||x.due,x.status,x.remark,x.photos.length,x.updatedAt?time(x.updatedAt):'',x.updatedBy,source(x)])],[17,28,16,28,60,56,32,15,52,10,24,27,60]));
  zip.file('xl/worksheets/sheet2.xml',sheet([['Datum','Person','Aktion','Nr.','Mangel / Unterlage','Änderung'],...info.history.map(e=>[time(e.at),e.actor,e.action,e.id,e.title,e.info])],[24,29,27,17,50,60]));
  zip.file('xl/worksheets/sheet3.xml',sheet([['Feld','Wert'],['Projekt',info.project],['Art',info.label],['Erstellt',time(info.time)],['Anzahl Pendenzen',info.rows.length],['Erledigt',info.rows.filter(x=>x.status==='Erledigt').length]],[28,50]));
  return zip.generateAsync({type:'blob',mimeType:mime,compression:'DEFLATE'});
 }
 function latin(value){
  return String(value??'').replace(/Ω/g,'Ohm').replace(/μ/g,'u').replace(/→/g,' zu ').replace(/[^\x20-\x7e\xA0-\xFF\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\n]/g,' ');
 }
 async function pdf(info){
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoResponse=await fetch('/logo.png');
  if(!logoResponse.ok)throw Error('Das Navolta-Logo konnte nicht geladen werden.');
  const logo=await pdf.embedPng(await logoResponse.arrayBuffer());
  const navy=rgb(.063,.18,.26),blue=rgb(0,.4,.56), muted=rgb(.31,.39,.44),line=rgb(.83,.89,.92);
  let page,y=0,pageIndex=0,activeGroup='';
  const draw=(value,x,yy,size=10,f=font,color=navy)=>page.drawText(latin(value),{x,y:yy,size,font:f,color});
  function newPage(){
   page=pdf.addPage([595.28,841.89]);pageIndex++;
   const mark=logo.scaleToFit(114,31);
   page.drawImage(logo,{x:553-mark.width,y:798,width:mark.width,height:mark.height});
   draw(info.label+' · Pendenzenprotokoll',41,808,17,bold);
   draw(info.project+'  |  '+time(info.time),41,785,10,font,muted);
   page.drawLine({start:{x:41,y:773},end:{x:554,y:773},thickness:1,color:line});
   page.drawLine({start:{x:41,y:48},end:{x:554,y:48},thickness:1,color:line});
   draw('Navolta AG · Bauleitung',41,31,9,font,muted);draw('Seite '+pageIndex,511,31,9,font,muted);
   y=749;
  }
  function wrap(value, maxWidth,size,f){
   const ret=[];
   for(const paragraph of latin(value).split('\n')){
    let current='';
    for(let word of paragraph.split(/\s+/)){
     if(!word)continue;
     if(current&&f.widthOfTextAtSize(current+' '+word,size)>maxWidth){ret.push(current);current='';}
     while(f.widthOfTextAtSize(word,size)>maxWidth){let n=1;while(n<word.length&&f.widthOfTextAtSize(word.slice(0,n+1),size)<=maxWidth)n++;ret.push(word.slice(0,n));word=word.slice(n);}
     current+=(current?' ':'')+word;
    }
    if(current)ret.push(current);
   }
   return ret;
  }
  function block(value,{size=10,f=font,color=navy,left=41,width=512}={}){
   for(const row of wrap(value,width,size,f)){if(y<65)newPage();draw(row,left,y,size,f,color);y-=size+4;}
  }
  newPage();
  block(info.rows.length+' Positionen · '+info.rows.filter(x=>x.status==='Erledigt').length+' erledigt', {f:bold});
  y-=11;
  for(const row of info.rows){
   if(y<200)newPage();
   if(row.group!==activeGroup){activeGroup=row.group;block(info.groups[row.group],{size:14,f:bold,color:blue});y-=4;}
   block(row.id+' · '+row.title,{f:bold,size:11});
   block([row.house,row.place,row.status,row.term||row.due].filter(Boolean).join(' · '),{size:9,color:muted});
   if(row.remark)block('Bemerkung: '+row.remark);
   if(row.updatedAt)block('Bearbeitet: '+time(row.updatedAt)+' · '+row.updatedBy,{size:9,color:muted});
   if(row.sources.length)block('Quellen: '+source(row),{size:8,color:muted});
   for(let index=0;index<row.photos.length;index+=3){
    const images=await Promise.all(row.photos.slice(index,index+3).map(async key=>{
     const res=await fetch('/file/'+key);
     if(!res.ok)throw Error('Ein Foto fehlt bei '+row.id+'.');
     return pdf.embedJpg(await res.arrayBuffer());
    }));
    if(y<190){newPage();block(row.id+' · Erledigungsfotos',{f:bold});}
    block('Erledigungsfotos',{size:9,color:muted});
    images.forEach((image,j)=>{const d=image.scaleToFit(158,103);page.drawImage(image,{x:41+j*170,y:y-d.height,width:d.width,height:d.height});});
    y-=113;
   }
   y-=11;
  }
  pdf.setTitle('Navolta '+info.label+' · Bölli Süd');
  return new Blob([await pdf.save()],{type:'application/pdf'});
 }
 function save(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}
 const base64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
 function eml(info,files){
  const boundary='navolta-'+Date.now();
  const wrap=value=>value.match(/.{1,76}/g).join('\r\n');
  const utf8=value=>btoa(String.fromCharCode(...new TextEncoder().encode(value)));
  return new Blob([['To: '+recipients,'Subject: =?UTF-8?B?'+utf8('Navolta Abschlussprotokoll – Bölli Süd')+'?=','X-Unsent: 1','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(utf8('Guten Tag\n\nIm Anhang findet ihr das Navolta-Abschlussprotokoll und die Excel-Liste.\n\nFreundliche Grüsse\nNavolta AG')),'',...files.flatMap(f=>['--'+boundary,'Content-Type: '+f.type+'; name="'+f.name+'"','Content-Transfer-Encoding: base64','Content-Disposition: attachment; filename="'+f.name+'"','',wrap(f.base64),'']),'--'+boundary+'--',''].join('\r\n')],{type:'message/rfc822'});
 }
 return {xlsx,pdf,save,base64,eml};
})();
