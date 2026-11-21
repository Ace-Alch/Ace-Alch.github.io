/**
 * Reduced-order CyberCity demonstrator.
 * Scenario inputs and acceptance criteria come from the thesis, Chapter 6.
 * Dispatch is a steady-state power balance. It cannot reproduce SPS waveforms.
 */
export const LIMITS = Object.freeze({
  duration: 20,
  evaluationStart: 2,
  nominalVoltage: 12,
  voltageBand: [11.6, 12.8],
  busCollapseVoltage: 10,
  busCollapseTime: 0.05,
  maxENS: 180,
  maxGeneratorDependency: 60,
  minCriticalServed: 95,
  minCriticalCompliance: 90,
  irradiance: 500,
  temperature: 22,
  pvRating: 72,
  batteryAh: 0.1,
  localAdequacy: 34,
  sourceReferences: { pv: 12.5, battery: 12, generator: 11.95 },
  generatorStages: [140, 130, 120, 110],
  loadLimits: [80, 70, 60, 60],
});

export const MODEL_NOTE = "Browser power-balance model. It uses the thesis loads, controller thresholds and time sequence, with estimated source dispatch. Converter switching and electrical transients require the original Simulink model. Scenario III uses the observed MG4-to-MG2 sequence as a routing preference, subject to donor safety checks. The published Simulink results are separate.";

export const DISTRICTS = [
  { id: "MG1", name: "Critical", priority: 1, color: "#F3AAC6", requestOn: 30, requestOff: 35, highNeed: 22, donorOn: 45, donorOff: 40, preference: [3, 2, 1] },
  { id: "MG2", name: "Industrial", priority: 2, color: "#78CAE5", requestOn: 24, requestOff: 29, highNeed: 18, donorOn: 35, donorOff: 30, preference: [3, 2, 0] },
  { id: "MG3", name: "Social", priority: 3, color: "#A6DD99", requestOn: 18, requestOff: 22, highNeed: 14, donorOn: 25, donorOff: 20, preference: [3, 1, 0] },
  { id: "MG4", name: "Residential", priority: 4, color: "#E9B477", requestOn: 15, requestOff: 19, highNeed: 12, donorOn: 15, donorOff: 10, preference: [2, 1, 0] },
];

const change = (t, resistance, title, detail, zone = null) => ({ t, resistance, title, detail, zone });
const scenario = (id, title, description, soc, resistance, changes = [], offline = null) => ({
  id, title, label: title, description, soc, resistance, changes, offline,
});

// Tables 16–23. Resistance is in ohms and battery charge is in percent.
export const SCENARIOS = [
  scenario("I", "Baseline local operation",
    "All four zones begin at 75% charge and operate independently under a 5 Ω load.",
    [75, 75, 75, 75], [5, 5, 5, 5]),
  scenario("II", "MG1 critical-zone overload",
    "At 4 s the critical zone requests approximately 90 W. The Main MCU can select a safe donor and the generator can supply a remaining deficit.",
    [60, 85, 85, 90], [5, 6, 6, 7], [
      change(4, [1.6, 6, 6, 7], "Critical-zone load increases", "MG1 changes from 5 Ω to 1.6 Ω.", "MG1"),
    ]),
  scenario("III", "Inter-microgrid support",
    "MG3 starts at 16% charge, faces an overload at 4 s and its load decreases at 14 s. The thesis observed MG4 support first, then MG2.",
    [75, 75, 16, 95], [6, 6, 5, 8], [
      change(4, [6, 6, 1.8, 8], "Social-zone load increases", "MG3 changes from 5 Ω to 1.8 Ω.", "MG3"),
      change(14, [6, 6, 4, 8], "Social-zone load decreases", "MG3 changes from 1.8 Ω to 4 Ω.", "MG3"),
    ]),
  scenario("IV", "Support request with unsafe donors",
    "MG3 faces heavy demand and the other zones have low reserves or higher loads. The Main MCU must refuse unsafe relay support.",
    [32, 24, 15, 8], [6, 5, 5, 5], [
      change(4, [6, 4, 1.8, 4], "Receiver and donor loads increase", "MG3 requests about 80 W. MG2 and MG4 each request about 36 W.", "MG3"),
    ]),
  scenario("V", "MG2 local MCU unavailable",
    "The industrial load increases at 4 s. The MG2 Local MCU becomes unavailable at 6 s. The Main MCU can take over the command path.",
    [80, 65, 80, 90], [6, 5, 6, 7], [
      change(4, [6, 2.2, 6, 7], "Industrial-zone load increases", "MG2 changes from 5 Ω to 2.2 Ω.", "MG2"),
    ], { t: 6, district: "MG2" }),
  scenario("VI", "Combined worst-case stress",
    "Low reserves, a critical overload and two load steps coincide with MG3 Local MCU unavailability. The thesis run fails the ENS limit.",
    [42, 28, 16, 11], [5, 5, 5, 5], [
      change(4, [1.6, 4, 4, 4], "Critical overload and city-wide load increase", "MG1 requests about 90 W. MG2–MG4 each request about 36 W.", "MG1"),
      change(8, [1.6, 2.2, 2, 2.3], "Second city-wide load increase", "MG2–MG4 loads increase while the MG3 Local MCU remains unavailable."),
    ], { t: 6, district: "MG3" }),
];

