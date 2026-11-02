"use strict";
/*
 * Máy chủ "chùa online" — cho người thật nhìn thấy nhau.
 * Chạy:  npm install && npm start      (mặc định http://localhost:8080)
 *
 * Biến môi trường (đều tùy chọn):
 *   PORT=8080            cổng lắng nghe
 *   SEATS=500            số chỗ ngồi (tối đa 20000)
 *   ALLOWED_ORIGINS=https://web-cua-ban.com,https://www.web-cua-ban.com
 *                        chỉ cho các trang này kết nối (nên đặt khi đưa lên mạng)
 *   MAX_PER_IP=10        số kết nối tối đa từ một địa chỉ IP
 *   TRUST_PROXY=1        đứng sau nginx/Cloudflare: lấy IP từ X-Forwarded-For
 *
 * Giao thức (JSON):
 *   server → client  {t:"state", total, occupied:[...], seat}   ảnh chụp đầy đủ khi mới vào (seat = -1: đang chờ)
 *                    {t:"seat", seat}                            được xếp chỗ từ hàng chờ
 *                    {t:"delta", j:[...], l:[...], b:[...]}      thay đổi: vào / rời / lạy — gom mỗi 300ms
 *   client → server  {t:"bow"}
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 8080;
const TOTAL = Math.min(Math.max(Math.floor(Number(process.env.SEATS)) || 500, 1), 20000);
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 10;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const BOW_COOLDOWN_MS = 350;
const FLUSH_MS = 300;
const PAGE = path.join(__dirname, "..", "index.html");

const seats = new Array(TOTAL).fill(null); // seats[i] = ws đang ngồi
const waiting = [];                        // hàng chờ khi hết chỗ
const perIp = new Map();
let occupied = 0;
let delta = { j: new Set(), l: new Set(), b: new Set() };

/* ---------- HTTP: phục vụ trang để thử nhanh ---------- */
const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/" || url === "/index.html") {
    fs.readFile(PAGE, "utf8", (err, html) => {
      if (err) { res.writeHead(500); return res.end("Không đọc được index.html"); }
      // báo cho trang biết: dùng máy chủ cùng địa chỉ thay vì chế độ demo
      const out = html.replace("</head>", '<script>window.CHUA_ONLINE_CONFIG={SERVER_URL:"auto"};</script>\n</head>');
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(out);
    });
  } else if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, seats: TOTAL, occupied, waiting: waiting.length }));
  } else {
    res.writeHead(404); res.end("Not found");
  }
});

const wss = new WebSocketServer({ server, maxPayload: 256 });

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || "?";
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function lowestFree() { for (let i = 0; i < TOTAL; i++) if (!seats[i]) return i; return -1; }

function seatUp(ws, i) {
  seats[i] = ws; ws.seat = i; occupied++;
  delta.l.delete(i); delta.j.add(i);
}
function seatDown(ws) {
  const i = ws.seat;
  if (i < 0) return;
  seats[i] = null; ws.seat = -1; occupied--;
  delta.j.delete(i); delta.b.delete(i); delta.l.add(i);
}
function promoteFromQueue() {
  while (waiting.length) {
    const i = lowestFree();
    if (i < 0) return;
    const w = waiting.shift();
    if (w.readyState !== 1) continue;
    seatUp(w, i);
    send(w, { t: "seat", seat: i });
  }
}

wss.on("connection", (ws, req) => {
  if (ALLOWED.length && !ALLOWED.includes(req.headers.origin)) return ws.close(1008, "origin");
  const ip = clientIp(req);
  const n = (perIp.get(ip) || 0) + 1;
  if (n > MAX_PER_IP) return ws.close(1008, "too many connections");
  perIp.set(ip, n);

  ws.seat = -1; ws.alive = true; ws.lastBow = 0;
  const free = lowestFree();
  if (free >= 0) seatUp(ws, free); else waiting.push(ws);
  const occ = [];
  for (let i = 0; i < TOTAL; i++) if (seats[i]) occ.push(i);
  send(ws, { t: "state", total: TOTAL, occupied: occ, seat: ws.seat });

  ws.on("pong", () => { ws.alive = true; });
  ws.on("message", (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || m.t !== "bow" || ws.seat < 0) return;
    const now = Date.now();
    if (now - ws.lastBow < BOW_COOLDOWN_MS) return;
    ws.lastBow = now;
    delta.b.add(ws.seat);
  });
  ws.on("close", () => {
    const c = (perIp.get(ip) || 1) - 1;
    if (c <= 0) perIp.delete(ip); else perIp.set(ip, c);
    const w = waiting.indexOf(ws);
    if (w >= 0) waiting.splice(w, 1);
    seatDown(ws);
    promoteFromQueue();
  });
  ws.on("error", () => {});
});

/* ---------- Gom thay đổi, gửi mỗi 300ms ---------- */
setInterval(() => {
  if (!delta.j.size && !delta.l.size && !delta.b.size) return;
  const msg = JSON.stringify({ t: "delta", j: [...delta.j], l: [...delta.l], b: [...delta.b] });
  delta = { j: new Set(), l: new Set(), b: new Set() };
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}, FLUSH_MS);

/* ---------- Dọn kết nối chết ---------- */
setInterval(() => {
  for (const c of wss.clients) {
    if (!c.alive) { c.terminate(); continue; }
    c.alive = false; c.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`Chùa online: http://localhost:${PORT}  (${TOTAL} chỗ)`));
