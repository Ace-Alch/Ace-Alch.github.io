(() => {
  'use strict';
  const root=document.documentElement;
  root.classList.add('js');
  document.querySelectorAll('img[data-fallback]').forEach(image=>{image.addEventListener('error',()=>{if(image.dataset.fallback){const fallback=image.dataset.fallback;delete image.dataset.fallback;image.src=fallback;}},{once:true});});
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=media.matches;
  try {paused=paused||localStorage.getItem('mm-motion')==='paused';}catch{}
  const toggle=document.querySelector('[data-motion]');
  const canvas=document.querySelector('#field');
  const ctx=canvas?.getContext('2d');
  let width=0,height=0,dpr=1,frame=0,visible=!document.hidden,last=0;
  const points=Array.from({length:55},(_,i)=>({x:(Math.sin(i*127.1)*43758.5453)%1,y:(Math.sin(i*311.7)*23658.132)%1,r:i%7===0?1.5:.7}));
  function resize(){if(!canvas||!ctx)return;dpr=Math.min(devicePixelRatio||1,1.5);width=innerWidth;height=innerHeight;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw(0);}
  function draw(time){if(!ctx)return;ctx.clearRect(0,0,width,height);const t=time*.00004;
    for(let i=0;i<points.length;i++){const p=points[i],x=((Math.abs(p.x)*width+Math.sin(t+i)*12)%width),y=((Math.abs(p.y)*height+t*6*(1+i%3))%height);ctx.beginPath();ctx.arc(x,y,p.r,0,Math.PI*2);ctx.fillStyle=i%9===0?'#b1e7cf99':'#b5c8cf55';ctx.fill();if(i%5===0&&width>650){const q=points[(i+8)%points.length],qx=Math.abs(q.x)*width,qy=Math.abs(q.y)*height;if(Math.hypot(x-qx,y-qy)<width*.22){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(qx,qy);ctx.strokeStyle='#b1e7cf0c';ctx.lineWidth=.7;ctx.stroke();}}}}
  function animate(time){frame=0;if(paused||!visible)return;if(time-last>40){draw(time);last=time;}frame=requestAnimationFrame(animate);}
  function syncMotion(){root.classList.toggle('motion-off',paused);if(toggle){toggle.textContent=paused?'? Motion off':'? Pause motion';toggle.setAttribute('aria-pressed',String(paused));}if(frame)cancelAnimationFrame(frame);frame=0;if(!paused&&visible&&ctx)frame=requestAnimationFrame(animate);else draw(0);}
  toggle?.addEventListener('click',()=>{paused=!paused;try{localStorage.setItem('mm-motion',paused?'paused':'running');}catch{}syncMotion();});
  media.addEventListener('change',()=>{paused=media.matches;syncMotion();});
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;syncMotion();});
  addEventListener('resize',resize,{passive:true});resize();syncMotion();
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}},{threshold:.08,rootMargin:'0px 0px -20px 0px'}):null;
  document.querySelectorAll('.reveal').forEach(el=>observer?observer.observe(el):el.classList.add('visible'));
  let scrollQueued=false;
  function scroll(){scrollQueued=false;const max=document.documentElement.scrollHeight-innerHeight;root.style.setProperty('--progress',max>0?scrollY/max:0);root.style.setProperty('--scroll',paused?0:Math.min(scrollY,1200));document.body.classList.toggle('scrolled',scrollY>650);}
  addEventListener('scroll',()=>{if(!scrollQueued){scrollQueued=true;requestAnimationFrame(scroll);}},{passive:true});scroll();
  const search=document.querySelector('[data-search]'),filters=[...document.querySelectorAll('[data-filter]')],rows=[...document.querySelectorAll('[data-project-row]')],count=document.querySelector('[data-result-count]'),empty=document.querySelector('[data-empty]');
  let category='all';
  function filter(){let n=0;const q=search?.value.trim().toLowerCase()||'';for(const row of rows){const show=(category==='all'||row.dataset.category===category)&&row.dataset.search.includes(q);row.hidden=!show;if(show)n++;}if(count)count.textContent=String(n).padStart(2,'0')+' PROJECT'+(n===1?'':'S');if(empty)empty.hidden=n>0;}
  filters.forEach(button=>button.addEventListener('click',()=>{category=button.dataset.filter;filters.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filter();}));search?.addEventListener('input',filter);
  const shortcutMap={'/':'[data-search]'};document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){const input=document.querySelector(shortcutMap['/']);if(input){event.preventDefault();input.focus();}}});
})();


(() => {
  const match = location.pathname.match(/^\/work\/([^/]+)\/?$/);
  const hero = document.querySelector('.story-hero');
  const firstSection = document.querySelector('.story-section');
  const links = hero?.querySelector('.story-links');
  if (!match || !links || !firstSection) return;

  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  async function renderProject() {
    const response = await fetch('/archive/projects.json?v=folio');
    if (!response.ok) return;
    const records = await response.json();
    const project = records.find(record => record.slug === decodeURIComponent(match[1]));
    if (!project?.presentation) return;
    const {style, name, headline, focus, label} = project.presentation;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/atelier/project-folios.css';
    document.head.append(css);

    const panel = element('section', '', 'project-folio');
    panel.dataset.presentation = style;
    panel.setAttribute('aria-labelledby', 'folio-headline');
    const context = element('div', '', 'folio-context');
    context.append(element('p', name, 'folio-type'));
    const title = element('h2', headline);
    title.id = 'folio-headline';
    context.append(title, element('p', focus, 'folio-focus'));

    const inventory = element('ol', '', 'folio-inventory');
    inventory.setAttribute('aria-label', style === 'drawing' ? 'Design elements' : 'Project components');
    project.components.forEach(component => inventory.append(element('li', component)));
    panel.append(context, inventory);

    const sections = [...document.querySelectorAll('.story-section')];
    const recordLinks = [...sections.at(-1).querySelectorAll('a[href]')].slice(0, 3);
    if (project.gaps?.length || recordLinks.length) {
      const evidence = element('details', '', 'folio-evidence');
      evidence.append(element('summary', 'Evidence and verification'));
      const originalContext = sections.at(-1).querySelector('.context-note');
      if (originalContext) evidence.append(element('p', originalContext.textContent));
      if (project.gaps?.length) {
        const list = element('ul');
        project.gaps.forEach(gap => list.append(element('li', gap)));
        evidence.append(list);
      }
      if (recordLinks.length) {
        const nav = element('div', '', 'folio-links');
        recordLinks.forEach(link => nav.append(link.cloneNode(true)));
        evidence.append(nav);
      }
      panel.append(evidence);
    }

    // Keep the original, server-rendered project record if the archive is unavailable.
    firstSection.before(panel);
    sections.forEach(section => { section.hidden = true; });
    hero.dataset.presentation = style;
    if (project.demo) {
      const action = element('a', label, 'pill primary folio-action');
      action.href = project.demo;
      for (const link of links.querySelectorAll('a.primary')) link.classList.remove('primary');
      links.prepend(action);
    }
    const nav = document.querySelector('.site-nav a[href="/#selected"]');
    if (nav) nav.href = '/#projects';
  }
  renderProject().catch(error => console.warn('Could not load this project folio.', error));
})();
