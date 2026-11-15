import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const API='https://graph.facebook.com/v21.0', page='962589380261249';
const file='publicador/sol-bonus-20261114/receipts-extra.json';
const items=JSON.parse(fs.readFileSync('publicador/sol-bonus-20261114/manifest-extra.json'));
let receipts=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function persist(){fs.writeFileSync(file,JSON.stringify(receipts,null,2)+'\n');execFileSync('git',['add',file]);try{execFileSync('git',['commit','-m','receipt: SOL Facebook bonus']);}catch{}; for(let i=0;i<4;i++){try{execFileSync('git',['pull','--rebase','origin','main']);execFileSync('git',['push','origin','HEAD:main']);return;}catch{}}throw Error('RECEIPT_NOT_PERSISTED');}
async function get(path,fields){const u=new URL(API+'/'+path);u.searchParams.set('fields',fields);u.searchParams.set('access_token',token);const d=await(await fetch(u)).json();if(d.error)throw Error(d.error.message);return d;}
async function post(path,data){const d=await(await fetch(API+'/'+path,{method:'POST',body:new URLSearchParams({...data,access_token:token})})).json();if(d.error)throw Error(d.error.message);return d;}
let token=process.env.IG_TOKEN;
token=(await get(page,'access_token')).access_token;if(!token)throw Error('PAGE_TOKEN_MISSING');
const identity=await get(page,'id,name');console.log('PAGE',JSON.stringify(identity));
for(const [index,item] of items.entries()){
 const slot=Date.parse(item.slot);
 let r=receipts[item.slug];
 if(r?.state==='POSTED'){console.log(item.slug,'ALREADY_POSTED',r.video_id);continue;}
 if(r){console.log(item.slug,'EXISTING_ATTEMPT_NO_RETRY',JSON.stringify(r));continue;}
 try{
  r=receipts[item.slug]={state:'STARTING',slot:new Date(slot).toISOString()};persist();
  const ini=await post(page+'/video_reels',{upload_phase:'start'});if(!ini.video_id)throw Error('NO_VIDEO_ID');
  r.video_id=ini.video_id;r.state='UPLOADING';persist();
  const bytes=fs.readFileSync('publicador/sol-bonus-20261114/'+item.file);
  const up=await(await fetch(`https://rupload.facebook.com/video-upload/v21.0/${r.video_id}`,{method:'POST',headers:{Authorization:`OAuth ${token}`,offset:'0',file_size:String(bytes.length),'Content-Type':'application/octet-stream'},body:bytes})).json();
  if(!up.success)throw Error('UPLOAD_FAILED '+JSON.stringify(up));
  let ready=false;for(let j=0;j<24;j++){const d=await get(r.video_id,'status');r.readback=d.status;if(d.status?.uploading_phase?.status==='complete'||d.status?.video_status==='ready'){ready=true;break;}await sleep(5000);}
  if(!ready)throw Error('UPLOAD_NOT_CONFIRMED');
  r.state='UPLOADED_WAITING_SLOT';persist();
  while(Date.now()<slot)await sleep(Math.min(15000,slot-Date.now()));
  if(Date.now()>Date.parse('2026-11-15T02:30:00Z'))throw Error('DEADLINE_PASSED');
  r.state='FINISHING';persist();
  const done=await post(page+'/video_reels',{upload_phase:'finish',video_id:r.video_id,video_state:'PUBLISHED',description:item.caption+'\n\n#Astronomia #NeuralUpdate'});
  if(!done.success)throw Error('FINISH_NOT_CONFIRMED');
  r.state='ACCEPTED';persist();
  for(let j=0;j<24;j++){const d=await get(r.video_id,'status,published,permalink_url');r.readback=d;if(d.published===true){r.state='POSTED';r.confirmed_at=new Date().toISOString();break;}await sleep(5000);}
  persist();console.log('RESULT',item.slug,JSON.stringify(r));
 }catch(e){r.state=r.state==='ACCEPTED'?'ACCEPTED_UNVERIFIED':'FAIL';r.error=e.message;persist();console.log('RESULT',item.slug,JSON.stringify(r));}
}
