import * as THREE from "three";
import { SERVICES } from "./services.mjs?v=layers-1";

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
  const { place, box, cylinder, material, luminous, tag, tube, trees, assetMounts } = h;
  const field = new THREE.Group();
  parent.add(field);
  const dark = material(0x344650, .78, .35);
  const steel = material(0x879b9e, .42, .62);
  const concrete = material(0x858778, .94);
  const wood = material(0x8d6141, .87);
  const waterColor = 0x68ddff;
  const effects = new Map();
  let daylight = true;

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
  const pale=material(0xc0b9a1,.82);
  const asphalt=new THREE.MeshStandardMaterial({map:surfaceTexture("asphalt"),roughness:.95});
  function paved(x,z,w,d,surface=pale) { box(field,surface,x,.72,z,w,.13,d); }
  const slots=(x,z,count)=>{
    paved(x,z,count*2.15+1,3.65,asphalt);
    for(let i=0;i<=count;i++)box(field,pale,x+2.15*(i-count/2),.795,z,.075,.017,3.35,false);
  };
  if(zone.id==="MG1") {
    slots(10.8,5.0,4);
    paved(-9,3.7,12,3.4);
    for(const side of [-1,1])for(let n=0;n<4;n++)box(field,steel,-9+side*5.7,1.51,2.5+n*.78,.13,1.42,.13);
    const canopy=box(field,material(0x517483,.32,.46),-9,2.22,3.7,12.3,.18,3.1);
    canopy.castShadow=true;
    const handler=place(new THREE.Group(),-16.8,0,-2.5,field);
    assetMounts.push({name:"airHandler",target:handler,height:1.65,width:3.65,depth:3.8});
  } else if(zone.id==="MG2") {
    paved(8.4,2.8,10.1,5.15,asphalt);
    for(const edge of [-1,1]) for(let i=0;i<8;i++) {
      box(field,steel,edge*21.8,1.3,-11.9+i*2.4,.14,1.62,.14);
      if(i<7)box(field,steel,edge*21.8,1.58,-10.7+i*2.4,.07,.07,2.4,false);
    }
    for(let n=0;n<4;n++)box(field,material(0xb8964b,.78),4.1+n*1.1,.80,4.75,.51,.024,.17,false);
  } else if(zone.id==="MG3") {
    paved(0,4.9,21,2.35);
    paved(-14.8,-6.4,7.3,8.2,material(0x7c705a,.92));
    const seesaw=place(new THREE.Group(),-15,.83,-6.4,field);
    assetMounts.push({name:"seesaw",target:seesaw,height:1.28,width:3.9,depth:2.5});
    for(const x of [-9,-3,3,9]) cylinder(field,wood,x,.97,6.1,.35,.39,.40,12);
  } else {
    slots(-12.9,5.1,3);
    for(const x of [-14.4,-6.8,5.6,13.2]) {
      paved(x,2.7,2.8,7.2,asphalt);
      box(field,wood,x+1.7,1,3.1,.33,.55,.63);
    }
    const unit=place(new THREE.Group(),-13.2,.8,-1,field);
    assetMounts.push({name:"heatPump",target:unit,height:1.35,width:2.1,depth:2.6});
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
      const belt = material(0x202423,.91);
      for(const x of [-12.8,-9.2,-5.6]) {
        for(const z of [3.05,4.7]) box(root,dark,x,1.23,z,.22,1.23,.25);
        box(root,steel,x,1.61,3.88,.25,.20,2.06);
      }
      box(root,belt,-9.3,1.8,3.88,8.75,.24,1.74);
      for(const z of [2.95,4.81]) box(root,steel,-9.3,1.83,z,8.8,.12,.16);
      for(let n=0;n<12;n++) box(root,steel,-13.4+n*.73,1.94,3.89,.07,.016,1.59,false);
      const crates=Array.from({length:4},(_,i)=>box(root,wood,-13+i*2.15,2.28,3.86,.69,.65,.92));
      box(root,accent,-13.53,2.49,2.53,.17,.17,.14,false);
      box(root,dark,-13.53,1.42,2.53,.46,2.1,.39);
      effects.set(service.id,{ type:"factory",parts,accent,crates,power:0, travel:0 });
    } else if (service.kind === "fan") {
      const accent=luminous(0x8ccac0,.6);
      const rotors=[];
      const factory=zone.id==="MG2";
      const enclosure=place(new THREE.Group(),factory?0:-15.2, factory?0:.35, factory?0:-1.18,root);
      if(!factory)enclosure.scale.setScalar(.59);
      for(const x of [-1.8,2.6]) {
        box(enclosure,dark,x,2.75,5.35,3.1,3.1,.71);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.28,.11,10,32),steel);
        place(rim,x,2.75,5.76,enclosure);
        const rotor=place(new THREE.Group(),x,2.75,5.77,enclosure);
        rotors.push(rotor);
        for(let n=0;n<5;n++) {
          const spoke=place(new THREE.Group(),0,0,0,rotor);
          spoke.rotation.z=n*Math.PI*2/5;
          const blade=box(spoke,steel,0,.63,0,.34,.98,.14);
          blade.rotation.z=.30;
        }
        const cap=cylinder(rotor,steel,0,0,.13,.26,.26,.19,18);
        cap.rotation.x=Math.PI/2;
        box(enclosure,accent,x+1.37,1.47,5.78,.16,.14,.08,false);
        for(let i=0;i<7;i++) box(enclosure,steel,x,1.66+i*.36,5.94,2.22,.026,.022,false);
      }
      effects.set(service.id,{ type:"fan",accent,rotors,power:0 });
    } else if(service.kind==="charger" || service.kind==="compressor") {
      const accent=luminous(0x83e8a7,.8);
      if(service.kind==="charger") {
        const xpos=zone.id==="MG1"?7:zone.id==="MG3"?8:-11.5;
        for(const x of [xpos,xpos+2.25]) {
          box(root,steel,x,.97,7.35,.60,.32,.70);
          box(root,material(0xe1dfca,.56,.3),x,1.92,7.35,.52,1.83,.43);
          box(root,dark,x,2.3,7.59,.40,.65,.06,false);
          box(root,accent,x,2.47,7.63,.26,.11,.04,false);
          tube(root,[[x+.24,2.28,7.5],[x+.56,1.11,7.52],[x+.83,1.31,7.53],[x+.78,2.2,7.52]],.045,dark,6);
        }
      } else {
        const tank=cylinder(root,material(0x53838c,.39,.6),11.6,1.69,4.49,.71,.71,3.7,20);
        tank.rotation.z=Math.PI/2;
        box(root,steel,11.7,.91,4.49,4.05,.23,1.73);
        box(root,dark,10.4,2.56,4.49,1.11,.51,.71);
        box(root,accent,10.4,2.86,4.49,.3,.07,.21,false);
        tube(root,[[10.85,2.66,4.49],[11.4,2.66,4.49],[11.4,2.35,4.49]],.07,steel,8);
      }
      effects.set(service.id,{type:service.kind,accent,power:0});
    } else {
      const isRoad = service.kind === "street";
      const accent = luminous(0xffe2a7, 1.4);
      const cast = isRoad ? new THREE.PointLight(0xffd088,0,15,1.8) : null;
      if(cast) place(cast,0,4.72,8.55,root);
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
      effects.set(service.id,{ type:"lights",accent,power:0,cast });
    }
  }

  function update(zoneFrame,waterSupply=1) {
    for (const service of zoneFrame.services ?? []) {
      const f = effects.get(service.id);
      if (!f) continue;
      f.power = service.demand > .001 ? Math.min(1, service.served / service.demand) : 0;
      if(f.type==="water" && !(zone.id==="MG2" && service.id==="cooling")) f.power=Math.min(f.power,waterSupply);
      f.accent.emissiveIntensity = f.power * 2.3;
      f.accent.color.setHex(f.power > .025 ? (f.type === "water" ? waterColor :
        ["charger","compressor","fan"].includes(f.type)?0x83e8a7:0xffd580) : 0x3e494b);
      if (f.water) f.water.object.visible = f.power > .025;
      if (f.cast) f.cast.intensity = daylight ? 0 : f.power*23;
      for (const part of f.parts ?? []) part.visible = f.power > .025;
    }
  }
  let last=0;
  function animate(now, reduced) {
    let moving = false;
    const dt=last ? Math.min(50,now-last) : 0;
    last=now;
    for (const f of effects.values()) {
      if ((!f.parts && !f.rotors) || f.power <= .025) continue;
      moving ||= !reduced;
      if (!reduced) {
        for(const rotor of f.rotors ?? []) rotor.rotation.z += dt*.015*f.power;
        if(f.crates) {
          f.travel=(f.travel+dt*.0021*f.power)%8.1;
          f.crates.forEach((crate,i)=>{crate.position.x=-13.25+(2.025*i+f.travel)%8.1;});
        }
      }
      const time = reduced ? 0 : now * .00014;
      f.parts?.forEach((part, i) => {
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
  return { update, animate, setDaylight(day) {
    daylight=day;
    for(const effect of effects.values()) if(effect.cast) effect.cast.intensity=daylight?0:effect.power*23;
  }};
}
