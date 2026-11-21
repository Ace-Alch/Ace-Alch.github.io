import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIMITS } from './model.mjs?v=layers-1';
import { buildField, surfaceTexture } from './field.mjs?v=layers-1';
import { createExplorer } from './explore.mjs?v=living-grid-2';
import { span, tower, createWaterNetwork } from './infrastructure.mjs?v=layers-1';
import { CONTROL_ALTITUDE, createControlLayer } from './control-layer.mjs?v=camera-1';
import { POWER_COLORS, describeBattery, displayWatts } from './power-readings.mjs';

const ZONES = [
  { id: 'MG1', name: 'CRITICAL', tint: 0xf3aac6, site: [29, -24], asset: 'hospital', height: 13, width: 26 },
  { id: 'MG2', name: 'INDUSTRIAL', tint: 0x78cae5, site: [-29, -24], asset: 'factory', height: 11, width: 28 },
  { id: 'MG3', name: 'SOCIAL', tint: 0xa6dd99, site: [-29, 24], asset: 'school', height: 10, width: 25 },
  { id: 'MG4', name: 'RESIDENTIAL', tint: 0xe9b477, site: [29, 24], asset: 'residence', height: 11, width: 14 },
];
const SYSTEM = {
  GEN: { site: [0, 54], port: [0, 1.3, 48.1], tint: 0xffc46c, name: 'SHARED GENERATOR' },
  MAIN: { site: [-24, 54], tint: 0x81d8fa, name: 'MAIN MCU' },
  DAQ: { site: [24, 54], tint: 0x8fe4b4, name: 'MONITORING / DAQ' },
};
const SHARING_BUS = [0, 1.64, 0];
const POWER_COLOR = 0x79f1ee;
const GEN_COLOR = 0xffba6b;
const BASIS = 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/basis/';
const ASSETS = {
  ambulance: 'https://tevy.dev/models/ambulance/v1/lod2.glb',
  airHandler: 'https://tevy.dev/models/rooftop-air-handler/v1/lod1.glb',
  heatPump: 'https://tevy.dev/models/ac-unit-on-ground-blocks/v1/lod1.glb',
  seesaw: 'https://tevy.dev/models/playground-seesaw/v1/lod1.glb',
  hospital: 'https://tevy.dev/models/hospital-building/v2/lod1.glb',
  factory: 'https://tevy.dev/models/factory-hall/v1/lod1.glb',
  school: 'https://tevy.dev/models/school-building/v1/lod1.glb',
  residence: 'https://tevy.dev/models/village-house/v2/lod1.glb',
  lamp: 'https://tevy.dev/models/city-street-lamp/v1/lod2.glb',
  solar: 'https://files.innerscene.com/library/solar-panel-20-w-12-v-430-x-350-mm-aluminium-frame-e78c6040/c094fe06a72641dcf48c/solar-panel-20-w-12-v-430-x-350-mm-aluminium-frame.glb',
};
const POWER_PATH_RADIUS = 0.21;

const v3 = (values) => new THREE.Vector3(...values);
const bounded = (value, min, max) => Math.max(min, Math.min(max, value));

function material(color, roughness = 0.68, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function luminous(color, strength = 0.62) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: strength, roughness: 0.56 });
}

function place(object, x, y, z, parent) {
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function mesh(geometry, surface, x, y, z, parent, shadows = true) {
  const object = new THREE.Mesh(geometry, surface);
  object.castShadow = shadows;
  object.receiveShadow = true;
  return place(object, x, y, z, parent);
}

function box(parent, surface, x, y, z, w, h, d, shadows = true) {
  return mesh(new THREE.BoxGeometry(w, h, d), surface, x, y, z, parent, shadows);
}

function cylinder(parent, surface, x, y, z, top, bottom, height, sides = 20) {
  return mesh(new THREE.CylinderGeometry(top, bottom, height, sides), surface, x, y, z, parent);
}

function deck(parent, surface, x, y, z, width, depth, height, cut = 1) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const outline = new THREE.Shape();
  outline.moveTo(-halfW + cut, -halfD);
  outline.lineTo(halfW - cut, -halfD);
  outline.lineTo(halfW, -halfD + cut);
  outline.lineTo(halfW, halfD - cut);
  outline.lineTo(halfW - cut, halfD);
  outline.lineTo(-halfW + cut, halfD);
  outline.lineTo(-halfW, halfD - cut);
  outline.lineTo(-halfW, -halfD + cut);
  outline.closePath();
  const body = mesh(new THREE.ExtrudeGeometry(outline, {
    depth: height, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.11, bevelSegments: 2, steps: 1,
  }), surface, x, y, z, parent);
  body.rotation.x = -Math.PI / 2;
  return body;
}

function tag(object, id, component) {
  object.userData.location = { id, component };
  return object;
}

