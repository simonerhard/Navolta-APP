'use strict';

const byId = id => document.getElementById(id);
const canvas = byId('track');
const context = canvas.getContext('2d');
const stage = byId('stage');
const overlay = byId('overlay');
const play = byId('play');
const hud = ['score','best','coins','time','speed'].map(byId);
const meter = byId('meter');
const feedback = byId('feedback');
const levelLabel = byId('level-label');
const interlude = byId('interlude');
const backgrounds = ['Rheinufer','Altstadt','Skatepark am Hafen'];
const quotes = [
  'Der Asphalt hat gefragt, ob ich noch eine Runde drehe.',
  'Kopf frei, Board an. Weiter geht’s!',
  'Mein Board kennt nur eine Richtung: vorwärts.',
  'Kleine Rollen, grosse Pläne.',
  'Vier Rollen reichen für ein Abenteuer.',
  'Die nächste Linie gehört mir.'
];
const interludeDuration = 4;
const duration = 60;
const sight = 700;
const startSpeed = 130;
const acceleration = 2.45;
const bestKey = 'jonas-skate-run-best-v1';
const format = new Intl.NumberFormat('de-CH');
let best = 0;
try { best = Number(localStorage.getItem(bestKey)) || 0; } catch {}
let width, height, pixelRatio, scenery;
let state = 'ready', elapsed = 0, distance = 0, coinCount = 0, score = 0;
let lane = 0, riderLane = 0, jump = 0, duck = 0, coinFlash = 0;
let nextWave = 400, wave = 0, objects = [];
let lastFrame = 0, swipe;
let level = 1, previousLevelsDistance = 0, interludeTime = 0;

function speedAt(time) {
  return Math.min(385,startSpeed+acceleration*((level-1)*duration+time));
}

function scoreAt(localDistance) {
  return Math.floor((previousLevelsDistance+localDistance)/6) + coinCount*100;
}

function updateHud() {
  const values = [format.format(score), format.format(Math.max(best,score)), coinCount, Math.ceil(duration-elapsed)+' s',
    Math.round(speedAt(elapsed) * 18 / startSpeed)];
  hud.forEach((node,index) => {
    const value = String(values[index]);
    if (node.textContent !== value) node.textContent = value;
  });
  meter.style.transform = 'scaleX(' + (1-elapsed/duration) + ')';
}

function start() {
  level = 1;
  previousLevelsDistance = coinCount = score = 0;
  lastFrame = performance.now();
  beginLevel();
}

function beginLevel() {
  elapsed = distance = lane = riderLane = jump = duck = coinFlash = 0;
  nextWave = level === 1 ? 400 : speedAt(0)*2.6;
  wave = 0;
  objects = [];
  swipe = undefined;
  state = 'running';
  overlay.hidden = true;
  interlude.hidden = true;
  feedback.hidden = true;
  const location = backgrounds[(level-1) % backgrounds.length];
  levelLabel.textContent = 'Level ' + level + ' · ' + location;
  levelLabel.hidden = false;
  canvas.setAttribute('aria-label','Dreispurige Strecke · ' + location);
  paintSky();
  fillTrack();
  updateHud();
  draw();
}

function saveBest() {
  if (score <= best) return false;
  best = score;
  try { localStorage.setItem(bestKey,String(best)); } catch {}
  return true;
}

function completeLevel() {
  state = 'interlude';
  interludeTime = interludeDuration;
  previousLevelsDistance += distance;
  saveBest();
  feedback.hidden = true;
  byId('interlude-title').textContent = 'Level ' + level + ' geschafft!';
  byId('interlude-quote').textContent = '«' + quotes[(level-1) % quotes.length] + '»';
  const nextLocation = backgrounds[level % backgrounds.length];
  byId('interlude-next').textContent = 'Weiter zu Level ' + (level+1) + ' · ' + nextLocation;
  interlude.hidden = false;
}

function advanceInterlude(dt) {
  interludeTime -= dt;
  if (interludeTime > 0) return;
  level++;
  beginLevel();
}

