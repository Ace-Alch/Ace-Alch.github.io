import { sampleAt, DISTRICTS as ZONES, LIMITS, PUBLISHED } from './model.mjs';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const SCOPE = { width: 780, height: 264, left: 57, right: 755, top: 16, bottom: 218 };
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
const formats = Array.from({ length: 6 }, (_, maximumFractionDigits) =>
  new Intl.NumberFormat('en', { maximumFractionDigits }),
);
const unit = (value, decimals, suffix = '') => typeof value === 'number' && Number.isFinite(value)
  ? `${formats[decimals].format(value)}${suffix}`
  : '—';
const percent = (value, decimals = 2) => unit(value, decimals, '%');
const seconds = (value) => unit(value, 2, ' s');
const watts = (value) => unit(value, 1, ' W');
const energy = (value) => unit(value, 3, ' Ws');
const volts = (value) => unit(value, 3, ' V');

const [VOLTAGE_MIN, VOLTAGE_MAX] = LIMITS.voltageBand;
const START = LIMITS.evaluationStart;
const SYSTEM_METRICS = [
  ['ens', 'Energy not served', energy, '≤ 180 Ws'],
  ['criticalServed', 'MG1 load served', percent, '≥ 95%'],
  ['generatorDependency', 'Generator dependency', percent, '≤ 60%'],
  ['mg1VoltageCompliance', 'MG1 voltage compliance', percent, '≥ 90%'],
  ['voltageCompliance', 'Mean voltage compliance', percent, 'Mean across four buses'],
  ['voltageRmse', 'Mean voltage RMSE', (value) => unit(value, 5, ' V'), 'Reference 12 V'],
  ['ensPercent', 'Energy not served', (value) => percent(value, 4), 'Share of requested energy'],
  ['generatorEnergy', 'Generator energy', energy, 'Integrated output'],
  ['servedEnergy', 'Energy served', energy, 'All four microgrids'],
  ['demandEnergy', 'Energy requested', energy, 'All four microgrids'],
  ['minimumServed', 'Lowest district service', percent, 'Lowest across four microgrids'],
  ['requestDuration', 'Request duration', seconds, 'Sum across microgrids'],
  ['relayDuration', 'Relay duration', seconds, 'Sum across microgrids'],
  ['takeoverDuration', 'Takeover duration', seconds, 'Sum across microgrids'],
];
const DISTRICT_METRICS = [
  ['ens', 'Energy not served', energy],
  ['ensPercent', 'Energy not served ratio', (value) => percent(value, 4)],
  ['loadServed', 'Load served ratio', percent],
  ['voltageRmse', 'Voltage RMSE', (value) => unit(value, 5, ' V')],
  ['voltageCompliance', 'Voltage compliance', percent],
  ['requestDuration', 'Request duration', seconds],
  ['relayDuration', 'Relay duration', seconds],
  ['takeoverDuration', 'Takeover duration', seconds],
];

