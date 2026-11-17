import {models} from './models.js?v=2';
import {workflowExamples} from './examples.js?v=2';

const $ = id => document.getElementById(id);
const slug = new URLSearchParams(location.search).get('project');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const palette = ['#83eaf5', '#ffd584', '#e6abff'];

function plot(points, index, axes) {
  const canvas = $('plot');
  const {width, height} = canvas.getBoundingClientRect();
  const scale = Math.min(3, devicePixelRatio || 1);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const left = 62, right = width - 20, top = 39, bottom = height - 46;
  const low = Math.min(0, ...points.flatMap(point => point.slice(1)));
  const high = Math.max(low + 1e-6, ...points.flatMap(point => point.slice(1)));
  const end = points.at(-1)[0];
  const x = value => left + (right - left) * value / end;
  const y = value => bottom - (bottom - top) * (value - low) / (high - low);
  const number = new Intl.NumberFormat(undefined, {maximumSignificantDigits: 4});
  ctx.font = '12px system-ui';
  ctx.fillStyle = '#a9bad8';
  ctx.textAlign = 'left';
  ctx.fillText(axes[1], left, 22);
  ctx.textAlign = 'center';
  ctx.fillText(axes[0], (left + right) / 2, height - 9);
  ctx.strokeStyle = '#26334e';
  for (let tick = 0; tick <= 4; tick++) {
    const fraction = tick / 4;
    const lineY = top + (bottom - top) * fraction;
    const lineX = left + (right - left) * fraction;
    ctx.beginPath();
    ctx.moveTo(left, lineY);
    ctx.lineTo(right, lineY);
    ctx.moveTo(lineX, top);
    ctx.lineTo(lineX, bottom);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(number.format(high - (high - low) * fraction), left - 7, lineY + 4);
    ctx.textAlign = 'center';
    ctx.fillText(number.format(end * fraction), lineX, bottom + 17);
  }
  for (let series = 1; series < points[0].length; series++) {
    ctx.strokeStyle = palette[series - 1];
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.setLineDash(series === 1 ? [] : [5, 5]);
    ctx.beginPath();
    for (let i = 0; i <= index; i++) {
      const [horizontal] = points[i];
      if (i === 0) ctx.moveTo(x(horizontal), y(points[i][series]));
      else ctx.lineTo(x(horizontal), y(points[i][series]));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x(points[index][0]), y(points[index][series]), 4.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function start(project) {
  document.title = project.title + ' | Interactive demo';
  $('title').textContent = project.title;
  $('purpose').textContent = project.purpose;
  $('details').href = '/work/' + encodeURIComponent(slug) + '/';
  $('details').hidden = false;
  const model = Object.hasOwn(models, slug) ? models[slug] : null;
  $('type').textContent = model ? 'Illustrative model' : 'Workflow walkthrough';
  $('context').textContent = model?.context ||
    'Select a step to explore the project components in order. The sequence illustrates the project scope.';
  $('lab').hidden = false;
  let index = 0, frame = 0, points = [], started;
  const sliders = [];
  const steps = [];
  if (model) {
    $('plot').hidden = false;
    for (const [name, min, max, step, initial] of model.inputs) {
      const label = document.createElement('label');
      const caption = document.createElement('span');
      const input = document.createElement('input');
      Object.assign(input, {type: 'range', min, max, step, value: initial});
      label.append(caption, input);
      $('inputs').append(label);
      sliders.push({name, caption, input, initial});
      input.addEventListener('input', () => {
        pause();
        compute();
        index = points.length - 1;
        render();
      });
    }
  } else {
    $('cover').src = project.banner || '/atelier/visuals/' + slug + '.svg';
    $('cover').hidden = false;
    $('flow').hidden = false;
    for (const [i, name] of project.components.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.onclick = () => { pause(); index = i; render(); };
      $('flow').append(button);
      steps.push(button);
    }
  }
  const last = () => (model ? points.length : steps.length) - 1;
  function compute() {
    if (!model) return;
    points = model.compute(sliders.map(({name, caption, input}) => {
      caption.textContent = name + ' � ' + input.value;
      return input.valueAsNumber;
    }));
  }
  function render() {
    if (model) {
      plot(points, index, model.axes);
      const values = points[index].map(value => Number(value.toPrecision(4)));
      $('result').textContent = model.axes[0] + ' = ' + values[0] +
        ' � ' + model.axes[1] + ' = ' + values[1] +
        (values.length > 2 ? ' � Comparison: ' + values.slice(2).join(' / ') : '');
    } else {
      steps.forEach((button, i) => {
        if (i === index) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      $('result').textContent = 'Step ' + (index + 1) + ' of ' + steps.length +
        ' � ' + project.components[index];
    }
    $('step').disabled = index >= last();
  }
  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
    $('play').textContent = 'Run';
  }
  $('play').onclick = () => {
    if (frame) { pause(); return; }
    if (index >= last()) index = 0;
    if (reducedMotion.matches) {
      index = Math.min(last(), model ? last() : index + 1);
      render();
      return;
    }
    const first = index;
    started = undefined;
    function tick(now) {
      started ??= now;
      const increment = Math.floor((now - started) / (model ? 4800 / last() : 850));
      const next = Math.min(last(), first + increment);
      if (next !== index) { index = next; render(); }
      if (index < last()) frame = requestAnimationFrame(tick);
      else pause();
    }
    $('play').textContent = 'Pause';
    render();
    frame = requestAnimationFrame(tick);
  };
  $('step').onclick = () => {
    pause();
    index = Math.min(last(), index + (model ? Math.ceil(last() / 20) : 1));
    render();
  };
  $('reset').onclick = () => {
    pause();
    for (const {input, initial} of sliders) input.value = initial;
    compute();
    index = 0;
    render();
  };
  if (project.gaps?.length) {
    $('evidence').hidden = false;
    for (const gap of project.gaps) {
      const item = document.createElement('li');
      item.textContent = gap;
      $('gaps').append(item);
    }
  }
  compute();
  render();
  if (Object.hasOwn(workflowExamples, slug)) addExample(workflowExamples[slug]);
  if (model) new ResizeObserver(render).observe($('plot'));
}

function addExample(example) {
  const section = document.createElement('form');
  section.className = 'example';
  const heading = document.createElement('h2');
  heading.textContent = example.label;
  section.append(heading);
  const inputs = example.fields.map(([name, value]) => {
    const label = document.createElement('label');
    label.textContent = name;
    const input = document.createElement(value.includes('\n') ? 'textarea' : 'input');
    input.value = value;
    input.maxLength = 2500;
    label.append(input);
    section.append(label);
    return input;
  });
  const button = document.createElement('button');
  button.textContent = 'Run example';
  const output = document.createElement('output');
  output.setAttribute('aria-live', 'polite');
  section.append(button, output);
  section.addEventListener('submit', event => {
    event.preventDefault();
    output.textContent = example.run(inputs.map(input => input.value));
  });
  $('lab').after(section);
}

try {
  const response = await fetch('/archive/projects.json');
  if (!response.ok) throw Error('Project data unavailable');
  const projects = await response.json();
  const project = projects.find(project => project.slug === slug);
  if (!project) throw Error('Project not found');
  if (project.demo) location.replace(project.demo);
  else start(project);
} catch (error) {
  $('title').textContent = 'Demo unavailable';
  $('purpose').textContent = 'Open the project catalog and select a demo.';
  console.warn(error);
}
