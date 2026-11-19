"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const MAX_PLAYERS = 8;
const TICK_MS = 50;
const FINISH_DISTANCE = 2200;
const ROOM_IDLE_MS = 10 * 60 * 1000;
const INPUTS_PER_SECOND = 30;
const rooms = new Map();
const palette = [0x36d9ff,0xff4f9a,0xffd34e,0x9b7bff,0x63e68b,0xff814f,0xffffff,0x54a6ff];

const mime = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".png":"image/png",".svg":"image/svg+xml",".ico":"image/x-icon"};
function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function safeName(value) {
  return String(value || "Racer").replace(/[<>\u0000-\u001f\u007f]/g, "").trim().slice(0,16) || "Racer";
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:5},()=>chars[crypto.randomInt(chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id:p.id,name:p.name,color:p.color,x:p.x,z:p.z,heading:p.heading,
    speed:p.speed,finished:p.finished,finishTime:p.finishTime
  }));
}
function broadcast(room, payload) {
  const data = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
}
function roomInfo(room) {
  return {type:"room",code:room.code,hostId:room.hostId,count:room.players.size,maxPlayers:MAX_PLAYERS,started:room.started};
}
function cleanupRoom(room) {
  if (!room.players.size) rooms.delete(room.code);
}
function removePlayer(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || !ws.playerId) return;
  const player = room.players.get(ws.playerId);
  if (!player) return;
  room.players.delete(ws.playerId);
  if (room.hostId === player.id) room.hostId = room.players.keys().next().value || null;
  if (!room.players.size) { rooms.delete(room.code); return; }
  broadcast(room,{type:"players",players:publicPlayers(room)});
  broadcast(room,roomInfo(room));
  if (room.started && [...room.players.values()].every(p=>p.finished)) finishRoom(room);
}
function createRoom() {
  const room = {code:makeCode(),players:new Map(),hostId:null,started:false,startAt:0,lastActivity:Date.now(),finishedAt:0};
  rooms.set(room.code,room);
  return room;
}
function joinRoom(ws,msg) {
  if (ws.playerId) return send(ws,{type:"error",message:"You have already joined a room."});
  const requested = String(msg.code || "").trim().toUpperCase();
  let room = requested ? rooms.get(requested) : [...rooms.values()].find(r=>!r.started && r.players.size<MAX_PLAYERS);
  if (requested && !room) return send(ws,{type:"error",message:"Room not found. Check the code and try again."});
  if (room && room.started) return send(ws,{type:"error",message:"That race has already started."});
  if (room && room.players.size>=MAX_PLAYERS) return send(ws,{type:"error",message:"That room is full."});
  if (!room) room=createRoom();
  const id=crypto.randomBytes(8).toString("hex");
  const slot=room.players.size;
  const player={id,ws,name:safeName(msg.name),color:palette[slot],x:(slot-3.5)*5,z:0,heading:0,speed:0,throttle:0,steer:0,finished:false,finishTime:null,inputWindow:Date.now(),inputCount:0};
  room.players.set(id,player);
  if (!room.hostId) room.hostId=id;
  room.lastActivity=Date.now();
  ws.playerId=id; ws.roomCode=room.code;
  send(ws,{type:"joined",id,code:room.code,hostId:room.hostId,players:publicPlayers(room),maxPlayers:MAX_PLAYERS});
  broadcast(room,{type:"players",players:publicPlayers(room)});
  broadcast(room,roomInfo(room));
}
function finishRoom(room) {
  room.started=false;
  room.finishedAt=Date.now();
  const results=publicPlayers(room).sort((a,b)=>(a.finishTime??Infinity)-(b.finishTime??Infinity));
  broadcast(room,{type:"results",players:results});
  broadcast(room,roomInfo(room));
}
function startRace(room, ws) {
  if (ws.playerId!==room.hostId) return send(ws,{type:"error",message:"Only the room host can start the race."});
  if (room.started) return send(ws,{type:"error",message:"The race is already running."});
  if (!room.players.size) return;
  for (const p of room.players.values()) {
    p.x=( [...room.players.keys()].indexOf(p.id)-((room.players.size-1)/2))*5;
    p.z=0;p.heading=0;p.speed=0;p.throttle=0;p.steer=0;p.finished=false;p.finishTime=null;
  }
  room.started=true;room.startAt=Date.now()+3500;room.lastActivity=Date.now();
  broadcast(room,{type:"countdown",startAt:room.startAt});
  broadcast(room,roomInfo(room));
}
function handleMessage(ws, raw) {
  let msg;
  try { msg=JSON.parse(raw.toString()); } catch { return send(ws,{type:"error",message:"Invalid message format."}); }
  if (!msg || typeof msg.type!=="string") return;
  if (msg.type==="join") return joinRoom(ws,msg);
  const room=rooms.get(ws.roomCode);
  const p=room && room.players.get(ws.playerId);
  if (!room || !p) return;
  room.lastActivity=Date.now();
  if (msg.type==="start") return startRace(room,ws);
  if (msg.type==="input") {
    const now=Date.now();
    if (now-p.inputWindow>=1000) {p.inputWindow=now;p.inputCount=0;}
    if (++p.inputCount>INPUTS_PER_SECOND) return;
    if (!room.started || now<room.startAt || p.finished) return;
    const throttle=Number(msg.throttle),steer=Number(msg.steer);
    p.throttle=Number.isFinite(throttle)?Math.max(-1,Math.min(1,throttle)):0;
    p.steer=Number.isFinite(steer)?Math.max(-1,Math.min(1,steer)):0;
  }
}
const server=http.createServer((req,res)=>{
  if (req.method!=="GET" && req.method!=="HEAD") {res.writeHead(405,{"Allow":"GET, HEAD"});return res.end("Method not allowed");}
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);} catch {res.writeHead(400);return res.end("Bad request");}
  if (pathname==="/health") {res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});return res.end(JSON.stringify({ok:true,rooms:rooms.size,uptime:Math.floor(process.uptime())}));}
  const relative=pathname==="/"?"index.html":pathname.replace(/^\/+/, "");
  const target=path.resolve(PUBLIC_DIR,relative);
  if (target!==PUBLIC_DIR && !target.startsWith(PUBLIC_DIR+path.sep)) {res.writeHead(403);return res.end("Forbidden");}
  fs.readFile(target,(err,data)=>{
    if (err) {res.writeHead(err.code==="ENOENT"?404:500,{"Content-Type":"text/plain; charset=utf-8"});return res.end(err.code==="ENOENT"?"Not found":"Server error");}
    res.writeHead(200,{"Content-Type":mime[path.extname(target)]||"application/octet-stream","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cache-Control":"no-cache"});
    if (req.method==="HEAD") return res.end();
    res.end(data);
  });
});
const wss=new WebSocketServer({server,maxPayload:2048,perMessageDeflate:false});
wss.on("connection",ws=>{
  ws.isAlive=true;
  ws.on("pong",()=>{ws.isAlive=true;});
  ws.on("message",raw=>handleMessage(ws,raw));
  ws.on("close",()=>removePlayer(ws));
  ws.on("error",()=>removePlayer(ws));
});
const heartbeat=setInterval(()=>{
  for (const ws of wss.clients) {
    if (!ws.isAlive) {ws.terminate();continue;}
    ws.isAlive=false;ws.ping();
  }
},30000);
heartbeat.unref();
const simulation=setInterval(()=>{
  const now=Date.now();
  for (const room of rooms.values()) {
    if (!room.started) {
      if (now-room.lastActivity>ROOM_IDLE_MS) {for(const p of room.players.values())p.ws.close(1000,"Room expired");rooms.delete(room.code);}
      continue;
    }
    if (now<room.startAt) continue;
    for (const p of room.players.values()) {
      if (p.finished) continue;
      const dt=TICK_MS/1000;
      p.speed=Math.max(0,Math.min(78,(p.speed+p.throttle*36*dt)*0.988));
      p.heading+=p.steer*(0.7+p.speed/100)*dt;
      p.x+=Math.sin(p.heading)*p.speed*dt*1.25;
      p.z+=Math.cos(p.heading)*p.speed*dt;
      p.x=Math.max(-35,Math.min(35,p.x));
      if(p.z>=FINISH_DISTANCE){p.z=FINISH_DISTANCE;p.finished=true;p.finishTime=now-room.startAt;p.throttle=0;p.steer=0;}
    }
    broadcast(room,{type:"state",players:publicPlayers(room),trackLength:FINISH_DISTANCE});
    if([...room.players.values()].every(p=>p.finished))finishRoom(room);
  }
},TICK_MS);
simulation.unref();
server.listen(PORT,HOST,()=>console.log("NEON RUSH listening on "+PORT));
function shutdown(){clearInterval(heartbeat);clearInterval(simulation);for(const ws of wss.clients)ws.close();server.close(()=>process.exit(0));}
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
