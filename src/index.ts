const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
});

const html = (body, status = 200) => new Response(body, {
  status, headers: { "Content-Type": "text/html;charset=utf-8" }
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

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

    return html("<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><title>Saraha Monitor</title></head><body><h1>Saraha Monitor</h1><p>API is running.</p></body></html>");
  }
};