// Tables 25–36, ordered by MG1–MG4. All ratios in the printed tables are percentages.
const publishedDistrictRows = [
  [[1.399, .2698, .0216, 100, 0, 0, 99.73], [1.399, .2698, .0216, 100, 0, 0, 99.73], [1.399, .2698, .0216, 100, 0, 0, 99.73], [1.399, .2698, .0216, 100, 0, 0, 99.73]],
  [[17.79, 1.188, .05883, 100, 16, 16, 98.81], [1.096, .2537, .02327, 100, 0, 0, 99.75], [1.096, .2537, .02327, 100, 0, 0, 99.75], [3.434, .9275, .05792, 100, 16, 0, 99.07]],
  [[1.09, .2523, .02403, 100, 0, 0, 99.75], [2.893, .6697, .04783, 100, 16, 0, 99.33], [10.16, .9468, .04852, 100, 18, 18, 99.05], [.8088, .2496, .0278, 100, 2, 0, 99.75]],
  [[1.092, .2528, .02325, 100, 0, 0, 99.75], [5.851, .9234, .0528, 100, 0, 0, 99.08], [16.69, 1.248, .06438, 100, 0, 0, 98.75], [5.866, .9258, .05294, 100, 0, 18, 99.07]],
  [[1.088, .2519, .02321, 100, 0, 0, 99.75], [11.73, 1.062, .05558, 100, 16, 16, 98.94], [1.088, .2519, .02321, 100, 0, 0, 99.75], [3.285, .8871, .05506, 100, 16, 0, 99.11]],
  [[19.7, 1.32, .06807, 99.99, 0, 0, 98.68], [10.9, 1.11, .05897, 99.99, 0, 0, 98.89], [153.8, 14.43, .0581, 99.99, 0, 14, 85.57], [10.4, 1.093, .05859, 99.99, 0, 18, 98.91]],
];

// Table 37, §7.8. Keep the printed precision of each metric.
const publishedSystemRows = [
  [5.594, .2698, .0216, 100, 0, 0, 0, 2068, 2074, 0, 99.73, 99.73, true],
  [23.42, .8572, .04082, 100, 32, 16, 650.1, 2708, 2732, 24, 98.81, 98.81, true],
  [14.96, .6613, .03705, 100, 36, 18, 341.4, 2247, 2262, 15.2, 99.75, 99.05, true],
  [29.5, .9714, .04834, 100, 0, 18, 763.6, 3007, 3037, 25.39, 99.75, 98.75, true],
  [17.19, .7349, .03927, 100, 32, 16, 236.2, 2322, 2339, 10.17, 99.75, 98.94, true],
  [194.9, 4.328, .06093, 99.99, 0, 32, 1941, 4308, 4503, 45.06, 98.68, 85.57, false],
];

const failureReasons = ["No failure", "Invalid signal", "SoC outside 0–100%", "Sustained bus voltage below 10 V",
  "MG1 load served below 95%", "Total ENS exceeds 180 Ws", "Generator dependency exceeds 60%", "MG1 voltage compliance below 90%"];

