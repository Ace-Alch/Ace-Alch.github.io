import { DISTRICTS, LIMITS, SCENARIOS, sampleAt, simulate } from "./model.mjs?v=layers-1";
import { createMonitor } from "./monitor.mjs";
import { createSingleLine } from "./single-line.mjs?v=utilities-1";
import { describeBattery, displayWatts, districtPowerRows } from "./power-readings.mjs";

const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries([
  "scenario-list", "scenario-description", "scenario-events", "sharing", "takeover",
  "generator", "load-scale", "load-scale-value", "restore-controls", "city-canvas",
  "scene-status", "focus-view", "reset-view", "zoom-in", "zoom-out", "play", "reset-time", "time", "clock", "node-list",
  "node-id", "node-title", "node-description", "node-metrics", "node-state", "monitor",
  "figure-scenario", "figure-gallery", "plot-link", "plot-image",
  "district-control", "district-form", "district-message", "clear-events", "fault-status",
  "city-mode", "line-mode", "wide-view", "daylight", "city-frame", "diagram",
  "service-controls", "signal-panel", "signal-values",
  "mission", "mission-objective", "mission-checks", "mission-result", "camera-mode",
  "graphics", "sim-speed", "clean-hud",
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
  mainEnabled: true,
  controlLayer: false,
};

const objectives = {
  I: "Keep all districts operating on local PV and batteries.",
  II: "Supply the critical district after its demand rises at 4 seconds.",
  III: "Keep MG3 supplied and follow the change of donor during the run.",
  IV: "Keep the support relays open when no donor meets the reserve checks.",
  V: "Maintain industrial service after the MG2 local controller drops out at 6 seconds.",
  VI: "Keep MG1 supplied and reduce unmet energy during overlapping failures.",
};
let gameMode = "explore";
let lastMission = "";
let waterDrill = false;
function renderMission() {
  if (gameMode !== "challenge") return;
  const id = state.run.scenario.id;
  const metrics = state.run.kpis;
  const final = state.time >= state.run.duration;
  const frame=sampleAt(state.run,state.time);
  const waterOnline=pumpState(frame).served>.025;
  const signature = `${id}|${final}|${metrics.ens}|${metrics.criticalServed}|${metrics.generatorDependency}|${metrics.failureReason}|${waterDrill}|${waterOnline}`;
  if (signature === lastMission) return;
  lastMission = signature;
  elements["mission-objective"].textContent = waterDrill
    ? "Utility drill · The MG2 pump is disconnected. Restore water supply to all four districts using the city pump switch."
    : objectives[id];
  const limits = [
    `Keep MG1 load served at or above ${LIMITS.minCriticalServed}%`,
    `Keep generator dependency at or below ${LIMITS.maxGeneratorDependency}%`,
    `Keep energy not served at or below ${LIMITS.maxENS} Ws`,
    `Keep MG1 voltage compliance at or above ${LIMITS.minCriticalCompliance}%`,
  ];
  elements["mission-checks"].replaceChildren(...limits.map(text => {
    const line = document.createElement("li");
    line.textContent = text;
    return line;
  }));
  const result = elements["mission-result"];
  result.dataset.result = waterDrill ? (waterOnline?"pass":"running") : final ? (metrics.success ? "pass" : "fail") : "running";
  result.textContent = waterDrill ? (waterOnline?"Drill complete · All districts have water supply":"Waiting for pump power")
    : final
    ? `${metrics.success ? "Criteria met" : metrics.failureReason} · ${metrics.ens.toFixed(1)} Ws unmet · MG1 ${metrics.criticalServed.toFixed(2)}% served`
    : "Run to 20 seconds to read your engineering report.";
}

const monitor = createMonitor(elements.monitor, {
  onSelectZone: (index) => selectNode(DISTRICTS[index]?.id),
  onSeek: seek,
});
const singleLine = createSingleLine(elements.diagram, selectNode, (key) => {
  const district = activeDistrict();
  if (!district) return;
  if(key==="relay") manual({relayMode:district.relayMode===2?0:district.relayMode===0?1:2});
  else manual({ [key]: !district.switches[key] });
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

const statusButtons=DISTRICTS.map(({id})=>{
  const control=button(id,()=>selectNode(id));
  byId("utility-status").append(control);
  return control;
});
const utilitySwitches = [
  ["water","City water pump", () => {
    const pump=pumpState(sampleAt(state.run,state.time));
    manual({service:"cooling",enabled:!pump.enabled},"MG2");
  }],
  ["main","Main MCU",()=> {state.mainEnabled=!state.mainEnabled; configure();}],
  ["localMcu","Local MCU",()=>flipDistrict("localMcu")],
  ["pv","PV",()=>flipDistrict("pv")],
  ["battery","Battery",()=>flipDistrict("battery")],
  ["load","Demand",()=>flipDistrict("load")],
  ["relay","Relay",()=> {
    const d=activeDistrict();
    if(d) manual({relayMode:d.relayMode===2?0:d.relayMode===0?1:2});
  }],
  ["generator","Generator",()=> {elements.generator.checked=!elements.generator.checked; configure();}],
].map(([key,label,action])=>{
  const control=button(label,action);
  byId("utility-switches").append(control);
  return {key,label,control};
});

function pumpState(frame) {
  return frame.districts.find(({id})=>id==="MG2").services.find(({id})=>id==="cooling");
}
function flipDistrict(key) {
  const district=activeDistrict();
  if(district) manual({[key]:!district.switches[key]});
}
function renderUtilities(frame) {
  const pump=pumpState(frame);
  const district=frame.districts.find(({id})=>id===state.selected);
  for(const [index,row] of frame.districts.entries()) {
    const control=statusButtons[index], off=row.voltage<10, limited=row.unserved>.4;
    control.dataset.state=off?"out":limited?"limited":"normal";
    control.setAttribute("aria-pressed",String(row.id===state.selected));
    control.textContent=`${row.id}  ${row.voltage.toFixed(1)} V · ${off?"OUT":limited?"LIMITED":"SUPPLIED"}`;
  }
  for(const {key,label,control} of utilitySwitches) {
    const global=["water","main","generator"].includes(key);
    const enabled=key==="water"?pump.enabled:key==="main"?state.mainEnabled:key==="generator"?elements.generator.checked:district?.switches[key];
    control.disabled=!global&&!district;
    control.setAttribute("aria-pressed",String(Boolean(enabled)));
    const value=key==="relay"&&district?["OPEN","CLOSED","AUTO"][district.relayMode]
      :key==="localMcu"&&district&&!district.localAlive&&enabled?"SCENARIO FAULT":enabled?"ON":"OFF";
    control.textContent=`${global?"":(district?.id ?? "District")+" "}${label} · ${value}`;
  }
  const relay=frame.flows.filter(({type})=>type==="relay").map(({from,to,watts})=>`${from} → ${to} ${watts.toFixed(1)} W`);
  const water=pump.served>.025?"Water supplied to four districts":"Water supply stopped";
  byId("utility-flow").textContent=`${water} · ${relay.length?relay.join(" / "):"No relay transfer"} · Generator ${frame.totals.generator.toFixed(1)} W`;
}

const airSignals=byId("air-signals");
let renderedSignals="";
function renderAirSignals(frame) {
  if(!state.controlLayer || elements["city-frame"].hidden) return;
  const main=state.mainEnabled
    ? frame.support?.receiver ? `${frame.support.receiver} · ${frame.support.reason || "Support request received"}` : "Main MCU monitoring all districts"
    : "Main MCU disabled";
  const entries=frame.districts.map(zone=>{
    const power=zone.localAlive?"Local MCU online":zone.owner==="MAIN"?"Main takeover":"Local MCU offline";
    const command=zone.mainCommand==="NONE"?"No override":zone.mainCommand;
    const switches=["battery","pv","load","generator"].map(key=>
      Number(zone.switches[key]&&zone.sourceEnabled&&(key!=="generator"||elements.generator.checked))).join("");
    return [zone.id,`${power} · Request ${Number(zone.request)} · Relay ${zone.relay?"closed":"open"} · SW1–4 ${switches} · ${command}`];
  });
  const signature=JSON.stringify([main,entries]);
  if(renderedSignals===signature) return;
  renderedSignals=signature;
  const heading=document.createElement("h3");
  heading.textContent=main;
  const roles=document.createElement("p");
  roles.textContent="Local MCUs read voltage, charge and load, then set source switches or request support. The Main MCU selects donors, commands relays, limits load and takes over failed local control.";
  const list=document.createElement("dl");
  for(const [id,status] of entries) {
    const row=document.createElement("div"), title=document.createElement("dt"), value=document.createElement("dd");
    title.textContent=id;
    value.textContent=status;
    row.append(title,value);list.append(row);
  }
  airSignals.replaceChildren(heading,roles,list);
}

function setScenario(id) {
  waterDrill = false;
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
    mainEnabled: state.mainEnabled,
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

function activeDistrict() {
  return sampleAt(state.run, state.time).districts.find(({ id }) => id === state.selected);
}

function manual(values, target=state.selected) {
  const t = sampleAt(state.run, state.time).t;
  state.interventions.push({ t, district: target, ...values });
  state.running = false;
  configure();
  elements["district-message"].textContent = `${target} input applied at ${t.toFixed(2)} s.`;
}

let controlsZone = null;
function renderServices(zone) {
  if (controlsZone !== zone?.id) {
    controlsZone = zone?.id;
    elements["service-controls"].replaceChildren(...(zone?.services ?? []).map(({ id, name }) => {
      const entry = button(name, () => {
        const service = activeDistrict()?.services.find((item) => item.id === id);
        if (service) manual({ service: id, enabled: !service.enabled });
      });
      entry.dataset.service = id;
      entry.append(document.createElement("small"));
      return entry;
    }));
  }
  for (const [index, service] of (zone?.services ?? []).entries()) {
    const control = elements["service-controls"].children[index];
    control.setAttribute("aria-pressed", String(service.enabled));
    control.toggleAttribute("data-current", state.component === service.id);
    const label = service.demand > .05 ? `${asNumber(service.served)} W` : service.enabled ? "ISOLATED" : "OFF";
    control.lastElementChild.textContent = label;
  }
}

function renderSignals(zone, frame) {
  if (!elements["signal-panel"].open) return;
  const { totals } = frame;
  const fixed = (n, units) => `${asNumber(n, 2)} ${units}`;
  const binary = (on) => on ? "1" : "0";
  const values = zone ? [
    ["Ruser", fixed(zone.rUser,"Ω")], ["S", fixed(zone.irradiance, "W/m²")], ["TempC", fixed(zone.temperature,"°C")],
    ["SoC", fixed(zone.soc,"%")], ["Vbus", fixed(zone.voltage,"V")], ["Pload", fixed(zone.served,"W")],
    ["Ppv", fixed(zone.pv,"W")], ["Pbatt", fixed(zone.battery,"W")], ["Prenew", fixed(zone.pv+zone.battery,"W")],
    ["Pgen", fixed(zone.generator,"W")], ["Pshared", fixed(zone.imported-zone.exported,"W")],
    ["SW1 · Battery", binary(zone.switches.battery && zone.sourceEnabled)], ["SW2 · PV", binary(zone.switches.pv && zone.sourceEnabled)],
    ["SW3 · Demand", binary(zone.switches.load && zone.sourceEnabled)], ["SW4 · Generator", binary(zone.switches.generator && elements.generator.checked && zone.sourceEnabled)],
    ["reqFlag", binary(zone.request)], ["localAlive", binary(zone.localAlive)], ["Relay_manual", zone.relayMode], ["cmdRelay", binary(zone.relay)],
    ["mainCmd", zone.mainCommand], ["Roverride", zone.shed ? fixed(144 / zone.effectiveDemand,"Ω") : "Inactive"],
  ] : [["Generator_P", fixed(totals.generator,"W")], ["ActiveTime", fixed(Math.max(0,frame.t-2),"s")],
    ["Relay commands", frame.districts.map(({ relay }) => binary(relay)).join(" · ")],
    ["Local MCU availability", frame.districts.map(({ localAlive }) => binary(localAlive)).join(" · ")]];
  const nodes = values.flatMap(([label, value]) => {
    const term = document.createElement("dt");
    const desc = document.createElement("dd");
    term.textContent = label;
    desc.textContent = value;
    return [term,desc];
  });
  elements["signal-values"].replaceChildren(...nodes);
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

const localPower=byId("local-power");
const powerRows=byId("local-power-rows");
for(let i=0;i<6;i++)powerRows.append(document.createElement("dt"),document.createElement("dd"));
function renderInspector(frame) {
  const zone = frame.districts.find(({ id }) => id === state.selected);
  const { totals, support } = frame;
  localPower.hidden=!zone;
  if(zone) {
    for(const [i,[label,watts]] of districtPowerRows(zone).entries()) {
      powerRows.children[i*2].textContent=label;
      powerRows.children[i*2+1].textContent=displayWatts(watts);
    }
    const mode=!zone.switches.battery ? "Isolated" : !zone.sourceEnabled ? "Control unavailable" : describeBattery(zone.battery);
    byId("battery-state").textContent=`3S pack · ${zone.soc.toFixed(1)}% · ${mode}`;
  }
  renderServices(zone);
  renderSignals(zone, frame);
  if (zone) {
    const part = components[state.component];
    elements["node-id"].textContent = `${zone.id} · Priority ${zone.priority}`;
    const service = zone.services.find(({ id }) => id === state.component);
    elements["node-title"].textContent = part?.[0] ?? service?.name ?? zone.name;
    elements["node-description"].textContent = part?.[1] ?? (service
      ? "Use the equipment switch below. This consumer contributes part of the district’s aggregate resistive load."
      : districtUses[zone.id]);
    metrics([
      ["Bus voltage", `${asNumber(zone.voltage, 2)} V`], ["Battery SoC", `${asNumber(zone.soc)}%`],
      ["Demand", asW(zone.demand)], ["Load served", asW(zone.served)],
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
  renderAirSignals(frame);
  renderUtilities(frame);
  renderMission();
  state.scene?.update(frame,state.mainEnabled);
  if (!elements.diagram.hidden) singleLine.update(frame, state.selected);
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
  if (previousTime !== null) state.time = Math.min(LIMITS.duration, state.time +
    Math.min(.15, (now - previousTime) / 1000) * Number(elements["sim-speed"].value));
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
elements["reset-view"].addEventListener("click", () => {
  elements["camera-mode"].value = "orbit";
  state.scene?.resetView();
});
elements["focus-view"].addEventListener("click", () => {
  elements["camera-mode"].value = "orbit";
  state.scene?.select(state.selected, { focus: true });
});
for (const [id,factor] of [["zoom-in",.72],["zoom-out",1/.72]]) {
  elements[id].addEventListener("click", () => {
    if (elements["camera-mode"].value !== "orbit") elements["reset-view"].click();
    state.scene?.zoomCamera(factor);
  });
}
elements["camera-mode"].addEventListener("change", (event) => state.scene?.setCamera(event.target.value));
elements.graphics.addEventListener("change", (event) => state.scene?.setQuality(event.target.value));
elements["clean-hud"].addEventListener("click", () => {
  const minimal = elements["city-frame"].classList.toggle("clean-hud");
  elements["clean-hud"].setAttribute("aria-pressed", String(minimal));
  elements["clean-hud"].textContent = minimal ? "Show HUD" : "Clear HUD";
  state.scene?.setLabels(!minimal);
});
byId("water-drill").addEventListener("click", () => {
  setScenario("I");
  waterDrill=true;
  manual({service:"cooling",enabled:false},"MG2");
});
byId("export-run").addEventListener("click", () => {
  const columns = ["time_s","district","bus_V","battery_pct","demand_W","served_W","pv_W","battery_W","generator_W","import_W","export_W","relay_closed","controller"];
  const rows = state.run.frames.flatMap(({t,districts}) => districts.map(row =>
    [t,row.id,row.voltage,row.soc,row.demand,row.served,row.pv,row.battery,row.generator,row.imported,row.exported,Number(row.relay),row.owner].join(",")));
  const url = URL.createObjectURL(new Blob([[columns.join(","),...rows].join("\r\n")], {type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = `cybercity-browser-${state.run.scenario.id}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const gameButtons = [...document.querySelectorAll("button[data-game]")];
for (const control of gameButtons) control.addEventListener("click", () => {
  gameMode = control.dataset.game;
  byId("city").dataset.game = gameMode;
  for (const item of gameButtons) item.setAttribute("aria-pressed", String(item === control));
  elements.mission.hidden = gameMode !== "challenge";
  (gameMode === "sandbox" ? elements["line-mode"] : elements["city-mode"]).click();
});
for (const [id, useCity] of [["city-mode", true], ["line-mode", false]]) {
  elements[id].addEventListener("click", () => {
    elements["city-frame"].hidden = !useCity;
    elements.diagram.hidden = useCity;
    airSignals.hidden=!useCity || !state.controlLayer;
    elements["city-mode"].setAttribute("aria-pressed", String(useCity));
    elements["line-mode"].setAttribute("aria-pressed", String(!useCity));
    render();
  });
}
byId("mcu-layer").addEventListener("click", () => {
  state.controlLayer=!state.controlLayer;
  const enabled=state.controlLayer;
  byId("mcu-layer").setAttribute("aria-pressed",String(enabled));
  elements["city-frame"].classList.toggle("control-network",enabled);
  byId("signal-key").hidden=!enabled;
  state.scene?.setNetwork(enabled?"controls":"utilities");
  elements["city-mode"].click();
  if(enabled)elements["reset-view"].click();
  render();
});
elements["wide-view"].addEventListener("click", () => {
  const expanded = byId("city").classList.toggle("wide-view");
  elements["wide-view"].setAttribute("aria-pressed", String(expanded));
  elements["wide-view"].textContent = expanded ? "Compact view" : "Expand view";
});
elements.daylight.addEventListener("click", () => {
  const day = elements.daylight.getAttribute("aria-pressed") !== "true";
  elements.daylight.setAttribute("aria-pressed", String(day));
  elements.daylight.textContent = day ? "Daylight" : "Night";
  state.scene?.setDaylight(day);
});
for (const element of [elements.sharing, elements.takeover, elements.generator, elements["load-scale"]]) {
  element.addEventListener("change", configure);
}
elements["load-scale"].addEventListener("input", () => {
  elements["load-scale-value"].textContent = `${elements["load-scale"].value}%`;
});
elements["restore-controls"].addEventListener("click", () => {
  state.mainEnabled = true;
  elements.sharing.checked = true;
  elements.takeover.checked = true;
  elements.generator.checked = true;
  elements["load-scale"].value = "100";
  elements["load-scale-value"].textContent = "100%";
  configure();
});
elements["figure-scenario"].addEventListener("change", renderFigures);
elements["figure-gallery"].addEventListener("toggle", renderFigures);
elements["signal-panel"].addEventListener("toggle", render);

elements["district-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.selected.startsWith("MG")) return;
  const changes = [...new FormData(event.target)].filter(([, value]) => value !== "");
  if (!changes.length) {
    elements["district-message"].textContent = "Select at least one change.";
    return;
  }
  const numeric = new Set(["resistance","temperature","irradiance","relayMode"]);
  const values = Object.fromEntries(changes.map(([key, value]) => [key, numeric.has(key) ? Number(value) : value === "true"]));
  event.target.reset();
  manual(values);
});
elements["clear-events"].addEventListener("click", () => {
  state.interventions = [];
  configure();
  elements["district-message"].textContent = "Custom events cleared.";
});

markButton(nodeButtons, state.selected);
setScenario("I");

import("./city.mjs?v=power-1").then(({ mountCity }) => {
  state.scene = mountCity(elements["city-canvas"], {
    onPick: selectNode,
    onStatus: ({ kind, message, assets }) => {
      elements["scene-status"].textContent = message || "";
      elements["scene-status"].hidden = kind === "ready";
      if (assets) elements["city-canvas"].dataset.loadedModels = assets.join(",");
      if (kind === "error") {
        for(const id of ["reset-view","focus-view","zoom-in","zoom-out","daylight"]) elements[id].disabled=true;
      }
    },
  });
  elements["reset-view"].disabled = elements["focus-view"].disabled = elements.daylight.disabled = !state.scene;
  elements["zoom-in"].disabled = elements["zoom-out"].disabled = !state.scene;
  elements["camera-mode"].disabled = elements.graphics.disabled = !state.scene;
  byId("mcu-layer").disabled=!state.scene;
  if (state.scene && matchMedia("(pointer: coarse)").matches) {
    elements.graphics.value = "medium";
    state.scene.setQuality("medium");
  }
  state.scene?.select(state.selected);
  render();
}).catch((error) => {
  console.error("CyberCity 3D initialization", error);
  elements["scene-status"].textContent = "3D view unavailable. Scenario controls and monitoring are available.";
});
