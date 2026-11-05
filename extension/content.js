(()=>{
 let video=null,active=false,connected=false,suppressUntil=0,baseRate=1,correction=null,theater=null,remoteState=null,lastBeat=0;
 const ui=document.createElement('div');ui.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647';
 const shadow=ui.attachShadow({mode:'closed'});shadow.innerHTML='<style>button{font:14px sans-serif;padding:12px;background:#172a3b;color:white;border:1px solid white;border-radius:5px;cursor:pointer}div{display:flex;gap:6px}</style><div></div>';
 const box=shadow.querySelector('div');
 function notify(text,fn){if(!ui.isConnected)document.documentElement.append(ui);box.replaceChildren();const b=document.createElement('button');b.textContent=text;b.onclick=fn;const x=document.createElement('button');x.textContent='×';x.onclick=()=>box.replaceChildren();box.append(b,x);}
 function message(m){return chrome.runtime.sendMessage(m).catch(()=>({}));}
 function videos(root=document){const result=[...root.querySelectorAll('video')];for(const el of root.querySelectorAll('*'))if(el.shadowRoot)result.push(...videos(el.shadowRoot));return result;}
 const playerAdapter={
  detect(){return videos().map(v=>{const r=v.getBoundingClientRect(),css=getComputedStyle(v);const visible=css.display!=='none'&&css.visibility!=='hidden'&&r.width>20&&r.height>20&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;return {v,score:visible?Math.min(r.width,innerWidth)*Math.min(r.height,innerHeight)*(v.paused?1:1.5):0};}).sort((a,b)=>b.score-a.score)[0];},
  play:()=>video.play(),pause:()=>video.pause(),getCurrentTime:()=>video.currentTime,setCurrentTime:t=>{video.currentTime=Number.isFinite(video.duration)?Math.min(t,Math.max(0,video.duration-0.05)):t;},getPlaybackRate:()=>baseRate,setPlaybackRate:r=>{baseRate=r;video.playbackRate=r;}
 };
 const state=()=>({time:playerAdapter.getCurrentTime(),paused:video.paused,rate:baseRate});
 function local(event){if(!video||!active||!connected||Date.now()<suppressUntil)return;if(event==='playbackRate'){clearTimeout(correction);baseRate=video.playbackRate;}message({type:'local',event,state:state()});}
 const handlers={play:()=>local('play'),pause:()=>local('pause'),seeked:()=>local('seek'),ratechange:()=>local('playbackRate')};
 function select(v){if(video===v)return false;if(theater)exitTheater(false);if(video)for(const[k,h]of Object.entries(handlers))video.removeEventListener(k,h);video=v;if(video){baseRate=video.playbackRate;for(const[k,h]of Object.entries(handlers))video.addEventListener(k,h);}return true;}
 function apply(s,event){if(!video||!s)return;remoteState={state:s,at:Date.now()};if(video.readyState<1){return;}clearTimeout(correction);suppressUntil=Date.now()+800;const delta=s.time-video.currentTime;
  const hard=['play','pause','seek','sync','playbackRate'].includes(event)||Math.abs(delta)>1.5;
  if(hard&&Math.abs(delta)>0.12){try{playerAdapter.setCurrentTime(s.time);}catch{}}
  playerAdapter.setPlaybackRate(s.rate);
  if(!hard&&!s.paused&&Math.abs(delta)>0.25){video.playbackRate=Math.max(.25,Math.min(4,s.rate*(delta>0?1.05:.95)));correction=setTimeout(()=>{suppressUntil=Date.now()+300;if(video)video.playbackRate=baseRate;},3000);}
  if(s.paused)playerAdapter.pause();else if(video.paused)playerAdapter.play().catch(()=>notify('Playback blocked — click to play',()=>{suppressUntil=Date.now()+800;playerAdapter.play().then(()=>box.replaceChildren()).catch(()=>{});}));
 }
 document.addEventListener('loadedmetadata',e=>{if(e.target===video&&remoteState){const s={...remoteState.state};if(!s.paused)s.time+=(Date.now()-remoteState.at)/1000*s.rate;apply(s,'sync');}},true);
 function enterTheater(){if(!video||theater)return;
  // Keep the video in its original DOM parent: site observers and event handlers survive.
  const nodes=[];let node=video;while(node&&node instanceof Element){nodes.push({node,style:node.getAttribute('style')});node=node.parentElement||node.getRootNode()?.host;}
  theater={nodes,x:scrollX,y:scrollY};
  for(const {node}of nodes.slice(1)){
   node.style.setProperty('transform','none','important');node.style.setProperty('filter','none','important');node.style.setProperty('perspective','none','important');node.style.setProperty('contain','none','important');node.style.setProperty('overflow','visible','important');node.style.setProperty('clip-path','none','important');node.style.setProperty('isolation','auto','important');node.style.setProperty('opacity','1','important');node.style.setProperty('z-index','2147483645','important');
  }
  for(const[k,v]of Object.entries({position:'fixed',inset:'0',width:'100vw',height:'100vh','max-width':'none','max-height':'none','min-width':'0','min-height':'0',margin:'0',padding:'0',border:'0','object-fit':'contain','z-index':'2147483646',background:'black'}))video.style.setProperty(k,v,'important');
  document.documentElement.style.setProperty('overflow','hidden','important');
  notify('Exit Theater (Esc)',()=>exitTheater(true));
 }
 function exitTheater(broadcast){if(!theater)return;const old=theater;theater=null;for(const{node,style}of old.nodes){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);}scrollTo(old.x,old.y);box.replaceChildren();if(broadcast)message({type:'local',event:'theater',enabled:false});}
 document.addEventListener('keydown',e=>{if(e.key==='Escape')exitTheater(true);},true);
 document.addEventListener('fullscreenchange',()=>{if(active&&connected)message({type:'local',event:'fullscreen',enabled:!!document.fullscreenElement});});
 function fullscreenPrompt(text='Click here for Real Fullscreen'){notify(text,async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await video.requestFullscreen();box.replaceChildren();}catch{notify('Fullscreen unavailable — use Theater Mode',()=>{enterTheater();message({type:'local',event:'theater',enabled:true});});}});}
 chrome.runtime.onMessage.addListener((m,_sender,reply)=>{
  if(m.type==='getState'){reply(video?state():null);return;}
  if(m.type==='remote')apply(m.state,m.event);
  if(m.type==='theater')m.enabled?enterTheater():exitTheater(false);
  if(m.type==='toggleTheater'){if(theater)exitTheater(false);else enterTheater();}
  if(m.type==='fullscreenPrompt')fullscreenPrompt();
  if(m.type==='fullscreen'&&m.enabled)fullscreenPrompt('Other viewer entered fullscreen — click to match');
  reply({});
 });
 async function scan(){const best=playerAdapter.detect();const changed=select(best?.score>0?best.v:null);const result=await message({type:'report',score:best?.score||0,label:video?`HTML5 video (${Math.round(video.getBoundingClientRect().width)} × ${Math.round(video.getBoundingClientRect().height)})`:'',blocked:!video&&!!document.querySelector('iframe'),changed});active=!!result.active;connected=!!result.connected;
  if(active&&connected&&video&&Date.now()-lastBeat>3000&&video.readyState>=1){lastBeat=Date.now();message({type:'local',event:'heartbeat',state:state()});}
 }
 setInterval(scan,2000);scan();
})();