export const PUBLISHED = Object.fromEntries(SCENARIOS.map(({ id }, index) => {
  const [ens, ensPercent, voltageRmse, voltageCompliance, relayDuration, takeoverDuration, generatorEnergy,
    servedEnergy, demandEnergy, generatorDependency, criticalServed, minimumServed, success] = publishedSystemRows[index];
  const districts = publishedDistrictRows[index].map((row, zone) => {
    const [ens, ensPercent, voltageRmse, voltageCompliance, relayDuration, takeoverDuration, loadServed] = row;
    return { id: DISTRICTS[zone].id, ens, ensPercent, voltageRmse, voltageCompliance, relayDuration, takeoverDuration, loadServed };
  });
  const failureReasonCode = success ? 0 : 5;
  return [id, { source: "Published thesis, Chapter 7, Tables 25–37", evaluationStart: 2, evaluationDuration: 18,
    ens, ensPercent, voltageRmse, voltageCompliance, relayDuration, takeoverDuration, generatorEnergy, servedEnergy,
    demandEnergy, generatorDependency, criticalServed, minimumServed, success, failureReasonCode,
    failureReason: failureReasons[failureReasonCode], districts }];
}));

const STEP = 0.05;
const PV_OPERATING_WATTS = 16.5; // Midpoint of the reported 16–17 W baseline.
const BATTERY_POWER_WATTS = 18; // Representative value in the archived model's 17–20 W block range.
const BATTERY_NOMINAL_ENERGY = LIMITS.nominalVoltage * LIMITS.batteryAh * 3600;
const GENERATOR_PREVIEW_LIMIT = 140; // Highest thesis supervisory threshold, used as a demo budget.
const RELAY_ARM_TIME = 0.5;
const MIN_PAIR_HOLD = 0.5;
const EPSILON = 0.001;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function percent(part, whole, empty = 0) {
  return whole > 0 ? 100 * part / whole : empty;
}

function receiverNeed(zone, index) {
  const deficit = Math.max(0, zone.localTarget - zone.available);
  const need = Math.max(
    zone.heavy ? 3.5 : 0,
    zone.soc <= zone.highNeed ? 4 : zone.soc <= zone.requestOn ? 3 : 0,
    deficit >= Math.max(5, .18 * zone.localTarget) ? 2.5 : deficit >= Math.max(2.5, .10 * zone.localTarget) ? 1.5 : 0,
  );
  return need + (4 - index) * .01;
}

function donorReason(donor, receiver, keeping = false) {
  if (donor.id === receiver.id) return "Selected receiver";
  if (!donor.switches.relay) return "Donor relay isolated";
  if (!donor.localAlive) return "Local MCU unavailable";
  if (donor.request || donor.heavy) return "Local support needed";
  if (donor.soc < (keeping ? donor.donorOff : donor.donorOn)) return "Reserve below donor threshold";
  if (donor.demand > 45) return "Local demand above donor limit";
  if (donor.localTarget - donor.available > Math.max(3, .12 * donor.localTarget)) return "Local power deficit";
  return null;
}

function donorScore(zone) {
  const loadScore = zone.demand <= 34 ? 8 : -.4 * (zone.demand - 34);
  return 10 * zone.priority + .2 * zone.soc + loadScore + .5 * (zone.available - zone.localTarget);
}

function decideSupport(districts, activePair, t, settings, sc) {
  const requested = districts.filter((zone) => zone.request || zone.need >= 1.5)
    .sort((first, second) => second.need - first.need);
  const receiver = requested[0] ?? null;
  if (!receiver || t < RELAY_ARM_TIME) return { receiver, donor: null, reason: "", candidates: [] };
  if (!receiver.sourceEnabled) return { receiver, donor: null, reason: "Receiver command path unavailable", candidates: [] };
  if (!receiver.switches.relay) return { receiver, donor: null, reason: "Receiver relay isolated", candidates: [] };

  // Chapter 7 reports that MG4 carries the initial connection in III and MG2
  // follows after the 4 s load step. Use that observation as the browser's
  // preferred route only if the candidate still passes all donor safety checks.
  const observedRoute = sc.id === "III" && receiver.id === "MG3" ? (t < 4 ? "MG4" : "MG2") : null;
  const candidates = receiver.preference.map((index) => {
    const zone = districts[index];
    const reason = donorReason(zone, receiver);
    return { id: zone.id, eligible: reason === null, reason, score: donorScore(zone) };
  });
  if (!settings.sharing) return { receiver, donor: null, reason: "Relay sharing disabled", candidates };
  if (activePair && activePair.receiver === receiver.id) {
    const established = districts.find((zone) => zone.id === activePair.donor);
    const safe = donorReason(established, receiver, true) === null;
    if (safe && (t - activePair.since < MIN_PAIR_HOLD || !observedRoute || established.id === observedRoute)) {
      return { receiver, donor: established, reason: "Existing relay pair retained", candidates };
    }
  }
  const eligible = candidates.filter((candidate) => candidate.eligible).sort((a, b) => b.score - a.score);
  const selected = eligible.find((candidate) => candidate.id === observedRoute) ?? eligible[0];
  return {
    receiver,
    donor: selected ? districts.find((zone) => zone.id === selected.id) : null,
    reason: selected ? "Safe donor selected" : "No safe donor",
    candidates,
  };
}

