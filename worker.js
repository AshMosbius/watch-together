// Only playback state is accepted. No URLs, media, user accounts or code execution.
const TTL = 30 * 60 * 1000;
const TYPES = {create:['type','id','state'],join:['type','id','code'],leave:['type'],ping:['type'],play:['type','state'],pause:['type','state'],seek:['type','state'],playbackRate:['type','state'],heartbeat:['type','state'],theater:['type','enabled'],fullscreen:['type','enabled']};
export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
   return new Response(url.pathname === '/' || url.pathname === '/health' ? 'ok' : 'Not found', {status: url.pathname === '/' || url.pathname === '/health' ? 200 : 404});
  }
  if(url.pathname !== '/') return new Response('Not found', {status:404});
  const origin=request.headers.get('Origin');
  if(origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return new Response('Extension clients only', {status:403});
  // One coordination object keeps both viewers on the same authoritative clock.
  return env.RELAY.get(env.RELAY.idFromName('relay-v1')).fetch(request);
 }
};
export class Relay {
 constructor(ctx) {
  this.ctx=ctx;this.rooms=new Map();
  ctx.blockConcurrencyWhile(async()=>{
   const saved=await ctx.storage.list({prefix:'room:'});
   for(const r of saved.values()) this.rooms.set(r.code,r);
  });
 }
 async fetch() {
  const sockets=this.ctx.getWebSockets();
  if(sockets.length>=100) return new Response('Connection limit',{status:429});
  const pair=new WebSocketPair();const [client,server]=Object.values(pair);
  this.ctx.acceptWebSocket(server);
  server.serializeAttachment({id:'',code:'',tokens:40,last:Date.now()});
  await this.schedule();
  return new Response(null,{status:101,webSocket:client});
 }
 members(code) {return this.ctx.getWebSockets().filter(w=>w.deserializeAttachment()?.code===code);}
 send(w,m) {try {if(w.readyState===1) w.send(JSON.stringify(m));} catch {}}
 broadcast(r,m,except) {for(const w of this.members(r.code))if(w!==except)this.send(w,m);}
 snapshot(r) {return {...r.state,time:r.state.time+(r.state.paused?0:(Date.now()-r.updated)/1000*r.state.rate)};}
 async persist(r) {await this.ctx.storage.put('room:'+r.code,r);}
 async schedule() {if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+5*60*1000);}
 async detach(ws) {
  const a=ws.deserializeAttachment();if(!a?.code)return;
  const r=this.rooms.get(a.code);a.code='';ws.serializeAttachment(a);
  if(r){r.touched=Date.now();this.broadcast(r,{type:'presence',count:this.members(r.code).length,host:r.host});await this.persist(r);}
 }
 async webSocketMessage(ws,raw) {
  try {
   const now=Date.now(),a=ws.deserializeAttachment();
   if(!a)throw Error('Invalid connection');
   a.tokens=Math.min(40,a.tokens+(now-a.last)/100)-1;a.last=now;ws.serializeAttachment(a);
   if(a.tokens<0){ws.close(1008,'Rate limit');return;}
   if(typeof raw!=='string'||new TextEncoder().encode(raw).length>2048){ws.close(1009,'Message too large or binary');return;}
   const m=JSON.parse(raw);
   if(!m||typeof m!=='object'||Array.isArray(m)||!Object.hasOwn(TYPES,m.type)||Object.keys(m).some(k=>!TYPES[m.type].includes(k)))throw Error('Invalid message');
   if(m.type==='ping'){this.send(ws,{type:'pong'});return;}
   if(m.type==='leave'){await this.detach(ws);this.send(ws,{type:'left'});return;}
   if(m.type==='create'||m.type==='join') {
    if(!/^[a-f0-9]{32}$/.test(m.id))throw Error('Invalid client');
    if(a.code)throw Error('Already joined');let r;
    if(m.type==='create') {
     if(this.rooms.size>=100)throw Error('Room limit');
     const state=validateState(m.state);
     const bytes=crypto.getRandomValues(new Uint8Array(18));
     const code=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_');
     r={code,host:m.id,state,updated:now,touched:now,theater:false};this.rooms.set(code,r);
    } else {
     if(!/^[A-Za-z0-9_-]{24}$/.test(m.code))throw Error('Invalid room code');
     r=this.rooms.get(m.code);
     if(!r||now-r.touched>TTL)throw Error('Room expired or unavailable');
    }
    for(const old of this.members(r.code)) {
     const previous=old.deserializeAttachment();
     if(previous.id===m.id){previous.code='';old.serializeAttachment(previous);old.close(4001,'Replaced');}
    }
    if(this.members(r.code).length>=2)throw Error('Room full');
    a.id=m.id;a.code=r.code;ws.serializeAttachment(a);r.touched=now;
    this.send(ws,{type:'joined',code:r.code,host:r.host,state:this.snapshot(r),theater:r.theater});
    this.broadcast(r,{type:'presence',count:this.members(r.code).length,host:r.host});
    await this.persist(r);return;
   }
   const r=this.rooms.get(a.code);if(!r)throw Error('Join first');
   if(now-r.touched>TTL){await this.detach(ws);ws.close(4000,'Room expired');return;}
   if(m.type==='theater'||m.type==='fullscreen') {
    if(typeof m.enabled!=='boolean')throw Error('Invalid state');
    if(m.type==='theater')r.theater=m.enabled;
    r.touched=now;this.broadcast(r,{type:m.type,enabled:m.enabled},ws);await this.persist(r);return;
   }
   const state=validateState(m.state);r.touched=now;
   if(m.type==='heartbeat'&&a.id!==r.host)this.send(ws,{type:'heartbeat',state:this.snapshot(r)});
   else {r.state=state;r.updated=now;this.broadcast(r,{type:m.type,state:this.snapshot(r)},ws);}
   await this.persist(r);
  } catch(e) {this.send(ws,{type:'error',message:e.message});}
 }
 async webSocketClose(ws) {await this.detach(ws);try{ws.close(1000,'Closed');}catch{}}
 async webSocketError(ws) {await this.detach(ws);try{ws.close(1011,'Socket error');}catch{}}
 async alarm() {
  const now=Date.now();
  for(const [code,r]of this.rooms)if(now-r.touched>TTL){
   for(const w of this.members(code)){const a=w.deserializeAttachment();a.code='';w.serializeAttachment(a);w.close(4000,'Room expired');}
   this.rooms.delete(code);await this.ctx.storage.delete('room:'+code);
  }
  for(const w of this.ctx.getWebSockets())if(now-(w.deserializeAttachment()?.last||0)>TTL)w.close(4000,'Inactive connection');
  if(this.rooms.size||this.ctx.getWebSockets().length)await this.ctx.storage.setAlarm(now+5*60*1000);
 }
}
function validateState(s) {
 if(!s||typeof s!=='object'||Object.keys(s).sort().join(',')!=='paused,rate,time'||typeof s.paused!=='boolean'||!Number.isFinite(s.time)||s.time<0||s.time>1e9||!Number.isFinite(s.rate)||s.rate<.25||s.rate>4)throw Error('Invalid playback state');
 return {time:s.time,paused:s.paused,rate:s.rate};
}