function finish(obstacle) {
  state = 'finished';
  feedback.hidden = true;
  const record = saveBest();
  overlay.classList.add('finished');
  byId('tag').textContent = (record ? 'Neuer Bestscore' : 'Ergebnis') + ' · Level ' + level;
  byId('message').textContent = 'Kollision!';
  const hint = { barrier:'Über die Hürde springen.', gate:'Unter dem Balken ducken.', crate:'Die blockierte Spur wechseln.' };
  byId('detail').textContent = format.format(score) + ' Punkte · ' + coinCount + (coinCount === 1 ? ' Münze.' : ' Münzen.') + ' ' + hint[obstacle];
  play.textContent = 'Nochmals spielen';
  overlay.hidden = false;
  play.focus({preventScroll:true});
}

function pickLane() { return Math.floor(Math.random()*3)-1; }

function fillTrack() {
  while (nextWave < distance + sight + 100) {
    const target = wave === 0 ? 0 : pickLane();
    const kind = ['barrier','gate','crate'][(wave+level-1)%3];
    if (wave === 0) {
      for (const offset of [230,175,120]) objects.push({kind:'coin',lane:0,at:nextWave-offset});
    } else {
      const openLane = target === 0 ? (Math.random() < .5 ? -1 : 1) : 0;
      for (const offset of [110,62,14]) objects.push({kind:'coin',lane:openLane,at:nextWave-offset});
      if ((level > 1 || elapsed > 22) && wave % 3 === 1) {
        const unusedLane = -target-openLane;
        objects.push({kind:'crate',lane:unusedLane,at:nextWave});
      }
    }
    objects.push({kind,lane:target,at:nextWave});
    nextWave += (level === 1 ? 200 + elapsed*1.3 : speedAt(elapsed)*.94) + Math.random()*32;
    wave++;
  }
}

function step(dt) {
  const active = Math.min(dt,duration-elapsed);
  const previousDistance = distance;
  distance += active * speedAt(elapsed + active/2);
  elapsed += active;
  riderLane += (lane-riderLane) * (1-Math.exp(-25*active));
  jump = Math.max(0,jump-active);
  duck = Math.max(0,duck-active);
  coinFlash = Math.max(0,coinFlash-active);
  fillTrack();
  for (const object of objects) {
    if (object.at > distance || object.at <= previousDistance || Math.abs(object.lane-riderLane) > .44) continue;
    if (object.kind === 'coin') {
      coinCount++;
      coinFlash = .55;
      continue;
    }
    const clears = (object.kind === 'barrier' && jump > .11 && jump < .68)
      || (object.kind === 'gate' && duck > 0);
    if (!clears) {
      score = scoreAt(object.at);
      updateHud();
      finish(object.kind);
      return;
    }
  }
  objects = objects.filter(object => object.at > distance);
  score = scoreAt(distance);
  feedback.hidden = coinFlash === 0;
  updateHud();
  if (elapsed >= duration) completeLevel();
}

function move(direction) {
  if (state !== 'running') return;
  if (direction === 'left') lane = Math.max(-1,lane-1);
  if (direction === 'right') lane = Math.min(1,lane+1);
  if (direction === 'up' && jump === 0) { jump = .78; duck = 0; }
  if (direction === 'down') { duck = .78; jump = 0; }
}

