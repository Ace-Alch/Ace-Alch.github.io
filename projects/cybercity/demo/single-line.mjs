import { DISTRICTS } from "./model.mjs?v=street-lab-1";

const points = [93, 251, 409, 567];
const name = { battery: "Battery", pv: "PV", load: "Demand", generator: "Generator feeder", relay: "Support relay", localMcu: "Local MCU" };

export function createSingleLine(root, onSelect, onSwitch) {
  root.innerHTML = `
    <div class="flow-intro"><div><p class="eyebrow">Live single-line diagram</p><h2>Power paths</h2></div>
    <div class="flow-legend"><span><i></i> Relay support</span><span><i></i> Generator supply</span></div></div>
    <p id="diagram-route" class="flow-readout"></p>
    <svg viewBox="0 0 660 260" class="single-line" role="img" aria-label="Every district has a local DC bus. Relays connect eligible districts to the upper support bus. Independent diode feeders connect the generator supply.">
      <path class="relay-rail" d="M38 35H622"></path>
      <text x="37" y="20" class="rail-label">COMMON SUPPORT BUS</text>
      ${DISTRICTS.map(({ id, name: title, color }, i) => {
        const x = points[i];
        return `<g data-zone="${id}" tabindex="0" role="button" aria-label="Inspect ${id} ${title}" style="--zone:${color}">
          <path data-path="relay" d="M${x} 35V65 M${x} 87V96"></path>
          <circle data-path="relay" cx="${x}" cy="65" r="3"></circle><circle data-path="relay" cx="${x}" cy="87" r="3"></circle>
          <path data-blade d="M${x} 87l13 -21"></path>
          <rect data-node x="${x-64}" y="96" width="128" height="72" rx="9"></rect>
          <text data-id x="${x}" y="123">${id} · ${title}</text><text data-voltage x="${x}" y="146">—</text>
          <path data-path="generator" d="M${x} 168V193 M${x} 207V226"></path>
          <path data-diode d="M${x-5} 204h10l-5 -8z M${x-6} 193h12"></path>
        </g>`;
      }).join("")}
      <path class="generator-rail" d="M38 226H622"></path>
      <text x="37" y="249" class="rail-label">SHARED GENERATOR · DIODE-ISOLATED FEEDERS</text>
    </svg>
    <div class="flow-switches">
      <strong id="flow-switch-title"></strong>
      <div class="flow-buttons">${Object.entries(name).map(([key, label])=>`<button type="button" data-switch="${key}">${label}<small></small></button>`).join("")}</div>
    </div>`;
  const zones = [...root.querySelectorAll("[data-zone]")];
  for (const zone of zones) {
    zone.addEventListener("click", () => onSelect(zone.dataset.zone));
    zone.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      onSelect(zone.dataset.zone);
    });
  }
  const buttonList = [...root.querySelectorAll("[data-switch]")];
  for (const b of buttonList) b.addEventListener("click", () => onSwitch(b.dataset.switch));
  const route = root.querySelector("#diagram-route");
  const switchTitle = root.querySelector("#flow-switch-title");
  const line = root.querySelector(".single-line");
  function update(frame, selected) {
    const transfer = frame.flows.find(({ type }) => type === "relay");
    line.toggleAttribute("data-sharing", Boolean(transfer));
    line.toggleAttribute("data-generating", frame.totals.generator > .05);
    const sharing = transfer ? `${transfer.from} → ${transfer.to} · ${transfer.watts.toFixed(1)} W`
      : frame.support?.receiver ? `${frame.support.receiver} · ${frame.support.reason || "Awaiting support"}` : "Relays open";
    route.textContent = `${sharing}   ·   Shared generator ${frame.totals.generator.toFixed(1)} W`;
    for (const [i, group] of zones.entries()) {
      const district = frame.districts[i];
      group.toggleAttribute("data-selected", district.id === selected);
      group.toggleAttribute("data-relay", district.relay);
      group.toggleAttribute("data-generator", district.generator > .05);
      group.querySelector("[data-blade]").setAttribute("d", `M${points[i]} 87l${district.relay ? 0 : 13} -21`);
      group.querySelector("[data-voltage]").textContent = `${district.voltage.toFixed(2)} V · ${district.owner}`;
    }
    const district = frame.districts.find(({ id }) => id === selected);
    switchTitle.textContent = district ? `${district.id} switch panel` : "Select a district to switch its equipment";
    for (const b of buttonList) {
      const allowed = district?.switches[b.dataset.switch] ?? false;
      b.disabled = !district;
      b.setAttribute("aria-pressed", String(allowed));
      b.querySelector("small").textContent = b.dataset.switch === "relay" && allowed ? "AUTO"
        : b.dataset.switch === "localMcu" && allowed ? (district.localAlive ? "ENABLED" : "SCENARIO FAULT")
        : allowed ? "ENABLED" : "ISOLATED";
    }
  }
  return { update };
}
