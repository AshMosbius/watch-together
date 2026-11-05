import {test} from 'node:test';
import assert from 'node:assert/strict';
const endpoint=process.env.RELAY_TEST_URL||'ws://127.0.0.1:8787';
async function client(){const w=new WebSocket(endpoint),q=[];w.addEventListener('message',e=>q.push(JSON.parse(e.data)));await new Promise((r,j)=>{w.addEventListener('open',r,{once:true});w.addEventListener('error',j,{once:true});});return {ws:w,send:m=>w.send(JSON.stringify(m)),next:async type=>{const end=Date.now()+3500;while(Date.now()<end){const i=q.findIndex(m=>m.type===type);if(i>=0)return q.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timeout '+type);}};}
const initial={time:10,paused:true,rate:1};
test('Cloudflare runtime: rooms, shared controls, heartbeat, reconnect, strict validation, theater and fullscreen',async()=>{
 const sockets=[];try {
 const a=await client(),b=await client(),c=await client();sockets.push(a,b,c);
 a.send({type:'create',id:'a'.repeat(32),state:initial});const room=await a.next('joined');assert.match(room.code,/^[\w-]{24}$/);
 b.send({type:'join',id:'b'.repeat(32),code:room.code});assert.equal((await b.next('joined')).state.time,10);
 c.send({type:'join',id:'c'.repeat(32),code:room.code});assert.equal((await c.next('error')).message,'Room full');
 for(const [type,state]of [['play',{time:10,paused:false,rate:1}],['pause',{time:18,paused:true,rate:1}],['seek',{time:61,paused:true,rate:1}],['playbackRate',{time:61,paused:true,rate:1.5}]]){a.send({type,state});const result=(await b.next(type)).state;assert.equal(result.paused,state.paused);assert.equal(result.rate,state.rate);assert.ok(Math.abs(result.time-state.time)<.3);}
 b.send({type:'seek',state:{time:70,paused:true,rate:1.5}});assert.equal((await a.next('seek')).state.time,70);
 b.send({type:'heartbeat',state:initial});assert.equal((await b.next('heartbeat')).state.time,70);
 a.send({type:'heartbeat',state:{time:71,paused:true,rate:1.5}});assert.equal((await b.next('heartbeat')).state.time,71);
 a.send({type:'theater',enabled:true});assert.equal((await b.next('theater')).enabled,true);
 b.ws.close();await new Promise(r=>setTimeout(r,100));const re=await client();sockets.push(re);re.send({type:'join',code:room.code,id:'b'.repeat(32)});const joined=await re.next('joined');assert.equal(joined.state.time,71);assert.equal(joined.theater,true);
 a.send({type:'fullscreen',enabled:true});assert.equal((await re.next('fullscreen')).enabled,true);
 for(const bad of [{type:'execute',js:'anything'},{type:'seek',state:initial,url:'private'},{type:'seek',state:{time:-1,paused:true,rate:1}}]){a.send(bad);assert.equal((await a.next('error')).type,'error');}
 re.send({type:'leave'});await re.next('left');a.send({type:'leave'});await a.next('left');
 }finally{sockets.forEach(c=>c.ws.close());}
});
test('Cloudflare runtime: flooding is disconnected',async()=>{const a=await client();const closed=new Promise(r=>a.ws.addEventListener('close',r,{once:true}));for(let i=0;i<80;i++)a.send({type:'ping'});const event=await closed;assert.equal(event.code,1008);});
