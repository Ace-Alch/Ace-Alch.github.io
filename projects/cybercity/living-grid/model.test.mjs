import assert from "node:assert/strict";
import { test } from "node:test";
import { SCENARIOS, PUBLISHED, sampleAt, simulate } from "./model.mjs";

for (const { id } of SCENARIOS) {
  test(`Scenario ${id} preserves the reference classification and power accounting`, () => {
    const run = simulate({ scenario: id });
    assert.equal(run.kpis.success, PUBLISHED[id].success);
    assert.equal(run.duration, 20);
    for (const frame of run.frames) {
      const { demand, served, unserved } = frame.totals;
      assert.ok(Math.abs(demand - served - unserved) < 1e-8);
      for (const { type, from, to } of frame.flows) {
        if (type !== "relay") continue;
        const district = (key) => frame.districts.find(({ id }) => id === key);
        assert.ok(district(from).relay && district(to).relay);
      }
    }
  });
}

test("the scheduled controller fault and manual loads change the selected district", () => {
  const run = simulate({ scenario: "V", interventions: [{ t: 3, district: "MG1", service: "water", enabled: false }] });
  assert.ok(sampleAt(run, 5.95).districts[1].localAlive);
  assert.equal(sampleAt(run, 6).districts[1].owner, "MAIN");
  assert.ok(sampleAt(run, 2.95).districts[0].services.find(({ id }) => id === "water").served > 0);
  assert.equal(sampleAt(run, 3).districts[0].services.find(({ id }) => id === "water").served, 0);
});
