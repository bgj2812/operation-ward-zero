import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data.json');
const PORT=Number(process.env.PORT||3000);
const initial={readings:[],notes:[],alerts:[],events:[],caregiver:{name:'Demo Caregiver',checkedIn:false,lastChange:null},lastAlertAt:0,nextAlertId:1};
let state;
try{state=JSON.parse(await fs.readFile(DATA,'utf8'))}catch{state=structuredClone(initial);await save()}
async function save(){await fs.writeFile(DATA,JSON.stringify(state,null,2))}
function event(message){state.events.unshift({time:new Date().toISOString(),message});state.events=state.events.slice(0,100)}
function assess(v){let score=0;const reasons=[];if(v.spo2<90){score+=3;reasons.push('SpO₂ below 90%')}else if(v.spo2<94){score+=2;reasons.push('SpO₂ below 94%')}if(v.hr>=125||v.hr<45){score+=3;reasons.push('marked heart-rate deviation')}else if(v.hr>=105||v.hr<55){score++;reasons.push('heart rate outside demo threshold')}if(v.temp>=39){score+=2;reasons.push('high temperature')}else if(v.temp>=38){score++;reasons.push('raised temperature')}if(v.bp<95){score+=2;reasons.push('low systolic pressure')}else if(v.bp<100){score++;reasons.push('systolic pressure below demo threshold')};return{level:score>=3?'HIGH':score>=1?'MEDIUM':'LOW',score,reasons}}
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj))}
async function body(req){let s='';for await(const c of req)s+=c;return s?JSON.parse(s):{}}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
 if(url.pathname==='/api/health')return json(res,200,{ok:true,storage:'json-file',mode:'simulation',version:'3.0.0'});
 if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,state);
 if(url.pathname==='/api/readings'&&req.method==='POST'){
  const v=await body(req);for(const k of ['hr','spo2','temp','bp'])if(typeof v[k]!=='number'||!Number.isFinite(v[k]))return json(res,400,{error:'Invalid synthetic reading'});
  const a=assess(v),record={...v,id:Date.now(),time:new Date().toISOString(),risk:a.level,score:a.score,reasons:a.reasons};state.readings.unshift(record);state.readings=state.readings.slice(0,500);
  const active=state.alerts.find(x=>x.status!=='Resolved');const rank={LOW:0,MEDIUM:1,HIGH:2};const cooldown=Date.now()-state.lastAlertAt>30000;
  if(a.level!=='LOW'&&active&&rank[a.level]>rank[active.level]){const previous=active.level;active.level=a.level;active.reason=a.reasons.join('; ')||'Configured risk threshold exceeded';active.escalatedAt=record.time;active.readingId=record.id;event(`Alert #${active.id} escalated ${previous} → ${a.level}`)}
  else if(a.level!=='LOW'&&!active&&cooldown){const alert={id:state.nextAlertId++,level:a.level,reason:a.reasons.join('; ')||'Configured risk threshold exceeded',time:record.time,status:'Open',readingId:record.id};state.alerts.unshift(alert);state.lastAlertAt=Date.now();event(`New ${a.level} risk alert #${alert.id}`)}
  event(`Sensor reading received; risk ${a.level}`);await save();return json(res,201,{reading:record,assessment:a,state})
 }
 if(url.pathname==='/api/notes'&&req.method==='POST'){const b=await body(req);if(!String(b.text||'').trim())return json(res,400,{error:'Note is required'});state.notes.unshift({id:Date.now(),text:String(b.text).slice(0,1000),language:['English','Tamil','Hindi'].includes(b.language)?b.language:'English',englishSummary:String(b.englishSummary||'').slice(0,1000),caregiver:state.caregiver.name,time:new Date().toISOString()});event('Caregiver note recorded');await save();return json(res,201,state.notes[0])}
 if(url.pathname==='/api/alerts/action'&&req.method==='POST'){const b=await body(req);const a=state.alerts.find(x=>x.id===Number(b.id));if(!a)return json(res,404,{error:'Alert not found'});if(b.action==='acknowledge'&&a.status==='Open'){a.status='Acknowledged';a.acknowledgedAt=new Date().toISOString();event(`Caregiver acknowledged alert #${a.id}`)}else if(b.action==='resolve'&&a.status==='Acknowledged'){a.status='Resolved';a.resolvedAt=new Date().toISOString();event(`Caregiver resolved alert #${a.id}`)}else return json(res,409,{error:'Invalid alert transition'});await save();return json(res,200,a)}
 if(url.pathname==='/api/caregiver'&&req.method==='POST'){const b=await body(req);if(b.action==='checkin'||b.action==='checkout'){state.caregiver.checkedIn=b.action==='checkin';state.caregiver.lastChange=new Date().toISOString();if(b.name)state.caregiver.name=String(b.name).slice(0,80);event(`${state.caregiver.name} ${b.action==='checkin'?'checked in':'checked out'}`);await save();return json(res,200,state.caregiver)}return json(res,400,{error:'Unknown caregiver action'})}
 if(url.pathname==='/api/reset'&&req.method==='POST'){state=structuredClone(initial);event('Demo data reset');await save();return json(res,200,state)}
 if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(await fs.readFile(path.join(ROOT,'index.html')))}
 if(req.method==='GET'&&url.pathname==='/sw.js'){res.writeHead(200,{'Content-Type':'application/javascript','Service-Worker-Allowed':'/'});return res.end(await fs.readFile(path.join(ROOT,'sw.js')))}
 res.writeHead(404);res.end('Not found');
 }catch(e){console.error(e);json(res,500,{error:'Server error',detail:e.message})}});
server.listen(PORT,()=>console.log(`Nursio SmartCare AI v3 running at http://localhost:${PORT}`));