const keys = {ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
document.addEventListener('keydown', event => {
  if (state !== 'running' || !keys[event.key]) return;
  event.preventDefault();
  if (!event.repeat) move(keys[event.key]);
});
play.addEventListener('click',start);
stage.addEventListener('pointerdown',event => {
  if (state !== 'running' || !event.isPrimary || event.button !== 0) return;
  swipe = {id:event.pointerId,x:event.clientX,y:event.clientY};
  stage.setPointerCapture(event.pointerId);
});
function readSwipe(event) {
  if (swipe?.id !== event.pointerId) return;
  const dx = event.clientX-swipe.x, dy = event.clientY-swipe.y;
  if (Math.max(Math.abs(dx),Math.abs(dy)) < 24) return;
  move(Math.abs(dx)>Math.abs(dy) ? (dx<0?'left':'right') : (dy<0?'up':'down'));
  swipe = undefined;
}
stage.addEventListener('pointermove',readSwipe);
stage.addEventListener('pointerup',event => {
  readSwipe(event);
  if (swipe?.id === event.pointerId) swipe = undefined;
});
stage.addEventListener('pointercancel',event => { if (swipe?.id === event.pointerId) swipe = undefined; });

function polygon(ctx,color,...points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function rect(ctx,color,x,y,w,h) { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }

function oval(ctx,color,x,y,rx,ry) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  ctx.fill();
}

function trace(ctx,color,lineWidth,...points) {
  ctx.beginPath();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function paintSky() {
  scenery ??= document.createElement('canvas');
  scenery.width = width*pixelRatio;
  scenery.height = height*pixelRatio;
  const ctx = scenery.getContext('2d');
  ctx.scale(pixelRatio,pixelRatio);
  const horizon = height*.32;
  const route = (level-1) % backgrounds.length;
  if (route === 1) {
    paintOldTown(ctx,horizon);
    return;
  }
  if (route === 2) {
    paintHarbour(ctx,horizon);
    return;
  }
  const sky = ctx.createLinearGradient(0,0,0,horizon);
  sky.addColorStop(0,'#735d8a');
  sky.addColorStop(.6,'#e78a77');
  sky.addColorStop(1,'#ffd38e');
  rect(ctx,sky,0,0,width,horizon+2);
  const sunX = width*.26;
  oval(ctx,'#ffdfa6',sunX,horizon*.52,horizon*.19,horizon*.19);
  for (let i=0;i<8;i++) {
    const x = width*((i*.183+.07)%1);
    const y = horizon*(.18+i%3*.17);
    trace(ctx,'#ffd3ad36',2,[x,y],[x+width*.10,y]);
  }
  for (let i=0;i<25;i++) {
    const x = width*(i/24)-5;
    const h = 6+(i*17%16);
    const w = width/23+3;
    rect(ctx,i%2===0?'#6b536b':'#79556b',x,horizon-h,w,h);
    polygon(ctx,'#5b4863',[x-2,horizon-h],[x+w*.52,horizon-h-7-(i%4)],[x+w+2,horizon-h]);
  }
  const tower = width*.76;
  const twin = width*.055;
  const stone = '#534359';
  rect(ctx,stone,tower-16,horizon-30,twin+32,30);
  polygon(ctx,stone,[tower-19,horizon-30],[tower+twin*.5,horizon-53],[tower+twin+19,horizon-30]);
  for (const x of [tower,tower+twin]) {
    rect(ctx,stone,x-7,horizon-60,14,60);
    polygon(ctx,stone,[x-9,horizon-60],[x,horizon-91],[x+9,horizon-60]);
    rect(ctx,'#efaa84',x-1.5,horizon-51,3,9);
  }
  const river = ctx.createLinearGradient(0,horizon,0,height);
  river.addColorStop(0,'#8f8aa3');
  river.addColorStop(1,'#314f68');
  rect(ctx,river,0,horizon,width,height-horizon);
  for (let i=0;i<85;i++) {
    const depth = ((i*43)%89)/89;
    const y = horizon+depth*height*.67;
    const x = width*((i*29)%97)/97;
    const length = 3+depth*width*.12;
    trace(ctx,i%3===0?'#f7b68c6b':'#a8bdc652',1+depth,[x,y],[x+length,y]);
  }
}

function paintOldTown(ctx,horizon) {
  const sky = ctx.createLinearGradient(0,0,0,horizon);
  sky.addColorStop(0,'#518bba');
  sky.addColorStop(1,'#c6e3df');
  rect(ctx,sky,0,0,width,height);
  rect(ctx,'#b3a098',0,horizon,width,height-horizon);
  const facades = ['#bb6a55','#e7b986','#dfc5a1','#9d6464','#ddb18c'];
  for (let i=0;i<12;i++) {
    const side = i < 6 ? -1 : 1;
    const depth = (i%6)/5;
    const houseWidth = width*(.085+depth*.05);
    const x = width*.51 + side*width*(.039+depth*.40) - houseWidth/2;
    const y = horizon-(.26+depth*.62)*horizon;
    const ground = horizon+(.016+depth*.38)*height;
    rect(ctx,facades[(i*3)%facades.length],x,y,houseWidth,ground-y);
    polygon(ctx,'#694e56',[x-2,y],[x+houseWidth*.49,y-houseWidth*.45],[x+houseWidth+2,y]);
    const windowSize = Math.max(2,houseWidth*.12);
    for (let floor = y+7;floor<ground-8;floor+=windowSize*2.45) {
      for (const offset of [.21,.59]) {
        rect(ctx,'#fce8be',x+offset*houseWidth-2,floor-1,windowSize+4,windowSize*1.24+2);
        rect(ctx,'#506575',x+offset*houseWidth,floor,windowSize,windowSize*1.24);
      }
    }
  }
  for (let row=0;row<17;row++) {
    const y = horizon+(height-horizon)*(row/16)**1.7;
    trace(ctx,'#83777b65',1,[0,y],[width,y]);
  }
}

function paintHarbour(ctx,horizon) {
  const sky = ctx.createLinearGradient(0,0,0,height);
  sky.addColorStop(0,'#172344');
  sky.addColorStop(.33,'#475796');
  sky.addColorStop(1,'#243456');
  rect(ctx,sky,0,0,width,height);
  oval(ctx,'#d8f0fd',width*.76,horizon*.30,horizon*.14,horizon*.14);
  for (let i=0;i<42;i++) {
    oval(ctx,'#e1eafa99',width*((i*37%97)/97),horizon*((i*29%59)/75),1,1);
  }
  const water = '#273f60';
  rect(ctx,water,0,horizon,width,height-horizon);
  for (let i=0;i<20;i++) {
    const x = width*i/19;
    const blockHeight = horizon*(.10+(i*17%7)*.043);
    rect(ctx,'#212d48',x,horizon-blockHeight,width*.057,blockHeight);
    rect(ctx,i%3===0?'#f5aa73':'#76d6d8',x+4,horizon-blockHeight*.66,3,2);
  }
  for (const x of [width*.17,width*.67]) {
    trace(ctx,'#1c2640',5,[x,horizon],[x,horizon*.40],[x+width*.16,horizon*.40]);
    trace(ctx,'#344b70',2,[x-width*.045,horizon*.45],[x,horizon*.21],[x+width*.16,horizon*.40]);
    trace(ctx,'#4f6284',1,[x+width*.13,horizon*.40],[x+width*.13,horizon*.74]);
    oval(ctx,'#f99695',x,horizon*.22,2,2);
  }
  for (let i=0;i<49;i++) {
    const depth = (i*23%47)/47;
    const x = width*(i*31%71)/71;
    const y = horizon+depth*(height-horizon);
    trace(ctx,i%2===0?'#64dde351':'#fb9db75a',1+depth,[x,y],[x+5+depth*width*.075,y]);
  }
  for (const x of [width*.06,width*.88]) {
    polygon(ctx,'#344663',[x-16,height*.66],[x+10,height*.46],[x+43,height*.46],[x+60,height*.66]);
    trace(ctx,'#6bf1cd',2,[x-16,height*.66],[x+10,height*.46],[x+43,height*.46]);
  }
}

function resize() {
  width = stage.clientWidth;
  height = stage.clientHeight;
  pixelRatio = Math.min(2,window.devicePixelRatio || 1);
  canvas.width = width*pixelRatio;
  canvas.height = height*pixelRatio;
  paintSky();
  draw();
}

function projection(z, position) {
  const linear = Math.max(0, 1-z/sight);
  const depth = linear ** 2.05;
  const spread = width*.32;
  return {
    x:width*.51 + position*spread*(.06+.94*depth),
    y:height*(.32+.52*depth),
    scale:(Math.min(width,height)*.116)*(.085+.915*depth)
  };
}

function floorPoint(z, position) {
  const point = projection(z,position);
  return [point.x,point.y];
}

function pavement() {
  const route = (level-1) % backgrounds.length;
  const shoulder = ['#85717a','#a79992','#545777'][route];
  const road = ['#524e5e','#64545a','#3c425e'][route];
  const edge = ['#f8bc8b','#ffe5ac','#68cdbd'][route];
  const farLeft = floorPoint(sight,-1.69), farRight = floorPoint(sight,1.69);
  const nearLeft = floorPoint(-180,-1.69), nearRight = floorPoint(-180,1.69);
  polygon(context,shoulder,farLeft,farRight,nearRight,nearLeft);
  polygon(context,road,floorPoint(sight,-1.5),floorPoint(sight,1.5),floorPoint(-180,1.5),floorPoint(-180,-1.5));
  for (let z = sight-(distance%54); z > -145; z -= 54) {
    for (const side of [-1,1]) {
      polygon(context,'#f3d2ad9a',floorPoint(z,side*.515),floorPoint(z,side*.485),floorPoint(z-23,side*.485),floorPoint(z-23,side*.515));
    }
  }
  for (const side of [-1,1]) {
    trace(context,edge,2,floorPoint(sight,side*1.52),floorPoint(-180,side*1.52));
  }
  for (let z = sight-(distance%66); z > -145; z -= 66) {
    const p = projection(z,-1.76);
    trace(context,'#38394d',Math.max(1,p.scale*.055),[p.x,p.y],[p.x,p.y-p.scale*.64]);
    const q = projection(z+66,-1.76);
    trace(context,'#656174',Math.max(1,p.scale*.038),[p.x,p.y-p.scale*.58],[q.x,q.y-q.scale*.58]);
  }
  for (let z = sight-(distance%160); z > -125; z -= 160) {
    const p = projection(z,1.77);
    trace(context,'#323243',Math.max(1,p.scale*.06),[p.x,p.y],[p.x,p.y-p.scale*1.61],[p.x-p.scale*.23,p.y-p.scale*1.61]);
    oval(context,'#ffdb91',p.x-p.scale*.24,p.y-p.scale*1.57,p.scale*.14,p.scale*.067);
  }
}

function drawObject(object) {
  const p = projection(object.at-distance,object.lane);
  const s = p.scale;
  context.save();
  context.translate(p.x,p.y);
  context.scale(s,s);
  if (object.kind === 'coin') {
    const spin = .23 + Math.abs(Math.cos(elapsed*8+object.at*.012))*.20;
    oval(context,'#2b263669',0,0,.39,.085);
    oval(context,'#75421f',0,-.62,spin+.045,.41);
    oval(context,'#ffcd58',0,-.65,spin,.38);
    oval(context,'#f6a739',0,-.65,spin*.68,.27);
    polygon(context,'#fff1a8',[0,-.83],[spin*.45,-.65],[0,-.47],[-spin*.45,-.65]);
  } else if (object.kind === 'gate') {
    oval(context,'#29273886',0,-.015,.88,.13);
    for (const side of [-1,1]) {
      rect(context,'#2f343c',side*.77-.045,-1.51,.09,1.51);
      rect(context,'#d0ded6',side*.77-.115,-.095,.23,.09);
    }
    rect(context,'#29293c',-.88,-1.58,1.76,.37);
    rect(context,'#6bedd2',-.86,-1.55,1.72,.28);
    for (const x of [-.65,-.32,.01,.34,.67]) {
      polygon(context,'#247a78',[x-.1,-1.49],[x-.02,-1.49],[x+.085,-1.36],[x+.01,-1.36]);
    }
  } else if (object.kind === 'barrier') {
    oval(context,'#29273886',0,-.025,.78,.13);
    rect(context,'#4d3339',-.73,-.44,.11,.44);
    rect(context,'#4d3339',.62,-.44,.11,.44);
    rect(context,'#a44333',-.76,-.54,1.52,.33);
    rect(context,'#ff9860',-.76,-.59,1.52,.29);
    for (const x of [-.52,-.12,.28]) {
      polygon(context,'#fff0ce',[x-.14,-.33],[x,-.56],[x+.15,-.56],[x+.01,-.33]);
    }
  } else {
    oval(context,'#29273886',0,-.02,.77,.13);
    rect(context,'#794b61',-.62,-1.08,1.24,1.08);
    polygon(context,'#b7697e',[-.62,-1.08],[-.43,-1.25],[.75,-1.25],[.62,-1.08]);
    polygon(context,'#563747',[.62,-1.08],[.75,-1.25],[.75,-.16],[.62,0]);
    trace(context,'#ec9c99',.11,[-.49,-.92],[.48,-.15]);
    trace(context,'#ec9c99',.11,[.49,-.92],[-.48,-.15]);
  }
  context.restore();
}

function drawRider() {
  const p = projection(0,riderLane);
  const s = p.scale;
  const lift = jump ? Math.sin(Math.PI * jump/.78)*s*1.21 : 0;
  const lean = (lane-riderLane)*.27;
  const crouching = duck > 0;
  oval(context,'#1d203080',p.x,p.y+2,s*.66,s*.175);
  context.save();
  context.translate(p.x,p.y-lift);
  context.scale(s,s);
  context.rotate(lean);
  for (const x of [-.45,.39]) oval(context,'#191c29',x,.012,.12,.145);
  trace(context,'#f6b357',.105,[-.67,-.17],[-.54,-.105],[.46,-.105],[.63,-.19]);
  trace(context,'#35504b',.21,[-.17,crouching?-.59:-.83],[-.49,-.46],[-.42,-.23]);
  trace(context,'#4d6252',.22,[.17,crouching?-.54:-.8],[.40,-.43],[.24,-.22]);
  trace(context,'#f0e4ce',.12,[-.53,-.19],[-.33,-.19]);
  trace(context,'#f0e4ce',.12,[.21,-.19],[.43,-.19]);
  const body = crouching ? -.67 : -1.02;
  const bob = Math.sin(elapsed*14)*.035;
  trace(context,'#536e60',.17,[-.24,body-.15],[-.48,body-.01],[-.57,body+.14]);
  trace(context,'#415d56',.17,[.25,body-.11],[.48,body+.07],[.62,body+.01]);
  oval(context,'#263e3d',0,body,.34,.38);
  oval(context,'#47655a',0,body-.03,.29,.35);
  oval(context,'#6d8271',.03,body-.23,.23,.14);
  oval(context,'#ca8b66',.06,body-.43+bob,.19,.231);
  oval(context,'#302633',.024,body-.52+bob,.21,.164);
  trace(context,'#544049',.04,[-.12,body-.62+bob],[.02,body-.67+bob],[.15,body-.61+bob]);
  context.restore();
}

function draw() {
  context.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  context.drawImage(scenery,0,0,width,height);
  pavement();
  for (const object of [...objects].sort((a,b)=>b.at-a.at)) {
    if (object.at-distance < sight) drawObject(object);
  }
  drawRider();
}

function frame(now) {
  let dt = Math.max(0,(now-lastFrame)/1000);
  lastFrame = now;
  if (state === 'interlude' && !document.hidden) {
    advanceInterlude(dt);
  } else if (state === 'running' && !document.hidden) {
    while (dt > 0 && state === 'running') {
      const slice = Math.min(dt,.04);
      step(slice);
      dt -= slice;
    }
    draw();
  }
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange',() => { lastFrame = performance.now(); });
new ResizeObserver(resize).observe(stage);
resize();
updateHud();
requestAnimationFrame(frame);
