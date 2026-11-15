import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=Date.parse('2026-11-15T02:28:40Z');
while(Date.now()<until)await wait(Math.min(15000,until-Date.now()));
execFileSync('git',['pull','--rebase','origin','main']);
const base='publicador/sol-bonus-20261114/';
const receipts={...JSON.parse(fs.readFileSync(base+'receipts.json')),...JSON.parse(fs.readFileSync(base+'receipts-extra.json'))};
let token=process.env.IG_TOKEN;
async function get(id,fields){const u=new URL('https://graph.facebook.com/v21.0/'+id);u.searchParams.set('fields',fields);u.searchParams.set('access_token',token);const d=await(await fetch(u)).json();if(d.error)throw Error(d.error.message);return d;}
token=(await get('962589380261249','access_token')).access_token;
const result={checked_at:new Date().toISOString(),page:await get('962589380261249','id,name'),videos:[]};
for(const [slug,r] of Object.entries(receipts)){
 if(!r.video_id){result.videos.push({slug,state:'NO_ID'});continue;}
 let d;
 for(let n=0;n<6;n++){d=await get(r.video_id,'status,published,permalink_url,length');if(d.published&&d.status?.video_status==='ready')break;await wait(5000);}
 result.videos.push({slug,...d});
}
fs.writeFileSync(base+'verified-final.json',JSON.stringify(result,null,2)+'\n');
execFileSync('git',['add',base+'verified-final.json']);
execFileSync('git',['commit','-m','Verify all ten Facebook reels from platform readback']);
for(let i=0;i<4;i++){try{execFileSync('git',['pull','--rebase','origin','main']);execFileSync('git',['push','origin','HEAD:main']);break;}catch(e){if(i===3)throw e;}}
console.log(JSON.stringify(result));
