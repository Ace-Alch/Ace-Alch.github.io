
const get = id => document.getElementById(id), space=get('space'), slider=get('time'), button=get('play');
const colors=['#a9c9ff','#d3bcff','#ffcb92','#a4fbdf'];
const stars=Array.from({length:170},(_,i)=>[(i*271%997)/997,(i*i*97%991)/991, i%7===0?1.2:.55]);
let data, frame=0;
function draw(){
  if(!data)return;
  const width=space.clientWidth,height=space.clientHeight,dpr=Math.min(3,devicePixelRatio);
  const W=Math.round(width*dpr),H=Math.round(height*dpr);
  if(space.width!==W||space.height!==H){space.width=W;space.height=H;}
  const ctx=space.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  const cx=width/2,cy=height/2,zoom=Math.min(width,height)/780;
  const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(width,height)*.64);
  bg.addColorStop(0,'#50384c');bg.addColorStop(.25,'#182341');bg.addColorStop(1,'#060813');
  ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#a4b4cf';
  for(const [x,y,r] of stars){ctx.beginPath();ctx.arc(x*width,y*height,r,0,Math.PI*2);ctx.fill();}
  const index=Number(slider.value);
  for(let object=0;object<64;object++){
    const color=colors[object%colors.length];
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.globalAlpha=.45;ctx.lineWidth=1;
    ctx.beginPath();
    for(let k=Math.max(0,index-24);k<=index;k++){
      const loc=(k*64+object)*4;
      const x=cx+(data.getInt16(loc,true)/8-960)*zoom;
      const y=cy+(data.getInt16(loc+2,true)/8-512)*zoom;
      if(k===Math.max(0,index-24))ctx.moveTo(x,y);else ctx.lineTo(x,y);
      if(k===index){ctx.stroke();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,Math.max(1.4,zoom*2.5),0,Math.PI*2);ctx.fill();}
    }
  }
  ctx.shadowBlur=22;ctx.shadowColor='#faad74';ctx.fillStyle='#050611';
  ctx.beginPath();ctx.arc(cx,cy,6+zoom*4.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffbd8a';ctx.lineWidth=1.5;ctx.stroke();ctx.shadowBlur=0;
  get('frame').value='Frame '+index+' / 180';
}
function stop(){cancelAnimationFrame(frame);frame=0;button.textContent='Play';}
button.onclick=()=>{
  if(frame){stop();return;}
  const first=+slider.value===180?0:+slider.value,t0=performance.now();
  button.textContent='Pause';
  function tick(t){const i=Math.min(180,first+Math.floor((t-t0)*.024));
    if(i!==+slider.value){slider.value=i;draw();}
    if(i<180)frame=requestAnimationFrame(tick);else stop();
  }
  frame=requestAnimationFrame(tick);
};
slider.oninput=()=>{stop();draw();};
new ResizeObserver(draw).observe(space);
try{
  const parts=await Promise.all(['coordinates-a.json','coordinates-b.json'].map(async file=>{const response=await fetch(file);if(!response.ok)throw Error('Coordinates unavailable');return atob(await response.json());}));
  const raw=parts.join('');
  if(raw.length!==181*64*4)throw Error('Incomplete run');
  data=new DataView(Uint8Array.from(raw,x=>x.charCodeAt(0)).buffer);
  slider.disabled=button.disabled=false;draw();
}catch{get('frame').value='Run data unavailable';}