function rng(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeBadge(id, name, tint, big = true) {
  const canvas = document.createElement('canvas');
  canvas.width = big ? 704 : 580;
  canvas.height = big ? 140 : 94;
  const ctx = canvas.getContext('2d');
  const color = `#${tint.toString(16).padStart(6, '0')}`;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = 'rgba(10, 23, 32, .96)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(22, 22, 5, h - 44, 2.5);
  ctx.fill();
  ctx.font = `bold ${big ? 43 : 34}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(id, 48, h / 2 + 2);
  ctx.fillStyle = '#f0f7fa';
  ctx.font = `600 ${big ? 34 : 25}px Arial, sans-serif`;
  ctx.fillText(name, big ? 172 : 157, h / 2 + 2, big ? 492 : 388);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
  badge.scale.set(big ? 15 : 12.8, big ? 2.98 : 2.07, 1);
  badge.renderOrder = 9;
  return badge;
}

function makeSign(parent, color, title, size, position) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#131e28';
  ctx.fillRect(0, 0, 512, 90);
  ctx.fillStyle = color;
  ctx.font = '700 45px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 47);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return mesh(new THREE.PlaneGeometry(size, size * 90 / 512), new THREE.MeshBasicMaterial({ map }), ...position, parent, false);
}

function trees(parent, x, z, seed, variant = 1) {
  const random = rng(seed);
  const bark = material(0x544332, 0.97, 0);
  const foliage = [material(0x314e3f, 0.96, 0), material(0x496545, 0.96, 0), material(0x638056, 0.96, 0)];
  const height = variant * (2.7 + random());
  cylinder(parent, bark, x, height * 0.29, z, 0.10, 0.19, height * 0.6, 9);
  for (let i = 0; i < 5; i++) {
    const yaw = random() * Math.PI * 2;
    const spread = (i > 1 ? 0.48 : 0.16) * variant;
    const canopy = mesh(new THREE.IcosahedronGeometry(0.78 * variant, 2), foliage[i % 3],
      x + Math.cos(yaw) * spread, height * (0.57 + i * 0.11), z + Math.sin(yaw) * spread, parent);
    canopy.scale.set(0.93 + random() * 0.2, 1.25 + random() * 0.4, 0.95);
    canopy.rotation.y = yaw;
  }
}

function lane(parent, x, z, length, width, across = false) {
  const asphalt = new THREE.MeshStandardMaterial({ map: surfaceTexture("asphalt"), roughness: .95 });
  const kerb = material(0x63707a, 0.8);
  const marks = material(0xa1a9a5, 0.95);
  const dimensions = across ? [length, width] : [width, length];
  box(parent, kerb, x, 0.56, z, dimensions[0] + 0.72, 0.22, dimensions[1] + 0.72, false);
  box(parent, asphalt, x, 0.69, z, dimensions[0], 0.1, dimensions[1], false);
  for (let shift = -length / 2 + 2.4; shift < length / 2 - 1.3; shift += 3.8) {
    box(parent, marks, x + (across ? shift : 0), 0.75, z + (across ? 0 : shift), across ? 1.65 : 0.09, 0.017, across ? 0.09 : 1.65, false);
  }
}

function markings(parent, x, z, turn = false) {
  const marks = material(0xbac5bd, 0.94);
  for (let i = -2; i <= 2; i++) {
    box(parent, marks, x + (turn ? i * 0.67 : 0), 0.755, z + (turn ? 0 : i * 0.67),
      turn ? 0.26 : 1.6, 0.02, turn ? 1.6 : 0.26, false);
  }
}

function lamps(parent, x, z, tint, face = 1) {
  const steel = material(0x607687, 0.38, 0.63);
  const lamp = luminous(tint, 1.25);
  const fallback = new THREE.Group();
  place(fallback, x, 0.7, z, parent);
  cylinder(fallback, steel, 0, 1.67, 0, 0.07, 0.12, 3.34, 12);
  box(fallback, steel, 0.25 * face, 3.39, 0, 0.67, 0.09, 0.14);
  box(fallback, lamp, 0.57 * face, 3.33, 0, 0.38, 0.041, 0.16, false);
  return fallback;
}

function pvPanel(parent, x, z) {
  const frame = material(0x8d9fae, 0.29, 0.8);
  const blue = material(0x193a56, 0.25, 0.64);
  const seam = material(0x3f7697, 0.37, 0.55);
  const tilt = new THREE.Group();
  place(tilt, x, 1.84, z, parent);
  tilt.rotation.x = -0.31;
  const body = new THREE.Group();
  tilt.add(body);
  box(body, frame, 0, 0, 0, 3.22, 0.15, 2.08);
  box(body, blue, 0, 0.087, 0, 3.04, 0.031, 1.91);
  for (let i = -3; i <= 3; i++) {
    box(body, seam, i * 0.38, 0.115, 0, 0.035, 0.012, 1.91, false);
  }
  for (let i = -1; i <= 1; i++) {
    box(body, seam, 0, 0.115, i * 0.46, 3.04, 0.012, 0.028, false);
  }
  for (const sign of [-1, 1]) {
    box(parent, frame, x + sign * 1.13, 0.99, z + 0.47, 0.11, 1.18, 0.11);
  }
  return { mount: tilt, placeholder: body };
}

function storage(parent) {
  const steel = material(0x848d90,.49,.67);
  const caseMaterial = material(0x303b3e,.76,.35);
  const insulation = material(0x23332d,.85);
  const copper = material(0xc4834d,.48,.75);
  const red = material(0xa9382b,.7,.14);
  const gold = luminous(0xa3df90,.24);
  const bays = [];
  box(parent,steel,0,.77,0,6.25,.25,3.72);
  box(parent,caseMaterial,0,1.04,0,5.9,.43,3.38);
  box(parent,caseMaterial,0,1.43,1.51,5.9,.46,.25);
  box(parent,caseMaterial,0,1.69,-1.52,5.9,.89,.22);
  for (const x of [-1.63,0,1.63]) {
    const core=cylinder(parent,insulation,x,1.94,0,.58,.58,2.44,28);
    core.rotation.x=Math.PI/2;
    for(const z of [-1.27,1.27]) {
      const cap=cylinder(parent,z>0?red:steel,x,1.94,z,.52,.52,.13,24);
      cap.rotation.x=Math.PI/2;
      const bolt=cylinder(parent,copper,x,1.94,z*1.082,.18,.18,.12,12);
      bolt.rotation.x=Math.PI/2;
    }
    for(const z of [-.84,.84]) {
      const clamp=cylinder(parent,steel,x,1.94,z,.613,.613,.12,28);
      clamp.rotation.x=Math.PI/2;
    }
  }
  box(parent,copper,-.82,2.10,1.36,1.62,.10,.18);
  box(parent,copper,.82,2.10,-1.36,1.62,.10,.18);
  box(parent,steel,2.67,1.63,.65,.53,1.17,1.56);
  box(parent,caseMaterial,2.68,1.72,1.44,.48,.48,.06);
  for(let i=0;i<3;i++)bays.push(box(parent,gold.clone(),2.68,1.61+i*.17,1.49,.31,.075,.037,false));
  const plate=makeSign(parent,"#beebae","3S Li-ion  /  BATTERY PACK",5.1,[0,1.40,1.65]);
  plate.renderOrder=1;
  cylinder(parent,red,2.5,1.4,-1.55,.17,.17,.43,16);
  cylinder(parent,insulation,2.12,1.4,-1.55,.17,.17,.43,16);
  return bays;
}

function makePowerLabel(parent, color, at) {
  const panel=document.createElement("canvas");
  panel.width=640; panel.height=112;
  const paint=panel.getContext("2d");
  const map=new THREE.CanvasTexture(panel);
  map.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
  sign.scale.set(11.8,2.07,1);
  sign.position.set(...at);
  sign.renderOrder=8;
  sign.visible=false;
  parent.add(sign);
  let previous="";
  return {sign,set(text) {
    if(text===previous)return;
    previous=text;
    paint.clearRect(0,0,640,112);
    paint.fillStyle="#09171ef5";
    paint.strokeStyle=`#${color.toString(16).padStart(6,"0")}`;
    paint.lineWidth=5;
    paint.beginPath();paint.roundRect(3,3,634,106,14);paint.fill();paint.stroke();
    paint.fillStyle=paint.strokeStyle;
    paint.textAlign="center";
    paint.textBaseline="middle";
    paint.font="700 40px Arial, sans-serif";
    paint.fillText(text,320,58,603);
    map.needsUpdate=true;
  }};
}

function localUnit(parent, tint, scale = 1) {
  const shell = material(0x657a86, 0.46, 0.54);
  const dark = material(0x1c2d36, 0.42);
  const indicator = luminous(tint, 0.7);
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  parent.add(body);
  box(body, shell, 0, 1.28, 0, 3.1, 1.11, 2.1);
  box(body, dark, 0, 1.31, 1.09, 2.87, 0.88, 0.09);
  for (let i = 0; i < 5; i++) {
    box(body, shell, -1.1 + 0.24 * i, 1.13, 1.15, 0.115, 0.067, 0.04, false);
  }
  const light = box(body, indicator, 0.84, 1.49, 1.16, 0.38, 0.14, 0.042, false);
  for (let i = 0; i < 5; i++) {
    box(body, dark, -0.95 + i * 0.47, 1.85, 0, 0.18, 0.049, 1.54, false);
  }
  return light;
}

