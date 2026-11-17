
const get = id => document.getElementById(id);
const scope = get('scope'), slider = get('freq'), button = get('audio');
let context, oscillator, gain, table;
function draw() {
  if (!table) return;
  const [requested, register, actual] = table[Number(slider.value) - 50];
  get('request').value = requested + ' Hz';
  get('actual').value = 'Timer output: ' + actual.toFixed(2) + ' Hz';
  get('register').value = 'OCR1A: ' + register;
  if (oscillator) oscillator.frequency.setTargetAtTime(actual, context.currentTime, .025);
  const width = scope.clientWidth, height = scope.clientHeight, dpr = Math.min(3, devicePixelRatio);
  scope.width = Math.round(width * dpr); scope.height = Math.round(height * dpr);
  const ctx = scope.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.strokeStyle='#384328';
  for(let i=0;i<=10;i++){const x=i*width/10;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
  ctx.strokeStyle='#81995a';
  for(const y of [height*.29,height*.7]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
  ctx.beginPath();
  const halfPeriod = width / (.04 * actual);
  let x = 0, y = height*.29;
  ctx.moveTo(0,y);
  while(x<width){x+=halfPeriod;ctx.lineTo(Math.min(x,width),y);if(x<width){y=y<height/2?height*.7:height*.29;ctx.lineTo(x,y);}}
  ctx.shadowBlur=12;ctx.shadowColor='#cafd72';ctx.strokeStyle='#dffa99';ctx.lineWidth=2;ctx.stroke();
  ctx.shadowBlur=0;ctx.font='12px monospace';ctx.fillStyle='#eaffba';ctx.fillText('PB2   20 ms window',14,height-16);
}
function stop() {
  if(oscillator){const old=oscillator;gain.gain.setTargetAtTime(0,context.currentTime,.01);old.stop(context.currentTime+.05);oscillator=null;}
  button.textContent='Listen';button.setAttribute('aria-pressed','false');
}
button.onclick=async()=>{
  if(oscillator){stop();return;}
  try{
    context ??= new AudioContext();
    await context.resume();
    if(oscillator)return;
    gain=context.createGain();gain.gain.value=.025;
    oscillator=context.createOscillator();oscillator.type='square';
    oscillator.connect(gain).connect(context.destination);
    draw();oscillator.start();button.textContent='Stop audio';button.setAttribute('aria-pressed','true');
  }catch{get('actual').value='Audio preview unavailable';}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
slider.oninput=draw;
new ResizeObserver(draw).observe(scope);
try{
  const response=await fetch('samples.json');
  if(!response.ok)throw Error('Samples unavailable');
  table=await response.json();button.disabled=false;draw();
}catch{get('actual').value='Run data unavailable';}
