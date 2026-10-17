import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const canvas = document.getElementById('space-scene');
const wrapper = document.getElementById('scene-wrap');
const fallback = document.getElementById('scene-fallback');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'});
} catch (error) {
  document.getElementById('scene-load').textContent = '3D unavailable on this browser. All mission controls and telemetry remain available below.';
  document.getElementById('scene-hint').textContent = 'USE THE SUBSYSTEM TABS TO EXPLORE';
  console.warn('ASTRA: WebGL could not initialize.', error);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setClearColor(0x0a0c0d, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0c0d, .011);
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 160);
  const mobile = () => window.innerWidth < 701;
  const home = () => new THREE.Vector3(...(mobile() ? [8,6,12.5] : [7.7,5,11]));
  camera.position.copy(home());
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0,0,0);
  controls.enableDamping = true;
  controls.dampingFactor = .055;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 20;
  controls.minPolarAngle = .18;
  controls.maxPolarAngle = Math.PI * .84;
  controls.autoRotate = false;
  controls.zoomSpeed = .65;
  scene.add(new THREE.AmbientLight(0xb5b8a9, 1.25));
  const sun = new THREE.DirectionalLight(0xffd9a0, 4.4); sun.position.set(4,8,7); scene.add(sun);
  const blue = new THREE.DirectionalLight(0x97d4df, 2.4); blue.position.set(-7,0,3); scene.add(blue);
  const rim = new THREE.DirectionalLight(0xffc477, 3.5); rim.position.set(-3,5,-8); scene.add(rim);

  let seed = 5321;
  const rand = () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const gold = new THREE.MeshStandardMaterial({color:0xb58a46,metalness:.88,roughness:.31});
  const lightGold = new THREE.MeshStandardMaterial({color:0xd5bb83,metalness:.82,roughness:.27});
  const metal = new THREE.MeshStandardMaterial({color:0x9ba3a0,metalness:.9,roughness:.3});
  const dark = new THREE.MeshStandardMaterial({color:0x202a2a,metalness:.78,roughness:.38});
  const black = new THREE.MeshStandardMaterial({color:0x070d10,metalness:.6,roughness:.22});
  const pcb = new THREE.MeshStandardMaterial({color:0x173d35,metalness:.5,roughness:.48});
  const glass = new THREE.MeshStandardMaterial({color:0x163c48,metalness:.85,roughness:.17});
  const frameMat = new THREE.MeshStandardMaterial({color:0x929a8f,metalness:.9,roughness:.35});
  const glowGreen = new THREE.MeshStandardMaterial({color:0x78c6ab,emissive:0x55be9b,emissiveIntensity:.65,roughness:.25});
  const glowRed = new THREE.MeshStandardMaterial({color:0xe16d4f,emissive:0xe05135,emissiveIntensity:.7,roughness:.25});
  const foilCanvas = document.createElement('canvas'); foilCanvas.width=256;foilCanvas.height=256;
  const foilCtx=foilCanvas.getContext('2d');foilCtx.fillStyle='#a4874a';foilCtx.fillRect(0,0,256,256);
  for(let i=0;i<420;i++){foilCtx.strokeStyle=`rgba(${rand()>.5?'255,236,164':'35,26,10'},${.04+rand()*.16})`;foilCtx.lineWidth=.2+rand()*1.5;foilCtx.beginPath();foilCtx.moveTo(rand()*256,rand()*256);foilCtx.lineTo(rand()*256,rand()*256);foilCtx.stroke();}
  const foilTexture = new THREE.CanvasTexture(foilCanvas);foilTexture.colorSpace=THREE.SRGBColorSpace;
  const foil = new THREE.MeshStandardMaterial({map:foilTexture,color:0xc5a75d,metalness:.82,roughness:.46});
  const craft = new THREE.Group();craft.rotation.set(.08,-.26,-.18);scene.add(craft);
  const pickables=[];
  function mesh(geo, mat, parent, x=0,y=0,z=0, part=null){const obj=new THREE.Mesh(geo,mat);obj.position.set(x,y,z);parent.add(obj);if(part){obj.userData.part=part;pickables.push(obj);}return obj;}
  function box(parent,w,h,d,x,y,z,mat=metal,part=null){return mesh(new THREE.BoxGeometry(w,h,d),mat,parent,x,y,z,part);}
  function rod(parent,start,end,r=.025,mat=metal){const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),diff=b.clone().sub(a);const m=mesh(new THREE.CylinderGeometry(r,r,diff.length(),8),mat,parent);m.position.copy(a.add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());return m;}
  function screw(parent,x,y,z){const s=mesh(new THREE.CylinderGeometry(.035,.035,.025,8),metal,parent,x,y,z);s.rotation.x=Math.PI/2;return s;}
  function label(text,w=512,h=128){const el=document.createElement('canvas');el.width=w;el.height=h;const c=el.getContext('2d');c.fillStyle='#131c1c';c.fillRect(0,0,w,h);c.strokeStyle='#d2b77b';c.strokeRect(8,8,w-16,h-16);c.fillStyle='#d8c69f';c.font='42px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2);const tex=new THREE.CanvasTexture(el);tex.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map:tex,metalness:.2,roughness:.6});}

  // The model is a conceptual spacecraft: the breadboard's four roles are
  // represented as selectable assemblies, not a measured mechanical twin.
  const bus=new THREE.Group();craft.add(bus);
  box(bus,1.8,1.9,1.5,0,0,0,foil);
  box(bus,1.88,.09,1.6,0,.98,0,metal);
  box(bus,1.88,.09,1.6,0,-.98,0,metal);
  for(const x of [-.92,.92])for(const z of [-.78,.78])box(bus,.055,1.97,.055,x,0,z,lightGold);
  for(const y of [-.86,.86])for(const x of [-.72,.72])screw(bus,x,y,.77);
  for(let i=0;i<7;i++)box(bus,.045,1.65,.035,-.65+i*.21,0,-.78,dark);
  const plate=mesh(new THREE.PlaneGeometry(1.15,.28),label('ASTRA / 001'),bus,0,-.72,.78);
  const solar=new THREE.Group();craft.add(solar);
  const panels=[];
  for(const side of [-1,1]){
    const wing=new THREE.Group();wing.position.x=side*1.0;solar.add(wing);panels.push(wing);
    rod(wing,[0,0,0],[side*.55,0,0],.045,lightGold);
    box(wing,2.7,1.9,.095,side*1.95,0,0,dark,'supervisor');
    for(const y of [-.97,.97])box(wing,2.82,.035,.13,side*1.95,y,0,frameMat);
    for(const x of [side*.55,side*3.35])box(wing,.035,1.97,.13,x,0,0,frameMat);
    for(let col=0;col<6;col++)for(let row=0;row<7;row++){
      const cellMat=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.54+rand()*.02,.35,.065+rand()*.035),metalness:.82,roughness:.21});
      box(wing,.40,.238,.012,side*(.805+col*.44),-.78+row*.26,.058,cellMat,'supervisor');
      box(wing,.39,.004,.014,side*(.805+col*.44),-.78+row*.26,.067,lightGold);
    }
    box(wing,.022,1.85,.02,side*1.95,0,.08,lightGold);
  }
  const parts={main:new THREE.Group(),supervisor:new THREE.Group(),payload:new THREE.Group(),probe:new THREE.Group()};
  Object.values(parts).forEach(p=>craft.add(p));
  parts.main.position.set(0,.4,.84);
  box(parts.main,1.24,.65,.12,0,0,0,pcb,'main');
  box(parts.main,.53,.45,.13,-.13,0,.11,metal,'main');
  box(parts.main,.21,.38,.08,.38,0,.1,black,'main');
  for(const side of [-1,1])for(let j=0;j<9;j++)box(parts.main,.046,.04,.05,-.5+j*.12,side*.30,.05,lightGold,'main');
  const mainLED=mesh(new THREE.SphereGeometry(.046,12,8),glowGreen.clone(),parts.main,.46,.19,.15,'main');
  mesh(new THREE.PlaneGeometry(.72,.11),label('01 MAIN'),parts.main,-.05,-.2,.18);
  parts.supervisor.position.set(0,-.34,.85);
  box(parts.supervisor,1.24,.58,.12,0,0,0,pcb,'supervisor');
  box(parts.supervisor,.45,.32,.13,.12,0,.12,metal,'supervisor');
  box(parts.supervisor,.29,.3,.09,-.38,0,.10,dark,'supervisor');
  const supervisorLED=mesh(new THREE.SphereGeometry(.043,12,8),glowGreen.clone(),parts.supervisor,.48,.17,.15,'supervisor');
  for(const side of [-1,1])for(let j=0;j<8;j++)box(parts.supervisor,.042,.04,.05,-.5+j*.14,side*.265,.05,lightGold,'supervisor');
  mesh(new THREE.PlaneGeometry(.80,.11),label('02 SUPERVISOR'),parts.supervisor,0,-.18,.18);
  parts.payload.position.set(0,-1.39,0);
  const payloadRing=mesh(new THREE.CylinderGeometry(.50,.50,.38,32),metal,parts.payload,0,0,0,'payload');
  const payloadBody=mesh(new THREE.CylinderGeometry(.38,.44,.5,32),dark,parts.payload,0,-.35,0,'payload');
  const lens=mesh(new THREE.CylinderGeometry(.33,.33,.045,32),glass,parts.payload,0,-.625,0,'payload');
  const payloadLED=mesh(new THREE.TorusGeometry(.35,.024,8,40),glowGreen.clone(),parts.payload,0,-.655,0,'payload');payloadLED.rotation.x=Math.PI/2;
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;rod(parts.payload,[Math.cos(a)*.47,-.06,Math.sin(a)*.47],[Math.cos(a)*.43,-.48,Math.sin(a)*.43],.012,lightGold);}
  parts.probe.position.set(.96,.6,.56);
  rod(parts.probe,[0,0,0],[.57,.55,.26],.025,metal);
  rod(parts.probe,[.57,.55,.26],[1.12,.55,.26],.035,metal);
  const probeTip=mesh(new THREE.CapsuleGeometry(.065,.35,5,12),metal,parts.probe,1.2,.55,.26,'probe');probeTip.rotation.z=Math.PI/2;
  mesh(new THREE.SphereGeometry(.08,12,8),glowGreen.clone(),parts.probe,1.42,.55,.26,'probe');
  // Antenna and structural braces.
  rod(bus,[0,.99,0],[0,1.45,0],.065,metal);
  const dish=new THREE.Group();dish.position.set(0,1.53,0);dish.rotation.x=.5;dish.rotation.z=-.15;bus.add(dish);
  const dishMesh=mesh(new THREE.SphereGeometry(.69,32,20,0,Math.PI*2,0,.82),lightGold,dish);dishMesh.rotation.x=Math.PI;
  const dishRim=mesh(new THREE.TorusGeometry(.5,.018,8,48),metal,dish,0,-.46,0);dishRim.rotation.x=Math.PI/2;
  rod(dish,[0,-.28,0],[0,-.75,0],.018,metal);mesh(new THREE.SphereGeometry(.045,12,8),lightGold,dish,0,-.76,0);
  for(const sx of [-1,1])for(const sz of [-1,1])rod(bus,[sx*.75,.95,sz*.6],[0,1.35,0],.018,metal);

  // A procedural planet avoids network-dependent textures and large downloads.
  const planetGroup=new THREE.Group();planetGroup.position.set(-.1,-4.1,-5.5);scene.add(planetGroup);
  const planetMaterial=new THREE.ShaderMaterial({uniforms:{lightDir:{value:new THREE.Vector3(1,1.0,1.5).normalize()}},vertexShader:`varying vec3 vPosition; varying vec3 vNormal; void main(){vPosition=position;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`
    varying vec3 vPosition; varying vec3 vNormal; uniform vec3 lightDir;
    float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){return .5*noise(p)+.25*noise(p*2.03)+.125*noise(p*4.1)+.0625*noise(p*8.2);}
    void main(){vec3 p=normalize(vPosition);float n=fbm(p*4.8);float land=smoothstep(.47,.54,n);vec3 ocean=vec3(.017,.066,.085);vec3 earth=mix(ocean,vec3(.14,.18,.13),land);float cloud=smoothstep(.58,.72,fbm(p*9.0+vec3(20.0)));earth=mix(earth,vec3(.45,.49,.44),cloud*.55);float light=max(dot(vNormal,lightDir),0.0);earth*=.13+light*1.5;float glow=pow(1.0-max(dot(vNormal,vec3(0.,0.,1.)),0.0),3.0);earth+=vec3(.03,.11,.12)*glow*light;gl_FragColor=vec4(earth,1.);}`});
  mesh(new THREE.SphereGeometry(3.8,64,40),planetMaterial,planetGroup);
  const airMat=new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false,vertexShader:`varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 n;void main(){float a=pow(1.-abs(n.z),3.5)*.36;gl_FragColor=vec4(.18,.39,.43,a);}`});
  mesh(new THREE.SphereGeometry(3.87,48,32),airMat,planetGroup);
  const rings=new THREE.Group();rings.position.set(0,-.25,-1);rings.rotation.set(1.15,-.16,-.5);scene.add(rings);
  for(let i=0;i<3;i++)mesh(new THREE.TorusGeometry(4.9+i*.29,.007,5,180),new THREE.MeshBasicMaterial({color:i===1?0x627e75:0xb99152,transparent:true,opacity:i===1?.22:.18}),rings);
  const track=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:180},(_,i)=>new THREE.Vector3(Math.cos(i/180*Math.PI*2)*4.1,Math.sin(i/180*Math.PI*2)*4.1,0))),new THREE.LineDashedMaterial({color:0x829b8b,transparent:true,opacity:.2,dashSize:.06,gapSize:.15}));track.computeLineDistances();rings.add(track);
  const beacon=mesh(new THREE.SphereGeometry(.045,10,8),new THREE.MeshBasicMaterial({color:0xd7ae72}),rings,4.9,0,0);
  const starVertices=[];
  for(let i=0;i<1000;i++){const theta=rand()*Math.PI*2,y=rand()*2-1,r=30+rand()*35,s=Math.sqrt(1-y*y);starVertices.push(Math.cos(theta)*s*r,y*r,Math.sin(theta)*s*r);}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starVertices,3));
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xd0d3bd,size:.045,transparent:true,opacity:.64,sizeAttenuation:true}));scene.add(stars);

  const bases=Object.fromEntries(Object.entries(parts).map(([name,g])=>[name,g.position.clone()]));
  const offsets={main:new THREE.Vector3(-.3,1.0,1.5),supervisor:new THREE.Vector3(.3,-.3,1.9),payload:new THREE.Vector3(0,-1.1,0),probe:new THREE.Vector3(1.1,.4,.3)};
  let visual=window.astraState||{status:'waiting',devices:{main:{online:false},supervisor:{online:false}}};
  let selected='main',exploded=0,explodeTarget=0,active=true,lastTime=0,rehearsing=false;
  let reduced=document.body.classList.contains('reduce-motion')||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cameraGoal=null;
  const selection = new THREE.BoxHelper(parts.main,0xd7ae72);selection.material.transparent=true;selection.material.opacity=.65;craft.add(selection);
  // BoxHelper uses world coordinates, so attach it to the scene.
  craft.remove(selection);scene.add(selection);
  function choose(part){if(!parts[part])return;selected=part;selection.setFromObject(parts[part]);}
  function view(name){explodeTarget=name==='exploded'?1:0;cameraGoal=name==='top'?new THREE.Vector3(.01,13,.2):home();document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
  document.getElementById('reset-view').addEventListener('click',()=>view('orbit'));
  window.addEventListener('astra:select',e=>choose(e.detail.part));
  window.addEventListener('astra:telemetry',e=>{if(!rehearsing)visual=e.detail;});
  window.addEventListener('astra:rehearsal',e=>{rehearsing=e.detail.active;visual=e.detail.active?e.detail.state:(window.astraState||visual);});
  window.addEventListener('astra:motion',e=>{reduced=e.detail.reduced;});
  let pointerStart={x:0,y:0};const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();
  canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};cameraGoal=null;});
  canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(pickables,false)[0];if(hit){choose(hit.object.userData.part);window.dispatchEvent(new CustomEvent('astra:selection',{detail:{part:hit.object.userData.part}}));}});
  controls.addEventListener('start',()=>{cameraGoal=null;});
  new ResizeObserver(()=>{const w=wrapper.clientWidth,h=wrapper.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}).observe(wrapper);
  new IntersectionObserver(entries=>{active=entries[0].isIntersecting;},{rootMargin:'100px'}).observe(wrapper);
  document.addEventListener('visibilitychange',()=>{lastTime=0;});
  const targetColor=new THREE.Color();
  function led(mesh,color,intensity){targetColor.set(color);mesh.material.color.lerp(targetColor,.08);mesh.material.emissive.copy(mesh.material.color);mesh.material.emissiveIntensity=intensity;}
  function frame(ms){requestAnimationFrame(frame);if(!active||document.hidden)return;const t=ms*.001,dt=Math.min((ms-lastTime)*.001,.05);lastTime=ms;
    const mainOnline=visual.devices?.main?.online,superOnline=visual.devices?.supervisor?.online;
    const healthy=visual.status==='healthy',hb=!!visual.heartbeat_ok;
    led(mainLED,!mainOnline?0x555e52:hb?0x88c6b2:0xef8b74,mainOnline ? (hb ? .7+Math.sin(t*12)*.25 : 1.2) : .05);
    led(supervisorLED,!superOnline?0x555e52:healthy?0x88c6b2:0xef8b74,superOnline ? .85 : .05);
    led(payloadLED,visual.payload_enabled&&superOnline?0x88c6b2:0x44332c,visual.payload_enabled&&superOnline?1.4:.04);
    if(!reduced){craft.position.y=Math.sin(t*.42)*.09;craft.rotation.y+=dt*.025;planetGroup.rotation.y+=dt*.013;stars.rotation.y+=dt*.002;beacon.position.set(Math.cos(t*.1)*4.9,Math.sin(t*.1)*4.9,0);}
    exploded=THREE.MathUtils.lerp(exploded,explodeTarget,reduced?1:.05);
    for(const [name,group]of Object.entries(parts))group.position.copy(bases[name]).addScaledVector(offsets[name],exploded);
    panels.forEach((wing,i)=>{wing.position.x=(i===0?-1:1)*(1+exploded*.4);});
    selection.setFromObject(parts[selected]);selection.material.opacity=reduced ? .5 : .4+Math.sin(t*2)*.16;
    if(cameraGoal){camera.position.lerp(cameraGoal,reduced?1:.045);if(camera.position.distanceTo(cameraGoal)<.02)cameraGoal=null;}
    controls.update();renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
  fallback.classList.add('ready');
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback.classList.remove('ready');document.getElementById('scene-load').textContent='3D paused. Reload to restore the scene; telemetry continues below.';});
}
