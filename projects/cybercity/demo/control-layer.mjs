import * as THREE from "three";

export const CONTROL_ALTITUDE = 32;
const altitude=CONTROL_ALTITUDE;
const controlColors={status:0x71d7f1,command:0xffcb78,fault:0xe78f7c};
const center=[0,altitude,42];

export function createControlLayer(scene,districts,h) {
  const { makeBadge,tube,tag }=h;
  const root=new THREE.Group();
  root.visible=false;
  scene.add(root);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(119,101),new THREE.MeshBasicMaterial({
    color:0x318899,opacity:.12,transparent:true,side:THREE.DoubleSide,depthWrite:false,
  }));
  screen.rotation.x=-Math.PI/2;
  screen.position.set(0,altitude-.15,6);
  root.add(screen);
  const grid=new THREE.GridHelper(100,10,0x6cc5c9,0x477e81);
  grid.position.set(0,altitude-.12,5);
  grid.material.transparent=true;
  grid.material.opacity=.24;
  grid.material.depthWrite=false;
  root.add(grid);
  const pulseGeometry=new THREE.SphereGeometry(.2,9,7);
  const records=new Map();
  function label(record,id,value,tint,at) {
    if(record.label===value) return;
    if(record.sprite) {
      record.sprite.material.map.dispose();
      record.sprite.material.dispose();
      record.sprite.removeFromParent();
    }
    const sprite=tag(makeBadge(id,value,tint),id,id==="MAIN"?undefined:"local");
    sprite.position.set(at[0],at[1]+1.7,at[2]);
    sprite.scale.multiplyScalar(.83);
    root.add(sprite);
    Object.assign(record,{label:value,sprite});
  }
  for (const [id,zone] of districts) {
    const {x,z}=zone.root.position;
    const node=[x,altitude,z], junction=[x>0?18:-18,altitude,33];
    const toMain=[node,[node[0],altitude,z+9],junction,center];
    const toDistrict=toMain.slice().reverse().map(([x,y,z])=>[x+.8,y+.15,z]);
    const signals=[toMain,toDistrict].map((points,i)=>{
      const material=new THREE.MeshBasicMaterial({color:i?controlColors.command:controlColors.status,transparent:true,opacity:.42});
      const {object,path}=tube(root,points,.075,material,6);
      const dot=new THREE.Mesh(pulseGeometry,new THREE.MeshBasicMaterial({color:i?controlColors.command:controlColors.status}));
      root.add(dot);
      return {object,path,dot,active:false};
    });
    const riser=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...zone.mcuPosition),new THREE.Vector3(zone.mcuPosition[0],altitude,zone.mcuPosition[2]),
      new THREE.Vector3(...node),
    ]),new THREE.LineDashedMaterial({color:0x85bbbd,dashSize:.45,gapSize:.48,transparent:true,opacity:.58}));
    riser.computeLineDistances();
    root.add(riser);
    records.set(id,{node,signals});
  }
  const main={};
  function update(data,mainEnabled) {
    if(!root.visible) return;
    label(main,"MAIN",mainEnabled?"SUPERVISOR ONLINE":"SUPERVISOR OFF",
      mainEnabled?controlColors.command:controlColors.fault,center);
    for(const entry of data?.districts??[]) {
      const record=records.get(entry.id);
      const [feedback,command]=record.signals;
      feedback.active=entry.localAlive&&mainEnabled;
      command.active=mainEnabled&&(entry.owner==="MAIN"||entry.relay||entry.shed||entry.mainCommand!=="NONE");
      feedback.object.material.opacity=feedback.active?.64:.18;
      command.object.material.opacity=command.active?.88:.16;
      const text=!entry.localAlive?(entry.owner==="MAIN"?"MAIN TAKEOVER":"LOCAL OFFLINE")
        : entry.shed?"LOAD LIMIT":entry.request?"SUPPORT REQUEST":entry.relay?"RELAY CLOSED":"LOCAL CONTROL";
      label(record,entry.id,text,!entry.localAlive?controlColors.fault:controlColors.status,record.node);
    }
  }
  function animate(now,reduced) {
    if(!root.visible) return false;
    let moving=false;
    for(const {signals} of records.values()) for(const {dot,path,active} of signals) {
      dot.visible=active;
      if(active) {
        dot.position.copy(path.getPointAt(reduced?.5:(now*.00024)%1));
        moving ||= !reduced;
      }
    }
    return moving;
  }
  return { update,animate,setVisible(visible) { root.visible=visible; },
    pickTargets(){return [main.sprite,...[...records.values()].map(({sprite})=>sprite)].filter(Boolean);} };
}
