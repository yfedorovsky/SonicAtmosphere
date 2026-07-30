// Generate a self-contained, offline labeling UI for the pooled judgment set.
// Reads eval/prompts.json (for prompt context) and eval/judgments.template.json
// (the candidate pool) and bakes both into eval/label.html — a single file you
// open in any browser (no server, no network, no API calls). Click or use
// 1/2/3 keys to mark each candidate relevant/borderline/irrelevant; progress
// autosaves to localStorage; "Export" downloads a finished judgments.json.
//
// Re-run this whenever the pool changes (e.g. after backfilling artist prompts)
// — it preserves nothing itself; your in-progress labels live in the browser's
// localStorage and can be re-imported.
//
// Usage: node scripts/build-label-tool.mjs
import { readFileSync, writeFileSync } from "node:fs";

const { prompts } = JSON.parse(readFileSync("eval/prompts.json", "utf8"));
const pool = JSON.parse(readFileSync("eval/judgments.template.json", "utf8"));

// Drop prompts with no pooled candidates (e.g. artist prompts that hit the
// quota wall mid-run) so the labeler only sees things they can actually label.
const skipped = Object.keys(pool).filter((id) => Object.keys(pool[id]).length === 0);
for (const id of skipped) delete pool[id];
if (skipped.length) console.error(`Skipped ${skipped.length} empty prompt(s): ${skipped.join(", ")}`);

const promptMeta = {};
for (const p of prompts) promptMeta[p.id] = { text: p.text, mode: p.mode, difficulty: p.difficulty };

