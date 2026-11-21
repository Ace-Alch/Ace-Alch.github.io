import * as THREE from "three";

const blocked = [
  [29,-29,13,8], [-29,-29,14,8], [-29,19,13,8],
  [20,15,5,4], [35,14,5,4], [22,24,5,4], [38,23,5,4],
  [-24,54,8,5], [0,54,10,5], [24,54,8,5],
];
const directions = { KeyW:"up", ArrowUp:"up", KeyS:"down", ArrowDown:"down",
  KeyA:"left", ArrowLeft:"left", KeyD:"right", ArrowRight:"right", KeyQ:"lower", KeyE:"raise" };

export function createExplorer(canvas, camera, orbit, changed, reducedMotion) {
  const keys = new Set();
  const heading = new THREE.Vector3(), side = new THREE.Vector3();
  let mode = "orbit", last = 0, yaw = 0, pitch = 0, pointer = null, tourTime = 0;
  const layer = canvas.parentElement.querySelector("#move-pad");
  const active = () => mode === "walk" || mode === "drone";
  const look = () => {
    const forward = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(forward.add(camera.position));
    changed();
  };
  const keydown = (e) => {
    if (!active() || !directions[e.code] || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
    e.preventDefault();
    keys.add(directions[e.code]);
  };
  const keyup = (e) => keys.delete(directions[e.code]);
  const clear = () => { keys.clear(); pointer = null; };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", clear);
  canvas.addEventListener("pointerdown", (e) => {
    if (!active() || e.button !== 0) return;
    canvas.focus({preventScroll:true});
    pointer = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer || !active()) return;
    yaw -= (e.clientX - pointer[0]) * .006;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - pointer[1]) * .005, -1.12, 1.12);
    pointer = [e.clientX, e.clientY];
    look();
  });
  for (const type of ["pointerup","pointercancel","lostpointercapture"]) {
    canvas.addEventListener(type, () => { pointer = null; });
  }
  for (const button of layer.querySelectorAll("button")) {
    const key = button.dataset.move;
    button.addEventListener("pointerdown", e => {
      button.setPointerCapture(e.pointerId);
      keys.add(key);
    });
    for (const event of ["pointerup","pointercancel","lostpointercapture"]) button.addEventListener(event, () => keys.delete(key));
    button.addEventListener("click", e => {
      if (e.detail === 0) move(effectiveVector(new Set([key])), mode === "walk" ? .85 : 2.6);
    });
  }
  function effectiveVector(input) {
    heading.set(Math.sin(yaw),0,Math.cos(yaw));
    side.set(-Math.cos(yaw),0,Math.sin(yaw));
    const v = new THREE.Vector3().addScaledVector(heading, Number(input.has("up"))-Number(input.has("down")))
      .addScaledVector(side, Number(input.has("right"))-Number(input.has("left")));
    if (mode === "drone") v.y = Number(input.has("raise"))-Number(input.has("lower"));
    return v.normalize();
  }
  function move(v, distance) {
    const next = camera.position.clone().addScaledVector(v,distance);
    const inside = (x,z) => Math.abs(x) < 62 && z > -52 && z < 62 &&
      blocked.every(([bx,bz,w,d]) => Math.abs(x-bx) > w+.5 || Math.abs(z-bz) > d+.5);
    if (mode === "walk") {
      if (inside(next.x,camera.position.z)) camera.position.x=next.x;
      if (inside(camera.position.x,next.z)) camera.position.z=next.z;
    } else {
      camera.position.set(THREE.MathUtils.clamp(next.x,-123,123),THREE.MathUtils.clamp(next.y,15,125),THREE.MathUtils.clamp(next.z,-120,130));
    }
    look();
  }
  function setMode(value) {
    mode = value;
    clear();
    layer.hidden = !active();
    layer.dataset.camera = value;
    orbit.enabled = value === "orbit";
    if (value === "walk") { camera.position.set(2,2.7,37); yaw = Math.PI; pitch = -.045; look(); }
    else if (value === "drone") { camera.position.set(42,38,56); yaw = -2.54; pitch = -.34; look(); }
    else if (value === "tour") tourTime = 0;
  }
  function tick(now) {
    const elapsed = Math.min(.055, (now - last) / 1000);
    last = now;
    if (active() && keys.size) move(effectiveVector(keys), elapsed * (mode === "walk" ? 7 : 32));
    if (mode !== "tour") return;
    if (!reducedMotion.matches) tourTime += elapsed;
    const a = .65 + tourTime * .12;
    camera.position.set(Math.sin(a)*102, 47+Math.cos(a*1.6)*10,Math.cos(a)*102);
    camera.lookAt(0,3,3);
    changed();
  }
  return { setMode, tick, active, dispose() { window.removeEventListener("keydown",keydown); window.removeEventListener("keyup",keyup); window.removeEventListener("blur",clear); } };
}
