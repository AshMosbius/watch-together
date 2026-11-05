import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {once} from 'node:events';
import {createRelay} from '../backend/server.js';
const until=async f=>{const start=Date.now();while(Date.now()-start<4500){if(await f())return;await new Promise(r=>setTimeout(r,15));}throw Error('Condition timed out');};
function profile(){let listener;const timers=[];const player={state:{time:10,paused:true,rate:1},messages:[]};const session={};
 const chrome={storage:{session:{get:async()=>({sessions:{}}),set:async x=>Object.assign(session,x)}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},tabs:{onRemoved:{addListener:()=>{}},sendMessage:async(id,m)=>{player.messages.push(m);if(m.type==='getState')return player.state;if(m.type==='remote')player.state={...m.state};return {};}},runtime:{onMessage:{addListener:h=>listener=h}}};
 const c=vm.createContext({chrome,WebSocket,URL,crypto,Date,Math,console,setInterval:()=>{},setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);timers.push(t);return t;}});vm.runInContext(fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),c);
 const msg=(m,sender={})=>new Promise(resolve=>listener({tabId:1,...m},sender,resolve));
 return {player,session,msg,report:(changed=false)=>msg({type:'report',score:230400,label:'HTML5',changed},{tab:{id:1},frameId:0}),close:()=>{for(const t of timers)clearTimeout(t);vm.runInContext('sessions.forEach(s=>{s.fatal=true;s.ws?.close()})',c);}};
}
test('two isolated worker contexts: controls, refreshed page, automatic reconnect and leave',async()=>{
 const app=createRelay();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const endpoint=`ws://127.0.0.1:${app.server.address().port}`;const a=profile(),b=profile();
 try{
 await a.report();await b.report();assert.equal((await a.msg({type:'create',endpoint})).error,undefined);await until(async()=>(await a.msg({type:'status'})).status==='Connected');const status=await a.msg({type:'status'});
 await b.msg({type:'join',endpoint,code:status.code});await until(async()=>(await b.msg({type:'status'})).status==='Connected');
 const desired={time:53,paused:true,rate:1.5};a.player.state=desired;await a.msg({type:'local',event:'seek',state:desired},{tab:{id:1},frameId:0});await until(()=>b.player.state.time===53);assert.equal(b.player.state.rate,1.5);
 a.player.state={time:0,paused:true,rate:1};await a.report(true);assert.equal(a.player.state.time,53);assert.equal(a.player.state.rate,1.5);
 const room=app.rooms.get(status.code);room.members.get(room.host).terminate();await until(async()=>(await a.msg({type:'status'})).status==='Disconnected');await until(async()=>(await a.msg({type:'status'})).status==='Connected');assert.equal(a.player.state.time,53);
 await b.msg({type:'leave'});assert.equal((await b.msg({type:'status'})).status,'Disconnected');
 }finally{a.close();b.close();app.close();}
});