function availableSupply(resistance, states, t, sc, settings) {
  return DISTRICTS.map((zone, index) => {
    const state = states[index];
    const switches = { ...state.switches };
    const localAlive = switches.localMcu && !(sc.offline?.district === zone.id && t >= sc.offline.t);
    const sourceEnabled = localAlive || settings.takeover;
    const loadScale = settings.loadScale * state.loadScale;
    const actualResistance = Math.max(1, resistance[index] / loadScale);
    const demand = LIMITS.nominalVoltage ** 2 / actualResistance;
    const pvCapacity = sourceEnabled && switches.pv ? PV_OPERATING_WATTS * (settings.irradiance / LIMITS.irradiance) : 0;
    const batteryCapacity = sourceEnabled && switches.battery
      ? Math.min(BATTERY_POWER_WATTS, state.soc * BATTERY_NOMINAL_ENERGY / (100 * STEP)) : 0;
    const available = pvCapacity + batteryCapacity;
    const localTarget = Math.min(demand, LIMITS.localAdequacy);
    const requestOn = state.soc <= zone.requestOn || state.voltage <= 11.2 ||
      (localTarget > 3 && available < localTarget - Math.max(2, .08 * localTarget));
    const requestOff = state.soc >= zone.requestOff && state.voltage >= 11.5 &&
      available >= localTarget - Math.max(1, .04 * localTarget);
    state.request = localAlive && (state.request ? !requestOff : requestOn);
    state.heavy = state.heavy ? actualResistance < 3.3 : actualResistance <= 3;
    const loadLimit = LIMITS.loadLimits[index];
    const clearResistance = 1.2 * LIMITS.nominalVoltage ** 2 / loadLimit;
    state.shed = settings.generator && settings.takeover && state.shed && actualResistance < clearResistance;
    const effectiveDemand = state.shed ? Math.min(loadLimit, demand) : demand;
    const record = {
      ...zone, soc: state.soc, actualResistance, effectiveDemand, demand, localAlive, sourceEnabled, switches, loadScale,
      available, batteryCapacity, pvCapacity, localTarget, request: state.request, heavy: state.heavy, shed: state.shed,
      owner: localAlive ? "LOCAL" : settings.takeover ? "MAIN" : "OFFLINE",
      relay: false, donor: false, imported: 0, exported: 0, generator: 0, pv: 0, battery: 0,
    };
    return { ...record, need: receiverNeed(record, index) };
  });
}

function applyGeneratorStages(districts, states, pair, settings, t) {
  if (!settings.generator || !settings.takeover || t < RELAY_ARM_TIME) return;
  const estimatedGeneratorDemand = () => {
    const totalDeficit = sum(districts.map((zone) => zone.sourceEnabled ? Math.max(0, zone.effectiveDemand - zone.available) : 0));
    const relayRelief = pair.donor
      ? Math.min(Math.max(0, pair.receiver.effectiveDemand - pair.receiver.available),
        Math.max(0, pair.donor.available - pair.donor.effectiveDemand))
      : 0;
    return totalDeficit - relayRelief;
  };
  // The web model settles each stage before testing the next threshold. The
  // SPS implementation instead observes generator power at its solver step.
  for (let index = districts.length - 1; index >= 0; index -= 1) {
    const zone = districts[index];
    const limit = LIMITS.loadLimits[index];
    if (zone.demand > limit && !zone.shed && estimatedGeneratorDemand() >= LIMITS.generatorStages[index]) {
      zone.shed = states[index].shed = true;
      zone.effectiveDemand = limit;
    }
  }
}

