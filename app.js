'use strict';
const $=id=>document.getElementById(id);
const values={temperature_c:[],voltage_v:[],current_ma:[]};
const series=[['temperature_c','temp-chart','#88c6b2'],['voltage_v','voltage-chart','#d7ae72'],['current_ma','current-chart','#c8d3ba']];
const hover={};
let latest=null, ws=null, connected=false, reconnectTimer=null, key='',selectedPart='main',lastTelemetryAt=0;
let soundEnabled=false,audio=null,rehearsing=false,rehearsalTimers=[],lastStatus=null,restoredUntil=0,toastTimer;
try{key=sessionStorage.getItem('astraKey')||'';}catch(_){}
$('api-key').value=key;
const format=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
const title=s=>String(s||'unknown').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4000);}
function tone(type='tap'){
 if(!soundEnabled)return;
 try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(type==='warning'?210:type==='success'?680:480,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(type==='warning'?130:920,audio.currentTime+.12);gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.18);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.2);}catch(_){}
}
const message=(s,error=false)=>{$('command-message').textContent=s;$('command-message').classList.toggle('error',error);toast(s);tone(error?'warning':'success');};
function controls(){
 $('key-state').textContent=key?'Key saved for this tab':'Read-only';
 document.querySelectorAll('[data-action]').forEach(button=>{const online=latest?.devices[button.dataset.device]?.online;button.disabled=!key||!online||button.dataset.busy==='true';});
}
function draw(){
 series.forEach(([name,id,color])=>{
  const canvas=$(id),rect=canvas.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.max(1,rect.width*scale);canvas.height=Math.max(1,rect.height*scale);
  const ctx=canvas.getContext('2d');if(!ctx)return;ctx.scale(scale,scale);
  const w=rect.width,h=rect.height,data=values[name];
  ctx.strokeStyle='#30382b';ctx.lineWidth=.5;
  [.25,.75].forEach(level=>{ctx.beginPath();ctx.moveTo(0,h*level);ctx.lineTo(w,h*level);ctx.stroke();});
  const finite=data.filter(Number.isFinite);if(!finite.length){ctx.fillStyle='#63705a';ctx.font='8px monospace';ctx.fillText('AWAITING SIGNAL',0,h/2);return;}
  let low=Math.min(...finite),high=Math.max(...finite),pad=Math.max((high-low)*.25,name==='current_ma'?.5:.1);low-=pad;high+=pad;
  const xAt=i=>i/Math.max(1,data.length-1)*w,yAt=v=>h-5-(v-low)/(high-low)*(h-13);
  ctx.strokeStyle=color;ctx.lineWidth=1.25;ctx.beginPath();let drawing=false;
  data.forEach((v,i)=>{if(!Number.isFinite(v)){drawing=false;return;}if(drawing)ctx.lineTo(xAt(i),yAt(v));else ctx.moveTo(xAt(i),yAt(v));drawing=true;});ctx.stroke();
  const last=data[data.length-1];if(Number.isFinite(last)){ctx.fillStyle=color;ctx.beginPath();ctx.arc(w-2,yAt(last),2,0,Math.PI*2);ctx.fill();}
  if(hover[name]!==undefined){const i=Math.min(data.length-1,Math.max(0,Math.round(hover[name]*(data.length-1)))),v=data[i];if(Number.isFinite(v)){const x=xAt(i);ctx.strokeStyle='#d7ae7266';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,yAt(v),3,0,Math.PI*2);ctx.fill();ctx.font='8px monospace';ctx.fillStyle='#e9e4d9';ctx.fillText(format(v,2),Math.min(w-42,Math.max(0,x+5)),10);}}
 });
}
const parts={
 main:{number:'01 / 04',name:'Main controller',description:'Reads the temperature probe and generates heartbeat pulses. The supervisor watches for missing edges.',label:'CONTROLLER LINK'},
 supervisor:{number:'02 / 04',name:'The independent guardian',description:'Monitors heartbeat, current and voltage. It isolates the payload and resets the main controller when protection is required.',label:'SUPERVISOR LINK'},
 payload:{number:'03 / 04',name:'The protected payload',description:'The spacecraft instrument represents your LED load. A MOSFET switches it off during protection and recovery.',label:'PAYLOAD STATE'},
 probe:{number:'04 / 04',name:'Thermal awareness',description:'The DS18B20 probe measures temperature. At 45 °C the main stops heartbeat; the supervisor responds independently.',label:'PROBE TEMPERATURE'}
};
function renderPart(){const p=parts[selectedPart];$('part-number').textContent=p.number;$('part-name').textContent=p.name;$('part-description').textContent=p.description;$('part-label').textContent=p.label;const a=latest?.devices.main,b=latest?.devices.supervisor;let value='Waiting';if(selectedPart==='main')value=a?.online?'Online':a?.age_s!==null&&a?'Offline':'Waiting';if(selectedPart==='supervisor')value=b?.online?title(b.status):b?.age_s!==null&&b?'Offline':'Waiting';if(selectedPart==='payload')value=b?.online?(latest.payload_enabled?'Enabled':'Isolated'):'Unknown';if(selectedPart==='probe')value=a?.online?(a.probe_ok?`${format(latest.temperature_c)} °C`:'Probe missing'):'Waiting';$('part-value').textContent=value;}
function selectPart(part,dispatch=true){if(!parts[part])return;selectedPart=part;document.querySelectorAll('[data-part]').forEach(b=>{const on=b.dataset.part===part;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});renderPart();if(dispatch)window.dispatchEvent(new CustomEvent('astra:select',{detail:{part}}));tone();}
function sequence(index,caption){document.querySelectorAll('[data-step]').forEach((step,i)=>{step.classList.toggle('active',i===index);step.classList.toggle('complete',index>=0&&i<index);if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});$('sequence-caption').textContent=caption;}
function liveSequence(data){if(rehearsing)return;
 if(data.status==='healthy'&&data.payload_enabled){sequence(Date.now()<restoredUntil?4:0,Date.now()<restoredUntil?'Fresh heartbeat verified. Payload restored.':'Nominal monitoring. Waiting for any change in system state.');}
 else if(data.status==='recovering'){sequence(3,'Supervisor has isolated the payload and is checking recovery.');}
 else if(data.status==='locked_out'){sequence(2,'Protection is latched. Inspect the cause before re-arming.');}
 else if(data.status==='fault'){sequence(data.payload_enabled?1:2,`Protection response: ${title(data.fault)}.`);}
 else if(data.devices.supervisor.online&&!data.payload_enabled&&data.devices.supervisor.manual_off){sequence(2,'Payload deliberately disabled by operator. Monitoring continues.');}
 else sequence(-1,data.status==='starting'?'Startup qualification: waiting for valid supply and fresh heartbeat.':'Live response appears when both controllers report fresh telemetry.');
}
function update(data,stale=false){
 if(!stale)lastTelemetryAt=Date.now();
 latest=data;window.astraState=data;
 if(data.status==='healthy'&&lastStatus&&['recovering','fault','locked_out'].includes(lastStatus)){restoredUntil=Date.now()+8000;tone('success');}
 if(data.status!==lastStatus&&['locked_out','fault'].includes(data.status))tone('warning');lastStatus=data.status;
 $('mode').textContent=data.mode==='simulation'?'SIMULATION':'HARDWARE';$('mode').classList.toggle('simulation',data.mode==='simulation');
 $('footer-mode').textContent=data.mode==='simulation'?'Simulation mode · synthetic readings':'Hardware mode · live circuit readings';
 const names={waiting:'Waiting for controllers',healthy:'All systems nominal',starting:'Controllers starting',recovering:'Recovery in progress',locked_out:'Protection lockout',offline:'Supervisor link offline',warning:'Controller link warning',fault:'Fault detected'};
 $('status').textContent=names[data.status]||title(data.status);
 $('fault').textContent=data.fault?title(data.fault):data.status==='healthy'?'Independent monitoring active.':data.recommendations[0]||'Waiting for the first report.';
 $('state-dot').className='pulse '+(data.status==='healthy'?'good':['locked_out','fault','offline'].includes(data.status)?'bad':'');
 $('heartbeat').textContent=data.devices.supervisor.online?(data.heartbeat_ok?'Active':'Missing'):'Unknown';
 $('hb-packets').classList.toggle('inactive',!data.heartbeat_ok||!data.devices.supervisor.online);
 $('payload').textContent=data.devices.supervisor.online?(data.payload_enabled?'Enabled':'Isolated'):'Unknown';$('resets').textContent=data.reset_count;
 $('temperature').textContent=format(data.temperature_c);$('voltage').textContent=format(data.voltage_v,2);$('current').textContent=format(data.current_ma);
 const ml=data.ml||{},fresh=data.devices.main.online&&data.devices.supervisor.online;
 $('ml-state').textContent=!fresh?'Waiting for sensor links':!ml.ready?'Learning healthy patterns':ml.anomaly?'Unusual pattern detected':'Within learned baseline';
 $('ml-score').textContent=fresh&&Number.isFinite(ml.score)?format(ml.score,4):'—';
 $('ml-progress').textContent=ml.ready?`${ml.baseline_samples} healthy samples · baseline ready`:`${ml.baseline_samples||0} / ${ml.required_samples||60} healthy samples`;
 $('ml-meter-fill').style.width=`${Math.min(100,(ml.baseline_samples||0)/(ml.required_samples||60)*100)}%`;
 $('ml-card').classList.toggle('ml-alert',fresh&&!!ml.ready&&!!ml.anomaly);
 [['main','temp-fresh'],['supervisor','voltage-fresh'],['supervisor','current-fresh']].forEach(([role,id])=>{const dev=data.devices[role];$(id).textContent=dev.online?'Live · 60s window':dev.age_s!==null?`Stale · ${dev.age_s}s ago`:'No samples';$(id).closest('.metric').classList.toggle('stale',!dev.online);});
 for(const role of ['main','supervisor']){const dev=data.devices[role],badge=$(role+'-online');badge.textContent=dev.online?'ONLINE':dev.age_s===null?'WAITING':'OFFLINE';badge.classList.toggle('online',dev.online);$(role+'-detail').textContent=dev.boot_id?`Boot ${dev.boot_id} · ${title(dev.status||'unknown')} · #${dev.seq}`:'No report received';}
 $('advice').replaceChildren(...data.recommendations.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('event-count').textContent=`${data.events.length} RECENT EVENTS`;
 $('events').replaceChildren(...data.events.map(event=>{const li=document.createElement('li');li.className=event.kind;const time=document.createElement('time');time.textContent=new Date(event.timestamp).toLocaleTimeString();const dot=document.createElement('span');dot.className='event-dot';const text=document.createElement('span');text.textContent=event.message;li.append(time,dot,text);return li;}));
 series.forEach(([name])=>{const role=name==='temperature_c'?'main':'supervisor';values[name].push(data.devices[role].online?data[name]:null);if(values[name].length>120)values[name].shift();});
 draw();controls();renderPart();liveSequence(data);window.dispatchEvent(new CustomEvent('astra:telemetry',{detail:data}));
}
function openSocket(){
 ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/telemetry`);
 ws.onopen=()=>{connected=true;$('link').textContent='● Live telemetry';$('link').classList.add('live');};
 ws.onmessage=event=>{try{update(JSON.parse(event.data));}catch(e){console.error('Invalid telemetry',e);}};
 ws.onclose=()=>{connected=false;$('link').textContent='● Reconnecting';$('link').classList.remove('live');clearTimeout(reconnectTimer);reconnectTimer=setTimeout(openSocket,2000);};ws.onerror=()=>ws.close();
}
async function request(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-ASTRA-Key':key},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Request rejected; check API docs');return result;}
$('key-form').addEventListener('submit',event=>{event.preventDefault();key=$('api-key').value.trim();try{sessionStorage.setItem('astraKey',key);}catch(_){}controls();message(key?'Key saved. Commands are authenticated by the server.':'Controls locked.');});
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{button.dataset.busy='true';controls();try{const result=await request('/api/commands',{device:button.dataset.device,action:button.dataset.action});message(result.id?`Command #${result.id} queued. Waiting for acknowledgement.`:'Applied to the simulation.');}catch(error){message(error.message,true);}finally{delete button.dataset.busy;controls();}}));
$('chat-form').addEventListener('submit',async event=>{event.preventDefault();$('answer').textContent='Reading mission state…';try{const result=await request('/api/chat',{message:$('question').value});$('answer').textContent=result.answer;}catch(error){$('answer').textContent=error.message;}});
document.querySelectorAll('[data-part]').forEach(b=>b.addEventListener('click',()=>selectPart(b.dataset.part)));
window.addEventListener('astra:selection',event=>selectPart(event.detail.part,false));
$('sound-toggle').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound-toggle').setAttribute('aria-pressed',String(soundEnabled));$('sound-toggle').setAttribute('aria-label',soundEnabled?'Mute interface sounds':'Enable interface sounds');$('sound-toggle').querySelector('span').textContent=soundEnabled?'SOUND ON':'SOUND OFF';tone();});
let reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function setMotion(value){reduced=value;document.body.classList.toggle('reduce-motion',reduced);$('motion-toggle').setAttribute('aria-pressed',String(reduced));$('motion-toggle').setAttribute('aria-label',reduced?'Enable scene motion':'Reduce scene motion');$('motion-toggle').querySelector('span').textContent=reduced?'MOTION OFF':'MOTION ON';window.dispatchEvent(new CustomEvent('astra:motion',{detail:{reduced}}));}
$('motion-toggle').addEventListener('click',()=>setMotion(!reduced));setMotion(reduced);
function stopRehearsal(){rehearsalTimers.forEach(clearTimeout);rehearsalTimers=[];rehearsing=false;document.body.classList.remove('rehearsing');$('rehearse').innerHTML='Rehearse the story <span>↗</span>';$('rehearsal-note').textContent='Visual rehearsal · no device commands';document.querySelector('.visual-tag').textContent='CONCEPT SPACECRAFT / LIVE CIRCUIT STATE';window.dispatchEvent(new CustomEvent('astra:rehearsal',{detail:{active:false}}));if(latest)liveSequence(latest);else sequence(-1,'Live response appears here when both controllers connect.');}
function rehearse(){if(rehearsing){stopRehearsal();return;}rehearsing=true;document.body.classList.add('rehearsing');$('rehearse').textContent='Stop rehearsal ×';$('rehearsal-note').textContent='VISUAL REHEARSAL · device state is unchanged';document.querySelector('.visual-tag').textContent='VISUAL REHEARSAL / NO DEVICE COMMANDS';const stages=[['healthy',true,true,0,'Visual rehearsal: nominal signals and active payload.'],['fault',false,true,1,'Visual rehearsal: the main heartbeat stops.'],['fault',false,false,2,'Visual rehearsal: the supervisor isolates the payload.'],['recovering',false,false,3,'Visual rehearsal: reset the main and verify fresh heartbeat.'],['healthy',true,true,4,'Visual rehearsal: heartbeat returns and the payload is restored.']];stages.forEach(([status,hb,payload,index,caption],i)=>{const apply=()=>{sequence(index,caption);tone(index===1?'warning':'tap');window.dispatchEvent(new CustomEvent('astra:rehearsal',{detail:{active:true,state:{status,heartbeat_ok:hb,payload_enabled:payload,devices:{main:{online:true},supervisor:{online:true}}}}}));};if(i===0)apply();else rehearsalTimers.push(setTimeout(apply,i*2300));});rehearsalTimers.push(setTimeout(stopRehearsal,12500));toast('Visual rehearsal only. No hardware commands are sent.');}
$('rehearse').addEventListener('click',rehearse);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&rehearsing)stopRehearsal();});
series.forEach(([name,id])=>{$(id).addEventListener('pointermove',e=>{const rect=$(id).getBoundingClientRect();hover[name]=(e.clientX-rect.left)/rect.width;draw();});$(id).addEventListener('pointerleave',()=>{delete hover[name];draw();});});
if('IntersectionObserver'in window){document.body.classList.add('js-ready');const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}});},{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));const navObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting)document.querySelectorAll('.nav-link').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+entry.target.id));});},{rootMargin:'-20% 0px -60% 0px'});document.querySelectorAll('main>section[id]').forEach(el=>navObserver.observe(el));}
window.addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-window.innerHeight;$('scroll-progress').style.width=`${max>0?window.scrollY/max*100:0}%`;},{passive:true});
setInterval(()=>{$('clock').textContent=new Date().toLocaleTimeString();},1000);
setInterval(async()=>{if(latest&&Date.now()-lastTelemetryAt>6000&&Object.values(latest.devices).some(dev=>dev.online)){const stale=JSON.parse(JSON.stringify(latest));for(const dev of Object.values(stale.devices)){dev.online=false;if(dev.age_s!==null)dev.age_s=+(dev.age_s+(Date.now()-lastTelemetryAt)/1000).toFixed(1);}stale.temperature_c=null;stale.voltage_v=null;stale.current_ma=null;stale.payload_enabled=null;stale.ml.ready=false;stale.ml.anomaly=false;stale.ml.score=null;stale.status='offline';stale.heartbeat_ok=false;stale.recommendations=['Telemetry connection is stale. Check the server and network; local ESP32 protection operates independently.'];update(stale,true);}if(!connected){try{const response=await fetch('/api/telemetry');if(response.ok)update(await response.json());}catch(_){}}try{const response=await fetch('/api/commands');if(!response.ok)return;const rows=await response.json();$('commands').replaceChildren(...rows.slice(0,4).map(command=>{const span=document.createElement('span');span.textContent=`#${command.id} ${title(command.action)} · ${command.status}`;return span;}));}catch(_){}},2000);
window.addEventListener('resize',draw);controls();draw();renderPart();openSocket();