function makeWindows(parent, materialSet, seed, width, height, depth, floorCount, columns) {
  const random = rng(seed);
  const wallHeight = height / floorCount;
  const glassWidth = width / columns;
  const sideCount = Math.max(2, Math.round(columns * depth / width));
  for (let floor = 1; floor < floorCount + 1; floor++) {
    const y = 0.55 + wallHeight * (floor - 0.54);
    for (let col = 0; col < columns; col++) {
      const x = (col - (columns - 1) / 2) * glassWidth;
      const surface = random() > 0.24 ? materialSet.light : materialSet.dim;
      for (const sign of [-1, 1]) {
        box(parent, materialSet.trim, x, y, sign * (depth / 2 + 0.035), glassWidth * 0.76, wallHeight * 0.62, 0.14, false);
        box(parent, surface, x, y, sign * (depth / 2 + 0.115), glassWidth * 0.68, wallHeight * 0.54, 0.025, false);
        box(parent, materialSet.trim, x + 0.12, y, sign * (depth / 2 + 0.14), 0.074, wallHeight * 0.54, 0.025, false);
      }
    }
    for (let col = 0; col < sideCount; col++) {
      const zWidth = depth / sideCount;
      const z = (col - (sideCount - 1) / 2) * zWidth;
      for (const sign of [-1, 1]) {
        box(parent, random() > 0.38 ? materialSet.light : materialSet.dim,
          sign * (width / 2 + 0.06), y, z, 0.12, wallHeight * 0.5, zWidth * 0.57, false);
      }
    }
    box(parent, materialSet.trim, 0, floor * wallHeight + 0.47, 0, width + 0.16, 0.08, depth + 0.16, false);
  }
}

function gable(parent, width, depth, height, surface, y) {
  const positions = [
    -width / 2, 0, depth / 2, width / 2, 0, depth / 2, 0, height, depth / 2,
    -width / 2, 0, -depth / 2, width / 2, 0, -depth / 2, 0, height, -depth / 2,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 5, 4, 3, 2, 5, 3, 2, 3, 0, 1, 4, 5, 1, 5, 2, 0, 3, 4, 0, 4, 1]);
  geometry.computeVertexNormals();
  mesh(geometry, surface, 0, y, 0, parent);
}

