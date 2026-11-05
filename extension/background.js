const sessions=new Map(), frames=new Map();
const boot=chrome.storage.session.get('sessions').then(({sessions:s={}})=>{for(const [id,data]of Object.entries(s)){sessions.set(+id,{...data,status:'Disconnected'});connect(+id);}});
function save(){const out={};for(const [id,s]of sessions)out[id]={endpoint:s.endpoint,id:s.id,code:s.code,state:s.state,stateAt:s.stateAt,theater:s.theater};return chrome.storage.session.set({sessions:out});}
function send(s,m){if(s.ws?.readyState===1)s.ws.send(JSON.stringify(m));}
function toFrame(tabId,frameId,m){return chrome.tabs.sendMessage(tabId,m,{frameId}).catch(()=>null);}
function chosen(tabId){const fs=frames.get(tabId);if(!fs)return null;return [...fs.values()].filter(f=>Date.now()-f.at<6500&&f.score>0).sort((a,b)=>b.score-a.score)[0]||null;}
function route(tabId,m){const s=sessions.get(tabId);if(m.type==='remote'&&m.event==='sync'&&s?.stateAt&&m.state===s.state){m={...m,state:{...s.state,time:s.state.time+(s.state.paused?0:(Date.now()-s.stateAt)/1000*s.state.rate)}};}const f=chosen(tabId);if(f)return toFrame(tabId,f.frameId,m);}
function connect(tabId,create=false){const s=sessions.get(tabId);if(!s||s.ws?.readyState===1||s.ws?.readyState===0)return;
 s.status='Connecting';const ws=s.ws=new WebSocket(s.endpoint);let joined=false;
 ws.onopen=()=>send(s,create?{type:'create',id:s.id,state:s.state}:{type:'join',id:s.id,code:s.code});
 ws.onmessage=({data})=>{let m;try{m=JSON.parse(data);}catch{return;}if(s.ws!==ws)return;
  if(m.type==='joined'){joined=true;s.code=m.code;s.host=m.host;s.state=m.state;s.stateAt=Date.now();s.theater=m.theater;s.status='Connected';s.error='';s.retry=0;save();route(tabId,{type:'remote',event:'sync',state:m.state});route(tabId,{type:'theater',enabled:m.theater});}
  else if(m.type==='presence'){s.count=m.count;s.host=m.host;}
  else if(m.type==='error'){s.error=m.message;if(!joined){s.status='Disconnected';s.fatal=true;ws.close();}}
  else if(m.type==='theater'){s.theater=m.enabled;route(tabId,m);save();}
  else if(m.type==='fullscreen')route(tabId,m);
  else if(m.state){s.state=m.state;s.stateAt=Date.now();route(tabId,{type:'remote',event:m.type,state:m.state});}
 };
 ws.onclose=()=>{if(s.ws!==ws)return;s.status='Disconnected';if(!s.fatal&&sessions.get(tabId)===s){const delay=Math.min(30000,1000*2**Math.min(s.retry||0,5))+Math.random()*500;s.retry=(s.retry||0)+1;setTimeout(()=>connect(tabId,!s.code),delay);}};
 ws.onerror=()=>{s.error='Connection failed; retrying (cold start may take ~60 seconds).';};
}
setInterval(()=>sessions.forEach(s=>send(s,{type:'ping'})),20000);
chrome.alarms.create('reconnect',{periodInMinutes:0.5});chrome.alarms.onAlarm.addListener(()=>sessions.forEach((s,id)=>{if(!s.fatal)connect(id,!s.code);}));
chrome.tabs.onRemoved.addListener(id=>{const s=sessions.get(id);sessions.delete(id);s?.ws?.close();frames.delete(id);save();});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{(async()=>{await boot;const tabId=sender.tab?.id??m.tabId;if(!Number.isInteger(tabId))throw Error('No tab');const s=sessions.get(tabId);
 if(m.type==='report'){
  if(!frames.has(tabId))frames.set(tabId,new Map());const before=chosen(tabId);frames.get(tabId).set(sender.frameId,{frameId:sender.frameId,score:m.score,label:m.label,blocked:m.blocked,at:Date.now()});const after=chosen(tabId);
  if(after?.frameId===sender.frameId&&s&&(!before||before.frameId!==after.frameId||m.changed)){route(tabId,{type:'remote',event:'sync',state:s.state});route(tabId,{type:'theater',enabled:s.theater});}
  return {active:after?.frameId===sender.frameId,host:s?.host===s?.id,connected:s?.status==='Connected'};
 }
 if(m.type==='local') {if(s&&chosen(tabId)?.frameId===sender.frameId){if(m.state){s.state=m.state;s.stateAt=Date.now();save();}if(m.event==='theater'){s.theater=m.enabled;save();}send(s,['theater','fullscreen'].includes(m.event)?{type:m.event,enabled:m.enabled}:{type:m.event,state:m.state});}return {};}
 if(m.type==='status'){const f=chosen(tabId);return {status:s?.status||'Disconnected',code:s?.code||'',role:s?(s.host===s.id?'Host / Shared Control':'Shared Control'):'—',count:s?.count||0,player:f?.label||([...frames.get(tabId)?.values()||[]].some(f=>f.blocked)?'Player detected but not controllable':'No accessible HTML5 video detected'),error:s?.error||'',theater:!!s?.theater};}
 if(m.type==='leave'){sessions.delete(tabId);if(s){send(s,{type:'leave'});s.ws?.close();}route(tabId,{type:'theater',enabled:false});await save();return {};}
 if(m.type==='create'||m.type==='join'){
  const u=new URL(m.endpoint);if(u.protocol!=='wss:'&&!(u.protocol==='ws:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Use a public wss:// endpoint');
  if(m.type==='join'&&!/^[\w-]{24}$/.test(m.code))throw Error('Invalid room code');
  const f=chosen(tabId);if(!f)throw Error('Open a playable HTML5 video first');
  const state=await route(tabId,{type:'getState'});if(!state)throw Error('Player unavailable');
  sessions.delete(tabId);s?.ws?.close();const n={endpoint:u.href,id:crypto.randomUUID().replaceAll('-',''),code:m.type==='join'?m.code:'',state,theater:false};sessions.set(tabId,n);await save();connect(tabId,m.type==='create');return {};
 }
 if(m.type==='theater'){if(s){s.theater=!s.theater;send(s,{type:'theater',enabled:s.theater});save();return await route(tabId,{type:'theater',enabled:s.theater});}return await route(tabId,{type:'toggleTheater'});}
 if(m.type==='fullscreen')return await route(tabId,{type:'fullscreenPrompt'});
 throw Error('Unknown action');
 })().then(respond,e=>respond({error:e.message}));return true;});
