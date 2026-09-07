const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const TS=16, MAP_W=20, MAP_H=20, WORLD_W=MAP_W*TS, WORLD_H=MAP_H*TS;
let scale=3, area='outside', map, interior;
let player={x:10*TS+8,y:16*TS+8,dir:'up',moving:false};
let keys=new Set(), last=performance.now(), walkTime=0, camera={x:0,y:0};
const idleImg=new Image(),walkImg=new Image(),houseImg=new Image(),grassImg=new Image();
idleImg.src='assets/orc3_idle.png'; walkImg.src='assets/orc3_walk.png'; houseImg.src='assets/house.png'; grassImg.src='assets/ground_grass_details.png';

Promise.all([
 fetch('map.json').then(r=>r.json()).then(x=>map=x),
 fetch('interior.json').then(r=>r.json()).then(x=>interior=x),
 new Promise(r=>houseImg.onload=r), new Promise(r=>idleImg.onload=r), new Promise(r=>walkImg.onload=r)
]).then(()=>requestAnimationFrame(loop));

function resize(){
  const rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(320,Math.round(rect.width/2));
  canvas.height=Math.max(180,Math.round(rect.height/2));
}
addEventListener('resize',resize); resize();

const dirRow={down:0,up:1,left:2,right:3};
function setKey(e,on){
  const k=e.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e'].includes(k)){
    e.preventDefault(); on?keys.add(k):keys.delete(k);
  }
}
addEventListener('keydown',e=>{setKey(e,true);if(e.key.toLowerCase()==='e')tryDoor()});
addEventListener('keyup',e=>setKey(e,false));

document.querySelectorAll('[data-dir]').forEach(b=>{
  const d=b.dataset.dir, down=e=>{e.preventDefault();keys.add(d==='up'?'w':d==='down'?'s':d==='left'?'a':'d')},
        up=e=>{e.preventDefault();keys.delete(d==='up'?'w':d==='down'?'s':d==='left'?'a':'d')};
  b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up);
});
document.getElementById('enterBtn').addEventListener('pointerdown',e=>{e.preventDefault();tryDoor()});

