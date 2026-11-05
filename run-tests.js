import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {spawn} from 'node:child_process';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('./worker.js',import.meta.url).pathname,compatibilityDate:'2026-11-05',durableObjects:{RELAY:{className:'Relay',useSQLite:true}},durableObjectsPersist:false,cf:false}));
try {
 const url=await mf.ready;
 const health=await fetch(new URL('/health',url));if(await health.text()!=='ok')throw Error('Health check failed');
 const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--test','test-local.test.js'],{cwd:new URL('.',import.meta.url),stdio:'inherit',env:{...process.env,RELAY_TEST_URL:url.href.replace(/^http/,'ws').replace(/\/$/,'')}});child.on('error',reject);child.on('exit',resolve);});
 process.exitCode=exit;
} finally {await mf.dispose();}
