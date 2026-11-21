import { DISTRICTS, LIMITS, SCENARIOS, sampleAt, simulate } from "./model.mjs";
import { createMonitor } from "./monitor.mjs";

const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries([
  "scenario-list", "scenario-description", "scenario-events", "sharing", "takeover",
  "generator", "load-scale", "load-scale-value", "restore-controls", "city-canvas",
  "scene-status", "reset-view", "play", "reset-time", "time", "clock", "node-list",
  "node-id", "node-title", "node-description", "node-metrics", "node-state", "monitor",
  "figure-scenario", "figure-gallery", "plot-link", "plot-image",
  "district-control", "district-form", "district-message", "clear-events", "fault-status",
].map((id) => [id, byId(id)]));

const districtUses = {
  MG1: "Hospital and emergency services. The controller gives this district the highest service priority.",
  MG2: "Factory, production lines, and process equipment. This district is second in the service order.",
  MG3: "School, offices, and public services. This district is third in the service order.",
  MG4: "Homes, lights, fans, and domestic loads. This district has the most flexible demand.",
};

const components = {
  consumer: ["Demand", "Each district uses a variable resistive load on a switched path. Scenario events change its resistance and requested power."],
  pv: ["PV array and conversion", "Two parallel strings of two 18 W modules give 72 W nameplate per district. The thesis uses P&O MPPT and a voltage-fixing buck converter. Tests use 500 W/m² and 22 °C."],
  battery: ["Battery and DAB converter", "A 3S lithium-ion pack is represented as 12 V, 0.1 Ah, with 0.12 Ω internal resistance. A PI-controlled dual-active-bridge converter links the battery to the local bus."],
  local: ["Local MCU", "The Local MCU reads voltage, state of charge, and supply adequacy. It sets the local switches and can request support. The Main MCU can take control if local commands are unavailable."],
  bus: ["Local DC bus", "The 12 V local DC bus joins the PV converter, battery interface, load, and controlled support connections. The thesis evaluates voltage compliance between 11.6 and 12.8 V."],
  tie: ["Support relay", "A relay connects this district to the common support bus. The Main MCU selects a receiver and a safe donor. The generator has a separate diode-isolated path."],
};

const systemNodes = {
  MAIN: ["Main MCU", "Supervisory control", "Checks requests, donor reserve, and load adequacy. It selects a relay pair, can take over local commands, and applies staged limits based on generator power."],
  GEN: ["Shared generator", "Separate distribution path", "A permanent-magnet DC machine feeds four diode-isolated branches. Its voltage reference is 11.95 V. The thesis models the DC machine electrically."],
  DAQ: ["Monitoring unit", "Data acquisition", "The DAQ observes bus voltage, SoC, power, relay states, and controller authority. It evaluates the 2–20 s interval against the thesis criteria."],
};

const state = {
  scenario: "I",
  selected: "MG1",
  component: null,
  time: 0,
  running: false,
  run: null,
  scene: null,
  interventions: [],
};

const monitor = createMonitor(elements.monitor, {
  onSelectZone: (index) => selectNode(DISTRICTS[index]?.id),
  onSeek: seek,
});

function button(label, handler) {
  const result = document.createElement("button");
  result.type = "button";
  result.textContent = label;
  result.addEventListener("click", handler);
  return result;
}

function markButton(buttons, id) {
  for (const [key, control] of buttons) control.setAttribute("aria-pressed", key === id ? "true" : "false");
}

const scenarioButtons = new Map();
for (const scenario of SCENARIOS) {
  const item = button("", () => setScenario(scenario.id));
  for (const label of [scenario.id, scenario.title]) {
    const span = document.createElement("span");
    span.textContent = label;
    item.append(span);
  }
  scenarioButtons.set(scenario.id, item);
  elements["scenario-list"].append(item);
  elements["figure-scenario"].add(new Option(`${scenario.id} · ${scenario.title}`, scenario.id));
}

const nodeButtons = new Map();
for (const [id, label] of [...DISTRICTS.map(({ id, name }) => [id, name]), ...Object.entries(systemNodes).map(([id, [name]]) => [id, name])]) {
  const item = button("", () => selectNode(id));
  const code = document.createElement("span");
  code.className = "node-code";
  code.textContent = id;
  const title = document.createElement("span");
  title.textContent = label;
  item.append(code, title);
  nodeButtons.set(id, item);
  elements["node-list"].append(item);
}

function setScenario(id) {
  state.scenario = id;
  state.time = 0;
  state.running = false;
  state.interventions = [];
  elements["district-message"].textContent = "";
  elements["figure-scenario"].value = id;
  renderFigures();
  configure();
}

