import {fields} from './fields.js';
import {recover,values} from './model.js';
const pdfjs = async () => {
 const lib=await import('./vendor/pdf.min.mjs');
 lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
 return lib;
};
export async function renderPdf(data){
 const {PDFDocument,StandardFonts,rgb}=globalThis.PDFLib;
 const response=await fetch('./vorlage.pdf');
 if(!response.ok)throw Error('PDF-Vorlage konnte nicht geladen werden.');
 const doc=await PDFDocument.load(await response.arrayBuffer());
 const normal=await doc.embedFont(StandardFonts.Helvetica);
 const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const page=doc.getPage(0), {v}=values(data);
 doc.setTitle('Regie-Rapport '+(data.number||''));
 doc.setAuthor('Navolta AG');
 doc.setSubject('NAVOLTA-RAPPORT/1 '+JSON.stringify(data));
 v.special=v.special||'Spezialw.Nr: 60';
 for(const [k,f] of Object.entries(fields)){
  const txt=String(v[k]??'').replace(/[\r\n\t]+/g,' ').trim();
  if(!txt)continue;
  const font=f.bold?bold:normal;
  let width;
  try{width=font.widthOfTextAtSize(txt,f.size);}
  catch{throw Error('Nicht darstellbares Zeichen im Feld: '+k);}
  const size=Math.min(f.size,f.size*f.w/width);
  if(size<4.5)throw Error('Zu langer Text für die PDF-Vorlage im Feld: '+k);
  const actual=font.widthOfTextAtSize(txt,size);
  const x=f.x+(f.align==='right'?f.w-actual:f.align==='center'?(f.w-actual)/2:0);
  page.drawText(txt,{x,y:792-f.y,size,font,color:rgb(0,0,0)});
 }
 return doc.save();
}
async function scan(canvas, progress){
 if(!globalThis.Tesseract)throw Error('Texterkennung konnte nicht geladen werden.');
 const base=new URL('./vendor/',import.meta.url);
 const worker=await Tesseract.createWorker('eng',1,{
  workerPath:new URL('worker.min.js',base).href,
  corePath:new URL('tesseract-core-lstm.wasm.js',base).href,
  langPath:base.href, workerBlobURL:false,logger:m=>progress(m.status==='recognizing text'?'Texterkennung '+Math.round(m.progress*100)+' %':'Texterkennung wird geladen …')
 });
 try{
  await worker.setParameters({tessedit_pageseg_mode:'11'});
  const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
  const tokens=(data.blocks||[]).flatMap(b=>b.paragraphs).flatMap(p=>p.lines).flatMap(l=>l.words).map(w=>({
   text:w.text,x:w.bbox.x0*612/canvas.width,y:w.bbox.y1*792/canvas.height,
   width:(w.bbox.x1-w.bbox.x0)*612/canvas.width
  }));
  return {...recover(tokens),raw:data.text,mode:'Scan / OCR'};
 }finally{await worker.terminate();}
}
export async function importReport(file,progress){
 if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
  const lib=await pdfjs();
  const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()), useWasm:false}).promise;
  try{
   if(doc.numPages!==1)throw Error('Bitte einen einseitigen Rapport auswählen. Mehrseitige PDFs können als Beleg abgelegt werden.');
   const meta=await doc.getMetadata();
   const subject=meta.info.Subject;
   if(subject?.startsWith('NAVOLTA-RAPPORT/1 ')){
    const original=JSON.parse(subject.slice('NAVOLTA-RAPPORT/1 '.length));
    const data=Object.fromEntries(Object.entries(original).filter(([k,v])=>Object.hasOwn(fields,k)&&typeof v==='string'));
    return {data,sourceTotal:values(data).v.total,mode:'Navolta PDF'};
   }
   const page=await doc.getPage(1);
   const view=page.getViewport({scale:1});
   const {items}=await page.getTextContent();
   const tokens=items.filter(i=>i.str?.trim()).map(i=>{
    const [x,y]=view.convertToViewportPoint(i.transform[4],i.transform[5]);
    return {text:i.str,x:x*612/view.width,y:y*792/view.height,width:i.width*612/view.width};
   });
   const raw=tokens.map(t=>t.text).join('\n');
   if(tokens.length>20)return {...recover(tokens),raw,mode:'PDF-Text'};
   const viewport=page.getViewport({scale:3});
   const canvas=document.createElement('canvas');
   canvas.width=viewport.width;canvas.height=viewport.height;
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   return await scan(canvas,progress);
  }finally{await doc.destroy();}
 }
 if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Für die Erkennung bitte PDF, JPG, PNG oder WebP auswählen.');
 const img=await createImageBitmap(file);
 try{
  const scale=Math.min(1,2400/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');
  canvas.width=img.width*scale;canvas.height=img.height*scale;
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return await scan(canvas,progress);
 }finally{img.close();}
}
