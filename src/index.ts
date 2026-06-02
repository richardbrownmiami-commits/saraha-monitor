const MONITOR_TABLES = [
  `CREATE TABLE IF NOT EXISTS monitor_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, content TEXT NOT NULL, category TEXT DEFAULT 'general', source TEXT DEFAULT 'seed', created_at TEXT DEFAULT (datetime('now')))`,
];

const MONITOR_SEED = [
  { k: "dashboard_overview", c: "Overview tab shows summary stats: total proposals, anti-patterns, kill switch status, recent cycles.", cat: "display" },
  { k: "dashboard_proposals", c: "Proposals tab lists all proposals with risk badges, expandable details, and approve/deny buttons for pending items.", cat: "display" },
  { k: "dashboard_activity", c: "Activity tab shows brain logs filtered to auto/propose/research/duplicate/error steps.", cat: "display" },
  { k: "dashboard_kill", c: "Kill Switch tab toggles brain idle cycle on/off. When on, brain skips all autonomous cycles.", cat: "display" },
  { k: "api_summary", c: "GET /api/summary returns proposals grouped by status, kill switch state, last activity, and anti-pattern count.", cat: "api" },
  { k: "api_kill", c: "GET /api/kill-switch returns current state. POST /api/kill-switch with {active:bool} to toggle.", cat: "api" },
  { k: "api_proposals", c: "GET /api/proposals lists proposals. GET /api/proposals/:id returns detail + receipts. Supports ?status= filter.", cat: "api" },
  { k: "api_proposals_approve", c: "POST /api/proposals/approve/:id proxies to brain. POST /api/proposals/deny/:id proxies to brain.", cat: "api" },
  { k: "api_activity", c: "GET /api/activity returns brain_logs filtered to idle cycle steps.", cat: "api" },
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
});