const districtSeries = (key) => ZONES.map((zone, index) => ({
  label: zone.id,
  color: zone.color,
  read: (frame) => frame.districts[index]?.[key],
}));
const SIGNALS = {
  voltage: {
    title: 'DC bus voltage',
    unit: 'V',
    min: 9,
    max: 13,
    band: [VOLTAGE_MIN, VOLTAGE_MAX],
    describe: `Four 12 V DC buses. The shaded band shows the thesis compliance interval of ${VOLTAGE_MIN}–${VOLTAGE_MAX} V.`,
    format: volts,
    series: districtSeries('voltage'),
    district: true,
  },
  soc: {
    title: 'Battery state of charge',
    unit: '%',
    min: 0,
    max: 100,
    describe: 'The estimated charge of each 3S battery. Select a district to emphasize its trace.',
    format: percent,
    series: districtSeries('soc'),
    district: true,
  },
  power: {
    title: 'District power balance',
    unit: 'W',
    min: 0,
    max: 40,
    describe: 'Demand and the allocated local, shared and generator contributions for the selected district.',
    format: watts,
    series: [
      { label: 'Demand', color: '#eff6fb', key: 'demand', dash: '6 4' },
      { label: 'Served', color: '#79dfc1', key: 'served' },
      { label: 'PV', color: '#f2cc7c', key: 'pv' },
      { label: 'Battery', color: '#a9a4ff', key: 'battery' },
      { label: 'Generator', color: '#ff9d72', key: 'generator' },
      { label: 'Import', color: '#80c6fa', key: 'imported' },
      { label: 'Export', color: '#8db7ab', key: 'exported', dash: '3 3' },
    ],
  },
  adequacy: {
    title: 'City demand and service',
    unit: 'W',
    min: 0,
    max: 100,
    describe: 'Aggregate demand, served load, unmet load and generator allocation across all four districts.',
    format: watts,
    series: [
      { label: 'Demand', color: '#f1f6fb', key: 'demand', dash: '6 4' },
      { label: 'Served', color: '#79dfc1', key: 'served' },
      { label: 'Unserved', color: '#ff8f85', key: 'unserved' },
      { label: 'Generator', color: '#f2cc7c', key: 'generator' },
    ].map((series) => ({
      ...series,
      read: (frame) => frame.districts.reduce((sum, district) => sum + (district[series.key] ?? 0), 0),
    })),
  },
  command: {
    title: 'Controller signals',
    unit: '',
    min: -0.18,
    max: 3.68,
    describe: 'Each trace rises while its command is active. Supervisory influence includes Local MCU loss or an active Main MCU command.',
    series: [
      { label: 'Request', axis: 'Req', color: '#f2cc7c', key: 'request' },
      { label: 'Relay closed', axis: 'Relay', color: '#79dfc1', key: 'relay' },
      { label: 'Supervisory influence', axis: 'Main', color: '#80c6fa', key: 'takeover' },
      { label: 'Load limit', axis: 'Limit', color: '#ff9d8f', key: 'shed' },
    ].map((entry, lane) => ({ ...entry, lane: 3 - lane })),
    digital: true,
  },
};

function zoneIndex(selection) {
  if (Number.isInteger(selection) && ZONES[selection]) return selection;
  return ZONES.findIndex((zone) => zone.id === selection);
}

function scenarioId(run) {
  const value = run.scenario?.id ?? run.scenario;
  if (typeof value === 'number') return ROMAN[value];
  return ROMAN.includes(value) ? value : ROMAN[0];
}

function rowDetail(kpis, index) {
  return kpis?.districts?.find((value) => value.id === ZONES[index].id) ?? kpis?.districts?.[index];
}

function metric(kpis, key) {
  return key === 'mg1VoltageCompliance' ? rowDetail(kpis, 0)?.voltageCompliance : kpis?.[key];
}

function resultLabel(success) {
  return success === true || success === 1 ? 'Pass' : success === false || success === 0 ? 'Fail' : '—';
}

function kpiRows(current, published) {
  return SYSTEM_METRICS.map(([key, title, format, criterion]) => `
    <tr><th scope="row">${title}<small>${criterion}</small></th>
      <td>${format(metric(current, key))}</td>
      <td>${format(metric(published, key))}</td></tr>`).join('');
}

function districtRows(current, published) {
  return DISTRICT_METRICS.map(([key, title, format]) =>
    `<tr><th scope="row">${title}</th><td>${format(current?.[key])}</td><td>${format(published?.[key])}</td></tr>`,
  ).join('');
}