function configure() {
  state.run = simulate({
    scenario: state.scenario,
    sharing: elements.sharing.checked,
    takeover: elements.takeover.checked,
    generator: elements.generator.checked,
    loadScale: Number(elements["load-scale"].value) / 100,
    interventions: state.interventions,
  });
  const scenario = state.run.scenario;
  elements["scenario-description"].textContent = scenario.description;
  markButton(scenarioButtons, scenario.id);
  elements["scenario-events"].replaceChildren();
  const events = scenario.changes.map(({ t, title }) => ({ t, title }));
  if (scenario.offline) events.push({ t: scenario.offline.t, title: `${scenario.offline.district} Local MCU unavailable` });
  for (const event of events.sort((a, b) => a.t - b.t)) {
    const item = button(event.title, () => seek(event.t));
    const time = document.createElement("time");
    time.textContent = `${event.t.toFixed(1)} s`;
    item.prepend(time);
    elements["scenario-events"].append(item);
  }
  monitor.setRun(state.run, { published: state.run.published });
  render();
}

function seek(seconds) {
  state.time = Math.min(LIMITS.duration, Math.max(0, Number(seconds) || 0));
  state.running = false;
  render();
}

function selectNode(id, component = null) {
  if (!nodeButtons.has(id)) return;
  state.selected = id;
  state.component = component;
  markButton(nodeButtons, id);
  state.scene?.select(id);
  elements["district-control"].hidden = !id.startsWith("MG");
  elements["district-message"].textContent = "";
  render();
}

const asNumber = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const asW = (value) => `${asNumber(value)} W`;

function metrics(entries) {
  const root = elements["node-metrics"];
  if (root.children.length !== entries.length) {
    root.replaceChildren(...entries.map(() => {
      const cell = document.createElement("div");
      cell.append(document.createElement("span"), document.createElement("strong"));
      return cell;
    }));
  }
  for (const [index, [label, value]] of entries.entries()) {
    const cell = root.children[index];
    cell.firstElementChild.textContent = label;
    cell.lastElementChild.textContent = value;
  }
}

function renderInspector(frame) {
  const zone = frame.districts.find(({ id }) => id === state.selected);
  const { totals, support } = frame;
  if (zone) {
    const part = components[state.component];
    elements["node-id"].textContent = `${zone.id} · Priority ${zone.priority}`;
    elements["node-title"].textContent = part?.[0] ?? zone.name;
    elements["node-description"].textContent = part?.[1] ?? districtUses[zone.id];
    metrics([
      ["Bus voltage", `${asNumber(zone.voltage, 2)} V`], ["Battery SoC", `${asNumber(zone.soc)}%`],
      ["Demand", asW(zone.demand)], ["Load served", asW(zone.served)],
      ["PV / battery", `${asNumber(zone.pv)} / ${asNumber(zone.battery)} W`], ["Generator", asW(zone.generator)],
    ]);
    const owner = { LOCAL: "Local MCU in control", MAIN: "Main MCU in control", OFFLINE: "No local command available" }[zone.owner];
    const condition = [
      !zone.localAlive && "Local MCU unavailable",
      zone.request && "Support requested",
      zone.relay && "Support relay closed",
      zone.shed && "Load limit active",
    ].filter(Boolean);
    elements["node-state"].textContent = [owner, ...condition].join(" · ");
    return;
  }
  const [title, eyebrow, description] = systemNodes[state.selected];
  elements["node-id"].textContent = eyebrow;
  elements["node-title"].textContent = title;
  elements["node-description"].textContent = description;
  if (state.selected === "MAIN") {
    const requests = frame.districts.filter((district) => district.request).map((district) => district.id);
    const owned = frame.districts.filter((district) => district.owner === "MAIN").map((district) => district.id);
    metrics([["Requests", requests.join(", ") || "None"], ["Main control", owned.join(", ") || "None"],
      ["Receiver", support?.receiver || "None"], ["Donor", support?.donor || "None"]]);
    elements["node-state"].textContent = support?.reason || "Monitoring all four districts";
  } else if (state.selected === "GEN") {
    metrics(frame.districts.map((district) => [district.id, asW(district.generator)]));
    elements["node-state"].textContent = `${asW(totals.generator)} total generator output`;
  } else {
    metrics([["Demand", asW(totals.demand)], ["Load served", asW(totals.served)],
      ["Unserved", asW(totals.unserved)], ["Generator", asW(totals.generator)]]);
    elements["node-state"].textContent = frame.t < LIMITS.evaluationStart ? "Startup interval" : "KPI evaluation interval";
  }
}

