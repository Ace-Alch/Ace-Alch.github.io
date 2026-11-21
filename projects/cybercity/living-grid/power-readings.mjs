export const POWER_COLORS = { pv:0xf4d17a, battery:0x9edb88, served:0x7ecdf1 };

export function describeBattery(watts) {
  if (watts > .05) return "Discharging";
  if (watts < -.05) return "Charging";
  return "Idle";
}

export function displayWatts(power) {
  return `${Math.abs(power).toFixed(1)} W`;
}

export function districtPowerRows(zone) {
  return [
    ["PV → bus", zone.pv],
    [zone.battery < -.05 ? "Bus → battery" : "Battery → bus", zone.battery],
    ["Generator → bus", zone.generator],
    ["Relay → bus", zone.imported],
    ["Bus → relay", zone.exported],
    ["Bus → loads", zone.served],
  ];
}