const html = (body, status = 200) => new Response(body, {
  status, headers: { "Content-Type": "text/html;charset=utf-8" }
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try { for (const s of MONITOR_TABLES) await env.DB.exec(s); } catch {}
    try {
      for (const item of MONITOR_SEED) {
        await env.DB.prepare("INSERT OR IGNORE INTO monitor_knowledge (key, content, category) VALUES (?1, ?2, ?3)").bind(item.k, item.c, item.cat).run();
      }
    } catch {}

    if (url.pathname === "/status") {
      let dbOk = false, brainOk = false;
      try { await env.DB.prepare("SELECT 1").run(); dbOk = true; } catch {}
      try { const r = await env.BRAIN.fetch("https://brain/status"); brainOk = r.ok; } catch {}
      return json({ alive: true, db: dbOk, brain: brainOk, version: "1.0.0" });
    }

    if (url.pathname === "/api/summary") {
      const props = await env.DB.prepare("SELECT COUNT(*) as total, status FROM proposals GROUP BY status").all();
      const kill = await env.DB.prepare("SELECT value FROM identity WHERE key='kill_switch'").all();
      const lastCycle = await env.DB.prepare("SELECT content, created_at FROM brain_logs WHERE step='auto' OR step='propose' ORDER BY created_at DESC LIMIT 5").all();
      const anti = await env.DB.prepare("SELECT COUNT(*) as total FROM anti_patterns").all();
      return json({
        proposals: props.results,
        killSwitch: kill.results[0]?.value === "true",
        lastActivity: lastCycle.results,
        antiPatterns: anti.results[0]?.total || 0
      });
    }

    if (url.pathname === "/api/kill-switch" && req.method === "POST") {
      let body; try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      if (body.active === true) {
        await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('kill_switch','true',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=datetime('now')").run();
      } else {
        await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('kill_switch','false',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=datetime('now')").run();
      }
      return json({ ok: true, active: body.active === true });
    }
    if (url.pathname === "/api/kill-switch") {
      const r = await env.DB.prepare("SELECT value FROM identity WHERE key='kill_switch'").all();
      return json({ active: r.results[0]?.value === "true" });
    }

    if (url.pathname === "/api/proposals") {
      const status = url.searchParams.get("status");
      let q = "SELECT * FROM proposals ORDER BY created_at DESC LIMIT 50";
      if (status) q = "SELECT * FROM proposals WHERE status=?1 ORDER BY created_at DESC LIMIT 50";
      const r = status ? await env.DB.prepare(q).bind(status).all() : await env.DB.prepare(q).all();
      return json({ entries: r.results });
    }

    if (url.pathname.startsWith("/api/proposals/approve/")) {
      const id = url.pathname.split("/")[4];
      try { const r = await env.BRAIN.fetch("https://brain/api/proposals/approve/" + id, { method: "POST" }); const data = await r.json(); return json(data, r.status); } catch (e) { return json({ error: e.message }, 502); }
    }
    if (url.pathname.startsWith("/api/proposals/deny/")) {
      const id = url.pathname.split("/")[4];
      try { const r = await env.BRAIN.fetch("https://brain/api/proposals/deny/" + id, { method: "POST" }); const data = await r.json(); return json(data, r.status); } catch (e) { return json({ error: e.message }, 502); }
    }

    if (url.pathname.startsWith("/api/proposals/")) {
      const id = parseInt(url.pathname.split("/")[3]);
      if (!id) return json({ error: "invalid id" }, 400);
      const p = await env.DB.prepare("SELECT * FROM proposals WHERE id=?1").bind(id).all();
      if (!p.results.length) return json({ error: "not found" }, 404);
      const rec = await env.DB.prepare("SELECT * FROM authority_receipts WHERE proposal_id=?1 ORDER BY created_at DESC").bind(id).all();
      return json({ proposal: p.results[0], receipts: rec.results });
    }

    if (url.pathname === "/api/activity") {
      const r = await env.DB.prepare("SELECT * FROM brain_logs WHERE step IN ('auto','propose','research','duplicate','error') ORDER BY created_at DESC LIMIT 50").all();
      return json({ entries: r.results });
    }

    if (url.pathname === "/api/knowledge") {
      const q = url.searchParams.get("q");
      const cat = url.searchParams.get("category");
      let results;
      if (q) {
        const r = await env.DB.prepare("SELECT key, content, category FROM monitor_knowledge WHERE content LIKE ?1 OR key LIKE ?1 LIMIT 10").bind("%" + q + "%").all();
        results = r.results;
      } else if (cat) {
        const r = await env.DB.prepare("SELECT key, content, category FROM monitor_knowledge WHERE category=?1 ORDER BY key LIMIT 20").bind(cat).all();
        results = r.results;
      } else {
        const r = await env.DB.prepare("SELECT key, content, category FROM monitor_knowledge ORDER BY category, key LIMIT 50").all();
        results = r.results;
      }
      return json({ entries: results });
    }

    return html(DASHBOARD_HTML);
  }
};

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Saraha Monitor</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#0B1120;color:#E2E8F0;font-family:system-ui,sans-serif;padding:16px;max-width:1200px;margin:0 auto}
.status-bar{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;font-size:12px}
.s-pill{padding:4px 12px;border-radius:20px;background:#1E293B;border:1px solid #334155;display:flex;align-items:center;gap:6px}
.s-dot{width:8px;height:8px;border-radius:50%;display:inline-block}.s-dot.on{background:#10B981;box-shadow:0 0 6px #10B98180}.s-dot.off{background:#EF4444;box-shadow:0 0 6px #EF444480}
.s-dot.warn{background:#F59E0B;box-shadow:0 0 6px #F59E0B80}
h1{color:#38BDF8;font-size:20px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.nav{display:flex;gap:2px;margin-bottom:16px;flex-wrap:wrap}
.nav button{padding:6px 14px;border:1px solid #1E293B;background:#0F172A;color:#64748B;cursor:pointer;font-size:12px;border-radius:6px 6px 0 0;transition:all .15s}
.nav button.active{background:#1E293B;color:#38BDF8;border-color:#334155;border-bottom-color:#1E293B;font-weight:600}
.nav button:hover:not(.active){background:#1E293B;color:#94A3B8}
.card{background:#1E293B;border-radius:8px;padding:12px;margin-bottom:12px;border:1px solid #334155}
.row{display:flex;gap:8px;flex-wrap:wrap}
.stat{flex:1;min-width:100px;text-align:center;padding:12px 8px}
.stat .v{font-size:22px;font-weight:700;color:#38BDF8}
.stat .l{font-size:10px;color:#64748B;margin-top:2px;text-transform:uppercase}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;color:#64748B;padding:6px 4px;border-bottom:1px solid #334155;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:5px 4px;border-bottom:1px solid #0F172A;vertical-align:top}
.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600}
.badge-pending{background:#78350F;color:#FBBF24}.badge-approved{background:#065F46;color:#6EE7B7}
.badge-denied{background:#7F1D1D;color:#FCA5A5}.badge-auto{background:#312E81;color:#A5B4FC}
.badge-executed{background:#14532D;color:#86EFAC}.badge-human{background:#7F1D1D;color:#FCA5A5}
.q{color:#64748B;font-size:10px;font-family:monospace}
.btn{padding:3px 10px;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;margin:1px}
.btn-app{background:#059669;color:#FFF}.btn-app:hover{background:#10B981}.btn-den{background:#DC2626;color:#FFF}
.btn-den:hover{background:#EF4444}.btn-tog{padding:5px 14px;border-radius:6px;border:none;cursor:pointer;font-weight:600;font-size:12px}
.btn-on{background:#DC2626;color:#FFF}.btn-off{background:#059669;color:#FFF}
.tab{display:none}.tab.active{display:block}
pre{background:#0F172A;padding:10px;border-radius:6px;font-size:11px;color:#64748B;max-height:200px;overflow:auto;white-space:pre-wrap;margin-top:6px}
.risk{display:inline-block;width:32px;text-align:center;padding:1px 3px;border-radius:3px;font-size:10px;font-weight:700}
.risk-h{background:#7F1D1D;color:#FCA5A5}.risk-m{background:#78350F;color:#FBBF24}.risk-l{background:#065F46;color:#6EE7B7}
.expand{display:none;background:#0F172A;padding:8px;border-radius:6px;margin-top:3px;font-size:11px}
.empty{color:#475569;text-align:center;padding:16px;font-size:12px;font-style:italic}
.log-entry{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #0F172A;align-items:flex-start;font-size:12px}
.log-entry:last-child{border-bottom:none}
.log-time{color:#475569;font-size:10px;white-space:nowrap;font-family:monospace;min-width:60px;padding-top:1px}
.log-step{min-width:65px;text-align:center}
.log-step .step-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
.step-thalamus{background:#1E3A5F;color:#93C5FD}.step-intellect{background:#3B0764;color:#D8B4FE}
.step-planner{background:#1E3A5F;color:#93C5FD}.step-executor{background:#14532D;color:#86EFAC}
.step-research{background:#5B2E00;color:#FBBF24}.step-sleep{background:#1E1B4B;color:#A5B4FC}
.step-rest{background:#1E293B;color:#94A3B8}.step-error{background:#7F1D1D;color:#FCA5A5}
.step-monitor{background:#312E81;color:#A5B4FC}.step-idle{background:#334155;color:#CBD5E1}
.log-content{flex:1;color:#CBD5E1;word-break:break-word;line-height:1.4}
.log-source{color:#475569;font-size:9px;white-space:nowrap;min-width:40px;text-align:right}
.live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#10B981;animation:pulse 1.5s ease-in-out infinite;margin-right:6px;vertical-align:middle}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style>
</head>
<body>
<h1><span class="live-dot" id="liveDot"></span>Saraha Monitor</h1>
<div class="status-bar" id="statusBar"></div>
<div class="nav">
<button onclick="showTab('activity')" id="t-activity" class="active">Activity</button>
<button onclick="showTab('overview')" id="t-overview">Overview</button>
<button onclick="showTab('proposals')" id="t-proposals">Proposals</button>
<button onclick="showTab('kill')" id="t-kill">Kill Switch</button>
<button onclick="showTab('knowledge')" id="t-knowledge">Knowledge</button>
</div>
<div id="tab-activity" class="tab active"><div id="log-list"></div></div>
<div id="tab-overview" class="tab"><div class="row" id="stats"></div><div class="card"><h2 style="font-size:13px;color:#64748B;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Recent Cycles</h2><div id="recent-activity"></div></div></div>
<div id="tab-proposals" class="tab"><div id="prop-list"></div></div>
<div id="tab-kill" class="tab"><div class="card" style="text-align:center;padding:32px"><h2 style="font-size:16px;margin-bottom:12px" id="kill-status">Kill Switch</h2><p style="color:#64748B;font-size:12px;margin-bottom:16px">When active, the brain skips all idle cycles.</p><button id="kill-btn" class="btn-tog" onclick="toggleKill()">Loading...</button></div></div>
<div id="tab-knowledge" class="tab"><div id="knowledge-list"></div></div>
<script>
const PAGES={activity,overview,proposals,knowledge};
let curTab="activity",lastCount=0,statusCache={};
function showTab(n){curTab=n;document.querySelectorAll(".tab").forEach(e=>e.classList.remove("active"));document.getElementById("tab-"+n).classList.add("active");document.querySelectorAll(".nav button").forEach(e=>e.classList.remove("active"));document.getElementById("t-"+n).classList.add("active");PAGES[n]()}
async function api(p){const r=await fetch(p);if(!r.ok)throw await r.text();return r.json()}
async function refreshStatus(){
  try{
    const s=await api("/status");
    const ks=await api("/api/kill-switch");
    statusCache={brain:s.brain,db:s.db,kill:ks.active};
    document.getElementById("statusBar").innerHTML=
      '<span class="s-pill"><span class="s-dot '+(s.brain?'on':'off')+'"></span>Brain '+(s.brain?'alive':'down')+'</span>'+
      '<span class="s-pill"><span class="s-dot '+(s.db?'on':'off')+'"></span>DB '+(s.db?'ok':'down')+'</span>'+
      '<span class="s-pill"><span class="s-dot '+(ks.active?'warn':'on')+'"></span>Kill '+(ks.active?'ON':'OFF')+'</span>'+
      '<span class="s-pill">v'+s.version+'</span>'+
      '<span class="s-pill" style="color:#475569">'+(new Date().toLocaleTimeString())+'</span>';
    document.getElementById("liveDot").style.background=s.brain&&s.db?'#10B981':'#EF4444';
  }catch(e){document.getElementById("statusBar").innerHTML='<span class="s-pill"><span class="s-dot off"></span>Status error</span>'}
}
function activity(){
  api("/api/activity").then(d=>{
    const el=document.getElementById("log-list");
    if(!d.entries||!d.entries.length){el.innerHTML='<div class="card"><div class="empty">No activity yet — waiting for brain cycles...</div></div>';lastCount=0;return}
    const isNew=d.entries.length>lastCount&&lastCount>0;
    if(isNew)document.getElementById("liveDot").style.background="#F59E0B";
    lastCount=d.entries.length;
    el.innerHTML='<div class="card" style="padding:8px">'+d.entries.map(e=>{
      const step=e.step||"idle";
      const time=(e.created_at||"").slice(11,19);
      const src=e.action_id?'#'+e.action_id:'';
      const c=(e.content||"").slice(0,160);
      return '<div class="log-entry"><span class="log-time">'+time+'</span><span class="log-step"><span class="step-badge step-'+step+'">'+step+'</span></span><span class="log-content">'+c+'</span><span class="log-source">'+src+'</span></div>'
    }).join('')+'</div>';
    if(isNew)setTimeout(()=>{document.getElementById("liveDot").style.background="#10B981"},2000);
  }).catch(()=>document.getElementById("log-list").innerHTML='<div class="card"><div class="empty">Error loading activity</div></div>')
}
function overview(){
  api("/api/summary").then(d=>{
    const total=(d.proposals||[]).reduce(function(s,p){return s+parseInt(p.total||0)},0);
    document.getElementById("stats").innerHTML=[
      '<div class="stat card"><div class="v">'+total+'</div><div class="l">Proposals</div></div>',
      '<div class="stat card"><div class="v">'+(d.antiPatterns||0)+'</div><div class="l">Anti-Patterns</div></div>',
      '<div class="stat card"><div class="v">'+(d.killSwitch?"ON":"OFF")+'</div><div class="l">Kill Switch</div></div>',
      '<div class="stat card"><div class="v">'+((d.lastActivity||[]).length)+'</div><div class="l">Recent Cycles</div></div>'
    ].join("");
    const el=document.getElementById("recent-activity");
    if(!d.lastActivity||!d.lastActivity.length){el.innerHTML='<div class="empty">No recent cycles</div>';return}
    el.innerHTML="<table><tr><th>Action</th><th>Time</th></tr>"+d.lastActivity.map(e=>"<tr><td>"+(e.content||"").slice(0,100)+"</td><td class='q'>"+(e.created_at||"").slice(11,19)+"</td></tr>").join("")+"</table>";
  }).catch(()=>document.getElementById("stats").innerHTML='<div class="empty">Failed to load</div>')
}
function proposals(){
  api("/api/proposals").then(d=>{
    const el=document.getElementById("prop-list");
    if(!d.entries||!d.entries.length){el.innerHTML='<div class="card"><div class="empty">No proposals yet</div></div>';return}
    let h="<table><tr><th>ID</th><th>Title</th><th>Type</th><th>Risk</th><th>Status</th><th></th></tr>";
    d.entries.map(p=>{
      const rc=p.risk_pct>60?"risk-h":p.risk_pct>30?"risk-m":"risk-l";
      const ab=p.status==="pending"?'<button class="btn btn-app" onclick="app('+p.id+')">✓</button><button class="btn btn-den" onclick="den('+p.id+')">✗</button>':"";
      h+='<tr><td class="q">'+p.id+'</td><td><a href="#" onclick="event.preventDefault();toggleExpand('+p.id+')" style="color:#38BDF8;text-decoration:none;font-size:12px">'+(p.title||"").slice(0,35)+'</a></td><td><span class="badge">'+(p.resource_type||"-")+'</span></td><td><span class="risk '+rc+'">'+(p.risk_pct||0)+'</span></td><td><span class="badge badge-'+p.status+'">'+p.status+'</span></td><td>'+ab+'</td></tr>';
      h+='<tr id="expand-'+p.id+'" class="expand"><td colspan="6"><strong>What:</strong> '+(p.what_diff||"-")+'<br><strong>How:</strong> '+(p.how_diff||"-")+'<br><span class="q">'+(p.created_at||"")+'</span></td></tr>';
    });h+="</table>";el.innerHTML=h;
  }).catch(()=>document.getElementById("prop-list").innerHTML='<div class="card"><div class="empty">Error loading</div></div>')
}
function toggleExpand(id){const el=document.getElementById("expand-"+id);el.style.display=el.style.display==="table-row"?"none":"table-row"}
async function app(id){try{await api("/api/proposals/approve/"+id);proposals()}catch{}}
async function den(id){try{await api("/api/proposals/deny/"+id);proposals()}catch{}}
function knowledge(){
  api("/api/knowledge").then(d=>{
    const el=document.getElementById("knowledge-list");
    if(!d.entries||!d.entries.length){el.innerHTML='<div class="card"><div class="empty">No knowledge entries</div></div>';return}
    let cats={};d.entries.map(e=>{if(!cats[e.category])cats[e.category]=[];cats[e.category].push(e)});
    let h="";Object.keys(cats).sort().map(c=>{h+='<div class="card"><h2 style="font-size:13px;color:#38BDF8;margin-bottom:6px;text-transform:capitalize">'+c+'</h2><table><tr><th>Key</th><th>Content</th></tr>';cats[c].map(e=>{h+='<tr><td class="q" style="white-space:nowrap">'+e.key+'</td><td style="font-size:11px">'+e.content+'</td></tr>'});h+="</table></div>"});
    el.innerHTML=h;
  }).catch(()=>document.getElementById("knowledge-list").innerHTML='<div class="card"><div class="empty">Error loading</div></div>')
}
async function toggleKill(){
  const btn=document.getElementById("kill-btn");btn.disabled=true;
  try{const s=await api("/api/kill-switch");await fetch("/api/kill-switch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!s.active})});const d=await api("/api/kill-switch");renderKill(d.active);refreshStatus()}catch{}btn.disabled=false;
}
function renderKill(active){
  document.getElementById("kill-status").textContent=active?"Kill Switch: ON":"Kill Switch: OFF";
  const btn=document.getElementById("kill-btn");btn.textContent=active?"Turn OFF":"Turn ON";btn.className="btn-tog "+(active?"btn-on":"btn-off");
}
refreshStatus();activity();setInterval(()=>{refreshStatus();PAGES[curTab]&&PAGES[curTab]()},8000);
</script>
</body>
</html>`;
