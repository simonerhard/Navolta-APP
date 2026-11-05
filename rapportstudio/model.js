import {fields} from './fields.js';
export const list = (n, make) => Array.from({length:n}, (_, i)=>make(i));
export const range = n => list(n,i=>i);
export const inputs = Object.keys(fields).filter(k=>!(/^(laborTop|material|labor|total)$|\.total$|^lab\.[0-9]\.qty$|^lab\.1[01]\.qty$/.test(k)));
export const amount = v => Number(String(v ?? '').replace(/[’‘'\s]/g,'').replace(',','.')) || 0;
export const cents = v => Math.sign(v)*Math.round((Math.abs(v)+Number.EPSILON*Math.max(1,Math.abs(v)))*100);
export const money = v => new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
export const iso = d => /^(\d{2})\.(\d{2})\.(\d{4}|\d{2})$/.test(d) ? d.replace(/^(\d{2})\.(\d{2})\.(\d{4}|\d{2})$/,(_,day,month,year)=> (year.length===2?'20':'')+year+'-'+month+'-'+day) : d;
export const swiss = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : d;
export function values(data){
 const v={...data};
 let work=0, materials=0, hours=0;
 for(const i of range(13)){
  const k='lab.'+i;
  const entries=range(8).map(j=>data[k+'.days.'+j]);
  const quantity=entries.reduce((s,n)=>s+amount(n),0);
  if(i<10)hours+=quantity;
  v[k+'.qty']=entries.some(x=>x!==undefined && x!=='') || i===10 || i===11 ? money(quantity) : '';
  const rate=data[k+'.rate'];
  if(rate!==undefined && rate!=='')v[k+'.rate']=money(amount(rate));
  const line=cents(quantity*amount(rate));
  v[k+'.total']=money(line/100);
  work+=line;
  entries.forEach((x,j)=>{ if(x!==undefined && x!=='')v[k+'.days.'+j]=money(amount(x)); });
 }
 for(const i of range(17)){
  const k='mat.'+i;
  const line=cents(amount(data[k+'.qty'])*amount(data[k+'.rate']));
  if(data[k+'.rate'])v[k+'.rate']=money(amount(data[k+'.rate']));
  v[k+'.total']=money(line/100);
  materials+=line;
 }
 v.labor=v.laborTop=money(work/100);
 v.material=money(materials/100);
 v.total=money((work+materials)/100);
 if(data.date)v.date=swiss(data.date);
 for(const i of range(8))if(data['days.'+i])v['days.'+i]=swiss(data['days.'+i]).replace(/\.(\d{2})(\d{2})$/,'.$2');
 return {v,work,materials,hours,total:work+materials};
}
export function filename(d){
 const clean = x => String(x??'').trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,52);
 const order=clean(d.order)||'Auftrag';
 const number=clean(String(d.number||'').startsWith(d.order+'.')?d.number.slice(d.order.length+1):d.number)||'Entwurf';
 return [order,number,'Regierapport',clean(d.location||d.project)||'Projekt',iso(d.date||'')||'ohne_Datum'].join('_')+'.pdf';
}
export function recover(tokens){
 const data={};
 for(const [k,f] of Object.entries(fields)){
  const name=k.endsWith('.name')&&k.startsWith('people.');
  const gap=name?7:k==='number'?8:5;
  const group=tokens.filter(t=>{
   const label=t.text.trim();
   if(!label||t.x<f.x-1.8||t.x+t.width/2>f.x+f.w+1.2||Math.abs(t.y-f.y)>gap)return false;
   if(k.startsWith('flag.'))return /^[xX×✓]$/.test(label);
   if(k.startsWith('days.'))return /\d/.test(label);
   if(k.startsWith('mat.')&&k.endsWith('.name')&&label==='Kleinmat.')return false;
   if((/\.days\.|\.(qty|rate|total)$/.test(k)||['total','labor','material','laborTop'].includes(k))&&!/[0-9]/.test(label))return false;
   return true;
  }).sort((a,b)=>a.x-b.x);
  if(!group.length)continue;
  let val=group.map(t=>t.text.trim()).join(' ').replace(/\bB KP/,'BKP');
  if(k==='date'||k.startsWith('days.'))val=iso(val);
  if(k.startsWith('flag.'))val='x';
  if(/\.days\.|\.(qty|rate)$/.test(k))val=String(amount(val));
  data[k]=val;
 }
 const sourceTotal=data.total||'';
 for(const k of Object.keys(data))if(!inputs.includes(k))delete data[k];
 return {data,sourceTotal};
}