const totalCandidates = Object.values(pool).reduce((n, m) => n + Object.keys(m).length, 0);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sonic Atmosphere — eval labeling</title>
<style>
  :root { color-scheme: dark; --bg:#0f1115; --panel:#171a21; --line:#262b36; --fg:#e6e8ee; --mut:#8b93a5;
    --rel:#2fbf6b; --bor:#d9a022; --irr:#e05555; }
  * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--fg);
    font:14px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { position:sticky; top:0; z-index:5; background:var(--panel); border-bottom:1px solid var(--line);
    padding:12px 18px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  header h1 { font-size:15px; margin:0; font-weight:650; }
  .bar { flex:1; min-width:180px; height:8px; background:#0c0e12; border-radius:6px; overflow:hidden; }
  .bar > i { display:block; height:100%; width:0; background:linear-gradient(90deg,#3d7bff,#2fbf6b); transition:width .2s; }
  .stat { color:var(--mut); font-variant-numeric:tabular-nums; }
  button { font:inherit; color:var(--fg); background:#222734; border:1px solid var(--line); border-radius:7px;
    padding:6px 12px; cursor:pointer; } button:hover { border-color:#3a4256; }
  .wrap { max-width:920px; margin:0 auto; padding:18px; }
  .prompt { background:var(--panel); border:1px solid var(--line); border-radius:12px; margin:14px 0; overflow:hidden; }
  .phead { padding:12px 16px; border-bottom:1px solid var(--line); cursor:pointer; display:flex; gap:10px; align-items:baseline; }
  .phead .id { font-weight:650; } .phead .mode { color:var(--mut); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
  .phead .done { margin-left:auto; color:var(--mut); font-variant-numeric:tabular-nums; }
  .ptext { padding:0 16px 10px; color:var(--mut); font-style:italic; }
  .cands { padding:4px 8px 10px; } .cands.collapsed { display:none; }
  .row { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:8px; }
  .row:hover { background:#1c212b; } .row.focus { background:#1c2534; outline:1px solid #2f3a4f; }
  .row .t { flex:1; min-width:0; } .row .t b { font-weight:600; } .row .t span { color:var(--mut); }
  .lab { border:1px solid var(--line); background:transparent; padding:3px 9px; border-radius:6px; font-size:12px; }
  .lab.on-rel { background:var(--rel); border-color:var(--rel); color:#04210f; font-weight:650; }
  .lab.on-bor { background:var(--bor); border-color:var(--bor); color:#241a02; font-weight:650; }
  .lab.on-irr { background:var(--irr); border-color:var(--irr); color:#2a0606; font-weight:650; }
  .hint { color:var(--mut); font-size:12px; } code { background:#0c0e12; padding:1px 5px; border-radius:4px; }
</style></head><body>
<header>
  <h1>🎧 eval labeling</h1>
  <div class="bar"><i id="barfill"></i></div>
  <span class="stat" id="stat">0 / 0</span>
  <button id="importBtn">Import…</button>
  <button id="exportBtn">Export judgments.json</button>
  <input id="file" type="file" accept="application/json" hidden>
</header>
<div class="wrap">
  <p class="hint">Click <b>Rel</b>/<b>Bor</b>/<b>Irr</b>, or hover a row and press <code>1</code> relevant · <code>2</code> borderline · <code>3</code> irrelevant (auto-advances). Progress autosaves in this browser. Click a prompt header to collapse it. When every candidate is labeled, hit <b>Export</b> and save the file as <code>eval/judgments.json</code>.</p>
  <div id="root"></div>
</div>
<script>
const PROMPTS = ${JSON.stringify(promptMeta)};
const POOL = ${JSON.stringify(pool)};
const LS = "sa-eval-labels-v1";
const labels = JSON.parse(localStorage.getItem(LS) || "{}"); // "promptId\\u0000trackId" -> label
const key = (p,t) => p + "\\u0000" + t;
const order = []; // flat list of {p,t} for keyboard nav
let focusIdx = -1;

function total(){ let n=0; for(const p in POOL) n+=Object.keys(POOL[p]).length; return n; }
function done(){ let n=0; for(const k in labels) if(labels[k]) n++; return n; }
function save(){ localStorage.setItem(LS, JSON.stringify(labels)); paint(); }

function setLabel(p,t,v){ labels[key(p,t)] = v; save(); }

function paint(){
  const d = done(), tot = total();
  document.getElementById("stat").textContent = d + " / " + tot;
  document.getElementById("barfill").style.width = (tot? (100*d/tot):0) + "%";
  document.querySelectorAll(".prompt").forEach(el=>{
    const pid = el.dataset.pid; const ids = Object.keys(POOL[pid]);
    const dn = ids.filter(t=>labels[key(pid,t)]).length;
    el.querySelector(".done").textContent = dn + "/" + ids.length;
  });
  document.querySelectorAll(".lab").forEach(b=>{
    const on = labels[key(b.dataset.p,b.dataset.t)] === b.dataset.v;
    b.classList.toggle("on-"+b.dataset.v.slice(0,3), on);
  });
}

function render(){
  const root = document.getElementById("root");
  root.innerHTML = "";
  for(const pid in POOL){
    const meta = PROMPTS[pid] || {text:"(unknown prompt)", mode:"?", difficulty:""};
    const ids = Object.keys(POOL[pid]);
    const wrap = document.createElement("div"); wrap.className="prompt"; wrap.dataset.pid=pid;
    const head = document.createElement("div"); head.className="phead";
    head.innerHTML = '<span class="id">'+pid+'</span><span class="mode">'+meta.mode+(meta.difficulty?" · "+meta.difficulty:"")+'</span><span class="done"></span>';
    const ptext = document.createElement("div"); ptext.className="ptext"; ptext.textContent = '"'+meta.text+'"';
    const cands = document.createElement("div"); cands.className="cands";
    head.onclick = ()=> cands.classList.toggle("collapsed");
    if(ids.length===0){ const e=document.createElement("div"); e.className="hint"; e.style.padding="6px 10px";
      e.textContent="(no candidates pooled — re-pool this prompt)"; cands.appendChild(e); }
    for(const t of ids){
      const c = POOL[pid][t];
      const row = document.createElement("div"); row.className="row"; row.dataset.p=pid; row.dataset.t=t;
      const oi = order.length; order.push({p:pid,t});
      row.onmouseenter = ()=>{ focusIdx=oi; document.querySelectorAll(".row.focus").forEach(r=>r.classList.remove("focus")); row.classList.add("focus"); };
      const info = document.createElement("div"); info.className="t";
      info.innerHTML = '<b>'+esc(c.artist||"?")+'</b> <span>— '+esc(c.name||"?")+'</span>';
      row.appendChild(info);
      for(const [v,lbl] of [["relevant","Rel"],["borderline","Bor"],["irrelevant","Irr"]]){
        const b=document.createElement("button"); b.className="lab"; b.dataset.p=pid; b.dataset.t=t; b.dataset.v=v;
        b.textContent=lbl; b.onclick=()=>setLabel(pid,t,v); row.appendChild(b);
      }
      cands.appendChild(row);
    }
    wrap.appendChild(head); wrap.appendChild(ptext); wrap.appendChild(cands); root.appendChild(wrap);
  }
  paint();
}
function esc(s){ return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m])); }

document.addEventListener("keydown",e=>{
  if(focusIdx<0 || !["1","2","3"].includes(e.key)) return;
  const {p,t}=order[focusIdx]; setLabel(p,t,{"1":"relevant","2":"borderline","3":"irrelevant"}[e.key]);
  const next = Math.min(order.length-1, focusIdx+1); focusIdx=next;
  const rows=document.querySelectorAll(".row"); document.querySelectorAll(".row.focus").forEach(r=>r.classList.remove("focus"));
  if(rows[next]){ rows[next].classList.add("focus"); rows[next].scrollIntoView({block:"center",behavior:"smooth"}); }
});

document.getElementById("exportBtn").onclick = ()=>{
  const out = {};
  for(const pid in POOL){ out[pid]={}; for(const t in POOL[pid]){ out[pid][t] = {...POOL[pid][t], label: labels[key(pid,t)]||""}; } }
  const blob = new Blob([JSON.stringify(out,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="judgments.json"; a.click();
};
document.getElementById("importBtn").onclick = ()=> document.getElementById("file").click();
document.getElementById("file").onchange = (e)=>{
  const f=e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ try{ const j=JSON.parse(r.result); for(const pid in j) for(const t in j[pid]){ const v=j[pid][t].label; if(v) labels[key(pid,t)]=v; } save(); alert("Imported labels."); }catch(err){ alert("Bad JSON: "+err.message); } };
  r.readAsText(f);
};
render();
</script></body></html>`;

writeFileSync("eval/label.html", html);
console.error(`Wrote eval/label.html — ${totalCandidates} candidates across ${Object.keys(pool).length} prompts. Open it in a browser to label.`);
