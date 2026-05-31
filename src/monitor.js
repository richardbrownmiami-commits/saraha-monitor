let startTime = Date.now();
const ADMIN_PW = "itsgood";

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saraha Monitor</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:24px;margin-bottom:5px;color:#38bdf8}.sub{color:#94a3b8;font-size:14px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px}
.card{background:#1e293b;padding:16px;border-radius:8px;border:1px solid #334155}.card .val{font-size:28px;font-weight:700;color:#38bdf8}.card .lbl{font-size:12px;color:#94a3b8;margin-top:4px}
table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:20px}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #334155;font-size:13px}
th{background:#0f172a;color:#38bdf8;font-weight:600;font-size:12px;text-transform:uppercase}
.badge{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.badge-done{background:#065f46;color:#6ee7b7}.badge-pending{background:#78350f;color:#fbbf24}.badge-error{background:#7f1d1d;color:#fca5a5}
.btn{padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600}
.btn-approve{background:#059669;color:#fff}.btn-reject{background:#dc2626;color:#fff}.btn-approve:hover{background:#047857}.btn-reject:hover{background:#b91c1c}
.login-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:100}
.login-box{background:#1e293b;padding:32px;border-radius:12px;border:1px solid #334155;width:320px}
.login-box h2{color:#38bdf8;margin-bottom:16px}.login-box input{width:100%;padding:10px;margin-bottom:12px;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:14px}
.login-box button{width:100%;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600}
.login-box button:hover{background:#1d4ed8}.error{color:#fca5a5;font-size:13px;margin-bottom:10px;display:none}
pre{font-size:11px;color:#94a3b8;max-height:200px;overflow:auto;white-space:pre-wrap}
</style></head><body>
<div id="login" class="login-overlay"><div class="login-box"><h2>Saraha Monitor</h2><div class="error" id="err">Wrong password</div>
<input type="password" id="pw" placeholder="Admin password" onkeydown="if(event.key==='Enter')login()"><button onclick="login()">Login</button></div></div>
<h1>Saraha Monitor</h1><div class="sub" id="sub">Loading...</div>
<div class="grid"><div class="card"><div class="val" id="totalActions">-</div><div class="lbl">Total Actions</div></div>
<div class="card"><div class="val" id="pendingEvolves">-</div><div class="lbl">Pending Evolves</div></div>
<div class="card"><div class="val" id="dbStatus">-</div><div class="lbl">Database</div></div>
<div class="card"><div class="val" id="uptime">-</div><div class="lbl">Uptime (s)</div></div></div>
<h2 style="margin-bottom:10px;font-size:16px;color:#38bdf8">Activity Log</h2>
<div id="activity"><p style="color:#94a3b8;font-size:13px">Loading...</p></div>
<h2 style="margin:20px 0 10px;font-size:16px;color:#38bdf8">Pending Evolve Requests</h2>
<div id="evolves"><p style="color:#94a3b8;font-size:13px">Loading...</p></div>
<script>
const api=f=>{const h={};if(sessionStorage.getItem("sa"))h["X-Admin"]=sessionStorage.getItem("sa");return fetch(f,{headers:h}).then(r=>{if(r.status===401){showLogin();throw"unauth"}return r.json()})};
function login(){const pw=document.getElementById("pw").value;fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw})}).then(r=>{if(r.ok){sessionStorage.setItem("sa",pw);document.getElementById("login").style.display="none";load()}else{document.getElementById("err").style.display="block"}})}
function showLogin(){document.getElementById("login").style.display="flex"}
function load(){api("/api/status").then(d=>{document.getElementById("sub").textContent="Last updated: "+new Date().toLocaleTimeString();document.getElementById("totalActions").textContent=d.totalActions||0;document.getElementById("pendingEvolves").textContent=d.pendingEvolves||0;document.getElementById("dbStatus").textContent=d.db?"OK":"ERR";document.getElementById("uptime").textContent=d.uptime||0});
api("/api/activity").then(d=>{let h="<table><tr><th>ID</th><th>Type</th><th>Status</th><th>Input</th><th>Result</th><th>Time</th></tr>";(d.entries||[]).map(e=>{h+="<tr><td>"+e.id+"</td><td>"+e.type+"</td><td><span class='badge badge-"+e.status+"'>"+e.status+"</span></td><td>"+(e.input||"").slice(0,40)+"</td><td>"+(e.result||"").slice(0,40)+"</td><td>"+(e.created_at||"")+"</td></tr>"});h+="</table>";document.getElementById("activity").innerHTML=h||"<p style='color:#94a3b8'>No activity yet</p>"});
api("/api/evolve-pending").then(d=>{let h="<table><tr><th>ID</th><th>Goal</th><th>Risk</th><th>Requested</th><th>Action</th></tr>";(d.entries||[]).map(e=>{h+="<tr><td>"+e.id+"</td><td>"+(e.input||"").slice(0,60)+"</td><td>"+(e.risk||"-")+"</td><td>"+(e.created_at||"")+"</td><td><button class='btn btn-approve' onclick='approve("+e.id+")'>Approve</button> <button class='btn btn-reject' onclick='reject("+e.id+")'>Reject</button></td></tr>"});h+="</table>";document.getElementById("evolves").innerHTML=h||"<p style='color:#94a3b8'>No pending evolve requests</p>"})}
function approve(id){fetch("/api/evolve/"+id+"/approve",{method:"POST",headers:{"X-Admin":sessionStorage.getItem("sa")}}).then(r=>r.json()).then(d=>{load()})}
function reject(id){fetch("/api/evolve/"+id+"/reject",{method:"POST",headers:{"X-Admin":sessionStorage.getItem("sa")}}).then(r=>r.json()).then(d=>{load()})}
if(sessionStorage.getItem("sa")){document.getElementById("login").style.display="none";load()}else showLogin();
setInterval(load,10000);
</script></body></html>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const auth = (req.headers.get("X-Admin") === ADMIN_PW);

    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

    if (url.pathname === "/api/login" && req.method === "POST") {
      const { password } = await req.json();
      if (password === ADMIN_PW) return new Response("ok", { status: 200 });
      return new Response("unauthorized", { status: 401 });
    }

    if (url.pathname.startsWith("/api/") && !auth) {
      return json({ error: "unauthorized" }, 401);
    }

    if (url.pathname === "/api/status") {
      let dbOk = false;
      try { await env.DB.prepare("SELECT 1").run(); dbOk = true; } catch {}
      const { results } = await env.DB.prepare("SELECT count(*) as c FROM actions").all();
      const { results: p } = await env.DB.prepare("SELECT count(*) as c FROM actions WHERE type='evolve' AND status='pending'").all();
      return json({ db: dbOk, totalActions: (results[0]||{}).c || 0, pendingEvolves: (p[0]||{}).c || 0, uptime: Math.floor((Date.now()-startTime)/1000) });
    }

    if (url.pathname === "/api/activity") {
      const { results } = await env.DB.prepare("SELECT * FROM actions ORDER BY created_at DESC LIMIT 50").all();
      return json({ entries: results });
    }

    if (url.pathname === "/api/evolve-pending") {
      const { results } = await env.DB.prepare("SELECT * FROM actions WHERE type='evolve' AND status='pending' ORDER BY created_at DESC").all();
      return json({ entries: results });
    }

    const evMatch = url.pathname.match(/^\/api\/evolve\/(\d+)\/(approve|reject)$/);
    if (evMatch && req.method === "POST") {
      const id = parseInt(evMatch[1]);
      const action = evMatch[2];
      const status = action === "approve" ? "approved" : "rejected";
      await env.DB.prepare("UPDATE actions SET status=?1, completed_at=datetime('now') WHERE id=?2").bind(status, id).run();
      return json({ ok: true, status });
    }

    return new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } });
  }
};
