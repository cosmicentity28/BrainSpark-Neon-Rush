const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, "..", "public");
const MAX_PLAYERS = 8;
const TICK = 50;
const FINISH_Z = 2200;
const rooms = new Map();

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("Bad request"); }
  const target = path.resolve(PUBLIC, "." + (pathname === "/" ? "/index.html" : pathname));
  if (!target.startsWith(PUBLIC + path.sep) && target !== path.join(PUBLIC, "index.html")) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json" };
    res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":"no-cache" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });
const send = (ws, obj) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
const cleanName = value => String(value || "Racer").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 16) || "Racer";
const snapshot = room => [...room.players.values()].map(p => ({
  id:p.id, name:p.name, color:p.color, x:p.x, z:p.z, heading:p.heading,
  speed:p.speed, finished:p.finished, finishTime:p.finishTime
}));
function broadcast(room, obj) {
  const data = JSON.stringify(obj);
  for (const p of room.players.values()) if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
}
function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:5}, () => alphabet[crypto.randomInt(alphabet.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function remove(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || !ws.playerId) return;
  room.players.delete(ws.playerId);
  if (!room.players.size) rooms.delete(room.code);
  else broadcast(room, {type:"players", players:snapshot(room)});
}
function join(ws, msg) {
  if (ws.roomCode) return send(ws, {type:"error", message:"You are already in a room. Refresh to rejoin."});
  const requested = String(msg.code || "").trim().toUpperCase();
  let room = requested ? rooms.get(requested) : [...rooms.values()].find(r => !r.started && r.players.size < MAX_PLAYERS);
  if (requested && !room) return send(ws, {type:"error", message:"That room code was not found."});
  if (!room) { room = {code:makeCode(), players:new Map(), started:false, startAt:0}; rooms.set(room.code, room); }
  if (room.started) return send(ws, {type:"error", message:"That race has already started."});
  if (room.players.size >= MAX_PLAYERS) return send(ws, {type:"error", message:"That room is full."});
  const id = crypto.randomBytes(5).toString("hex");
  const palette = [0x36d9ff,0xff4f9a,0xffd34e,0x9b7bff,0x63e68b,0xff814f,0xffffff,0x54a6ff];
  const slot = room.players.size;
  const p = {id, ws, name:cleanName(msg.name), color:palette[slot], x:(slot-3.5)*5, z:0, heading:0, speed:0, throttle:0, steer:0, finished:false, finishTime:null};
  room.players.set(id,p); ws.playerId=id; ws.roomCode=room.code;
  send(ws,{type:"joined",id,code:room.code,players:snapshot(room),maxPlayers:MAX_PLAYERS});
  broadcast(room,{type:"players",players:snapshot(room)});
}
wss.on("connection", ws => {
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws,{type:"error",message:"Invalid message."}); }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "join") return join(ws,msg);
    const room = rooms.get(ws.roomCode);
    const p = room && room.players.get(ws.playerId);
    if (!p) return;
    if (msg.type === "input" && !p.finished) {
      p.throttle = Math.max(-1,Math.min(1,Number(msg.throttle)||0));
      p.steer = Math.max(-1,Math.min(1,Number(msg.steer)||0));
    }
    if (msg.type === "start" && !room.started) {
      room.started = true; room.startAt = Date.now()+3000;
      for (const racer of room.players.values()) { racer.z=0; racer.speed=0; racer.heading=0; racer.finished=false; racer.finishTime=null; }
      broadcast(room,{type:"countdown",startAt:room.startAt});
    }
  });
  ws.on("close",()=>remove(ws));
  ws.on("error",()=>remove(ws));
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.started && now >= room.startAt) {
      for (const p of room.players.values()) {
        if (p.finished) continue;
        const dt=TICK/1000;
        p.speed=Math.max(0,Math.min(75,(p.speed+p.throttle*34*dt)*0.985));
        p.heading += p.steer*(0.75+p.speed/90)*dt;
        p.x += Math.sin(p.heading)*p.speed*dt*1.3;
        p.z += Math.cos(p.heading)*p.speed*dt;
        p.x=Math.max(-35,Math.min(35,p.x));
        if (p.z>=FINISH_Z) { p.z=FINISH_Z; p.finished=true; p.finishTime=now-room.startAt; p.throttle=0; }
      }
      broadcast(room,{type:"state",players:snapshot(room),trackLength:FINISH_Z});
      if ([...room.players.values()].every(p=>p.finished)) {
        broadcast(room,{type:"results",players:snapshot(room)});
        room.started=false;
      }
    } else {
      broadcast(room,{type:"players",players:snapshot(room)});
    }
  }
},TICK);

server.listen(PORT,"0.0.0.0",()=>console.log("NEON RUSH server listening on "+PORT));
