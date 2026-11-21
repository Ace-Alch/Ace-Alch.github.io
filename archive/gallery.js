(() => {
  let mounted;
  let pending;
  const element = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text) item.textContent = text;
    return item;
  };
  const link = (className, label, href) => {
    const item = element('a', className, label);
    item.href = href;
    return item;
  };
  const scrollToProjects = () => {
    if (['#projects', '#project-archive', '#selected'].includes(location.hash)) {
      document.getElementById('projects')?.scrollIntoView();
    }
  };
  const mount = async () => {
    if (!document.documentElement.hasAttribute('data-motion')) return;
    const anchor = document.querySelector('main.portfolio-minimal #projects');
    if (!anchor || anchor === mounted || anchor === pending) return;
    pending = anchor;
    try {
      const response = await fetch('/archive/projects.json?v=engineering');
      if (!response.ok) throw Error('Project data unavailable');
      const records = await response.json();
      if (!anchor.isConnected || pending !== anchor) return;
      const section = element('section', 'section shell archive-section');
      section.id = 'project-archive';
      section.setAttribute('aria-labelledby', 'portfolio-project-heading');
      section.innerHTML = '<div class="section-heading"><h2 id="portfolio-project-heading">Engineering projects</h2><span class="archive-count" role="status"></span></div><div class="archive-tools"><label>Search projects<input type="search" placeholder="Project, tool, or topic"></label><label>Discipline<select><option value="">All disciplines</option></select></label><label>Material<select data-material><option value="">All formats</option><option value="demo">Demos and examples</option><option value="case">Case studies</option></select></label></div><div class="archive-grid"></div>';
      const input = section.querySelector('input');
      const category = section.querySelector('select');
      const material = section.querySelector('[data-material]');
      const grid = section.querySelector('.archive-grid');
      for (const name of [...new Set(records.map(project => project.category))].sort()) {
        category.add(new Option(name, name));
      }
      const render = () => {
        const query = input.value.trim().toLowerCase();
        const matches = records.filter(project =>
          (!category.value || project.category === category.value) &&
          (!material.value || Boolean(project.demo) === (material.value === 'demo')) &&
          [project.title, project.purpose, ...project.stack, project.status, project.presentation.headline].join(' ').toLowerCase().includes(query));
        grid.replaceChildren();
        for (const project of matches) {
          const card = element('article', 'archive-card');
          const presentation = project.presentation;
          card.dataset.presentation = presentation.style;
          const img = element('img');
          img.src = project.banner || project.image || (project.details ? '/singularity-fallback.webp' : '/atelier/visuals/' + project.slug + '.svg');
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          card.append(img, element('span', 'archive-meta', project.status + ' / ' + presentation.name),
            element('h3', '', project.title), element('p', '', presentation.headline),
            element('span', 'archive-stack', project.stack.slice(0, 3).join(' / ')));
          const actions = element('div', 'archive-actions');
          const details = project.details || '/work/' + encodeURIComponent(project.slug) + '/';
          actions.append(link('button primary', presentation.label, project.demo || details));
          if (project.demo) actions.append(link('button', 'Project details', details));
          for (const action of actions.children) action.setAttribute('aria-label', action.textContent + ' for ' + project.title);
          card.append(actions);
          grid.append(card);
        }
        if (!matches.length) grid.append(element('p', '', 'No matching projects.'));
        section.querySelector('.archive-count').textContent = matches.length + (matches.length === 1 ? ' project' : ' projects');
      };
      input.addEventListener('input', render);
      category.addEventListener('change', render);
      material.addEventListener('change', render);
      render();
      anchor.after(section);
      mounted = anchor;
      anchor.classList.add('project-catalog-anchor');
      scrollToProjects();
    } catch (error) {
      console.warn('Could not load the project catalog.', error);
    } finally {
      if (pending === anchor) pending = null;
    }
  };
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      mount();
    });
  });
  observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-motion']});
  window.addEventListener('hashchange', scrollToProjects);
  mount();
})();


