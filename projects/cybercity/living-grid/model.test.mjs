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

test("manual relay commands follow the 0.5 s holdoff and honor open, closed, automatic", () => {
  const run=simulate({scenario:"I",mainEnabled:false,interventions:[
    {t:0,district:"MG1",relayMode:1},
    {t:2,district:"MG1",relayMode:0},
    {t:4,district:"MG1",relayMode:2},
  ]});
  assert.equal(sampleAt(run,.45).districts[0].relay,false);
  assert.equal(sampleAt(run,.5).districts[0].relay,true);
  assert.equal(sampleAt(run,2).districts[0].relay,false);
  assert.equal(sampleAt(run,4).districts[0].relayMode,2);
  assert.ok(run.frames.every(frame=>!frame.flows.some(flow=>flow.type==="relay")));
});

test("the shared water pump loses and regains electrical power at its configured events", () => {
  const run=simulate({scenario:"I",interventions:[
    {t:3,district:"MG2",service:"cooling",enabled:false},
    {t:7,district:"MG2",service:"cooling",enabled:true},
  ]});
  const power=t=>sampleAt(run,t).districts[1].services.find(s=>s.id==="cooling").served;
  assert.ok(power(2.95)>0);
  assert.equal(power(3),0);
  assert.ok(power(7)>0);
});