function combineStaticMeshes(group) {
  const buckets = new Map();
  for (const object of group.children) {
    if (!object.isMesh) continue;
    const key = `${object.material.uuid}:${object.castShadow}:${Boolean(object.geometry.index)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(object);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const geometries = bucket.map((object) => {
      object.updateMatrix();
      return object.geometry.clone().applyMatrix4(object.matrix);
    });
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const sample = bucket[0];
    mesh(merged, sample.material, 0, 0, 0, group, sample.castShadow);
    for (const object of bucket) {
      object.removeFromParent();
      object.geometry.dispose();
    }
  }
}

function fallbackBuilding(parent, type) {
  const darkSteel = material(0x354958, 0.65, 0.5);
  const cap = material(0x738491, 0.68, 0.26);
  const tones = {
    hospital: [0x879598, 0x4c8295, 0x9bd2d1, 0x384d58, 25, 10.8, 12, 5, 11],
    factory: [0x697680, 0x878b6f, 0xd6c398, 0x3c4b56, 27, 7.6, 15, 3, 12],
    school: [0x885b52, 0x797278, 0xcbb3a3, 0x45545c, 24, 8.3, 12.4, 4, 9],
    residence: [0xa5997a, 0x7c6b62, 0xd7b77f, 0x514749, 8.1, 4.8, 7.4, 2, 3],
  }[type];
  const [wall, dim, light, trim, w, h, d, floors, columns] = tones;
  const palette = { dim: material(dim, 0.39, 0.42), light: luminous(light, 0.34), trim: material(trim, 0.61, 0.33) };
  box(parent, cap, 0, 0.37, 0, w + 1.3, 0.62, d + 1.55);
  box(parent, material(wall, 0.72), 0, h / 2 + 0.54, 0, w, h, d);
  makeWindows(parent, palette, w + h, w, h, d, floors, columns);
  if (type === 'residence') {
    gable(parent, w + 0.8, d + 0.62, 3.3, material(0x5a3d3b, 0.87, 0.1), h + 0.53);
    box(parent, palette.trim, 2, h + 1.7, -1, 0.68, 2.25, 0.7);
    box(parent, cap, 0, 0.43, d / 2 + 0.86, 3.6, 0.3, 1.7);
    box(parent, darkSteel, 0, 1.54, d / 2 + 0.082, 1.2, 2.19, 0.16);
    combineStaticMeshes(parent);
    return;
  }
  box(parent, cap, 0, h + 0.64, 0, w + 0.63, 0.37, d + 0.62);
  for (const sign of [-1, 1]) {
    box(parent, darkSteel, sign * (w / 2 - 0.1), h + 0.97, 0, 0.25, 0.36, d, false);
    box(parent, darkSteel, 0, h + 0.97, sign * (d / 2 - 0.1), w, 0.36, 0.25, false);
  }
  const hvac = material(0x7b8790, 0.41, 0.58);
  for (let i = 0; i < 3; i++) {
    const x = -w * 0.34 + i * 2.7;
    box(parent, hvac, x, h + 1.3, -d * 0.23, 2.02, 1.1, 2.16);
    for (let j = 0; j < 5; j++) {
      box(parent, darkSteel, x - 0.68 + j * 0.33, h + 1.9, -d * 0.23, 0.07, 0.08, 1.76, false);
    }
  }
  box(parent, cap, 0, 0.4, d / 2 + 1.68, 7.1, 0.51, 3.46);
  box(parent, darkSteel, 0, 2.94, d / 2 + 1.35, 7.36, 0.36, 2.92);
  box(parent, palette.dim, 0, 1.62, d / 2 + 0.11, 4.37, 2.65, 0.27);
  for (const sign of [-1, 1]) box(parent, hvac, sign * 3.35, 1.8, d / 2 + 2.57, 0.18, 2.35, 0.18);
  if (type === 'hospital') {
    const red = luminous(0xff735f, 0.65);
    box(parent, red, 0, h - 1.34, d / 2 + 0.23, 2.4, 0.49, 0.16);
    box(parent, red, 0, h - 1.34, d / 2 + 0.23, 0.5, 2.45, 0.16);
  }
  if (type === 'factory') {
    for (const x of [5.5, 9]) {
      cylinder(parent, darkSteel, x, h + 3, -d * 0.29, 0.41, 0.54, 4.2);
      cylinder(parent, cap, x, h + 5.16, -d * 0.29, 0.58, 0.58, 0.25);
    }
    for (let x = -w / 2 + 1; x < w / 2; x += 1.8) {
      box(parent, cap, x, 1.03, d / 2 + 0.28, 0.155, 1.42, 0.16, false);
    }
  }
  makeSign(parent, '#e3eef1', { hospital: 'EMERGENCY', factory: 'PRODUCTION', school: 'CIVIC CAMPUS' }[type],
    6.55, [0, 3.95, d / 2 + 0.22]);
  combineStaticMeshes(parent);
}

function createDistrict(scene, zone, assetMounts) {
  const root = new THREE.Group();
  const [x, z] = zone.site;
  place(root, x, 0, z, scene);
  const shell = material(0x202e3b, 0.79);
  const top = material(0x283543, 0.85);
  const border = luminous(zone.tint, 0.23);
  const ring = tag(deck(root, border, 0, 0.14, 0, 49.8, 41.3, 0.16, 2.2), zone.id, 'bus');
  tag(deck(root, shell, 0, -0.58, 0, 50.3, 41.85, 0.62, 2.2), zone.id, 'consumer');
  tag(deck(root, top, 0, 0.31, 0, 48.65, 40.2, 0.28, 2.1), zone.id, 'consumer');
  for (const u of [-1, 1]) {
    for (const v of [-1, 1]) {
      cylinder(root, material(0x77848b, 0.31, 0.75), u * 22.1, 0.64, v * 17.8, 0.28, 0.31, 0.16, 12);
    }
  }
  const garden = new THREE.MeshStandardMaterial({ map: surfaceTexture(zone.id === 'MG2' ? "soil" : "grass"), roughness: .94 });
  tag(deck(root, garden, 0, 0.63, -4.4, 44.1, 25, 0.12, 1.25), zone.id, 'consumer');
  lane(root, 0, 10.9, 44, 4.2, true);
  markings(root, -17.7, 10.9);
  markings(root, 16.8, 10.9);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) trees(root, side * 18.4, -13.2 + i * 5.0, 41 + 12 * side + i * 31, zone.id === 'MG2' ? 0.6 : 0.88);
  }
  for (const lampX of [-13.4, 14.6]) {
    const stand = lamps(root, lampX, 8.3, 0xffe7bb, Math.sign(lampX));
    assetMounts.push({ name: 'lamp', target: stand, height: 3.45, width: 1.6, replace: true });
  }
  const buildingRoot = tag(new THREE.Group(), zone.id, 'consumer');
  place(buildingRoot, 0, 0.81, -5, root);
  if (zone.id === 'MG4') {
    for (const [bx, bz, yaw, scale] of [[-9.7, -4.4, 0.12, 0.94], [5.8, -4.7, -0.30, 1.1], [-6.7, 5.1, -0.2, 0.81], [8.9, 4.4, 0.12, 0.86]]) {
      const house = place(new THREE.Group(), bx, 0, bz, buildingRoot);
      house.rotation.y = yaw;
      house.scale.setScalar(scale);
      fallbackBuilding(house, 'residence');
      assetMounts.push({ name: 'residence', target: house, height: 8.5, width: 11, depth: 8.5, replace: true });
    }
  } else {
    fallbackBuilding(buildingRoot, zone.asset);
    assetMounts.push({ name: zone.asset, target: buildingRoot, height: zone.height, width: zone.width, depth: 17, replace: true });
  }
  const solar = tag(place(new THREE.Group(), -14.8, 0, 15.9, root), zone.id, 'pv');
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const panel = pvPanel(solar, a * 1.71, b * 1.19);
    assetMounts.push({ name: 'solar', target: panel.mount, placeholder: panel.placeholder, width: 3.15, flatten: true });
  }
  box(solar, material(0x40525d, 0.59, 0.23), -3.82, 0.89, 0.0, 0.82, 0.62, 0.72);
  const solarLamp = box(solar, luminous(0x72e6d9, 0.6), -3.82, 1.23, 0, 0.31, 0.04, 0.36, false);
  const batteries = tag(place(new THREE.Group(), 5.0, 0, 16.1, root), zone.id, 'battery');
  const energyLeds = storage(batteries);
  const controller = tag(place(new THREE.Group(), 16.9, 0, 16.1, root), zone.id, 'local');
  const status = localUnit(controller, zone.tint);
  const bus = tag(place(new THREE.Group(), 12.45, 0, 15.85, root), zone.id, 'bus');
  box(bus, material(0x385664, 0.62, 0.31), 0, 0.94, 0, 3.13, 0.57, 2.2);
  const busLight = box(bus, luminous(zone.tint, 0.66), 0, 1.24, 0, 2.84, 0.05, 0.45, false);
  for (const sign of [-1, 1]) {
    for (let i = -2; i <= 2; i++) cylinder(bus, material(0x728895, 0.41, 0.61), i * 0.51, 1.27, sign * 0.83, 0.11, 0.14, 0.13, 12);
  }
  const sign = tag(place(makeBadge(zone.id, zone.name, zone.tint), 0, 11.4 + zone.height * 0.43, 11.3, root), zone.id, 'consumer');
  const branch = tag(place(new THREE.Group(), x < 0 ? 24.1 : -24.1, 0, z < 0 ? 12.2 : -12.2, root), zone.id, 'tie');
  const relay = box(branch, luminous(0x526575, 0.19), 0, 1.53, 0, 2.13, 0.35, 1.75);
  box(branch, material(0x4b606d, 0.49, 0.43), 0, 1.24, 0, 2.6, 0.42, 2.16);
  const branchPos = [x + branch.position.x, 1.58, z + branch.position.z];
  const localSource = [
    ["pv", [[-18.62,1.12,15.9],[-18.62,1.12,13.58],[12.45,1.12,13.58],[12.45,1.12,15.45]],[-11,3.3,14.1]],
    ["battery", [[7.5,1.42,14.55],[7.5,1.07,13.98],[9.3,1.07,13.98],[9.3,1.07,15.35],[11.9,1.07,15.35]],[5,3.65,16.9]],
    ["served", [[13.32,1.17,15.75],[14.06,1.17,15.75],[14.06,1.17,10.3],[10.8,1.17,10.3]],[14.4,3.55,10.9]]
  ].map(([kind, points, at]) => {
    const color=POWER_COLORS[kind];
    const route=tag(new THREE.Group(),zone.id,kind==="served"?"bus":kind);
    root.add(route);
    const {object,path}=tube(route,points,.09,luminous(color,.2),8);
    const sparks=Array.from({length:kind==="pv"?4:2},()=>mesh(new THREE.CapsuleGeometry(.067,.34,2,6),
      new THREE.MeshBasicMaterial({color}),0,0,0,route,false));
    return {kind,object,path,sparks,watts:0,label:makePowerLabel(route,color,at)};
  });
  const dab=tag(place(new THREE.Group(),9.3,0,14,root),zone.id,"battery");
  box(dab,material(0x62717a,.54,.55),0,1.1,0,1.8,.56,1.28);
  for(let i=0;i<6;i++)box(dab,material(0x334b54,.58,.45),-.66+i*.26,1.41,0,.075,.12,1.03);
  const dabPlate=makeSign(dab,"#beebae","DAB",1.58,[0,1.13,.66]);dabPlate.renderOrder=1;
  const distribution=tag(place(new THREE.Group(),10.8,0,10.3,root),zone.id,"bus");
  box(distribution,material(0x42657c,.61,.42),0,1.04,0,1.15,.75,.68);
  const field = buildField(root, zone, { place, box, cylinder, material, luminous, tag, tube, trees, assetMounts });
  return { root, ring, status, busLight, solarLamp, sign, relay, energyLeds, branchPos, field, localSource,
    mcuPosition:[x+16.9,1.5,z+16.1] };
}

function tube(parent, points, radius, surface, sides = 8) {
  const path = new THREE.CurvePath();
  for (let i = 0; i + 1 < points.length; i++) path.add(new THREE.LineCurve3(v3(points[i]), v3(points[i + 1])));
  const object = mesh(new THREE.TubeGeometry(path, Math.max(8, points.length * 6), radius, sides, false), surface, 0, 0, 0, parent, false);
  return { object, path };
}

function systemNode(scene, id) {
  const { site: [x, z], tint, name } = SYSTEM[id];
  const group = tag(place(new THREE.Group(), x, 0, z, scene), id);
  const isGenerator = id === 'GEN';
  deck(group, luminous(tint, 0.25), 0, 0.14, 0, isGenerator ? 21.7 : 17, isGenerator ? 11.8 : 12.1, 0.19, 1.2);
  deck(group, material(0x374655, 0.66), 0, 0.41, 0, isGenerator ? 21.1 : 16.4, 11.15, 0.31, 1.0);
  const steel = material(0x7d95a0, 0.35, 0.73);
  const body = material(0x3c5361, 0.49, 0.58);
  const dark = material(0x24343e, 0.64);
  if (isGenerator) {
    box(group, dark, 0, 0.99, 0, 15.7, 0.52, 5.5);
    const engine = cylinder(group, body, -2.6, 2.72, 0, 1.81, 1.81, 6.45, 32);
    engine.rotation.z = Math.PI / 2;
    for (let i = -5; i <= 5; i++) {
      const rib = cylinder(group, steel, -2.6 + i * 0.42, 2.72, 0, 1.9, 1.9, 0.1, 28);
      rib.rotation.z = Math.PI / 2;
    }
    for (const xPos of [-5.9, 0.9, 2.9]) {
      const collar = cylinder(group, xPos === 2.9 ? luminous(tint, 0.42) : dark, xPos, 2.72, 0, 1.46, 1.46, 0.36, 24);
      collar.rotation.z = Math.PI / 2;
    }
    const shaft = cylinder(group, steel, 1.76, 2.72, 0, 0.38, 0.38, 2.66, 22);
    shaft.rotation.z = Math.PI / 2;
    box(group, body, 5.45, 2.2, 0, 4.58, 2.38, 3.9);
    for (let i = 0; i < 8; i++) box(group, steel, 5.45, 3.46, -1.4 + i * 0.4, 3.72, 0.17, 0.095, false);
    for (const sign of [-1, 1]) cylinder(group, steel, 6.1 + sign * 0.91, 4.0, 0.58, 0.13, 0.18, 1.08, 12);
  } else {
    for (const shift of [-4.0, 0, 4.0]) {
      box(group, body, shift, 2.57, -0.3, 3.45, 3.66, 4.6);
      box(group, dark, shift, 2.56, 2.07, 3.24, 3.4, 0.18);
      for (let row = 0; row < 6; row++) {
        const y = 1.21 + row * 0.46;
        box(group, steel, shift - 0.16, y, 2.2, 2.43, 0.07, 0.08, false);
        box(group, luminous(tint, 0.65), shift + 1.16, y, 2.21, 0.14, 0.078, 0.07, false);
      }
    }
  }
  const badge = place(makeBadge(id, name, tint, false), 0, isGenerator ? 8 : 8.3, 2.5, group);
  return { badge, group };
}

function sourceRoute(zone, kind) {
  const [x, , z] = zone.branchPos;
  if (kind === 'share') {
    const start=[x,8.8,z], end=[0,8.8,0];
    return [zone.branchPos,...span(start,end,.9), SHARING_BUS];
  }
  const side=Math.sign(x), start=[side*9.8,10.5,z], joint=[0,10.5,z<0?-12:12], middle=[0,10.5,33], end=[0,10.5,48.1];
  const trunk=z<0?[[0,10.5,12],middle,end]:[middle,end];
  const points=[joint,...trunk];
  return { branch:[zone.branchPos,...span(start,joint,.52)],
    anchors:[start,...points], trunk:points.slice(1).map((p,i)=>span(points[i],p,.71)) };
}

function conduitNodes(scene, districts) {
  const conduits = new THREE.Group();
  scene.add(conduits);
  const sharing = material(0x345662, 0.58, 0.47);
  const generator = material(0x6b553e, 0.59, 0.46);
  const support = { box, cylinder, material };
  const towers = new Set();
  function addTower(point, kind) {
    const key=`${point[0]},${point[2]}`;
    if (towers.has(key)) return;
    towers.add(key);
    const footing=new THREE.Group();
    conduits.add(footing);
    tower(footing,point[0],point[2],point[1],kind,support);
    combineStaticMeshes(footing);
  }
  const paths = new Map();
  const sharedGenerator = new Map();
  for (const [id, zone] of districts) {
    const relayRun=sourceRoute(zone,'share'), gen=sourceRoute(zone,'generator');
    [relayRun[1],relayRun.at(-2)].forEach(point=>addTower(point,'relay'));
    gen.anchors.forEach(point=>addTower(point,'generator'));
    tube(conduits,relayRun,.078,sharing,6);
    tube(conduits,gen.branch,.078,generator,6);
    const portions=[];
    for (const segment of gen.trunk) {
      const key=`GEN:trunk-${segment[0][2]}`;
      if(!sharedGenerator.has(key)) {
        sharedGenerator.set(key,segment);
        tube(conduits,segment,.085,generator,6);
        paths.set(key,segment.slice().reverse());
      }
      portions.push(key);
    }
    zone.generatorTrunk=portions.concat("GEN:riser");
    paths.set(`GEN:${id}`,gen.branch.slice().reverse());
  }
  const riser = [SYSTEM.GEN.port,[0,10.5,48.1]];
  tube(conduits,riser,.085,generator,6);
  paths.set("GEN:riser",riser);
  for (const [idA, a] of districts) for (const [idB, b] of districts) {
    if (idA === idB) continue;
    paths.set(`${idA}:${idB}`, sourceRoute(a, 'share').slice(0,-1).concat(sourceRoute(b, 'share').slice(0,-2).reverse()));
  }
  const hub = tag(place(new THREE.Group(), 0, 0, 0, conduits), 'MAIN', 'tie');
  cylinder(hub, material(0x506571, 0.42, 0.62), 0, 0.98, 0, 1.93, 2.31, 0.65, 12);
  cylinder(hub, luminous(POWER_COLOR, 0.43), 0, 1.38, 0, 1.37, 1.66, 0.21, 12);
  cylinder(hub, material(0x304454, 0.49, 0.44), 0, 1.59, 0, 1.25, 1.25, 0.2, 12);
  return paths;
}

function ovalTrack(scene) {
  const track = new THREE.Group();
  scene.add(track);
  const y = -0.008;
  const corner = 13;
  const w = 60;
  const d = 58.5;
  const middle = 7;
  const steel = material(0x8ea1a9, 0.38, 0.66);
  const sleepers = material(0x3d3b3c, 0.91, 0.01);
  const ballast = material(0x53606a, 0.91, 0.05);
  function loop(offset) {
    const x = w + offset;
    const z = d + offset;
    const radius = corner + offset;
    const left = -x;
    const right = x;
    const north = middle - z;
    const south = middle + z;
    const border = new THREE.Path();
    border.moveTo(left + radius, north);
    border.lineTo(right - radius, north);
    border.absarc(right - radius, north + radius, radius, -Math.PI / 2, 0, false);
    border.lineTo(right, south - radius);
    border.absarc(right - radius, south - radius, radius, 0, Math.PI / 2, false);
    border.lineTo(left + radius, south);
    border.absarc(left + radius, south - radius, radius, Math.PI / 2, Math.PI, false);
    border.lineTo(left, north + radius);
    border.absarc(left + radius, north + radius, radius, Math.PI, Math.PI * 1.5, false);
    const route = new THREE.CatmullRomCurve3(border.getSpacedPoints(260).slice(0, -1).map((point) => new THREE.Vector3(point.x, y, point.y)), true);
    route.arcLengthDivisions = 780;
    return route;
  }
  const center = loop(0);
  const bed = mesh(new THREE.TubeGeometry(center, 290, 1.68, 8, true), ballast, 0, 0, 0, track, false);
  bed.scale.y = 0.14;
  const railHeight = 0.20;
  for (const side of [-1, 1]) {
    mesh(new THREE.TubeGeometry(loop(side * 0.78), 290, 0.075, 6, true), steel, 0, railHeight, 0, track, false);
  }
  const count = 320;
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.84, 0.126, 0.29), sleepers, count);
  ties.receiveShadow = true;
  const locator = new THREE.Object3D();
  const point = new THREE.Vector3();
  const heading = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    center.getPointAt(i / count, point);
    center.getTangentAt(i / count, heading);
    locator.position.set(point.x, 0.105, point.z);
    locator.rotation.y = Math.atan2(heading.x, heading.z);
    locator.updateMatrix();
    ties.setMatrixAt(i, locator.matrix);
  }
  track.add(ties);

  const carMetal = material(0x564858, 0.48, 0.38);
  const signalRed = material(0xa8424e, 0.52, 0.28);
  const ivory = material(0xc2b1a6, 0.58, 0.25);
  for (let i = 0; i < 3; i++) {
    const t = (0.877 + i * 0.0138) % 1;
    center.getPointAt(t, point);
    center.getTangentAt(t, heading);
    const car = place(new THREE.Group(), point.x, 0.55, point.z, track);
    car.rotation.y = Math.atan2(heading.x, heading.z);
    deck(car, signalRed, 0, 0.22, 0, 2.65, 5.96, 1.42, 0.54);
    deck(car, ivory, 0, 1.67, 0, 2.39, 5.47, 0.24, 0.48);
    for (const side of [-1, 1]) {
      for (let w = 0; w < 5; w++) {
        box(car, carMetal, side * 1.34, 1.06, -1.84 + w * 0.92, 0.08, 0.61, 0.62, false);
      }
    }
    box(car, carMetal, 0, 0.14, 0, 1.89, 0.14, 6.23);
  }
  combineStaticMeshes(track);
}

function fitAsset(source, slot) {
  const clone = source.clone(true);
  clone.traverse((item) => {
    if (item.isMesh) {
      item.castShadow = true;
      item.receiveShadow = true;
    }
  });
  let bounds = new THREE.Box3().setFromObject(clone);
  if (bounds.isEmpty()) return null;
  const originalSize = bounds.getSize(new THREE.Vector3());
  const assembly = new THREE.Group();
  assembly.add(clone);
  if (slot.flatten && originalSize.z < originalSize.y && originalSize.z < originalSize.x) {
    clone.rotation.x -= Math.PI / 2;
    clone.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(clone);
  }
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const width = slot.width ?? Infinity;
  const height = slot.height ?? Infinity;
  const depth = slot.depth ?? Infinity;
  const factor = Math.min(width / size.x, height / size.y, depth / size.z);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  assembly.scale.setScalar(factor);
  assembly.position.set(-center.x * factor, -(slot.flatten ? center.y : bounds.min.y) * factor, -center.z * factor);
  return assembly;
}

async function loadAssets(renderer, assetMounts, onStatus, isDisposed) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const compressed = new KTX2Loader().setTranscoderPath(BASIS).detectSupport(renderer);
  loader.setKTX2Loader(compressed);
  const byName = new Map();
  for (const slot of assetMounts) {
    if (!byName.has(slot.name)) byName.set(slot.name, []);
    byName.get(slot.name).push(slot);
  }
  const results = await Promise.allSettled(Array.from(byName, async ([name, slots]) => {
    const gltf = await loader.loadAsync(ASSETS[name]);
    if (isDisposed()) return;
    for (const slot of slots) {
      const assembly = fitAsset(gltf.scene, slot);
      if (!assembly) continue;
      if (slot.replace) for (const item of slot.target.children) item.visible = false;
      if (slot.placeholder) slot.placeholder.visible = false;
      slot.target.add(assembly);
    }
    return name;
  }));
  compressed.dispose();
  if (!isDisposed()) {
    const loaded = results.filter((entry) => entry.status === 'fulfilled' && entry.value).map((entry) => entry.value);
    onStatus({
      kind: loaded.length === byName.size ? 'ready' : 'fallback',
      message: loaded.length === byName.size ? '3D city loaded.' : 'Built-in models replace any unavailable online assets.',
      assets: loaded,
    });
  }
}

function pickFrom(object) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return null;
    if (node.userData.location) {
      for (let parent = node.parent; parent; parent = parent.parent) if (!parent.visible) return null;
      return node.userData.location;
    }
  }
  return null;
}

export function mountCity(canvas, { onPick = () => {}, onStatus = () => {} } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    onStatus({ kind: 'error', message: 'WebGL could not start. The scenario controls and monitoring charts are still available.' });
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor(0x0a141d, 1);
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { light: { value: 1 } },
    vertexShader: 'varying vec3 ray; void main(){ ray=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 ray; uniform float light;
      float noise(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float cloud(vec2 p) {vec2 a=floor(p), b=fract(p); b=b*b*(3.-2.*b); return mix(mix(noise(a),noise(a+vec2(1,0)),b.x),mix(noise(a+vec2(0,1)),noise(a+1.),b.x),b.y);}
      void main(){vec3 d=normalize(ray); float h=max(0.,d.y);
      vec3 day=mix(vec3(.624,.741,.773),vec3(.27,.52,.77),smoothstep(0.,.78,h));
      vec2 uv=d.xz/max(.24,h+.22)*3.;
      float c=smoothstep(.57,.82,cloud(uv)*.7+cloud(uv*2.3)*.3)*smoothstep(.02,.32,h);
      day=mix(day,vec3(.88,.91,.91),c*.75);
      vec3 night=mix(vec3(.11,.16,.22),vec3(.024,.044,.091),smoothstep(0.,.66,h));
      gl_FragColor=vec4(mix(night,day,light),1.);}
    `,
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0x0a141d, 0.0026);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.68;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe2efff, 0x3c4b57, 1.47));
  const key = new THREE.DirectionalLight(0xffead7, 2.45);
  key.position.set(-32, 86, -30);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -82, right: 82, top: 77, bottom: -77, near: 0.1, far: 195 });
  key.shadow.normalBias = 0.23;
  key.shadow.bias = -0.00015;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x65bdff, 0.96);
  fill.position.set(45, 28, 50);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x7ef1cf, 0.56);
  rim.position.set(-55, 12, 28);
  scene.add(rim);
  let daylight = true;
  const daylightSky = 0x9fbdc5;
  const nightSky = 0x0a141d;
  function setDaylight(enabled) {
    daylight = enabled;
    const color = daylight ? daylightSky : nightSky;
    renderer.setClearColor(color, 1);
    scene.fog.color.setHex(color);
    scene.fog.density = daylight ? .003 : .0038;
    sky.material.uniforms.light.value = Number(daylight);
    key.intensity = daylight ? 3.2 : 1.25;
    fill.intensity = daylight ? .88 : 1.3;
    rim.intensity = daylight ? .34 : .65;
    for (const {field} of districts.values()) field.setDaylight(daylight);
    renderer.shadowMap.needsUpdate = true;
    redraw = true;
  }

  const camera = new THREE.PerspectiveCamera(38, 1, 0.06, 700);
  camera.position.set(104, 103, 125);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 5;
  controls.maxDistance = 460;
  controls.maxPolarAngle = Math.PI / 2.20;
  controls.zoomSpeed = 1.1;
  controls.rotateSpeed = 0.66;
  controls.screenSpacePanning = true;
  controls.target.set(0, 3.0, 5);

  const fieldTexture = surfaceTexture("grass").clone();
  fieldTexture.repeat.set(160, 160);
  fieldTexture.needsUpdate = true;
  const floor = new THREE.MeshStandardMaterial({ color: 0x8d9d7c, map: fieldTexture, roughness: .96 });
  const stage = mesh(new THREE.CircleGeometry(430,64), floor, 0, -2.45, 0, scene, false);
  stage.rotation.x = -Math.PI / 2;
  const plinth = material(0x263748, 0.69, 0.27);
  deck(scene, plinth, 0, -2.0, 7, 128, 127, 0.92, 7);
  deck(scene, material(0x192a39, 0.82), 0, -0.78, 7, 125.3, 124, 0.60, 6.1);
  const lip = material(0x405c71, 0.52, 0.56);
  deck(scene, lip, 0, -1.06, 7, 127.65, 126.46, 0.16, 6.8);
  const floorGrid = new THREE.GridHelper(260, 44, 0x284455, 0x223843);
  floorGrid.position.y = -2.37;
  floorGrid.material.transparent = true;
  floorGrid.material.opacity = 0;
  scene.add(floorGrid);
  ovalTrack(scene);

  const stations = new Map();
  for (const id of Object.keys(SYSTEM)) stations.set(id, systemNode(scene, id));
  const assetMounts = [];
  const districts = new Map(ZONES.map((zone) => [zone.id, createDistrict(scene, zone, assetMounts)]));
  const emergency = tag(place(new THREE.Group(), 11,.83,10.9, districts.get("MG1").root), "MG1", "consumer");
  emergency.rotation.y = Math.PI / 2;
  assetMounts.push({ name: "ambulance", target: emergency, height: 1.75, width: 1.5, depth: 4.8, replace: true });
  for (const [x,z,size] of [[-102,-74,19],[-83,-85,15],[-122,37,16],[92,-79,13],[112,43,19],[83,77,12]]) {
    const rise=mesh(new THREE.SphereGeometry(size,22,12),floor,x,-7,z,scene,false);
    rise.scale.y=.49;
    for (let i=0;i<5;i++) trees(scene,x+(i-2)*3,z+Math.sin(i*2)*5,311+i+x,.82);
  }
  const paths = conduitNodes(scene, districts);
  const water = createWaterNetwork(scene,districts,{ box,cylinder,material,luminous,tube,tag });
  const controlLayer = createControlLayer(scene,districts,{makeBadge,tube,tag});
  const activeLayer = new THREE.Group();
  scene.add(activeLayer);
  const highlights = new Map();
  const particles = new THREE.SphereGeometry(0.27, 11, 9);
  const viewDirection = v3([105, 105, 126]).normalize();
  const pointer = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 'MG1';
  let disposed = false;
  let down = null;
  let animation;
  let viewStarted = false;
  let labels = true;
  let streetCamera = false;
  let frameData;
  let liveFlows = [];
  let redraw = true;
  const drawOnChange = () => { redraw = true; };
  const explorer = createExplorer(canvas, camera, controls, drawOnChange, reduceMotion);
  let quality = "high";
  function setQuality(preset) {
    quality = preset;
    renderer.shadowMap.enabled = quality !== "low";
    renderer.shadowMap.needsUpdate = true;
    resize();
  }
  controls.addEventListener('change', drawOnChange);
  reduceMotion.addEventListener('change', drawOnChange);

  function setHighlight(id, on, watts) {
    let highlight = highlights.get(id);
    if (!highlight && on) {
      const route = paths.get(id);
      if (!route) return;
      const color = id.startsWith('GEN:') ? GEN_COLOR : POWER_COLOR;
      const body = tube(activeLayer, route, POWER_PATH_RADIUS, luminous(color, 1.22));
      const glints = [];
      const light = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      for (let i = 0; i < 7; i++) glints.push(mesh(particles, light, 0, 0, 0, activeLayer, false));
      highlight = { ...body, glints };
      highlights.set(id, highlight);
    }
    if (!highlight) return;
    highlight.object.visible = on;
    highlight.object.material.emissiveIntensity = 0.59 + bounded(watts / 15, 0, 2.0);
    for (const glint of highlight.glints) glint.visible = on && !reduceMotion.matches;
  }

  let activeNetwork="utilities";
  function update(data, mainEnabled=true) {
    frameData = data;
    const flows = new Map();
    for (const entry of data?.flows ?? []) {
      const key = `${entry.from}:${entry.to}`;
      if (entry.watts > 0.04) flows.set(key, (flows.get(key) ?? 0) + entry.watts);
      if(entry.type==="generator" && entry.watts>.04) for(const section of districts.get(entry.to)?.generatorTrunk??[]) {
        flows.set(section,(flows.get(section)??0)+entry.watts);
      }
    }
    for (const name of highlights.keys()) if (!flows.has(name)) setHighlight(name, false, 0);
    liveFlows = [...flows];
    for (const [name, watts] of liveFlows) setHighlight(name, true, watts);
    const pump = data?.districts?.find(({id})=>id==="MG2")?.services.find(({id})=>id==="cooling");
    const waterSupply = pump?.demand > .001 ? Math.min(1,pump.served/pump.demand) : 0;
    water.update(waterSupply);
    for (const row of data?.districts ?? []) {
      const zone=districts.get(row.id);
      zone?.field.update(row,waterSupply);
      for(const link of zone?.localSource??[]) {
        link.watts=row[link.kind];
        link.object.material.emissiveIntensity=.12 + Math.min(.7,Math.abs(link.watts)/18);
        const label=link.kind==="pv"?"PV → bus":link.kind==="served"?"Bus → loads"
          :describeBattery(link.watts)==="Idle"?"Battery idle":link.watts<0?"Bus → battery":"Battery → bus";
        link.label.set(`${label}  ·  ${displayWatts(link.watts)}`);
      }
    }
    controlLayer.update(data,mainEnabled);
    recolor();
  }

  function recolor() {
    for (const [id, place] of districts) {
      const row = frameData?.districts?.find((district) => district.id === id);
      const isSelected = id === selected;
      const stressed = row && (row.voltage < LIMITS.voltageBand[0] || row.voltage > LIMITS.voltageBand[1] || row.unserved > 0.4);
      const config = ZONES.find((zone) => zone.id === id);
      place.ring.material.emissive.setHex(stressed ? 0xff9268 : config.tint);
      place.ring.material.emissiveIntensity = (isSelected ? 1.05 : 0.23) + (stressed ? 0.27 : 0);
      const controllerOffline = ['WAIT', 'OFFLINE', 'UNAVAILABLE'].includes(String(row?.owner).toUpperCase());
      place.status.material.emissive.setHex(row?.takeover ? 0x72cfff : controllerOffline ? 0xf37463 : config.tint);
      place.status.material.emissiveIntensity = row?.takeover ? 1.55 : 0.65;
      place.busLight.material.emissive.setHex(stressed ? 0xff9268 : config.tint);
      place.busLight.material.emissiveIntensity = stressed ? 1.1 : 0.63;
      const solarOffline = row?.switches?.pv === false;
      place.solarLamp.material.emissive.setHex(solarOffline ? 0xf37463 : POWER_COLOR);
      place.solarLamp.material.emissiveIntensity = solarOffline ? 0.78 : bounded(0.12 + (row?.pv ?? 5) / 15, 0.12, 1.4);
      const relayDisabled = row?.switches?.relay === false;
      place.relay.material.emissive.setHex(relayDisabled ? 0xf37463 : row?.relay ? POWER_COLOR : row?.request ? GEN_COLOR : 0x526575);
      place.relay.material.emissiveIntensity = relayDisabled ? 0.75 : row?.relay ? 1.35 : row?.request ? 0.72 : 0.14;
      place.sign.material.opacity = isSelected ? 1 : 0.79;
      for (let i = 0; i < place.energyLeds.length; i++) {
        const offline = row?.switches?.battery === false;
        place.energyLeds[i].material.emissive.setHex(offline ? 0xf37463 : row?.battery<-.05 ? 0x7ecdf1 : POWER_COLORS.battery);
        place.energyLeds[i].material.emissiveIntensity = offline ? 0.63 : (row?.soc ?? 52) / 100 > i / 3 ? 0.78 : 0.105;
      }
    }
    for (const [id, station] of stations) station.badge.material.opacity = id === selected ? 1 : 0.77;
    redraw = true;
  }

  function select(id, { focus = false } = {}) {
    selected = id;
    recolor();
    if (focus) {
      streetCamera = false;
      explorer.setMode("orbit");
      const site = ZONES.find((zone) => zone.id === id)?.site ?? SYSTEM[id]?.site;
      if (!site) return;
      const direction = camera.position.clone().sub(controls.target).normalize();
      controls.target.set(site[0], 3.6, site[1]);
      const widthFactor = Math.max(1, 1.2 / Math.max(.5, camera.aspect));
      camera.position.copy(controls.target).addScaledVector(direction, 63 * widthFactor);
      controls.update();
    }
  }

  function resetView() {
    streetCamera = false;
    explorer.setMode("orbit");
    controls.target.set(0, activeNetwork==="controls"?CONTROL_ALTITUDE*.56:3.4, 4);
    const narrow = Math.max(1, 1.36 / Math.max(0.45, camera.aspect));
    const distance = Math.min(420, (activeNetwork==="controls"?190:176) * narrow);
    camera.position.copy(controls.target).addScaledVector(viewDirection, distance);
    controls.update();
  }

  function zoomCamera(factor) {
    const offset=camera.position.clone().sub(controls.target);
    const distance=bounded(offset.length()*factor,controls.minDistance,controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    redraw=true;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    const cap = {low:.75,medium:1,high:1.5,ultra:2}[quality] ?? 1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(rect.width, rect.height, false);
    redraw = true;
    if (!viewStarted) {
      viewStarted = true;
      resetView();
    }
  }

  function intersection(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const roots=activeNetwork==="controls"?controlLayer.pickTargets():pickRoots;
    for (const hit of ray.intersectObjects(roots, true)) {
      const result = pickFrom(hit.object);
      if (result) return result;
    }
    return null;
  }

  function pointerDown(event) { down = [event.clientX, event.clientY]; }
  function pointerUp(event) {
    if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) return;
    const item = intersection(event);
    if (item) {
      select(item.id);
      onPick(item.id, item.component);
    }
  }

  function contextLost(event) {
    event.preventDefault();
    onStatus({ kind: 'error', message: 'The graphics context stopped. Reload to restore the 3D city.' });
    cancelAnimationFrame(animation);
  }

  function render(now) {
    if (disposed) return;
    if (controls.enabled) controls.update();
    explorer.tick(now);
    for (const [name, watts] of liveFlows) {
      const highlight = highlights.get(name);
      if (!highlight) continue;
      for (let i = 0; i < highlight.glints.length; i++) {
        const glint = highlight.glints[i];
        glint.visible = !reduceMotion.matches;
        if (!glint.visible) continue;
        const t = (now * 0.00016 * (0.75 + Math.min(watts, 22) / 15) + i / highlight.glints.length) % 1;
        glint.position.copy(highlight.path.getPointAt(t));
      }
    }
    const utilities = activeNetwork==="utilities";
    let fieldMoving = utilities && water.animate(now,reduceMotion.matches);
    let controlMoving = !utilities && controlLayer.animate(now,reduceMotion.matches);
    const axis = new THREE.Vector3(0,1,0);
    for(const [id,{localSource}] of districts) for(const link of localSource) {
      const live=utilities&&Math.abs(link.watts)>.05;
      link.label.sign.visible=utilities&&labels&&id===selected;
      for(const [i,spark] of link.sparks.entries()) {
        spark.visible=live;
        if(!live)continue;
        const f=(i/link.sparks.length+(reduceMotion.matches?.32:now*.00018)*(link.watts<0?-1:1)+100)%1;
        spark.position.copy(link.path.getPointAt(f));
        spark.quaternion.setFromUnitVectors(axis,link.path.getTangentAt(f).normalize());
      }
      fieldMoving ||= live&&!reduceMotion.matches;
    }
    for (const { field } of districts.values()) fieldMoving = field.animate(now, reduceMotion.matches) || fieldMoving;
    if (redraw || fieldMoving || controlMoving || (utilities && liveFlows.length && !reduceMotion.matches)) {
      for (const {sign} of districts.values()) sign.visible = labels && !streetCamera && utilities;
      for (const {badge} of stations.values()) badge.visible = labels && !streetCamera && utilities;
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
      redraw = false;
    }
    animation = requestAnimationFrame(render);
  }

  const pickRoots = [...Array.from(districts.values(), (district) => district.root),
    ...Array.from(stations.values(), (station) => station.group),water.root];
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('webglcontextlost', contextLost);
  resize();
  setDaylight(true);
  recolor();
  animation = requestAnimationFrame(render);
  onStatus({ kind: 'ready', message: '3D city ready.' });
  void loadAssets(renderer, assetMounts, (status) => {
    renderer.shadowMap.needsUpdate = true;
    redraw = true;
    onStatus(status);
  }, () => disposed).catch(() => {
    if (!disposed) onStatus({ kind: 'fallback', message: '3D city loaded with built-in models.', assets: [] });
  });

  return {
    update,
    select,
    resetView,
    zoomCamera,
    setDaylight,
    setCamera(mode) {
      streetCamera = mode === "walk";
      if (mode === "orbit") resetView(); else explorer.setMode(mode);
      redraw = true;
    },
    setLabels(visible) { labels = visible; redraw = true; },
    setNetwork(network) {
      activeNetwork=network;
      activeLayer.visible=network==="utilities";
      water.root.visible=network==="utilities";
      controlLayer.setVisible(network==="controls");
      redraw=true;
    },
    setQuality,
    dispose() {
      disposed = true;
      explorer.dispose();
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.removeEventListener('change', drawOnChange);
      reduceMotion.removeEventListener('change', drawOnChange);
      controls.dispose();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('webglcontextlost', contextLost);
      const seen = new Set();
      scene.traverse((object) => {
        for (const resource of [object.geometry, ...[object.material].flat()]) {
          if (!resource || seen.has(resource)) continue;
          seen.add(resource);
          for (const value of Object.values(resource)) {
            if (value?.isTexture && !seen.has(value)) {
              seen.add(value);
              value.dispose();
            }
          }
          resource.dispose();
        }
      });
      environment.dispose();
      renderer.dispose();
    },
  };
}
