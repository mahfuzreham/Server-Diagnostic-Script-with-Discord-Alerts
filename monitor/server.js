const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { Client } = require('ssh2');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET;
const AGENT_SECRET = process.env.AGENT_SECRET;
const MASTER_KEY = Buffer.from(process.env.MASTER_KEY_HEX || '', 'hex');
if (!JWT_SECRET || !AGENT_SECRET || MASTER_KEY.length !== 32) throw new Error('JWT_SECRET, AGENT_SECRET and 32-byte MASTER_KEY_HEX are required');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline"] } } }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', maxAge: '1h' }));

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new Database(path.join(dataDir, 'monitor.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS servers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, hostname TEXT NOT NULL UNIQUE,
 agent_hash TEXT NOT NULL, ssh_user TEXT, ssh_port INTEGER DEFAULT 22, ssh_key_enc TEXT,
 last_seen INTEGER, status TEXT DEFAULT 'unknown', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS metrics (
 id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER NOT NULL, ts INTEGER NOT NULL,
 cpu REAL, ram REAL, disk REAL, load1 REAL, rx REAL, tx REAL, uptime INTEGER,
 services TEXT, FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL,
 server_id INTEGER, action TEXT NOT NULL, ip TEXT
);
`);

const limiter = new RateLimiterMemory({ points: 60, duration: 60 });
const loginLimiter = new RateLimiterMemory({ points: 8, duration: 60 });
const now = () => Math.floor(Date.now() / 1000);
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
function enc(text) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv); const out = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), out].map(x => x.toString('base64')).join('.'); }
function dec(blob) { const [iv, tag, data] = blob.split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(data), d.final()]).toString('utf8'); }
function audit(actor, serverId, action, ip) { db.prepare('INSERT INTO audit(ts,actor,server_id,action,ip) VALUES(?,?,?,?,?)').run(now(), actor, serverId || null, action, ip || ''); }
function auth(req, res, next) {
  const h = req.headers.authorization || ''; if (!h.startsWith('Bearer ')) return res.status(401).json({error:'unauthorized'});
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); } catch { res.status(401).json({error:'invalid token'}); }
}
async function throttle(req,res,next){ try { await limiter.consume(req.ip); next(); } catch { res.status(429).json({error:'rate limited'}); } }

app.post('/api/login', async (req,res)=>{
  try { await loginLimiter.consume(req.ip); } catch { return res.status(429).json({error:'too many attempts'}); }
  const {username,password} = req.body || {};
  const expectedUser = process.env.ADMIN_USER;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!username || !password || username !== expectedUser || !expectedHash) return res.status(401).json({error:'invalid credentials'});
  const ok = await require('bcryptjs').compare(password, expectedHash).catch(()=>false);
  if (!ok) return res.status(401).json({error:'invalid credentials'});
  const token = jwt.sign({sub: username, role:'admin'}, JWT_SECRET, {expiresIn:'30m', issuer:'resellnom-monitor'});
  audit(username,null,'login',req.ip); res.json({token});
});

app.get('/api/servers', auth, throttle, (req,res)=>{
  const rows = db.prepare('SELECT id,name,hostname,ssh_port,last_seen,status,created_at FROM servers ORDER BY name').all();
  res.json(rows.map(r=>({...r, online: !!r.last_seen && now()-r.last_seen < 90})));
});
app.get('/api/servers/:id/metrics', auth, throttle, (req,res)=>{
  const id = Number(req.params.id); const rows = db.prepare('SELECT ts,cpu,ram,disk,load1,rx,tx,uptime,services FROM metrics WHERE server_id=? ORDER BY ts DESC LIMIT 120').all(id);
  res.json(rows.reverse());
});
app.post('/api/servers', auth, throttle, (req,res)=>{
  const {name,hostname,sshUser='root',sshPort=22,sshPrivateKey=''} = req.body || {};
  if (!name || !hostname || !/^([a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])$/.test(hostname)) return res.status(400).json({error:'invalid server'});
  const agentToken = crypto.randomBytes(32).toString('hex');
  try { const info = db.prepare('INSERT INTO servers(name,hostname,agent_hash,ssh_user,ssh_port,ssh_key_enc,last_seen,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(name,hostname,sha256(agentToken),sshUser,Number(sshPort)||22,sshPrivateKey?enc(sshPrivateKey):null,null,'pending',now()); audit(req.user.sub,info.lastInsertRowid,'server_created',req.ip); res.status(201).json({id:info.lastInsertRowid,agentToken}); }
  catch { res.status(409).json({error:'server hostname already exists'}); }
});
app.delete('/api/servers/:id', auth, throttle, (req,res)=>{ const id=Number(req.params.id); db.prepare('DELETE FROM servers WHERE id=?').run(id); audit(req.user.sub,id,'server_deleted',req.ip); res.json({ok:true}); });

app.post('/agent/heartbeat', async (req,res)=>{
  const token = String(req.headers['x-resellnom-agent'] || ''); if (token.length < 32) return res.status(401).json({error:'unauthorized'});
  const server = db.prepare('SELECT * FROM servers WHERE agent_hash=?').get(sha256(token)); if (!server) return res.status(401).json({error:'unauthorized'});
  const m=req.body||{}; const cpu=Number(m.cpu),ram=Number(m.ram),disk=Number(m.disk); if (![cpu,ram,disk].every(Number.isFinite)) return res.status(400).json({error:'bad metrics'});
  db.prepare('INSERT INTO metrics(server_id,ts,cpu,ram,disk,load1,rx,tx,uptime,services) VALUES(?,?,?,?,?,?,?,?,?,?)').run(server.id,now(),cpu,ram,disk,Number(m.load1)||0,Number(m.rx)||0,Number(m.tx)||0,Number(m.uptime)||0,JSON.stringify(m.services||{}));
  db.prepare('UPDATE servers SET last_seen=?,status=? WHERE id=?').run(now(), cpu>=90||ram>=90||disk>=90?'warning':'online',server.id);
  db.prepare('DELETE FROM metrics WHERE server_id=? AND id NOT IN (SELECT id FROM metrics WHERE server_id=? ORDER BY ts DESC LIMIT 5000)').run(server.id,server.id);
  res.json({ok:true,serverTime:now()});
});

const wss = new WebSocketServer({server, path:'/ws/terminal'});
wss.on('connection',(ws,req)=>{
  const u=new URL(req.url,'http://localhost'); const token=u.searchParams.get('token'); const sid=Number(u.searchParams.get('server'));
  try { const user=jwt.verify(token,JWT_SECRET); if(user.role!=='admin') throw new Error(); const s=db.prepare('SELECT * FROM servers WHERE id=?').get(sid); if(!s || !s.ssh_key_enc) throw new Error('SSH key not configured');
    const host=s.hostname; const client=new Client(); let closed=false;
    client.on('ready',()=>{ client.shell({term:'xterm-256color'},(err,stream)=>{ if(err) return ws.close(1011,'ssh'); stream.on('data',d=>ws.send(d.toString('utf8'))); stream.stderr.on('data',d=>ws.send(d.toString('utf8'))); ws.on('message',m=>{ if(!closed && Buffer.byteLength(m)<=8192) stream.write(m.toString()); }); ws.on('close',()=>{closed=true;stream.end();client.end();}); audit(user.sub,sid,'terminal_connect',req.socket.remoteAddress); }); }).on('error',()=>ws.close(1011,'ssh error'));
    client.connect({host,port:s.ssh_port||22,username:s.ssh_user||'root',privateKey:dec(s.ssh_key_enc),readyTimeout:10000,hostVerifier:hash=>hash});
  } catch { ws.close(1008,'unauthorized'); }
});

setInterval(()=>{ const cutoff=now()-120; db.prepare("UPDATE servers SET status='offline' WHERE last_seen IS NOT NULL AND last_seen < ?").run(cutoff); },30000);
server.listen(PORT,'127.0.0.1',()=>console.log(`ResellNom Monitor listening on 127.0.0.1:${PORT}`));