function dataMarkup() {
  return `
    <header class="cc-monitor-head">
      <div>
        <p class="cc-monitor-kicker">Data acquisition</p>
        <h2>Monitoring station</h2>
        <p>Trace the four buses and check how the city serves demand.</p>
      </div>
      <span class="cc-monitor-kind">Browser simulation</span>
    </header>
    <div class="cc-monitor-scope-grid">
      <section class="cc-monitor-panel cc-monitor-scope" aria-label="Telemetry charts">
        <div class="cc-monitor-panel-head">
          <div>
            <h3 id="cc-scope-title">DC bus voltage</h3>
            <p id="cc-scope-description"></p>
          </div>
          <output class="cc-monitor-clock" aria-label="Current simulation time">0.00 s</output>
        </div>
        <div class="cc-monitor-switch" aria-label="Chart signal">
          <button type="button" data-signal="voltage" aria-pressed="true">Bus voltage</button>
          <button type="button" data-signal="soc" aria-pressed="false">Battery charge</button>
          <button type="button" data-signal="power" aria-pressed="false">District power</button>
          <button type="button" data-signal="adequacy" aria-pressed="false">City service</button>
          <button type="button" data-signal="command" aria-pressed="false">Control states</button>
        </div>
        <svg class="cc-monitor-chart" viewBox="0 0 780 264" role="img" aria-labelledby="cc-scope-title cc-scope-description" focusable="false"></svg>
        <div class="cc-monitor-chart-legend" aria-label="Current chart readings"></div>
        <label class="cc-monitor-range"><span>Chart time</span><input type="range" min="0" max="20" step="0.05" value="0"></label>
      </section>
      <section class="cc-monitor-panel cc-monitor-stream" aria-label="District telemetry">
        <div class="cc-monitor-panel-head">
          <div><h3>District signals</h3><p>Live at the selected time</p></div>
        </div>
        <div class="cc-monitor-table-wrap">
          <table class="cc-monitor-table cc-monitor-live">
            <thead><tr><th scope="col">District</th><th scope="col">Bus</th><th scope="col">SoC</th><th scope="col">Served</th></tr></thead>
            <tbody>
              ${ZONES.map((zone, index) => `
                <tr data-zone-row="${index}">
                  <th scope="row"><button type="button" data-zone="${index}" aria-pressed="false" style="--cc-series:${zone.color}"><span>${zone.id}</span> <small>${zone.name}</small></button></th>
                  <td data-voltage>—</td><td data-soc>—</td><td data-service>—</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="cc-monitor-flags" aria-label="Controller and relay states"></div>
      </section>
    </div>
    <div class="cc-monitor-analysis">
      <section class="cc-monitor-panel" aria-label="Scenario KPI comparison">
        <div class="cc-monitor-panel-head">
          <div><h3>Scenario results</h3><p>Full-run KPIs over the 2–20 s evaluation window.</p></div>
        </div>
        <div class="cc-monitor-result" data-summary></div>
        <div class="cc-monitor-table-wrap">
          <table class="cc-monitor-table cc-monitor-kpis">
            <thead><tr><th scope="col">Measure</th><th scope="col">Browser</th><th scope="col">Thesis</th></tr></thead>
            <tbody data-system-rows></tbody>
          </table>
        </div>
        <details class="cc-monitor-detail">
          <summary>District KPIs <span data-kpi-zone></span></summary>
          <div class="cc-monitor-table-wrap">
            <table class="cc-monitor-table cc-monitor-kpis">
              <thead><tr><th scope="col">Measure</th><th scope="col">Browser</th><th scope="col">Thesis</th></tr></thead>
              <tbody data-district-rows></tbody>
            </table>
          </div>
        </details>
        <details class="cc-monitor-detail">
          <summary>Acceptance criteria</summary>
          <ul class="cc-monitor-criteria">
            <li>All monitored signals are finite, and each battery stays within 0–100% charge.</li>
            <li>No bus stays below 10 V for more than 0.05 s.</li>
            <li>MG1 serves at least 95% of its requested energy and stays within the voltage band for at least 90% of the evaluation window.</li>
            <li>Total energy not served is at most 180 Ws, and generator dependency is at most 60%.</li>
          </ul>
        </details>
        <p class="cc-monitor-source">Thesis results are fixed Simulink values. A dash marks an unreported value. Browser settings affect only the browser column. <a href="https://urn.fi/URN:NBN:fi:tuni-202606298025" target="_blank" rel="noopener noreferrer">Thesis, Chapter 7 and Table 37</a>.</p>
      </section>
      <section class="cc-monitor-panel cc-monitor-events" aria-label="Control event log">
        <div class="cc-monitor-panel-head">
          <div><h3>Control event log</h3><p>Select an event to seek to its time.</p></div>
          <span class="cc-monitor-count" data-event-count></span>
        </div>
        <ol class="cc-monitor-event-list"></ol>
      </section>
    </div>`;
}

function scaleX(time, duration) {
  return SCOPE.left + time * (SCOPE.right - SCOPE.left) / duration;
}

function telemetry(entry, frame, selectedZone) {
  if (entry.read) return entry.read(frame);
  return frame.districts[selectedZone]?.[entry.key];
}

function chartValue(entry, sample) {
  return entry.lane === undefined ? sample : entry.lane + (sample ? 0.52 : 0);
}

function graph(svg, frames, duration, signal, selectedZone) {
  const series = signal.series.map((entry, index) => ({
    ...entry,
    values: frames.map((frame) => chartValue(entry, telemetry(entry, frame, selectedZone))),
    opacity: signal.district && selectedZone !== index ? 0.52 : 1,
  }));
  const allValues = series.flatMap((entry) => entry.values).filter(Number.isFinite);
  const measuredMax = Math.max(signal.max, ...allValues);
  const measuredMin = Math.min(signal.min, ...allValues);
  const increment = signal.unit === 'W' ? 20 : signal.unit === '%' ? 10 : 1;
  const max = signal.digital ? signal.max : Math.ceil(measuredMax / increment) * increment;
  const min = signal.digital ? signal.min : Math.floor(measuredMin / increment) * increment;
  const scaleY = (value) => SCOPE.bottom - (value - min) * (SCOPE.bottom - SCOPE.top) / (max - min);
  const lines = series.map((entry) => {
    const path = entry.values.map((value, index) => {
      if (!Number.isFinite(value)) return '';
      const x = scaleX(frames[index].t, duration).toFixed(2);
      const y = scaleY(value).toFixed(2);
      if (!index) return `M${x},${y}`;
      return signal.digital ? `H${x}V${y}` : `L${x},${y}`;
    }).join(' ');
    return `<path d="${path}" stroke="${entry.color}" opacity="${entry.opacity}" ${entry.dash ? `stroke-dasharray="${entry.dash}"` : ''}></path>`;
  }).join('');
  const gridY = signal.digital ? series.map(({ lane, axis }) => {
    const y = scaleY(lane);
    const labelY = scaleY(lane + 0.19);
    return `<path d="M${SCOPE.left},${y} H${SCOPE.right}"></path><text x="48" y="${labelY + 4}" text-anchor="end">${axis}</text>`;
  }).join('') : Array.from({ length: 5 }, (_, index) => {
    const value = min + (max - min) * index / 4;
    const y = scaleY(value);
    return `<path d="M${SCOPE.left},${y} H${SCOPE.right}"></path><text x="46" y="${y + 4}" text-anchor="end">${unit(value, 1)}</text>`;
  }).join('');
  const gridX = Array.from({ length: 5 }, (_, index) => {
    const time = duration * index / 4;
    const x = scaleX(time, duration);
    return `<path d="M${x},${SCOPE.top} V${SCOPE.bottom}"></path><text x="${x}" y="246" text-anchor="middle">${unit(time, 1)} s</text>`;
  }).join('');
  const band = signal.band
    ? `<rect class="cc-chart-band" x="${SCOPE.left}" y="${scaleY(signal.band[1])}" width="${SCOPE.right - SCOPE.left}" height="${scaleY(signal.band[0]) - scaleY(signal.band[1])}"></rect>`
    : '';
  const daqX = scaleX(START, duration);
  svg.innerHTML = `
    <rect class="cc-chart-area" x="${SCOPE.left}" y="${SCOPE.top}" width="${SCOPE.right - SCOPE.left}" height="${SCOPE.bottom - SCOPE.top}" rx="8"></rect>
    ${band}<g class="cc-chart-grid">${gridX}${gridY}</g>
    <text x="10" y="18" class="cc-chart-unit">${signal.unit}</text>
    <g class="cc-chart-series">${lines}</g>
    <rect class="cc-chart-future" x="${SCOPE.left}" y="${SCOPE.top}" width="${SCOPE.right - SCOPE.left}" height="${SCOPE.bottom - SCOPE.top}"></rect>
    <line class="cc-chart-daq" x1="${daqX}" x2="${daqX}" y1="${SCOPE.top}" y2="${SCOPE.bottom}"></line>
    <text class="cc-chart-daq-caption" x="${daqX + 5}" y="29">DAQ</text>
    <line class="cc-chart-cursor" x1="${SCOPE.left}" x2="${SCOPE.left}" y1="${SCOPE.top}" y2="${SCOPE.bottom}"></line>
    <g class="cc-chart-markers">${series.map((item) => `<circle r="4" fill="${item.color}" visibility="hidden"></circle>`).join('')}</g>`;
  return { series, scaleY, markers: [...svg.querySelectorAll('circle')], future: svg.querySelector('.cc-chart-future'), cursor: svg.querySelector('.cc-chart-cursor') };
}

function describeEvent(event) {
  const title = event.title ?? event.label ?? event.type ?? 'Control event';
  const detail = event.detail ?? event.message ?? event.description ?? '';
  return { title, detail, time: event.t ?? event.time ?? 0 };
}

export function createMonitor(root, { onSelectZone = () => {}, onSeek = () => {} } = {}) {
  root.classList.add('cc-monitor');
  root.innerHTML = dataMarkup();
  const get = (selector) => root.querySelector(selector);
  const svg = get('.cc-monitor-chart');
  const scopeTitle = get('#cc-scope-title');
  const scopeDescription = get('#cc-scope-description');
  const legend = get('.cc-monitor-chart-legend');
  const clock = get('.cc-monitor-clock');
  const range = get('.cc-monitor-range input');
  const flags = get('.cc-monitor-flags');
  const zoneRows = [...root.querySelectorAll('[data-zone-row]')];
  const signalButtons = [...root.querySelectorAll('[data-signal]')];
  const eventList = get('.cc-monitor-event-list');

  let run;
  let published;
  let signalId = 'voltage';
  let selectedZone = 0;
  let time = 0;
  let plot;
  let valueNodes = [];
  let events = [];
  let eventButtons = [];
  let priorEvent = -1;
  let priorFlags = '';
  let lastFrame;

  function redraw() {
    if (!run) return;
    const signal = SIGNALS[signalId];
    const zoneTitles = { power: 'power balance', command: 'controller signals' };
    scopeTitle.textContent = zoneTitles[signalId] ? `${ZONES[selectedZone].id} ${zoneTitles[signalId]}` : signal.title;
    scopeDescription.textContent = signal.describe;
    plot = graph(svg, run.frames, run.duration, signal, selectedZone);
    lastFrame = undefined;
    legend.innerHTML = plot.series.map((entry) =>
      `<span><i style="--cc-series:${entry.color}"></i>${entry.label} <b>—</b></span>`,
    ).join('');
    valueNodes = [...legend.querySelectorAll('b')];
  }

  function paintDistrictKpis() {
    const zone = ZONES[selectedZone];
    get('[data-kpi-zone]').textContent = `${zone.id} · ${zone.name}`;
    get('[data-district-rows]').innerHTML = districtRows(
      rowDetail(run.kpis, selectedZone), rowDetail(published, selectedZone),
    );
    zoneRows.forEach((row, index) => {
      row.classList.toggle('is-selected', index === selectedZone);
      row.querySelector('button').setAttribute('aria-pressed', String(index === selectedZone));
    });
  }

  function paintFlags(district) {
    const owner = { LOCAL: 'Local MCU', MAIN: 'Main MCU', OFFLINE: 'Offline' };
    const items = [
      ['Control', owner[district.owner] ?? 'Unknown'],
      ['Request', district.request ? 'Active' : 'Idle'],
      ['Relay', district.relay ? 'Closed' : 'Open'],
      ['Donor role', district.donor ? 'Selected' : 'Inactive'],
      ['Load limit', district.shed ? 'Active' : 'Idle'],
      ['Main command', district.mainCommand === 'NONE' ? 'None' : district.mainCommand],
    ];
    const markup = items.map(([label, value]) =>
      `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`,
    ).join('');
    if (priorFlags !== markup) {
      flags.innerHTML = `<dl>${markup}</dl>`;
      priorFlags = markup;
    }
  }

  function render({ time: nextTime = time, selectedZone: selection = selectedZone } = {}) {
    if (!run) return;
    const index = zoneIndex(selection);
    if (index >= 0 && index !== selectedZone) {
      selectedZone = index;
      redraw();
      paintDistrictKpis();
    }
    time = Math.max(0, Math.min(run.duration, Number.isFinite(nextTime) ? nextTime : 0));
    const frame = sampleAt(run, time);
    if (!frame) return;
    clock.value = `${time.toFixed(2)} s`;
    if (document.activeElement !== range) range.value = String(time);
    const x = scaleX(time, run.duration);
    plot.cursor.setAttribute('x1', x);
    plot.cursor.setAttribute('x2', x);
    plot.future.setAttribute('x', x);
    plot.future.setAttribute('width', SCOPE.right - x);
    const signal = SIGNALS[signalId];
    plot.series.forEach((entry, i) => {
      const sample = telemetry(entry, frame, selectedZone);
      const value = chartValue(entry, sample);
      if (lastFrame !== frame) {
        valueNodes[i].textContent = signal.digital ? (sample ? 'On' : 'Off') : signal.format(value);
        plot.markers[i].setAttribute('visibility', Number.isFinite(value) ? 'visible' : 'hidden');
        if (Number.isFinite(value)) plot.markers[i].setAttribute('cy', plot.scaleY(value));
      }
      if (Number.isFinite(value)) {
        plot.markers[i].setAttribute('cx', x);
      }
    });
    if (lastFrame !== frame) {
      frame.districts.forEach((district, i) => {
        const row = zoneRows[i];
        const service = district.demand > 0 ? district.served / district.demand * 100 : 100;
        row.querySelector('[data-voltage]').textContent = volts(district.voltage);
        row.querySelector('[data-soc]').textContent = percent(district.soc, 1);
        row.querySelector('[data-service]').textContent = percent(service, 1);
        row.toggleAttribute('data-outside-band', district.voltage < VOLTAGE_MIN || district.voltage > VOLTAGE_MAX);
        row.toggleAttribute('data-unserved', district.unserved > 0.5);
      });
      paintFlags(frame.districts[selectedZone]);
      lastFrame = frame;
    }
    const active = events.findLastIndex((event) => event.time <= time + 0.000001);
    if (active !== priorEvent) {
      for (const [i, button] of eventButtons.entries()) {
        button.classList.toggle('is-past', i <= active);
        if (i === active) button.setAttribute('aria-current', 'time');
        else button.removeAttribute('aria-current');
      }
      priorEvent = active;
    }
  }

  function setRun(nextRun, { published: reported } = {}) {
    if (!nextRun?.frames?.length) return;
    run = nextRun;
    const id = scenarioId(run);
    published = reported ?? PUBLISHED[id];
    time = 0;
    range.max = String(run.duration);
    range.step = String(run.step ?? 0.05);
    range.value = '0';
    events = (run.events ?? []).map(describeEvent).sort((a, b) => a.time - b.time);
    eventList.innerHTML = events.map((event, index) => `
      <li><button type="button" data-event="${index}"><time>${escape(seconds(event.time))}</time><span>
        <strong>${escape(event.title)}</strong>${event.detail && event.detail !== event.title ? `<small>${escape(event.detail)}</small>` : ''}
      </span></button></li>`).join('') || '<li class="cc-monitor-empty">No control transitions in this run.</li>';
    eventButtons = [...eventList.querySelectorAll('button')];
    get('[data-event-count]').textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
    priorEvent = -2;
    const models = [
      { label: 'Browser outcome', value: run.kpis },
      { label: `Thesis outcome · ${id}`, value: published },
    ];
    get('[data-summary]').innerHTML = models.map(({ label, value }) => {
      const result = resultLabel(value?.success);
      const reason = result === 'Fail' ? value?.failureReason : '';
      return `<div><span>${label}</span><strong class="is-${result.toLowerCase()}">${result}</strong>
        ${reason ? `<small>${escape(reason)}${value.failureReasonCode ? ` (code ${escape(value.failureReasonCode)})` : ''}</small>` : ''}</div>`;
    }).join('');
    get('[data-system-rows]').innerHTML = kpiRows(run.kpis, published);
    paintDistrictKpis();
    redraw();
    render();
  }

  for (const button of signalButtons) {
    button.addEventListener('click', () => {
      signalId = button.dataset.signal;
      for (const toggle of signalButtons) toggle.setAttribute('aria-pressed', String(toggle === button));
      redraw();
      render();
    });
  }
  for (const row of zoneRows) {
    const button = row.querySelector('button');
    button.addEventListener('click', () => {
      const index = Number(button.dataset.zone);
      render({ selectedZone: index });
      onSelectZone(index);
    });
  }
  eventList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-event]');
    if (button) onSeek(events[Number(button.dataset.event)].time);
  });
  range.addEventListener('input', () => onSeek(Number(range.value)));
  svg.addEventListener('click', (event) => {
    if (!run) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / SCOPE.width, rect.height / SCOPE.height);
    const offset = (rect.width - SCOPE.width * scale) / 2;
    const x = (event.clientX - rect.left - offset) / scale;
    const fraction = Math.min(1, Math.max(0, (x - SCOPE.left) / (SCOPE.right - SCOPE.left)));
    onSeek(fraction * run.duration);
  });

  return { setRun, render };
}