function render() {
  if (!state.run) return;
  const frame = sampleAt(state.run, state.time);
  state.scene?.update(frame);
  monitor.render({ time: frame.t, selectedZone: state.selected.startsWith("MG") ? state.selected : undefined });
  renderInspector(frame);
  const outages = frame.districts.filter(({ localAlive }) => !localAlive);
  const fault = outages.length ? outages.map(({ id, owner }) => `${id} MCU unavailable · ${owner === "MAIN" ? "Main takeover" : "Local control lost"}`).join("  /  ")
    : frame.support?.reason === "No safe donor" ? `${frame.support.receiver} · No safe donor` : "";
  if (elements["fault-status"].textContent !== fault) {
    elements["fault-status"].textContent = fault;
    elements["fault-status"].hidden = !fault;
  }
  elements.time.value = String(state.time);
  elements.time.setAttribute("aria-valuetext", `${state.time.toFixed(1)} seconds`);
  elements.clock.textContent = `${state.time.toFixed(1)} / ${state.run.duration} s`;
  elements.play.textContent = state.running ? "Pause" : state.time >= state.run.duration ? "Run again" : state.time > 0 ? "Resume" : "Run scenario";
}

function renderFigures() {
  if (!elements["figure-gallery"].open) return;
  const id = elements["figure-scenario"].value;
  const url = `./figures/scenario-${id}.webp`;
  elements["plot-link"].href = url;
  elements["plot-image"].src = url;
  elements["plot-image"].alt = `Thesis Scenario ${id}: ten original plots for voltage, state of charge, supply, and local load`;
}

let previousTime = null;
let lastRender = 0;
function animation(now) {
  if (!state.running) {
    previousTime = null;
    return;
  }
  if (previousTime !== null) state.time = Math.min(LIMITS.duration, state.time + Math.min(.15, (now - previousTime) / 1000));
  previousTime = now;
  if (state.time >= LIMITS.duration) state.running = false;
  if (now - lastRender > 85 || !state.running) {
    lastRender = now;
    render();
  }
  if (state.running) requestAnimationFrame(animation);
  else previousTime = null;
}

elements.play.addEventListener("click", () => {
  if (state.running) {
    state.running = false;
  } else {
    if (state.time >= LIMITS.duration) state.time = 0;
    state.running = true;
    previousTime = null;
    requestAnimationFrame(animation);
  }
  render();
});
elements["reset-time"].addEventListener("click", () => seek(0));
elements.time.addEventListener("input", () => seek(elements.time.value));
elements["reset-view"].addEventListener("click", () => state.scene?.resetView());
for (const element of [elements.sharing, elements.takeover, elements.generator, elements["load-scale"]]) {
  element.addEventListener("change", configure);
}
elements["load-scale"].addEventListener("input", () => {
  elements["load-scale-value"].textContent = `${elements["load-scale"].value}%`;
});
elements["restore-controls"].addEventListener("click", () => {
  elements.sharing.checked = true;
  elements.takeover.checked = true;
  elements.generator.checked = true;
  elements["load-scale"].value = "100";
  elements["load-scale-value"].textContent = "100%";
  configure();
});
elements["figure-scenario"].addEventListener("change", renderFigures);
elements["figure-gallery"].addEventListener("toggle", renderFigures);

elements["district-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.selected.startsWith("MG")) return;
  const changes = [...new FormData(event.target)].filter(([, value]) => value !== "");
  if (!changes.length) {
    elements["district-message"].textContent = "Select at least one change.";
    return;
  }
  const values = Object.fromEntries(changes.map(([key, value]) => [key, key === "loadScale" ? Number(value) : value === "true"]));
  const t = sampleAt(state.run, state.time).t;
  state.interventions.push({ t, district: state.selected, ...values });
  state.running = false;
  event.target.reset();
  configure();
  elements["district-message"].textContent = `${state.selected} event applied at ${t.toFixed(2)} s.`;
});
elements["clear-events"].addEventListener("click", () => {
  state.interventions = [];
  configure();
  elements["district-message"].textContent = "Custom events cleared.";
});

markButton(nodeButtons, state.selected);
setScenario("I");

import("./city.mjs").then(({ mountCity }) => {
  state.scene = mountCity(elements["city-canvas"], {
    onPick: selectNode,
    onStatus: ({ kind, message }) => {
      elements["scene-status"].textContent = message || "";
      elements["scene-status"].hidden = kind === "ready";
      if (kind === "error") elements["reset-view"].disabled = true;
    },
  });
  elements["reset-view"].disabled = !state.scene;
  state.scene?.select(state.selected);
  render();
}).catch((error) => {
  console.error("CyberCity 3D initialization", error);
  elements["scene-status"].textContent = "3D view unavailable. Scenario controls and monitoring are available.";
});
