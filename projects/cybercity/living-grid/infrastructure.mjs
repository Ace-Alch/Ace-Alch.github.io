import * as THREE from "three";

const vector = (p) => new THREE.Vector3(...p);

export function span(a, b, sag) {
  const last = 8;
  return Array.from({ length: last + 1 }, (_, i) => {
    const f = i / last;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - 4 * f * (1 - f) * sag,
      a[2] + (b[2] - a[2]) * f];
  });
}

export function tower(parent, x, z, hook, style, h) {
  const { cylinder, box, material } = h;
  const galvanized = material(0x809696, .48, .75);
  const footing = material(0x85847c,.91);
  const ceramic = material(style === "relay" ? 0x377973 : 0x836746,.28,.15);
  const sides = [[1,1],[1,-1],[-1,-1],[-1,1]];
  const tiers = [.65, .65 + (hook - .65) * .28, .65 + (hook - .65) * .58, hook + .43];
  const radius = [1.36, 1.01, .73, .35];
  const joints = tiers.map((y,j) => sides.map(([u,v]) => [x+u*radius[j],y,z+v*radius[j]]));
  function strut(a,b,width) {
    const start=vector(a), end=vector(b), axis=end.clone().sub(start);
    const mid=start.addScaledVector(axis,.5);
    const beam=box(parent,galvanized,mid.x,mid.y,mid.z,width,axis.length(),width);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
  }
  for (const [fx,_,fz] of joints[0]) box(parent,footing,fx,.28,fz,.66,.62,.66);
  for(let j=0;j<joints.length-1;j++) for(let i=0;i<4;i++) {
    const next=(i+1)%4;
    strut(joints[j][i],joints[j+1][i],.14);
    strut(joints[j][i],joints[j][next],.092);
    strut(joints[j][i],joints[j+1][next],.07);
    strut(joints[j][next],joints[j+1][i],.07);
  }
  box(parent,galvanized,x,hook+.43,z,3.5,.21,.19);
  box(parent,galvanized,x,hook+.43,z,.19,.21,2.7);
  for (const offset of [-.66,0,.66]) {
    for (let level=0;level<3;level++) cylinder(parent,ceramic,x+offset,hook+.07+level*.09,z,.18,.18,.044,12);
  }
}

export function createWaterNetwork(parent, districts, h) {
  const { box, cylinder, material, luminous, tube, tag } = h;
  const root=tag(new THREE.Group(),"MG2","cooling");
  parent.add(root);
  const manifold=[-2,1.11,-15.2], inlet=[-10.0,1.65,-17.7];
  const pipe=material(0x4d7b85,.43,.52), blue=luminous(0x5ad9eb,.85);
  const base=material(0x475557,.83,.38), body=material(0x367b91,.46,.55);
  box(root,base,-2,.77,-15.2,3.7,.57,3.15);
  cylinder(root,body,-2,2.15,-15.2,1.03,1.03,2.48,24);
  cylinder(root,base,-2,3.46,-15.2,.56,.92,.26,20);
  const network=[tube(root,[inlet,[-7,1.11,-17.7],[-7,1.11,-15.2],manifold],.22,pipe)];
  for(const [id,zone] of districts) {
    const { x, z }=zone.root.position;
    const east=x>0;
    const local=[x+19.1,1.65,z+6.3];
    const corridor=east?3.4:-4.5;
    const junction=[local[0]+(east ? 2.8 : 1.3),1.05,local[2]-1.05];
    const connection=tube(root,[manifold,[corridor,1.03,-15.2],[corridor,1.03,local[2]-1.05],junction,local],.19,pipe);
    network.push(connection);
    cylinder(root,body,junction[0],1.3,junction[2],.31,.39,.50,14);
  }
  const beadGeometry=new THREE.SphereGeometry(.16,8,6);
  const markers=network.map(({path}) => [path, Array.from({length:10},()=> {
    const particle=new THREE.Mesh(beadGeometry,blue);
    root.add(particle);
    particle.visible=false;
    return particle;
  })]);
  let flow=0;
  function update(value) { flow=value; blue.emissiveIntensity=.8+value; }
  function animate(now,reduced) {
    const show=flow>.025;
    for(const [path,series] of markers) for (const [i,bead] of series.entries()) {
      bead.visible=show;
      if(show) bead.position.copy(path.getPointAt((i/series.length+(reduced ? 0 : now*.00013*flow))%1));
    }
    return show && !reduced;
  }
  return { root,update,animate };
}
