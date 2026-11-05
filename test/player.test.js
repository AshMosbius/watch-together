import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
class Style{constructor(){this.props={};}setProperty(k,v){this.props[k]=v;}}
class Element{
 constructor(tag='div',parent=null,w=640,h=360){this.tag=tag;this.parentElement=parent;this.style=new Style();this.attrs={};this.listeners={};this.width=w;this.height=h;this.isConnected=true;}
 getAttribute(k){return this.attrs[k]??null;}setAttribute(k,v){this.attrs[k]=v;if(k==='style')this.style=new Style();}removeAttribute(k){delete this.attrs[k];if(k==='style')this.style=new Style();}
 getBoundingClientRect(){return {width:this.width,height:this.height,top:0,left:0,right:this.width,bottom:this.height};}
 addEventListener(k,h){this.listeners[k]=h;}removeEventListener(k){delete this.listeners[k];}getRootNode(){return {};}
 append(...nodes){this.children=nodes;}replaceChildren(...nodes){this.children=nodes;}
 attachShadow(){const box=new Element();this.shadowBox=box;return {innerHTML:'',querySelector:()=>box};}
}
class Video extends Element{
 constructor(parent,w,h){super('video',parent,w,h);this.currentTime=10;this.paused=true;this.playbackRate=1;this.duration=120;this.readyState=4;}
 play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}requestFullscreen(){return Promise.resolve();}
}
function harness(){const root=new Element('html'),parent=new Element('section',root);parent.setAttribute('style','transform:translateX(0)');const large=new Video(parent,640,360),small=new Video(root,50,30);const sent=[],timers=[],events={};let receive,ui;
 const document={documentElement:root,querySelectorAll:q=>q==='video'?[small,large]:[],querySelector:()=>null,createElement:t=>{const el=new Element(t);if(t==='div'&&!ui)ui=el;return el;},addEventListener:(k,h)=>events[k]=h};
 const context=vm.createContext({document,Element,innerWidth:1000,innerHeight:700,scrollX:14,scrollY:22,scrollTo:(x,y)=>{context.restored=[x,y];},getComputedStyle:()=>({display:'block',visibility:'visible'}),chrome:{runtime:{onMessage:{addListener:h=>receive=h},sendMessage:async m=>{sent.push(m);return {active:true,connected:true};}}},setInterval:h=>timers.push(h),setTimeout:h=>{timers.push(h);return timers.length;},clearTimeout:()=>{},Date,console});vm.runInContext(fs.readFileSync(new URL('../extension/content.js',import.meta.url),'utf8'),context);
 return {large,small,parent,root,sent,timers,events,context,ui,receive:m=>receive(m,{},()=>{})};
}
test('generic adapter chooses largest video; controls and drift corrections',async()=>{
 const h=harness();await new Promise(r=>setImmediate(r));assert.match(h.sent[0].label,/640/);
 h.receive({type:'remote',event:'play',state:{time:20,paused:false,rate:1}});assert.equal(h.large.currentTime,20);assert.equal(h.large.paused,false);assert.equal(h.small.currentTime,10);
 h.receive({type:'remote',event:'heartbeat',state:{time:20.1,paused:false,rate:1}});assert.equal(h.large.currentTime,20);assert.equal(h.large.playbackRate,1);
 h.receive({type:'remote',event:'heartbeat',state:{time:20.7,paused:false,rate:1}});assert.equal(h.large.currentTime,20);assert.equal(h.large.playbackRate,1.05);
 h.receive({type:'remote',event:'heartbeat',state:{time:28,paused:false,rate:1}});assert.equal(h.large.currentTime,28);
 h.receive({type:'remote',event:'pause',state:{time:29,paused:true,rate:1.5}});assert.equal(h.large.paused,true);assert.equal(h.large.playbackRate,1.5);
});
test('theater preserves DOM, restores original styles and scroll; Esc broadcasts exit',async()=>{
 const h=harness();await new Promise(r=>setImmediate(r));const parent=h.large.parentElement;
 h.receive({type:'theater',enabled:true});assert.equal(h.large.style.props.position,'fixed');assert.equal(h.large.style.props['object-fit'],'contain');assert.equal(h.large.parentElement,parent);
 h.events.keydown({key:'Escape'});assert.deepEqual(h.context.restored,[14,22]);assert.equal(h.parent.getAttribute('style'),'transform:translateX(0)');assert.equal(h.large.getAttribute('style'),null);assert.ok(h.sent.some(m=>m.event==='theater'&&m.enabled===false));
});
test('fullscreen helper waits for an explicit page click',async()=>{const h=harness();await new Promise(r=>setImmediate(r));let calls=0;h.large.requestFullscreen=async()=>calls++;h.receive({type:'fullscreen',enabled:true});assert.equal(calls,0);await h.ui.shadowBox.children[0].onclick();assert.equal(calls,1);});
