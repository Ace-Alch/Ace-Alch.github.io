export const SERVICES = {
  MG1: [
    { id: "clinical", name: "Clinical lighting", share: .50, kind: "lights" },
    { id: "water", name: "Hospital water pump", share: .32, kind: "water" },
    { id: "street", name: "Emergency access lamps", share: .18, kind: "street" },
  ],
  MG2: [
    { id: "process", name: "Factory process line", share: .57, kind: "factory" },
    { id: "cooling", name: "Cooling water pump", share: .28, kind: "water" },
    { id: "street", name: "Yard lighting", share: .15, kind: "street" },
  ],
  MG3: [
    { id: "school", name: "School and public lighting", share: .49, kind: "lights" },
    { id: "fountain", name: "Park fountain pump", share: .29, kind: "water" },
    { id: "street", name: "Park path lamps", share: .22, kind: "street" },
  ],
  MG4: [
    { id: "homes", name: "Household lighting", share: .53, kind: "lights" },
    { id: "water", name: "Water pressure pump", share: .29, kind: "water" },
    { id: "street", name: "Residential street lamps", share: .18, kind: "street" },
  ],
};
