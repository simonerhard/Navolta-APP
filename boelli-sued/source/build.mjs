import fs from 'node:fs';
import path from 'node:path';
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'node_modules';
const src=name=>fs.readFileSync(name,'utf8');
const assets=Object.fromEntries([['/','index.html'],['/style.css','style.css'],['/app.js','app.js'],['/reports.js','reports.js'],['/pdf.js',path.join(runtime,'pdf-lib/dist/pdf-lib.min.js')],['/zip.js',path.join(runtime,'jszip/dist/jszip.min.js')]].map(([route,file])=>[route,src(file)]));
fs.mkdirSync('dist/server',{recursive:true});
fs.mkdirSync('dist/.openai',{recursive:true});
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
fs.writeFileSync('dist/server/index.js','const SEED='+src('seed.json')+';\nconst REFERENCE='+src('photos.json')+';\nconst ASSETS='+JSON.stringify(assets)+';\n'+src('worker.mjs'));