function dispatch(districts, pair, settings, t) {
  const flows = [];
  if (pair.donor) {
    const { receiver, donor } = pair;
    receiver.relay = true;
    donor.relay = true;
    donor.donor = true;
    const watts = Math.min(Math.max(0, receiver.effectiveDemand - receiver.available),
      Math.max(0, donor.available - donor.effectiveDemand));
    donor.exported = receiver.imported = watts;
    if (watts > EPSILON) flows.push({ from: donor.id, to: receiver.id, watts, type: "relay" });
  }
  let availableGenerator = settings.generator && t >= RELAY_ARM_TIME ? GENERATOR_PREVIEW_LIMIT : 0;
  for (const zone of districts) {
    const { effectiveDemand, imported, exported, available, sourceEnabled, pvCapacity, batteryCapacity } = zone;
    const generatorNeeded = sourceEnabled && effectiveDemand > available + imported;
    const targetVoltage = generatorNeeded ? LIMITS.sourceReferences.generator : LIMITS.sourceReferences.battery;
    const target = sourceEnabled ? effectiveDemand * (targetVoltage / LIMITS.nominalVoltage) ** 2 : 0;
    const localTarget = Math.max(0, target + exported - imported);
    zone.pv = Math.min(pvCapacity, localTarget);
    zone.battery = Math.min(batteryCapacity, Math.max(0, localTarget - zone.pv));
    zone.generator = Math.min(availableGenerator, Math.max(0, localTarget - zone.pv - zone.battery));
    availableGenerator -= zone.generator;
    if (zone.generator > EPSILON) flows.push({ from: "GEN", to: zone.id, watts: zone.generator, type: "generator" });
    zone.served = Math.max(0, Math.min(zone.demand, zone.pv + zone.battery + zone.generator + imported - exported));
    zone.unserved = zone.demand - zone.served;
    zone.voltage = effectiveDemand > EPSILON ? LIMITS.nominalVoltage * Math.sqrt(zone.served / effectiveDemand) : targetVoltage;
    const charge = zone.switches.battery
      ? Math.min(Math.max(0, pvCapacity - zone.pv), Math.max(0, (100 - zone.soc) * BATTERY_NOMINAL_ENERGY / (100 * STEP)))
      : 0;
    zone.pv += charge;
    zone.battery -= charge;
    const activeCommand = zone.id === pair.receiver?.id && !!pair.reason && settings.sharing;
    zone.takeover = !zone.localAlive || activeCommand;
    zone.mainCommand = activeCommand ? (pair.donor ? "DONOR FOUND" : "NO SAFE DONOR") : zone.shed ? "LIMIT LOAD" : "NONE";
  }
  return flows;
}

function makeEvent(t, type, title, detail, zone = null) {
  return { t, time: t, type, title, detail, zone };
}

const switchLabels = { pv: "PV path", battery: "Battery path", relay: "Relay path", localMcu: "Local MCU" };

function normalizeInterventions(interventions) {
  if (!Array.isArray(interventions)) return [];
  return interventions.flatMap((entry) => {
    if (!entry || !Number.isFinite(entry.t)) return [];
    const zoneIndex = DISTRICTS.findIndex(({ id }) => id === entry.district);
    if (zoneIndex < 0) return [];
    const t = Math.ceil(clamp(entry.t, 0, LIMITS.duration) / STEP - EPSILON) * STEP;
    const switches = Object.fromEntries(Object.keys(switchLabels).flatMap((name) =>
      typeof entry[name] === "boolean" ? [[name, entry[name]]] : []));
    const loadScale = Number.isFinite(entry.loadScale) ? clamp(entry.loadScale, .25, 3) : null;
    return loadScale !== null || Object.keys(switches).length
      ? [{ t, zoneIndex, district: entry.district, switches, loadScale }] : [];
  }).sort((a, b) => a.t - b.t);
}

function applyIntervention(entry, states, events) {
  const state = states[entry.zoneIndex];
  const messages = [];
  for (const [name, enabled] of Object.entries(entry.switches)) {
    if (state.switches[name] === enabled) continue;
    state.switches[name] = enabled;
    const onLabel = name === "localMcu" ? "returned to scenario control" : "connected";
    messages.push(`${switchLabels[name]} ${enabled ? onLabel : "isolated"}`);
  }
  if (entry.loadScale !== null && entry.loadScale !== state.loadScale) {
    state.loadScale = entry.loadScale;
    messages.push(`requested demand factor ${entry.loadScale.toFixed(2)}×`);
  }
  if (messages.length) events.push(makeEvent(entry.t, "intervention", `${entry.district} manual intervention`,
    messages.join(". ") + ".", entry.district));
}