function blockedAt(px,py){
  const gx=Math.floor(px/TS),gy=Math.floor(py/TS);
  if(gx<0||gy<0||gx>=MAP_W||gy>=MAP_H)return true;
  const arr=area==='outside'?map.blocked:interior.blocked;
  return arr.some(b=>b.x===gx&&b.y===gy);
}
function move(dx,dy){
  const len=Math.hypot(dx,dy)||1;
  dx/=len;dy/=len;
  // Try axes separately: no faster diagonal movement and no corner clipping.
  const speed=48, dt=(performance.now()-last)/1000;
  const nx=player.x+dx*speed*dt, ny=player.y+dy*speed*dt;
  if(!blockedAt(nx-7,player.y-7)&&!blockedAt(nx+7,player.y-7)&&!blockedAt(nx-7,player.y+7)&&!blockedAt(nx+7,player.y+7))player.x=nx;
  if(!blockedAt(player.x-7,ny-7)&&!blockedAt(player.x+7,ny-7)&&!blockedAt(player.x-7,ny+7)&&!blockedAt(player.x+7,ny+7))player.y=ny;
}
function update(){
  const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  const dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  player.moving=!!(dx||dy);
  if(player.moving){
    if(Math.abs(dx)>Math.abs(dy))player.dir=dx>0?'right':'left'; else player.dir=dy>0?'down':'up';
    move(dx,dy); walkTime+=performance.now()-last;
  } else walkTime=0;
  // Keep player inside the 20x20 map.
  player.x=Math.max(TS+8,Math.min(WORLD_W-TS-8,player.x));
  player.y=Math.max(TS+8,Math.min(WORLD_H-TS-8,player.y));
}
function drawGrass(){
  ctx.fillStyle='#5b8d43';ctx.fillRect(0,0,WORLD_W,WORLD_H);
  // Use supplied grass-details tiles as real map decoration.
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    if((x*7+y*11)%9===0){
      const sx=((x+y)%10)*16, sy=64+((x*3+y)%10)*16;
      ctx.drawImage(grassImg,sx,sy,16,16,x*TS,y*TS,TS,TS);
    }
  }
  map.tiles.forEach((row,y)=>[...row].forEach((t,x)=>{if(t==='P'){ctx.fillStyle='#b89562';ctx.fillRect(x*TS,y*TS,TS,TS);ctx.fillStyle='#c9aa74';ctx.fillRect(x*TS+2,y*TS+6,12,4)}}));
}
function drawTrees(){
  // Pixel-art temporary trees made from the supplied foliage sheet.
  const spots=map.decor.filter(d=>d.type==='tree');
  for(const s of spots){
    ctx.fillStyle='#68472f';ctx.fillRect(s.x*TS+6,s.y*TS+9,5,9);
    ctx.fillStyle='#1d6b3b';ctx.beginPath();ctx.arc(s.x*TS+8,s.y*TS+7,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3b9650';ctx.beginPath();ctx.arc(s.x*TS+5,s.y*TS+5,5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(s.x*TS+12,s.y*TS+4,5,0,Math.PI*2);ctx.fill();
  }
}
function drawHouse(){
  const d=map.decor.find(x=>x.type==='house');
  // 145x130 supplied house, centered on the 9x8-ish tile footprint.
  ctx.drawImage(houseImg,d.x*TS-2,d.y*TS-2,145,130);
  // Door interaction marker.
  const px=map.door.x*TS+8,py=map.door.y*TS+8;
  ctx.fillStyle='#fff';ctx.globalAlpha=.7;
  ctx.fillRect(px-1,py-1,2,2);ctx.globalAlpha=1;
}
function drawInterior(){
  ctx.fillStyle='#8d6b55';ctx.fillRect(0,0,WORLD_W,WORLD_H);
  ctx.fillStyle='#6c4b3a';ctx.fillRect(2*TS,2*TS,16*TS,16*TS);
  for(let y=2;y<18;y++)for(let x=2;x<18;x++){
    ctx.fillStyle=((x+y)%2?'#9b765c':'#a78365');ctx.fillRect(x*TS,y*TS,TS,TS);
  }
  ctx.fillStyle='#4c352b';ctx.fillRect(0,0,WORLD_W,2*TS);ctx.fillRect(0,18*TS,WORLD_W,2*TS);
  ctx.fillStyle='#4c352b';ctx.fillRect(0,0,2*TS,WORLD_H);ctx.fillRect(18*TS,0,2*TS,WORLD_H);
  // Furniture-style blocks using the supplied interior palette.
  ctx.fillStyle='#68422f';ctx.fillRect(4*TS,4*TS,5*TS,2*TS);
  ctx.fillStyle='#7f5339';ctx.fillRect(12*TS,4*TS,3*TS,2*TS);
  ctx.fillStyle='#70452f';ctx.fillRect(5*TS,12*TS,3*TS,2*TS);
  ctx.fillStyle='#80533b';ctx.fillRect(12*TS,11*TS,4*TS,3*TS);
  ctx.fillStyle='#d2b080';ctx.fillRect(9*TS,8*TS,3*TS,3*TS);
  ctx.fillStyle='#fff';ctx.globalAlpha=.6;ctx.fillRect(interior.exit.x*TS+4,interior.exit.y*TS+4,8,8);ctx.globalAlpha=1;
}
function drawPlayer(){
  const img=player.moving?walkImg:idleImg;
  const frames=player.moving?6:4, frame=Math.floor(walkTime/(player.moving?105:200))%frames;
  const row=dirRow[player.dir];
  ctx.drawImage(img,frame*64,row*64,64,64,player.x-16,player.y-16,32,32);
}
function tryDoor(){
  if(area==='outside'){
    const d=map.door;
    const gx=Math.floor(player.x/TS),gy=Math.floor(player.y/TS);
    if(Math.abs(gx-d.x)<=1&&Math.abs(gy-d.y)<=1){
      area='inside';player.x=interior.spawn.x*TS+8;player.y=interior.spawn.y*TS+8;player.dir='up';
    }
  }else{
    const e=interior.exit,gx=Math.floor(player.x/TS),gy=Math.floor(player.y/TS);
    if(Math.abs(gx-e.x)<=1&&Math.abs(gy-e.y)<=1){
      area='outside';player.x=map.door.x*TS+8;player.y=(map.door.y+1)*TS+8;player.dir='down';
    }
  }
}
function draw(){
  ctx.save();
  const vw=canvas.width, vh=canvas.height;
  const zoom=Math.min(vw/WORLD_W,vh/WORLD_H)*.92;
  ctx.translate((vw-WORLD_W*zoom)/2,(vh-WORLD_H*zoom)/2);ctx.scale(zoom,zoom);
  if(area==='outside'){drawGrass();drawTrees();drawHouse()}else drawInterior();
  drawPlayer();
  ctx.restore();
  document.getElementById('area').textContent=area==='outside'?'Outside • 20×20':'House Interior • 20×20';
}
function loop(t){
  last=t; update(); draw(); requestAnimationFrame(loop);
}
