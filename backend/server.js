import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';
export function createRelay({ttl=30*60e3,maxRooms=1000}={}) {
 const rooms=new Map(), ips=new Map();
 const server=http.createServer((req,res)=>{res.writeHead(req.url==='/health'?200:404,{'Content-Type':'text/plain'});res.end(req.url==='/health'?'ok':'Not found');});
 const wss=new WebSocketServer({server,maxPayload:2048,perMessageDeflate:false});
 const send=(ws,m)=>{if(ws.readyState===WebSocket.OPEN && ws.bufferedAmount<65536)ws.send(JSON.stringify(m));};
 const broadcast=(r,m)=>r.members.forEach(ws=>send(ws,m));
 const snapshot=r=>({...r.state,time:r.state.time+(r.state.paused?0:(Date.now()-r.updated)/1000*r.state.rate)});
 function leave(ws){const r=ws.room;if(!r)return;r.members.delete(ws.id);ws.room=null;r.touched=Date.now();broadcast(r,{type:'presence',count:r.members.size,host:r.host});}
 wss.on('connection',(ws,req)=>{
  ws.on('error',()=>{});
  const origin=req.headers.origin;if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){ws.close(1008,'Extension clients only');return;}
  // Direct peer IP only: never trust user-supplied X-Forwarded-For.
  const ip=req.socket.remoteAddress; const n=ips.get(ip)||0;
  if(n>=100){ws.close(1008,'Connection limit');return;}ips.set(ip,n+1);
  ws.once('close',()=>{ips.set(ip,Math.max(0,(ips.get(ip)||1)-1));leave(ws);});
  ws.alive=true;ws.on('pong',()=>ws.alive=true);let tokens=40,last=Date.now();
  ws.on('message',(raw,binary)=>{try{
   const now=Date.now();tokens=Math.min(40,tokens+(now-last)/100);last=now;
   if(--tokens<0){ws.close(1008,'Rate limit');return;}
   if(binary)throw Error('Invalid message');const m=JSON.parse(raw.toString());
   if(!m||Array.isArray(m)||typeof m!=='object')throw Error('Invalid message');
   const allowed={create:['type','id','state'],join:['type','id','code'],leave:['type'],ping:['type'],play:['type','state'],pause:['type','state'],seek:['type','state'],playbackRate:['type','state'],heartbeat:['type','state'],theater:['type','enabled'],fullscreen:['type','enabled']};
   if(!allowed[m.type]||Object.keys(m).some(k=>!allowed[m.type].includes(k)))throw Error('Invalid message');
   if(m.type==='ping'){send(ws,{type:'pong'});return;}
   if(m.type==='leave'){leave(ws);send(ws,{type:'left'});return;}
   if(m.type==='create'||m.type==='join'){
    if(!/^[a-f0-9]{32}$/.test(m.id))throw Error('Invalid client');
    if(ws.room)throw Error('Already joined');let r;
    if(m.type==='create'){
     if(rooms.size>=maxRooms)throw Error('Room limit');
     const state=validateState(m.state);const code=randomBytes(18).toString('base64url');
     r={code,host:m.id,state,updated:now,touched:now,members:new Map(),theater:false};rooms.set(code,r);
    }else {if(!/^[A-Za-z0-9_-]{24}$/.test(m.code))throw Error('Invalid room code');r=rooms.get(m.code);if(!r)throw Error('Room expired or unavailable');}
    const old=r.members.get(m.id);if(old) {old.room=null;old.close(4001,'Replaced');r.members.delete(m.id);}
    if(r.members.size>=2)throw Error('Room full');ws.id=m.id;ws.room=r;r.members.set(ws.id,ws);r.touched=now;
    send(ws,{type:'joined',code:r.code,host:r.host,state:snapshot(r),theater:r.theater});broadcast(r,{type:'presence',count:r.members.size,host:r.host});return;
   }
   const r=ws.room;if(!r)throw Error('Join first');r.touched=now;
   if(m.type==='theater'||m.type==='fullscreen'){
    if(typeof m.enabled!=='boolean')throw Error('Invalid state');if(m.type==='theater')r.theater=m.enabled;
    r.members.forEach(p=>{if(p!==ws)send(p,{type:m.type,enabled:m.enabled});});return;
   }
   const s=validateState(m.state);
   // Host is the heartbeat clock; both viewers can issue deliberate controls.
   if(m.type==='heartbeat'&&ws.id!==r.host){send(ws,{type:'heartbeat',state:snapshot(r)});return;}
   if(m.type==='heartbeat'){
    const host=r.members.get(r.host);if(!host)return;
   }
   r.state=s;r.updated=now; r.members.forEach(p=>{if(p!==ws)send(p,{type:m.type,state:snapshot(r)});});
  }catch(e){send(ws,{type:'error',message:e.message});}});
 });
 const timer=setInterval(()=>{const now=Date.now();for(const [code,r]of rooms)if(now-r.touched>ttl){r.members.forEach(ws=>{ws.room=null;ws.close(4000,'Room expired');});rooms.delete(code);}wss.clients.forEach(ws=>{if(!ws.alive)return ws.terminate();ws.alive=false;ws.ping();});},Math.min(30000,ttl));timer.unref();
 return {server,wss,rooms,close:()=>{clearInterval(timer);wss.clients.forEach(w=>w.terminate());wss.close();server.close();}};
}
function validateState(s){if(!s||Object.keys(s).sort().join(',')!=='paused,rate,time'||typeof s.paused!=='boolean'||!Number.isFinite(s.time)||s.time<0||s.time>1e9||!Number.isFinite(s.rate)||s.rate<0.25||s.rate>4)throw Error('Invalid playback state');return {time:s.time,paused:s.paused,rate:s.rate};}
if(process.argv[1]===new URL(import.meta.url).pathname){const app=createRelay();app.server.listen(Number(process.env.PORT)||3000,'0.0.0.0');}
