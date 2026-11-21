export const SERVICES = {
  MG1: [
    { id: "clinical", name: "Clinical lighting", share: .20, kind: "lights" },
    { id: "vent", name: "Clinical air handling", share: .21, kind: "fan" },
    { id: "charger", name: "Ambulance charger", share: .19, kind: "charger" },
    { id: "water", name: "Hospital water booster", share: .32, kind: "water" },
    { id: "street", name: "Emergency access lamps", share: .08, kind: "street" },
  ],
  MG2: [
    { id: "process", name: "Factory conveyor", share: .26, kind: "factory" },
    { id: "compressor", name: "Compressed air station", share: .17, kind: "compressor" },
    { id: "fan", name: "Factory exhaust fans", share: .22, kind: "fan" },
    { id: "cooling", name: "Central water pump", share: .28, kind: "water" },
    { id: "street", name: "Factory yard lamps", share: .07, kind: "street" },
  ],
  MG3: [
    { id: "school", name: "School lighting", share: .19, kind: "lights" },
    { id: "kitchen", name: "School kitchen extraction", share: .23, kind: "fan" },
    { id: "charge", name: "Civic vehicle charger", share: .19, kind: "charger" },
    { id: "fountain", name: "Park fountain pump", share: .29, kind: "water" },
    { id: "street", name: "Park path lamps", share: .10, kind: "street" },
  ],
  MG4: [
    { id: "homes", name: "Household lighting", share: .18, kind: "lights" },
    { id: "heat", name: "Residential heat pumps", share: .28, kind: "fan" },
    { id: "charge", name: "Residential EV charging", share: .18, kind: "charger" },
    { id: "water", name: "Residential water booster", share: .29, kind: "water" },
    { id: "street", name: "Residential street lamps", share: .07, kind: "street" },
  ],
};
