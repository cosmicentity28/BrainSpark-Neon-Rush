"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const path=require("node:path");
const WebSocket=require("ws");
let child,baseUrl,clients=[];
function waitMessage(ws,predicate,timeout=4000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error("Timed out waiting for WebSocket message"))},timeout);
    const onMessage=data=>{let msg;try{msg=JSON.parse(data.toString())}catch{return}if(predicate(msg)){cleanup();resolve(msg)}};
    const onClose=()=>{cleanup();reject(new Error("WebSocket closed before expected message"))};
    function cleanup(){clearTimeout(timer);ws.off("message",onMessage);ws.off("close",onClose)}
    ws.on("message",onMessage);ws.on("close",onClose);
  });
}
async function connectAndJoin(name,code){
  const ws=new WebSocket(baseUrl.replace("http:","ws:"));
  clients.push(ws);
  await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject)});
  const joined=waitMessage(ws,m=>m.type==="joined");
  ws.send(JSON.stringify({type:"join",name,code}));
  return {ws,joined:await joined};
}
before(async()=>{
  const port=41000+Math.floor(Math.random()*15000);
  baseUrl="http://127.0.0.1:"+port;
  child=spawn(process.execPath,[path.join(__dirname,"../server/index.js")],{env:{...process.env,PORT:String(port)},stdio:"ignore"});
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw new Error("Server exited during startup");
    try{const response=await fetch(baseUrl+"/health");if(response.ok){ready=true;break}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(ready,true,"server should start and expose health endpoint");
});
after(async()=>{
  for(const ws of clients){try{ws.terminate()}catch{}}
  if(child&&!child.killed)child.kill("SIGTERM");
});
test("health, static page, room capacity and host-only race start",async()=>{
  const health=await fetch(baseUrl+"/health");
  assert.equal(health.status,200);
  assert.equal((await health.json()).ok,true);
  const page=await fetch(baseUrl+"/");
  assert.equal(page.status,200);
  assert.match(await page.text(),/NEON RUSH/);

  const first=await connectAndJoin("Host");
  assert.match(first.joined.code,/^[A-Z2-9]{5}$/);
  assert.equal(first.joined.hostId,first.joined.id);
  const racers=[first];
  for(let i=1;i<8;i++)racers.push(await connectAndJoin("Racer"+i,first.joined.code));
  assert.equal(racers.length,8);

  const ninth=new WebSocket(baseUrl.replace("http:","ws:"));
  clients.push(ninth);
  await new Promise((resolve,reject)=>{ninth.once("open",resolve);ninth.once("error",reject)});
  const fullRoom=waitMessage(ninth,m=>m.type==="error");
  ninth.send(JSON.stringify({type:"join",name:"Extra",code:first.joined.code}));
  assert.match((await fullRoom).message,/full/i);

  const nonHostError=waitMessage(racers[1].ws,m=>m.type==="error");
  racers[1].ws.send(JSON.stringify({type:"start"}));
  assert.match((await nonHostError).message,/host/i);

  const countdown=waitMessage(first.ws,m=>m.type==="countdown");
  first.ws.send(JSON.stringify({type:"start"}));
  assert.ok((await countdown).startAt>Date.now());
});
