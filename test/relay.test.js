import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs';
import {createRelay} from '../backend/server.js';
const initial={time:12,paused:true,rate:1};
async function client(url){const w=new WebSocket(url);w.queue=[];w.on('message',d=>w.queue.push(JSON.parse(d)));await once(w,'open');w.sendObj=o=>w.send(JSON.stringify(o));w.next=async(type)=>{const start=Date.now();while(Date.now()-start<2500){const i=w.queue.findIndex(m=>m.type===type);if(i>=0)return w.queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Timeout: '+type);};return w;}
test('two viewers: room, controls, reconnect, strict schema, capacity, expiry',async()=>{
 const app=createRelay({ttl:600});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const url=`ws://127.0.0.1:${app.server.address().port}`;const clients=[];
 try{
 const a=await client(url),b=await client(url),c=await client(url);clients.push(a,b,c);
 a.sendObj({type:'create',id:'a'.repeat(32),state:initial});const room=await a.next('joined');assert.match(room.code,/^[\w-]{24}$/);
 b.sendObj({type:'join',id:'b'.repeat(32),code:room.code});assert.equal((await b.next('joined')).state.time,12);
 c.sendObj({type:'join',id:'c'.repeat(32),code:room.code});assert.equal((await c.next('error')).message,'Room full');
 for(const[type,s]of [['play',{time:12,paused:false,rate:1}],['pause',{time:15,paused:true,rate:1}],['seek',{time:42,paused:true,rate:1}],['playbackRate',{time:42,paused:true,rate:1.5}]]){a.sendObj({type,state:s});const got=await b.next(type);assert.deepEqual(got.state,s);}
 b.sendObj({type:'seek',state:{time:67,paused:true,rate:1}});assert.equal((await a.next('seek')).state.time,67);
 a.sendObj({type:'heartbeat',state:{time:68,paused:true,rate:1}});assert.equal((await b.next('heartbeat')).state.time,68);
 b.sendObj({type:'heartbeat',state:{time:0,paused:true,rate:1}});assert.equal((await b.next('heartbeat')).state.time,68);
 a.sendObj({type:'theater',enabled:true});assert.equal((await b.next('theater')).enabled,true);
 b.close();await once(b,'close');const re=await client(url);clients.push(re);re.sendObj({type:'join',id:'b'.repeat(32),code:room.code});const joined=await re.next('joined');assert.equal(joined.theater,true);assert.equal(joined.state.time,68);
 a.sendObj({type:'execute',command:'anything'});assert.equal((await a.next('error')).message,'Invalid message');
 a.sendObj({type:'seek',state:{time:-1,paused:true,rate:1}});assert.equal((await a.next('error')).message,'Invalid playback state');
 a.sendObj({type:'seek',state:initial,url:'https://private/video'});assert.equal((await a.next('error')).message,'Invalid message');
 a.sendObj({type:'fullscreen',enabled:true});assert.equal((await re.next('fullscreen')).enabled,true);
 re.sendObj({type:'leave'});await re.next('left');a.sendObj({type:'leave'});await a.next('left');
 await new Promise(r=>setTimeout(r,1300));c.sendObj({type:'join',id:'c'.repeat(32),code:room.code});assert.equal((await c.next('error')).message,'Room expired or unavailable');
 }finally{clients.forEach(w=>w.terminate());app.close();}
});
test('rate limiting closes a flooding client',async()=>{const app=createRelay();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');try{const w=await client(`ws://127.0.0.1:${app.server.address().port}`);const closed=once(w,'close');for(let i=0;i<80;i++)w.sendObj({type:'ping'});const [code]=await closed;assert.equal(code,1008);}finally{app.close();}});