function processKpis(frames) {
  const evaluation = frames.filter(({ t }) => t >= LIMITS.evaluationStart && t < LIMITS.duration);
  const evaluationDuration = evaluation.length * STEP;
  let maxCollapseDuration = 0;
  const districts = DISTRICTS.map((zone, index) => {
    let ens = 0;
    let demandEnergy = 0;
    let servedEnergy = 0;
    let squaredVoltageError = 0;
    let complianceDuration = 0;
    let takeoverDuration = 0;
    let relayDuration = 0;
    let requestDuration = 0;
    let collapseDuration = 0;
    for (const frame of evaluation) {
      const sample = frame.districts[index];
      ens += STEP * sample.unserved;
      demandEnergy += STEP * sample.demand;
      servedEnergy += STEP * sample.served;
      squaredVoltageError += STEP * (sample.voltage - LIMITS.nominalVoltage) ** 2;
      if (sample.voltage >= LIMITS.voltageBand[0] && sample.voltage <= LIMITS.voltageBand[1]) complianceDuration += STEP;
      if (sample.takeover) takeoverDuration += STEP;
      if (sample.relay) relayDuration += STEP;
      if (sample.request) requestDuration += STEP;
      collapseDuration = sample.voltage < LIMITS.busCollapseVoltage ? collapseDuration + STEP : 0;
      maxCollapseDuration = Math.max(maxCollapseDuration, collapseDuration);
    }
    return { id: zone.id, ens, ensPercent: percent(ens, demandEnergy), demandEnergy, servedEnergy,
      voltageRmse: Math.sqrt(squaredVoltageError / evaluationDuration),
      voltageCompliance: percent(complianceDuration, evaluationDuration), takeoverDuration, relayDuration, requestDuration,
      loadServed: percent(servedEnergy, demandEnergy, 100) };
  });
  const total = (key) => sum(districts.map((district) => district[key]));
  const ens = total("ens");
  const demandEnergy = total("demandEnergy");
  const servedEnergy = total("servedEnergy");
  const generatorEnergy = sum(evaluation.map(({ totals }) => totals.generator * STEP));
  const generatorDependency = percent(generatorEnergy, servedEnergy);
  const criticalServed = districts[0].loadServed;
  const checks = [
    frames.some(({ districts }) => districts.some(({ voltage, soc, demand, served }) =>
      ![voltage, soc, demand, served].every(Number.isFinite))),
    frames.some(({ districts }) => districts.some(({ soc }) => soc < 0 || soc > 100)),
    maxCollapseDuration > LIMITS.busCollapseTime + EPSILON,
    criticalServed < LIMITS.minCriticalServed,
    ens > LIMITS.maxENS,
    generatorDependency > LIMITS.maxGeneratorDependency,
    districts[0].voltageCompliance < LIMITS.minCriticalCompliance,
  ];
  const failureReasonCode = checks.indexOf(true) + 1;
  return {
    evaluationStart: LIMITS.evaluationStart, evaluationDuration, ens, ensPercent: percent(ens, demandEnergy), demandEnergy,
    servedEnergy, voltageRmse: total("voltageRmse") / districts.length, voltageCompliance: total("voltageCompliance") / districts.length,
    relayDuration: total("relayDuration"), requestDuration: total("requestDuration"), takeoverDuration: total("takeoverDuration"),
    generatorEnergy, generatorDependency, criticalServed, minimumServed: Math.min(...districts.map(({ loadServed }) => loadServed)),
    failureReasonCode, failureReason: failureReasons[failureReasonCode], success: failureReasonCode === 0, districts,
  };
}

