
const get = id => document.getElementById(id);
const slider=get('time'), play=get('play'), select=get('case');
let cases, frame=0, start;
function surface(canvas) {
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(3,devicePixelRatio);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);return {ctx,w,h};
}
function draw(){
  if(!cases)return;
  const data=cases[select.selectedIndex], index=Number(slider.value),[time,target,position,pins]=data[index];
  const angle=position*360/400;
  const rot=surface(get('dial')),ctx=rot.ctx,cx=rot.w/2,cy=rot.h/2,r=Math.min(rot.w,rot.h)*.34;
  ctx.strokeStyle='#d2f9b9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<40;i++){const a=i/40*Math.PI*2;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(a)*(r+7),cy+Math.sin(a)*(r+7));ctx.stroke();}
  const rad=(angle-90)*Math.PI/180;ctx.strokeStyle='#f6b264';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(rad)*r*.85,cy+Math.sin(rad)*r*.85);ctx.stroke();
  get('coils').replaceChildren(...[...pins].map((v,i)=>{const el=document.createElement('span');el.className=v==='1'?'on':'';el.textContent='IN'+(i+1)+': '+v;return el;}));
  get('angle').value=angle.toFixed(1)+'\u00b0 commanded';
  const plot=surface(get('trace')),p=plot.ctx,L=35,B=plot.h-27;
  const scale=10**Math.floor(Math.log10(Math.max(1,...data.flatMap(r=>[Math.abs(r[1]),Math.abs(r[2])]))));
  const min=Math.floor(Math.min(0,...data.map(r=>r[2]))/scale)*scale;
  const max=Math.ceil(Math.max(...data.flatMap(r=>[r[1],r[2]]))/scale)*scale;
  const x=t=>L+(plot.w-L-10)*t/data.at(-1)[0], y=v=>B-(B-10)*(v-min)/(max-min);
  p.font='11px system-ui';p.fillStyle='#294e42';p.strokeStyle='#d4e0da';
  for(let i=0;i<=4;i++){const v=min+i*(max-min)/4,Y=y(v);p.fillText(Math.round(v),0,Y+4);p.beginPath();p.moveTo(L,Y);p.lineTo(plot.w-10,Y);p.stroke();}
  p.fillText((data.at(-1)[0]/1e6).toFixed(2)+' s',Math.max(L,plot.w-50),plot.h-4);
  for(const [column,color,dash] of [[1,'#b35b15',[5,5]],[2,'#166347',[]]]){
    p.beginPath();p.lineWidth=2;p.strokeStyle=color;p.setLineDash(dash);
    data.forEach((row,i)=>i?p.lineTo(x(row[0]),y(row[column])):p.moveTo(x(row[0]),y(row[column])));p.stroke();
  }
  p.setLineDash([]);p.strokeStyle='#162d29';p.lineWidth=1;p.beginPath();p.moveTo(x(time),10);p.lineTo(x(time),B);p.stroke();
  get('sample').value=(time/1e6).toFixed(3)+' s | Target '+target+' steps | Position '+position+' steps';
}
function stop(){cancelAnimationFrame(frame);frame=0;play.textContent='Play trace';}
play.onclick=()=>{
  if(frame){stop();return;}
  if(Number(slider.value)>=Number(slider.max))slider.value=0;
  const rows=cases[select.selectedIndex], offset=rows[Number(slider.value)][0];
  start=performance.now();play.textContent='Pause';
  function tick(now){
    const elapsed=(now-start)*1000+offset;
    const next=rows.findLastIndex(row=>row[0]<=elapsed);
    if(next!==Number(slider.value)){slider.value=next;draw();}
    if(next>=rows.length-1)stop();else frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);
};
slider.oninput=()=>{stop();draw();};select.onchange=()=>{stop();slider.value=0;draw();};
new ResizeObserver(draw).observe(get('trace'));new ResizeObserver(draw).observe(get('dial'));
try{
  const response=await fetch('runs.json');
  if(!response.ok)throw Error('Run unavailable');
  cases=await response.json();slider.disabled=play.disabled=false;draw();
}catch{get('sample').value='Run data unavailable';}
