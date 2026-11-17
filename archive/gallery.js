(() => {
  let mounted;
  let pending;
  const featured = ['Inertia-Control-Studio', 'circuit-lab', 'smart-hospital-bed',
    'hypersim-simulink-distribution', 'microgrid-prototype', 'bluetooth-hid', 'telegram-bot', 'MasterThesis2026'];
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
      const response = await fetch('/archive/projects.json');
      if (!response.ok) throw Error('Project data unavailable');
      const data = await response.json();
      if (!anchor.isConnected || pending !== anchor) return;
      const bySlug = new Map(data.map(project => [project.slug, project]));
      const records = [...featured.map(slug => bySlug.get(slug)).filter(Boolean),
        ...data.filter(project => !featured.includes(project.slug))];
      const section = element('section', 'section shell archive-section');
      section.id = 'project-archive';
      section.setAttribute('aria-labelledby', 'portfolio-project-heading');
      section.innerHTML = '<div class="section-heading"><h2 id="portfolio-project-heading">Projects.</h2><span class="archive-count" role="status"></span></div><div class="archive-tools"><label>Find a project<input type="search" placeholder="Search projects, tools, or topics"></label><label>Field<select><option value="">All fields</option></select></label></div><div class="archive-grid"></div><button class="button archive-more" type="button">Show all projects</button>';
      const input = section.querySelector('input');
      const category = section.querySelector('select');
      const grid = section.querySelector('.archive-grid');
      const more = section.querySelector('.archive-more');
      for (const name of [...new Set(records.map(project => project.category))].sort()) {
        category.add(new Option(name, name));
      }
      let expanded = false;
      const render = () => {
        const query = input.value.trim().toLowerCase();
        const matches = records.filter(project =>
          (!category.value || project.category === category.value) &&
          [project.title, project.purpose, ...project.stack, project.status].join(' ').toLowerCase().includes(query));
        const visible = expanded || query || category.value ? matches : matches.slice(0, 8);
        grid.replaceChildren();
        for (const project of visible) {
          const card = element('article', 'archive-card');
          const img = element('img');
          img.src = project.banner || project.image || (project.details ? '/singularity-fallback.webp' : '/atelier/visuals/' + project.slug + '.svg');
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          card.append(img, element('span', 'archive-meta', project.category + ' / ' + project.status),
            element('h3', '', project.title), element('p', '', project.purpose),
            element('span', 'archive-stack', project.stack.slice(0, 3).join(' / ')));
          const actions = element('div', 'archive-actions');
          actions.append(link('button primary', 'Open demo', project.demo || '/apps/project-demo/?project=' + encodeURIComponent(project.slug)),
            link('button', 'Project details', project.details || '/work/' + encodeURIComponent(project.slug) + '/'));
          for (const action of actions.children) action.setAttribute('aria-label', action.textContent + ' for ' + project.title);
          card.append(actions);
          grid.append(card);
        }
        if (!matches.length) grid.append(element('p', '', 'No matching projects.'));
        section.querySelector('.archive-count').textContent = matches.length + (matches.length === 1 ? ' project' : ' projects');
        more.hidden = Boolean(expanded || query || category.value || matches.length <= 8);
      };
      input.addEventListener('input', render);
      category.addEventListener('change', render);
      more.addEventListener('click', () => {
        expanded = true;
        render();
        grid.children[8]?.querySelector('a')?.focus();
      });
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