export function simulate(options = {}) {
  const sc = typeof options.scenario === "number" ? SCENARIOS[options.scenario] :
    SCENARIOS.find(({ id }) => id === (options.scenario?.id ?? options.scenario));
  const current = sc ?? SCENARIOS[0];
  const settings = {
    sharing: options.sharing !== false,
    takeover: options.takeover !== false,
    generator: options.generator !== false,
    loadScale: Number.isFinite(options.loadScale) ? clamp(options.loadScale, .25, 3) : 1,
    irradiance: Number.isFinite(options.irradiance) ? clamp(options.irradiance, 0, 1000) : LIMITS.irradiance,
  };
  const interventions = normalizeInterventions(options.interventions);
  const states = current.soc.map((soc) => ({ soc, voltage: LIMITS.nominalVoltage, request: false, heavy: false, shed: false,
    loadScale: 1, switches: { pv: true, battery: true, relay: true, localMcu: true } }));
  const events = [
    makeEvent(0, "scenario", current.title, current.description),
    makeEvent(2, "daq", "DAQ evaluation begins", "The active KPI interval is 2–20 s."),
    ...current.changes.map(({ t, title, detail, zone }) => makeEvent(t, "load", title, detail, zone)),
  ];
  if (current.offline) {
    const { t, district } = current.offline;
    events.push(makeEvent(t, "fault", `${district} Local MCU unavailable`,
      settings.takeover ? "Arbitration transfers commands to the Main MCU." : "Main MCU takeover is disabled.", district));
  }
  const frames = [];
  let activePair = null;
  let lastDecision = "";
  let previousGenerator = 0;
  let resistance = current.resistance;
  let interventionIndex = 0;
  for (let sample = 0; sample <= LIMITS.duration / STEP; sample += 1) {
    const t = sample / (1 / STEP);
    const action = current.changes.find((entry) => entry.t === t);
    if (action) resistance = action.resistance;
    while (interventionIndex < interventions.length && interventions[interventionIndex].t <= t + EPSILON) {
      applyIntervention(interventions[interventionIndex], states, events);
      interventionIndex += 1;
    }
    const districts = availableSupply(resistance, states, t, current, settings);
    const pair = decideSupport(districts, activePair, t, settings, current);
    applyGeneratorStages(districts, states, pair, settings, t);
    const flows = dispatch(districts, pair, settings, t);
    if (pair.donor && (!activePair || activePair.donor !== pair.donor.id || activePair.receiver !== pair.receiver.id)) {
      activePair = { donor: pair.donor.id, receiver: pair.receiver.id, since: t };
      events.push(makeEvent(t, "relay", `${pair.donor.id} supports ${pair.receiver.id}`,
        "The Main MCU closes two relays on the common DC support bus.", pair.receiver.id));
    } else if (!pair.donor) {
      if (activePair) events.push(makeEvent(t, "relay", "Support relays open", "The selected pair is no longer eligible.", activePair.receiver));
      activePair = null;
    }
    const decision = pair.receiver && pair.reason ? `${pair.receiver.id}:${pair.reason}` : "";
    if (!pair.donor && decision !== lastDecision && pair.reason === "No safe donor") {
      events.push(makeEvent(t, "decision", `Support denied for ${pair.receiver.id}`,
        "The Main MCU keeps relays open because no donor satisfies its reserve and load checks.", pair.receiver.id));
    }
    lastDecision = decision;
    const totals = Object.fromEntries(["demand", "served", "unserved", "pv", "battery", "generator"].map((key) =>
      [key, sum(districts.map((district) => district[key]))]));
    const previous = frames.at(-1);
    if (previous) {
      for (const [index, district] of districts.entries()) {
        if (district.shed && !previous.districts[index].shed) events.push(makeEvent(t, "limit",
          `${district.id} load limit active`, `The Main MCU limits the demand path to ${LIMITS.loadLimits[index]} W at nominal voltage.`, district.id));
      }
      if (totals.generator > EPSILON && previousGenerator <= EPSILON) {
        events.push(makeEvent(t, "generator", "Shared generator supplies load", "The generator feeds the diode-isolated distribution path.", "GEN"));
      }
    }
    frames.push({ t, districts, flows, totals, support: { receiver: pair.receiver?.id ?? null, donor: pair.donor?.id ?? null,
      reason: pair.reason, candidates: pair.candidates } });
    for (const [index, zone] of districts.entries()) {
      states[index].soc = clamp(zone.soc - 100 * zone.battery * STEP / BATTERY_NOMINAL_ENERGY, 0, 100);
      states[index].voltage = zone.voltage;
    }
    previousGenerator = totals.generator;
  }
  events.sort((first, second) => first.t - second.t);
  return { duration: LIMITS.duration, step: STEP, frames, events, kpis: processKpis(frames),
    scenario: current, settings, note: MODEL_NOTE, published: PUBLISHED[current.id] };
}

export function sampleAt(run, timestamp) {
  const time = Number.isFinite(timestamp) ? timestamp : 0;
  return run.frames[Math.round(clamp(time, 0, run.duration) / run.step)];
}
