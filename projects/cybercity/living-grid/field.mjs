import * as THREE from "three";
import { SERVICES } from "./services.mjs";

function noise(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const textures = new Map();
export function surfaceTexture(kind) {
  if (textures.has(kind)) return textures.get(kind);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const random = noise(919 + kind.length);
  const colors = {
    grass: ["#526d43", "#85a15a", "#43573a", "#494f34"],
    asphalt: ["#3c4448", "#575f60", "#303638", "#686d6b"],
    soil: ["#76664d", "#9b845d", "#62513b", "#574a37"],
  }[kind];
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3800; i++) {
    ctx.globalAlpha = .2 + random() * .4;
    ctx.fillStyle = colors[1 + Math.floor(random() * 3)];
    ctx.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  textures.set(kind, texture);
  return texture;
}

export function buildField(parent, zone, h) {
  const { place, box, cylinder, material, luminous, tag, tube, trees } = h;
  const field = new THREE.Group();
  parent.add(field);
  const dark = material(0x344650, .78, .35);
  const steel = material(0x879b9e, .42, .62);
  const concrete = material(0x858778, .94);
  const wood = material(0x8d6141, .87);
  const waterColor = 0x68ddff;
  const effects = new Map();

  function refuge(x, z) {
    box(field, concrete, x, .75, z, 5.9, .19, 2.8);
    box(field, wood, x, 1.24, z, 2.05, .15, .51);
    for (const offset of [-.77, .77]) box(field, dark, x + offset, 1, z, .12, .48, .49);
    for (const offset of [-2.1, 2.1]) {
      cylinder(field, wood, x + offset, .94, z, .45, .51, .4);
      trees(field, x + offset, z, 19 + offset * 2, .38);
    }
  }
  if (zone.id === "MG3" || zone.id === "MG4") {
    refuge(-13.8, 5.45);
    refuge(12.7, 5.45);
  }
  if (zone.id === "MG2") {
    for (const x of [-20, -18.8, -17.6]) {
      for (const z of [-6.4, -4.8, -3.2]) {
        box(field, x < -19 ? steel : wood, x, 1.09, z, 1.05, .77, 1.4);
      }
    }
  }

  for (const service of SERVICES[zone.id]) {
    const root = tag(new THREE.Group(), zone.id, service.id);
    field.add(root);
    if (service.kind === "water") {
      const accent = luminous(waterColor, .78);
      box(root, concrete, 18, .79, 3.8, 5.5, .2, 4.1);
      box(root, dark, 17.4, 1.23, 3.55, 2.15, .73, 1.12);
      const motor = cylinder(root, steel, 17.25, 1.95, 3.55, .55, .55, 1.85, 16);
      motor.rotation.z = Math.PI / 2;
      const pipePoints = [[18.1,1.65,3.55],[19.1,1.65,3.55],[19.1,1.65,6.3],[10,1.65,6.3],[10,1.65,3.9]];
      tube(root, pipePoints, .21, new THREE.MeshStandardMaterial({color:0x66adc5, transparent:true, opacity:.36, roughness:.2}), 12);
      const water = tube(root, pipePoints, .105, accent, 8);
      const beads = Array.from({length:10}, () => {
        const bead = new THREE.Mesh(new THREE.SphereGeometry(.15,8,6), accent);
        root.add(bead);
        return bead;
      });
      if (zone.id === "MG3") {
        cylinder(root, concrete, 10, .9, 3.8, 1.48, 1.6, .27, 24);
        cylinder(root, accent, 10, 1.06, 3.8, 1.22, 1.22, .055, 24);
      }
      effects.set(service.id, { type:"water", parts:beads, water, accent, power:0 });
    } else if (service.kind === "factory") {
      const stack = cylinder(root, steel, -16.1, 4.6, -10.75, .62, .83, 7.7, 20);
      stack.castShadow = true;
      cylinder(root, dark, -16.1, 8.55, -10.75, .73, .73, .22, 20);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createRadialGradient(32,32,2,32,32,30);
      gradient.addColorStop(0,"rgba(217,226,226,.82)");
      gradient.addColorStop(.45,"rgba(217,226,226,.42)");
      gradient.addColorStop(1,"rgba(217,226,226,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0,0,64,64);
      const map = new THREE.CanvasTexture(canvas);
      const parts = Array.from({length:11}, () => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent:true, depthWrite:false }));
        root.add(sprite);
        return sprite;
      });
      const accent = luminous(0xffc481, .9);
      box(root, dark, -14.9, 1.38, 2.8, 4.2, 1.1, 1.85);
      box(root, accent, -14.9, 1.94, 2.8, 3.3, .08, .22, false);
      effects.set(service.id,{ type:"factory",parts,accent,power:0 });
    } else {
      const isRoad = service.kind === "street";
      const accent = luminous(0xffe2a7, 1.4);
      const heads = isRoad ? [[-12,7.8], [0,7.8], [13.3,7.8]] : [[-7,-1.2],[0,-1.2],[7,-1.2]];
      for (const [x,z] of heads) {
        if (isRoad) {
          cylinder(root, dark, x, 2.75, z, .072, .16, 4.3, 12);
          box(root,dark,x,4.94,z+.45,.27,.16,.99);
          box(root,accent,x,4.83,z+.7,.36,.08,.5,false);
        } else {
          box(root,steel,x,1.2,z,.65,.95,.45);
          box(root,accent,x,1.62,z+.2,.52,.1,.29,false);
        }
      }
      effects.set(service.id,{ type:"lights",accent,power:0 });
    }
  }

  function update(zoneFrame) {
    for (const service of zoneFrame.services ?? []) {
      const f = effects.get(service.id);
      if (!f) continue;
      f.power = service.demand > .001 ? Math.min(1, service.served / service.demand) : 0;
      f.accent.emissiveIntensity = f.power * 2.3;
      f.accent.color.setHex(f.power > .025 ? (f.type === "water" ? waterColor : 0xffd580) : 0x3e494b);
      if (f.water) f.water.object.visible = f.power > .025;
      for (const part of f.parts ?? []) part.visible = f.power > .025;
    }
  }
  function animate(now, reduced) {
    let moving = false;
    for (const f of effects.values()) {
      if (!f.parts || f.power <= .025) continue;
      moving ||= !reduced;
      const time = reduced ? 0 : now * .00014;
      f.parts.forEach((part, i) => {
        const phase = (i / f.parts.length + time * (.4 + f.power)) % 1;
        if (f.type === "water") part.position.copy(f.water.path.getPointAt(phase));
        else {
          part.position.set(-16.1 + phase * phase * 4.2, 8.65 + phase * 7, -10.75 + Math.sin(phase * 4 + i) * .43);
          part.scale.setScalar(.94 + phase * 3);
          part.material.opacity = (1 - phase) * f.power * .46;
        }
      });
    }
    return moving;
  }
  return { update, animate };
}
