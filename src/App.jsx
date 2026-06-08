import React, { useState, useMemo, useEffect } from "react";
import { ArrowLeftRight, ChevronDown, Info, Plug, ShieldAlert, TrendingUp, Trophy, RotateCcw, Target, Layers, Radio } from "lucide-react";

/* =========================================================================
   PronosticFoot — prototype web mobile
   Onglet "Match"        : prédiction d'un match isolé (Elo + Poisson / Dixon-Coles)
   Onglet "Coupe du Monde": format 2026 (48 équipes, 12 groupes, R32->Finale).
     - groupes éditables, saisie des vrais scores -> classements automatiques
     - les scores réels recalculent les forces -> probabilités mises à jour en direct
     - tableau final auto-alimenté ; saisie sauvegardée entre les sessions
   Données d'équipes = ILLUSTRATIVES (voir "Brancher une vraie API").
   ========================================================================= */

const BASE_GOALS = 1.35, HOME_MULT = 1.18, AWAY_MULT = 0.92, RHO = -0.13, MAXG = 10;
const LETTERS = "ABCDEFGHIJKL".split("");
const GROUP_PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

const POOL = [
  { n: "France", f: "🇫🇷", elo: 2085, att: 1.40, def: 0.72, form: ["W","W","D","W","L"] },
  { n: "Argentine", f: "🇦🇷", elo: 2090, att: 1.38, def: 0.74, form: ["W","W","W","D","W"] },
  { n: "Espagne", f: "🇪🇸", elo: 2070, att: 1.42, def: 0.78, form: ["W","D","W","W","W"] },
  { n: "Brésil", f: "🇧🇷", elo: 2060, att: 1.40, def: 0.80, form: ["W","L","W","D","W"] },
  { n: "Angleterre", f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 2030, att: 1.34, def: 0.74, form: ["D","W","W","L","D"] },
  { n: "Portugal", f: "🇵🇹", elo: 2025, att: 1.38, def: 0.82, form: ["W","W","D","W","D"] },
  { n: "Pays-Bas", f: "🇳🇱", elo: 1985, att: 1.30, def: 0.85, form: ["W","D","L","W","W"] },
  { n: "Allemagne", f: "🇩🇪", elo: 1980, att: 1.34, def: 0.88, form: ["L","W","W","D","W"] },
  { n: "Italie", f: "🇮🇹", elo: 1975, att: 1.20, def: 0.74, form: ["D","W","D","W","L"] },
  { n: "Belgique", f: "🇧🇪", elo: 1960, att: 1.30, def: 0.90, form: ["W","L","D","W","D"] },
  { n: "Croatie", f: "🇭🇷", elo: 1945, att: 1.18, def: 0.86, form: ["D","D","W","L","W"] },
  { n: "Uruguay", f: "🇺🇾", elo: 1935, att: 1.22, def: 0.84, form: ["W","D","W","L","D"] },
  { n: "Maroc", f: "🇲🇦", elo: 1875, att: 1.12, def: 0.82, form: ["W","W","D","W","L"] },
  { n: "Colombie", f: "🇨🇴", elo: 1855, att: 1.18, def: 0.88, form: ["W","D","L","W","D"] },
  { n: "Danemark", f: "🇩🇰", elo: 1845, att: 1.16, def: 0.90, form: ["L","W","D","W","D"] },
  { n: "Japon", f: "🇯🇵", elo: 1830, att: 1.16, def: 0.92, form: ["W","W","L","D","W"] },
  { n: "Sénégal", f: "🇸🇳", elo: 1825, att: 1.14, def: 0.88, form: ["D","W","D","L","W"] },
  { n: "Mexique", f: "🇲🇽", elo: 1815, att: 1.14, def: 0.96, form: ["L","D","W","D","L"] },
  { n: "Suisse", f: "🇨🇭", elo: 1810, att: 1.10, def: 0.86, form: ["D","D","W","L","D"] },
  { n: "États-Unis", f: "🇺🇸", elo: 1800, att: 1.12, def: 0.98, form: ["W","L","D","W","L"] },
  { n: "Nigeria", f: "🇳🇬", elo: 1735, att: 1.12, def: 0.94, form: [] },
  { n: "Corée du Sud", f: "🇰🇷", elo: 1725, att: 1.10, def: 0.96, form: [] },
  { n: "Égypte", f: "🇪🇬", elo: 1710, att: 1.06, def: 0.92, form: [] },
  { n: "Cameroun", f: "🇨🇲", elo: 1690, att: 1.08, def: 0.98, form: [] },
  { n: "Canada", f: "🇨🇦", elo: 1685, att: 1.10, def: 1.00, form: [] },
  { n: "Australie", f: "🇦🇺", elo: 1660, att: 1.04, def: 0.98, form: [] },
  { n: "Serbie", f: "🇷🇸", elo: 1790, att: 1.18, def: 0.96, form: [] },
  { n: "Autriche", f: "🇦🇹", elo: 1790, att: 1.14, def: 0.92, form: [] },
  { n: "Turquie", f: "🇹🇷", elo: 1785, att: 1.16, def: 0.94, form: [] },
  { n: "Norvège", f: "🇳🇴", elo: 1780, att: 1.20, def: 0.94, form: [] },
  { n: "Équateur", f: "🇪🇨", elo: 1780, att: 1.10, def: 0.88, form: [] },
  { n: "Ukraine", f: "🇺🇦", elo: 1770, att: 1.10, def: 0.92, form: [] },
  { n: "Pologne", f: "🇵🇱", elo: 1755, att: 1.10, def: 0.94, form: [] },
  { n: "Iran", f: "🇮🇷", elo: 1740, att: 1.06, def: 0.90, form: [] },
  { n: "Écosse", f: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", elo: 1740, att: 1.06, def: 0.92, form: [] },
  { n: "Pérou", f: "🇵🇪", elo: 1720, att: 1.04, def: 0.94, form: [] },
  { n: "Algérie", f: "🇩🇿", elo: 1700, att: 1.10, def: 0.96, form: [] },
  { n: "Paraguay", f: "🇵🇾", elo: 1700, att: 1.02, def: 0.96, form: [] },
  { n: "Côte d'Ivoire", f: "🇨🇮", elo: 1690, att: 1.10, def: 0.98, form: [] },
  { n: "Costa Rica", f: "🇨🇷", elo: 1660, att: 1.00, def: 0.98, form: [] },
  { n: "Tunisie", f: "🇹🇳", elo: 1660, att: 1.02, def: 0.94, form: [] },
  { n: "Ghana", f: "🇬🇭", elo: 1645, att: 1.06, def: 1.02, form: [] },
  { n: "Jamaïque", f: "🇯🇲", elo: 1640, att: 1.04, def: 1.04, form: [] },
  { n: "Arabie saoudite", f: "🇸🇦", elo: 1620, att: 0.98, def: 1.00, form: [] },
  { n: "Panama", f: "🇵🇦", elo: 1610, att: 0.98, def: 1.02, form: [] },
  { n: "Qatar", f: "🇶🇦", elo: 1600, att: 0.98, def: 1.02, form: [] },
  { n: "Honduras", f: "🇭🇳", elo: 1590, att: 0.96, def: 1.04, form: [] },
  { n: "Nouvelle-Zélande", f: "🇳🇿", elo: 1560, att: 0.92, def: 1.06, form: [] },
];

/* ---------- maths ---------- */
function factorial(k) { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; }
function poisson(k, l) { return (Math.exp(-l) * Math.pow(l, k)) / factorial(k); }
function formScore(form) { if (!form || !form.length) return 0; return form.reduce((s, r) => s + (r === "W" ? 1 : r === "L" ? -1 : 0), 0) / form.length; }
function dcTau(i, j, lh, la) {
  if (i === 0 && j === 0) return 1 - lh * la * RHO;
  if (i === 0 && j === 1) return 1 + lh * RHO;
  if (i === 1 && j === 0) return 1 + la * RHO;
  if (i === 1 && j === 1) return 1 - RHO;
  return 1;
}
function predict(home, away, neutral) {
  const fh = formScore(home.form), fa = formScore(away.form);
  const attH = home.att * (1 + 0.08 * fh), defH = home.def * (1 - 0.05 * fh);
  const attA = away.att * (1 + 0.08 * fa), defA = away.def * (1 - 0.05 * fa);
  let lh = BASE_GOALS * attH * defA, la = BASE_GOALS * attA * defH;
  if (!neutral) { lh *= HOME_MULT; la *= AWAY_MULT; }
  let total = 0; const M = [];
  for (let i = 0; i <= MAXG; i++) { M[i] = []; for (let j = 0; j <= MAXG; j++) { const p = poisson(i, lh) * poisson(j, la) * dcTau(i, j, lh, la); M[i][j] = p; total += p; } }
  let pH = 0, pD = 0, pA = 0, over25 = 0, btts = 0, best = { i: 0, j: 0, p: 0 };
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = M[i][j] / total;
    if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
    if (i + j >= 3) over25 += p; if (i >= 1 && j >= 1) btts += p;
    if (p > best.p) best = { i, j, p };
  }
  return { lh, la, pH, pD, pA, over25, btts, score: best.i + "–" + best.j, scoreP: best.p };
}
function twoWay(p) { const d = p.pH + p.pA || 1; return { a: p.pH + p.pD * p.pH / d, b: p.pA + p.pD * p.pA / d }; }
function parseOdds(s) { const v = parseFloat(String(s).replace(",", ".")); return v > 1 ? v : null; }
function fairProbs(o1, ox, o2) { const a = parseOdds(o1), b = parseOdds(ox), c = parseOdds(o2); if (!a || !b || !c) return null; const i1 = 1/a, ix = 1/b, i2 = 1/c, s = i1+ix+i2; return { p1: i1/s, px: ix/s, p2: i2/s, margin: s-1 }; }
const pct = (x) => (x * 100).toFixed(1);
const short = (n) => n.length > 11 ? n.slice(0, 10) + "." : n;

/* ---------- tournoi ---------- */
function defaultGroups() {
  const idx = POOL.map((t, i) => i).sort((a, b) => POOL[b].elo - POOL[a].elo);
  const g = Array.from({ length: 12 }, () => []);
  let dir = 1, c = 0;
  for (let k = 0; k < idx.length; k++) { g[c].push(idx[k]); c += dir; if (c === 12) { c = 11; dir = -1; } else if (c < 0) { c = 0; dir = 1; } }
  return g;
}
function tournamentStats(groups, results) {
  const st = POOL.map(() => ({ gf: 0, ga: 0, gp: 0 }));
  groups.forEach((g, gi) => GROUP_PAIRS.forEach(([x, y]) => {
    const r = results["G" + LETTERS[gi] + "-" + x + "-" + y];
    if (r && r.hg != null && r.ag != null) {
      const ti = g[x], tj = g[y];
      st[ti].gf += r.hg; st[ti].ga += r.ag; st[ti].gp++;
      st[tj].gf += r.ag; st[tj].ga += r.hg; st[tj].gp++;
    }
  }));
  return st;
}
function effectivePool(stats) {
  return POOL.map((t, i) => {
    const s = stats[i];
    if (!s.gp) return { ...t };
    const w = Math.min(0.5, 0.15 * s.gp);
    const attObs = Math.max(0.2, s.gf / s.gp) / BASE_GOALS;
    const defObs = Math.max(0.2, s.ga / s.gp) / BASE_GOALS;
    return { ...t, att: Math.pow(t.att, 1 - w) * Math.pow(attObs, w), def: Math.pow(t.def, 1 - w) * Math.pow(defObs, w) };
  });
}
function groupTable(group, gi, results) {
  const rows = group.map((ti) => ({ ti, pts: 0, gf: 0, ga: 0, gp: 0 }));
  GROUP_PAIRS.forEach(([x, y]) => {
    const r = results["G" + LETTERS[gi] + "-" + x + "-" + y];
    if (r && r.hg != null && r.ag != null) {
      const X = rows[x], Y = rows[y];
      X.gf += r.hg; X.ga += r.ag; X.gp++; Y.gf += r.ag; Y.ga += r.hg; Y.gp++;
      if (r.hg > r.ag) X.pts += 3; else if (r.hg < r.ag) Y.pts += 3; else { X.pts++; Y.pts++; }
    }
  });
  rows.forEach((r) => (r.gd = r.gf - r.ga));
  return [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || POOL[b.ti].elo - POOL[a.ti].elo);
}
function seedOrder(n) { let p = [1, 2]; while (p.length < n) { const s = p.length * 2 + 1, nx = []; for (const x of p) { nx.push(x); nx.push(s - x); } p = nx; } return p; }
function buildKnockout(eff, qualRanked, ko, results) {
  const order = seedOrder(32);
  const slots = order.map((s) => qualRanked[s - 1] ?? null);
  let ties = []; for (let k = 0; k < 16; k++) ties.push([slots[2 * k], slots[2 * k + 1]]);
  const defs = [["R32", 16], ["R16", 8], ["QF", 4], ["SF", 2], ["F", 1]];
  const rounds = [];
  for (const [name, count] of defs) {
    const out = { name, ties: [] }, winners = [];
    for (let k = 0; k < count; k++) {
      const [a, b] = ties[k] || [null, null];
      const id = name + "-" + k;
      let prob = 0.5, winner = null, decided = false;
      if (a != null && b != null) {
        prob = twoWay(predict(eff[a], eff[b], true)).a;
        const m = ko[id], sc = results[id];
        if (m != null) { winner = m; decided = true; }
        else if (sc && sc.hg != null && sc.ag != null && sc.hg !== sc.ag) { winner = sc.hg > sc.ag ? a : b; decided = true; }
        else winner = prob >= 0.5 ? a : b;
      } else winner = a != null ? a : b;
      out.ties.push({ id, a, b, prob, winner, decided });
      winners.push(winner);
    }
    rounds.push(out);
    const nx = []; for (let k = 0; k < winners.length; k += 2) nx.push([winners[k] ?? null, winners[k + 1] ?? null]);
    ties = nx;
  }
  return rounds;
}

/* ---------- stockage persistant ---------- */
const store = {
  async get(k) { try { if (!window.storage) return null; const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async set(k, v) { try { if (window.storage) await window.storage.set(k, JSON.stringify(v)); } catch {} },
};

/* ========================= UI commun ========================= */
function FormPills({ form }) {
  if (!form || !form.length) return <span className="pf-elo">—</span>;
  return <div className="pf-form">{form.map((r, i) => <span key={i} className={"pf-pill pf-" + r}>{r === "W" ? "V" : r === "L" ? "D" : "N"}</span>)}</div>;
}
function TeamSelect({ label, value, onChange }) {
  const t = POOL[value];
  return (
    <div className="pf-team">
      <div className="pf-team-tag">{label}</div>
      <div className="pf-select-wrap">
        <span className="pf-flag">{t.f}</span>
        <select className="pf-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {POOL.map((tm, i) => <option key={i} value={i}>{tm.n}</option>)}
        </select>
        <ChevronDown size={18} className="pf-chev" />
      </div>
      <div className="pf-team-meta"><span className="pf-elo">Elo {t.elo}</span><FormPills form={t.form} /></div>
    </div>
  );
}
function Bar({ pH, pD, pA }) {
  return <div className="pf-bar"><div className="pf-seg pf-seg-h" style={{ width: pH * 100 + "%" }} /><div className="pf-seg pf-seg-d" style={{ width: pD * 100 + "%" }} /><div className="pf-seg pf-seg-a" style={{ width: pA * 100 + "%" }} /></div>;
}
function OutcomeTile({ label, value, kind }) {
  return <div className={"pf-tile pf-tile-" + kind}><div className="pf-tile-label">{label}</div><div className="pf-tile-val">{value}<span className="pf-pctsign">%</span></div></div>;
}
function EdgeRow({ label, model, fair, edge }) {
  const value = edge > 0.02;
  return (
    <div className="pf-edge">
      <div className="pf-edge-label">{label}</div>
      <div className="pf-edge-nums"><span>modèle {pct(model)}%</span><span className="pf-edge-fair">implicite {pct(fair)}%</span></div>
      <div className={"pf-edge-badge " + (value ? "pf-val" : edge < -0.02 ? "pf-neg" : "pf-neu")}>{edge >= 0 ? "+" : ""}{(edge * 100).toFixed(1)} pts {value ? "· value" : ""}</div>
    </div>
  );
}

/* ========================= Onglet MATCH ========================= */
function MatchTab() {
  const [h, setH] = useState(0), [a, setA] = useState(1), [neutral, setNeutral] = useState(true);
  const [o1, setO1] = useState(""), [ox, setOx] = useState(""), [o2, setO2] = useState("");
  const [openHow, setOpenHow] = useState(false), [openApi, setOpenApi] = useState(false);
  const home = POOL[h], away = POOL[a], same = h === a;
  const R = useMemo(() => (same ? null : predict(home, away, neutral)), [h, a, neutral]);
  const fair = useMemo(() => fairProbs(o1, ox, o2), [o1, ox, o2]);
  const edges = R && fair ? { e1: R.pH - fair.p1, ex: R.pD - fair.px, e2: R.pA - fair.p2 } : null;
  return (
    <>
      <section className="pf-card pf-match">
        <TeamSelect label="DOMICILE" value={h} onChange={setH} />
        <button className="pf-swap" onClick={() => { setH(a); setA(h); }}><ArrowLeftRight size={18} /></button>
        <TeamSelect label="EXTÉRIEUR" value={a} onChange={setA} />
        <label className="pf-neutral"><input type="checkbox" checked={neutral} onChange={(e) => setNeutral(e.target.checked)} /><span>Terrain neutre (tournoi)</span></label>
      </section>
      {same && <div className="pf-warn">Choisis deux équipes différentes.</div>}
      {R && (<>
        <section className="pf-card">
          <div className="pf-result-head">Probabilités du résultat</div>
          <Bar pH={R.pH} pD={R.pD} pA={R.pA} />
          <div className="pf-tiles"><OutcomeTile label={"Victoire " + home.n} value={pct(R.pH)} kind="h" /><OutcomeTile label="Match nul" value={pct(R.pD)} kind="d" /><OutcomeTile label={"Victoire " + away.n} value={pct(R.pA)} kind="a" /></div>
        </section>
        <section className="pf-card pf-stats">
          <div className="pf-stat"><div className="pf-stat-k">Score le plus probable</div><div className="pf-stat-v pf-accent">{R.score}</div><div className="pf-stat-x">{pct(R.scoreP)}%</div></div>
          <div className="pf-stat"><div className="pf-stat-k">Buts attendus (xG)</div><div className="pf-stat-v">{R.lh.toFixed(2)} – {R.la.toFixed(2)}</div><div className="pf-stat-x">dom. – ext.</div></div>
          <div className="pf-stat"><div className="pf-stat-k">+ de 2,5 buts</div><div className="pf-stat-v">{pct(R.over25)}%</div></div>
          <div className="pf-stat"><div className="pf-stat-k">Les deux marquent</div><div className="pf-stat-v">{pct(R.btts)}%</div></div>
        </section>
        <section className="pf-card">
          <div className="pf-odds-head"><TrendingUp size={16} /> Cotes & détection de value <span>(optionnel)</span></div>
          <div className="pf-odds-inputs">
            <label>1 <input inputMode="decimal" placeholder="2.10" value={o1} onChange={(e) => setO1(e.target.value)} /></label>
            <label>N <input inputMode="decimal" placeholder="3.30" value={ox} onChange={(e) => setOx(e.target.value)} /></label>
            <label>2 <input inputMode="decimal" placeholder="3.80" value={o2} onChange={(e) => setO2(e.target.value)} /></label>
          </div>
          {fair ? (<div className="pf-edges">
            <EdgeRow label={"Victoire " + home.n} model={R.pH} fair={fair.p1} edge={edges.e1} />
            <EdgeRow label="Match nul" model={R.pD} fair={fair.px} edge={edges.ex} />
            <EdgeRow label={"Victoire " + away.n} model={R.pA} fair={fair.p2} edge={edges.e2} />
            <div className="pf-margin">Marge du bookmaker ≈ {(fair.margin * 100).toFixed(1)}%</div>
          </div>) : <div className="pf-odds-hint">Saisis les 3 cotes décimales pour comparer le modèle aux probabilités implicites.</div>}
        </section>
      </>)}
      <Fold open={openHow} setOpen={setOpenHow} icon={<Info size={15} />} title="Comment ça marche">
        <p>Chaque équipe a une force d'<b>attaque</b> et de <b>défense</b>, ajustée par la forme et l'avantage du terrain → deux nombres de buts attendus → une <b>loi de Poisson</b> donne chaque score → une <b>correction Dixon-Coles</b> rééquilibre les petits scores. La somme donne victoire / nul / défaite.</p>
        <p>La « value » compare le modèle à la probabilité implicite des cotes <i>sans la marge</i>. Avec des données d'exemple, ce n'est qu'indicatif.</p>
      </Fold>
      <Fold open={openApi} setOpen={setOpenApi} icon={<Plug size={15} />} title="Brancher une vraie API">
        <p><b>football-data.org</b> (gratuit) — 12 compétitions, 10 req/min, saison en cours. <b>API-Football</b> — 100 req/jour en gratuit, stats joueurs incluses.</p>
        <p>Pour <code>att</code>/<code>def</code> : buts marqués/encaissés par match ÷ moyenne de la compétition. <b>Mets en cache</b> classements et historiques pour économiser les quotas.</p>
      </Fold>
    </>
  );
}
function Fold({ open, setOpen, icon, title, children }) {
  return (
    <section className="pf-card pf-fold">
      <button className="pf-fold-btn" onClick={() => setOpen(!open)}><span>{icon} {title}</span><ChevronDown size={16} className={open ? "pf-rot" : ""} /></button>
      {open && <div className="pf-fold-body">{children}</div>}
    </section>
  );
}

/* ========================= Onglet COUPE DU MONDE ========================= */
function ScoreInput({ value, onChange }) {
  return <input className="wc-score" inputMode="numeric" maxLength={2} value={value == null ? "" : value} placeholder="–" onChange={(e) => onChange(e.target.value)} />;
}
function GroupCard({ gi, group, results, eff, bestThirds, onTeam, onScore }) {
  const [open, setOpen] = useState(gi === 0);
  const table = groupTable(group, gi, results);
  const played = GROUP_PAIRS.filter(([x, y]) => { const r = results["G" + LETTERS[gi] + "-" + x + "-" + y]; return r && r.hg != null && r.ag != null; }).length;
  return (
    <div className="pf-card wc-group">
      <button className="wc-group-head" onClick={() => setOpen(!open)}>
        <span className="wc-glabel">Groupe {LETTERS[gi]}</span>
        <span className="wc-gprog">{played}/6</span>
        <ChevronDown size={16} className={open ? "pf-rot" : ""} />
      </button>
      {open && (<div className="wc-group-body">
        <table className="wc-st"><thead><tr><th>#</th><th>Équipe</th><th>J</th><th>Pts</th><th>+/-</th><th>BP</th></tr></thead>
          <tbody>{table.map((r, i) => {
            const q = i < 2 ? "q" : (i === 2 && bestThirds.has(r.ti)) ? "q3" : "";
            return <tr key={r.ti} className={"wc-row-" + (q || "x")}><td>{i + 1}</td><td className="wc-tn"><span className="wc-flag">{POOL[r.ti].f}</span>{short(POOL[r.ti].n)}{q === "q" && <span className="wc-qb">Q</span>}{q === "q3" && <span className="wc-qb wc-qb3">3e</span>}</td><td>{r.gp}</td><td className="wc-pts">{r.pts}</td><td>{r.gd > 0 ? "+" + r.gd : r.gd}</td><td>{r.gf}</td></tr>;
          })}</tbody>
        </table>
        <div className="wc-edit">{[0,1,2,3].map((s) => (
          <div key={s} className="wc-editrow"><span className="wc-flag">{POOL[group[s]].f}</span>
            <select value={group[s]} onChange={(e) => onTeam(gi, s, Number(e.target.value))}>{POOL.map((t, i) => <option key={i} value={i}>{t.n}</option>)}</select>
          </div>))}</div>
        <div className="wc-matches">{GROUP_PAIRS.map(([x, y]) => {
          const id = "G" + LETTERS[gi] + "-" + x + "-" + y, r = results[id] || {};
          const ta = POOL[group[x]], tb = POOL[group[y]];
          const done = r.hg != null && r.ag != null;
          const p = !done ? predict(eff[group[x]], eff[group[y]], true) : null;
          return (<div key={id} className="wc-m">
            <div className="wc-mline"><span className="wc-mt">{ta.f} {short(ta.n)}</span>
              <span className="wc-mscore"><ScoreInput value={r.hg} onChange={(v) => onScore(id, "hg", v)} /><i>–</i><ScoreInput value={r.ag} onChange={(v) => onScore(id, "ag", v)} /></span>
              <span className="wc-mt wc-r">{short(tb.n)} {tb.f}</span></div>
            {p && <div className="wc-mp">modèle {pct(p.pH)} / {pct(p.pD)} / {pct(p.pA)} · score {p.score}</div>}
          </div>);
        })}</div>
      </div>)}
    </div>
  );
}
function KnockoutTie({ tie, eff, onPick }) {
  if (tie.a == null && tie.b == null) return null;
  const A = tie.a != null ? POOL[tie.a] : null, B = tie.b != null ? POOL[tie.b] : null;
  const pa = Math.round(tie.prob * 100), pb = 100 - pa;
  const sel = (ti) => tie.winner === ti;
  return (
    <div className="wc-tie">
      <button className={"wc-side " + (sel(tie.a) ? "wc-win" : "") + (tie.decided && !sel(tie.a) ? " wc-out" : "")} onClick={() => A && onPick(tie.id, tie.a)} disabled={!A}>
        <span className="wc-flag">{A ? A.f : "·"}</span><span className="wc-sn">{A ? short(A.n) : "—"}</span><span className="wc-sp">{A ? pa + "%" : ""}</span>
      </button>
      <button className={"wc-side " + (sel(tie.b) ? "wc-win" : "") + (tie.decided && !sel(tie.b) ? " wc-out" : "")} onClick={() => B && onPick(tie.id, tie.b)} disabled={!B}>
        <span className="wc-flag">{B ? B.f : "·"}</span><span className="wc-sn">{B ? short(B.n) : "—"}</span><span className="wc-sp">{B ? pb + "%" : ""}</span>
      </button>
      <span className={"wc-tag " + (tie.decided ? "wc-tag-real" : "wc-tag-proj")}>{tie.decided ? "réel" : "projeté"}</span>
    </div>
  );
}
function RoundBlock({ round, eff, onPick, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const names = { R32: "16es de finale (Round of 32)", R16: "8es de finale", QF: "Quarts de finale", SF: "Demi-finales", F: "Finale" };
  return (
    <div className="pf-card wc-round">
      <button className="wc-group-head" onClick={() => setOpen(!open)}><span className="wc-glabel">{names[round.name]}</span><ChevronDown size={16} className={open ? "pf-rot" : ""} /></button>
      {open && <div className="wc-ties">{round.ties.map((t) => <KnockoutTie key={t.id} tie={t} eff={eff} onPick={onPick} />)}</div>}
    </div>
  );
}
function WorldCupTab() {
  const [view, setView] = useState("groups");
  const [groups, setGroups] = useState(defaultGroups);
  const [results, setResults] = useState({});
  const [ko, setKo] = useState({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { (async () => {
    const g = await store.get("wc:groups"), r = await store.get("wc:results"), k = await store.get("wc:ko");
    if (g && g.length === 12) setGroups(g); if (r) setResults(r); if (k) setKo(k); setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) store.set("wc:groups", groups); }, [groups, loaded]);
  useEffect(() => { if (loaded) store.set("wc:results", results); }, [results, loaded]);
  useEffect(() => { if (loaded) store.set("wc:ko", ko); }, [ko, loaded]);

  const wc = useMemo(() => {
    const stats = tournamentStats(groups, results);
    const eff = effectivePool(stats);
    const tables = groups.map((g, gi) => groupTable(g, gi, results));
    const thirds = tables.map((t, gi) => ({ ...t[2], gi })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || POOL[b.ti].elo - POOL[a.ti].elo);
    const bestThirds = new Set(thirds.slice(0, 8).map((t) => t.ti));
    const qualifiers = [];
    tables.forEach((t) => { qualifiers.push(t[0]); qualifiers.push(t[1]); });
    thirds.slice(0, 8).forEach((t) => qualifiers.push(t.ti));
    const rank = qualifiers.map((ti) => { const row = tables.flat().find((r) => r.ti === ti); return { ti, ...row }; })
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || POOL[b.ti].elo - POOL[a.ti].elo).map((r) => r.ti);
    const rounds = buildKnockout(eff, rank, ko, results);
    const champion = rounds[4].ties[0].winner;
    return { eff, bestThirds, rounds, champion };
  }, [groups, results, ko]);

  const onTeam = (gi, s, val) => setGroups((p) => { const n = p.map((g) => [...g]); n[gi][s] = val; return n; });
  const onScore = (id, side, val) => setResults((p) => {
    const cur = { ...(p[id] || { hg: null, ag: null }) };
    cur[side] = val === "" ? null : Math.max(0, Math.min(20, parseInt(val, 10) || 0));
    const n = { ...p, [id]: cur };
    if (cur.hg == null && cur.ag == null) delete n[id];
    return n;
  });
  const onPick = (id, ti) => setKo((p) => { const n = { ...p }; if (n[id] === ti) delete n[id]; else n[id] = ti; return n; });
  const reset = () => { if (confirm("Effacer tous les scores et rétablir les groupes par défaut ?")) { setResults({}); setKo({}); setGroups(defaultGroups()); } };

  const champ = wc.champion != null ? POOL[wc.champion] : null;
  return (
    <>
      <div className="wc-subnav">
        <button className={view === "groups" ? "wc-sb on" : "wc-sb"} onClick={() => setView("groups")}><Layers size={15} /> Groupes</button>
        <button className={view === "bracket" ? "wc-sb on" : "wc-sb"} onClick={() => setView("bracket")}><Target size={15} /> Tableau final</button>
        <button className="wc-reset" onClick={reset} title="Réinitialiser"><RotateCcw size={15} /></button>
      </div>

      {champ && <div className="pf-card wc-champ"><Trophy size={20} /><div><div className="wc-champ-k">Vainqueur {wc.rounds[4].ties[0].decided ? "" : "projeté"}</div><div className="wc-champ-v">{champ.f} {champ.n}</div></div></div>}

      {view === "groups" ? (<>
        <div className="wc-hint">Saisis les scores réels au fil du tournoi : classements, qualifications et probabilités se recalculent automatiquement. <b>Groupes pré-remplis et éditables</b> — ajuste-les au tirage officiel.</div>
        {groups.map((g, gi) => <GroupCard key={gi} gi={gi} group={g} results={results} eff={wc.eff} bestThirds={wc.bestThirds} onTeam={onTeam} onScore={onScore} />)}
      </>) : (<>
        <div className="wc-hint">Tableau auto-alimenté par les classements. <b>Touche une équipe</b> pour la qualifier (gère prolongation/tirs au but). Tant que rien n'est saisi, le favori du modèle est affiché en « projeté ». Seeding simplifié par têtes de série (pas le slotting officiel FIFA).</div>
        {wc.rounds.map((r, i) => <RoundBlock key={r.name} round={r} eff={wc.eff} onPick={onPick} defaultOpen={i === 0} />)}
      </>)}
    </>
  );
}

/* ========================= Onglet LIVE (proxy temps réel) ========================= */
const LIVE_LEAGUES = [
  { id: 61, n: "Ligue 1 🇫🇷" },
  { id: 39, n: "Premier League 🏴" },
  { id: 140, n: "La Liga 🇪🇸" },
  { id: 135, n: "Serie A 🇮🇹" },
  { id: 78, n: "Bundesliga 🇩🇪" },
];
function LiveTab() {
  const [league, setLeague] = useState(61);
  const [season, setSeason] = useState(2023);
  const [teams, setTeams] = useState([]);
  const [a, setA] = useState(0), [b, setB] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [updated, setUpdated] = useState(null);
  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/stats?source=apifootball&league=" + league + "&season=" + season);
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("HTTP " + r.status)); }
      const d = await r.json();
      if (!d.teams || !d.teams.length) throw new Error("Aucune donnée (saison non couverte par le plan ?)");
      setTeams(d.teams); setUpdated(new Date()); setA(0); setB(Math.min(1, d.teams.length - 1));
    } catch (e) { setErr(String(e.message || e)); setTeams([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [league, season]);
  useEffect(() => { if (!teams.length) return; const t = setInterval(load, 600000); return () => clearInterval(t); }, [teams.length, league, season]);
  const ta = teams[a], tb = teams[b];
  const R = ta && tb && a !== b ? predict({ ...ta, form: [] }, { ...tb, form: [] }, true) : null;
  return (
    <>
      <section className="pf-card">
        <div className="pf-result-head"><Radio size={15} /> Forces calculées en direct</div>
        <div className="lv-ctrl">
          <select value={league} onChange={(e) => setLeague(Number(e.target.value))}>{LIVE_LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.n}</option>)}</select>
          <input className="lv-season" inputMode="numeric" value={season} onChange={(e) => setSeason(Number(e.target.value) || season)} />
          <button className="lv-refresh" onClick={load} disabled={loading}>{loading ? "…" : "↻"}</button>
        </div>
        <div className="lv-meta">{updated ? "MAJ " + updated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + " · cache 10 min" : "Chargement…"}</div>
        {err && <div className="lv-err">⚠️ {err}<br /><span>Le proxy <code>/api/stats</code> ne répond qu'une fois l'app déployée sur Vercel avec la clé API-Football configurée.</span></div>}
      </section>
      {teams.length > 0 && (<>
        <section className="pf-card">
          <div className="pf-result-head">Match (forces réelles)</div>
          <div className="lv-pick">
            <select value={a} onChange={(e) => setA(Number(e.target.value))}>{teams.map((t, i) => <option key={i} value={i}>{t.name}</option>)}</select>
            <span>vs</span>
            <select value={b} onChange={(e) => setB(Number(e.target.value))}>{teams.map((t, i) => <option key={i} value={i}>{t.name}</option>)}</select>
          </div>
          {R && (<><Bar pH={R.pH} pD={R.pD} pA={R.pA} />
            <div className="pf-tiles"><OutcomeTile label={"Victoire " + short(ta.name)} value={pct(R.pH)} kind="h" /><OutcomeTile label="Match nul" value={pct(R.pD)} kind="d" /><OutcomeTile label={"Victoire " + short(tb.name)} value={pct(R.pA)} kind="a" /></div>
            <div className="lv-meta">Score probable {R.score} · forces issues des stats réelles de la saison</div></>)}
        </section>
        <section className="pf-card">
          <div className="pf-result-head">Forces du championnat (live)</div>
          <table className="wc-st"><thead><tr><th>Équipe</th><th>J</th><th>Att</th><th>Déf</th></tr></thead>
            <tbody>{teams.map((t, i) => <tr key={i}><td className="wc-tn">{short(t.name)}</td><td>{t.matches}</td><td className="wc-pts">{t.att.toFixed(2)}</td><td>{t.def.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </section>
      </>)}
    </>
  );
}

/* ========================= App ========================= */
export default function App() {
  const [tab, setTab] = useState("match");
  return (
    <div className="pf-root">
      <style>{CSS}</style>
      <header className="pf-header">
        <div className="pf-brand">PRONOSTIC<span>FOOT</span></div>
        <div className="pf-sub">Modèle Elo + Poisson / Dixon-Coles · données d'exemple</div>
      </header>
      <nav className="pf-tabs">
        <button className={tab === "match" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("match")}>Match</button>
        <button className={tab === "cdm" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("cdm")}>Coupe du Monde 2026</button>
        <button className={tab === "live" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("live")}>Live</button>
      </nav>
      <main className="pf-main">
        {tab === "match" ? <MatchTab /> : tab === "cdm" ? <WorldCupTab /> : <LiveTab />}
        <footer className="pf-footer"><ShieldAlert size={14} /><span>Outil d'analyse pédagogique. Les paris comportent un risque de perte ; aucun modèle ne garantit de gain. Jeu excessif : <b>09 74 75 13 13</b> (Joueurs Info Service, appel non surtaxé).</span></footer>
      </main>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700;800&family=Saira:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.pf-root{--bg:#0b0d10;--card:#15181d;--line:rgba(255,255,255,.07);--txt:#eef1f4;--dim:#8a93a0;--lime:#c8ff42;--cyan:#46d3ff;--grey:#7d8794;--amber:#ffba3a;--red:#ff5a5a;min-height:100vh;margin:0;color:var(--txt);font-family:'Saira',system-ui,sans-serif;background:radial-gradient(900px 500px at 80% -10%,rgba(200,255,66,.10),transparent 60%),radial-gradient(700px 500px at -10% 10%,rgba(70,211,255,.08),transparent 55%),var(--bg);background-attachment:fixed;}
.pf-header{padding:24px 18px 10px;max-width:560px;margin:0 auto;}
.pf-brand{font-family:'Saira Condensed';font-weight:800;font-size:33px;letter-spacing:.04em;line-height:.95;text-transform:uppercase;}
.pf-brand span{color:var(--lime);}
.pf-sub{color:var(--dim);font-size:12.5px;margin-top:4px;}
.pf-tabs{max-width:560px;margin:6px auto 0;padding:0 14px;display:flex;gap:8px;}
.pf-tab{flex:1;background:var(--card);border:1px solid var(--line);color:var(--dim);font-family:'Saira Condensed';font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;padding:11px 8px;border-radius:12px;cursor:pointer;transition:.15s;}
.pf-tab.on{color:#0b0d10;background:var(--lime);border-color:var(--lime);}
.pf-main{max-width:560px;margin:0 auto;padding:12px 14px 40px;display:flex;flex-direction:column;gap:12px;}
.pf-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 18px 40px -28px rgba(0,0,0,.9);animation:rise .35s ease both;}
@keyframes rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
.pf-match{display:grid;grid-template-columns:1fr;gap:12px;}
.pf-team-tag{font-family:'Saira Condensed';font-weight:700;font-size:11px;letter-spacing:.16em;color:var(--dim);text-transform:uppercase;margin-bottom:6px;}
.pf-select-wrap{position:relative;display:flex;align-items:center;background:#0e1116;border:1px solid var(--line);border-radius:13px;padding:0 10px;}
.pf-flag{font-size:22px;margin-right:6px;}
.pf-select{appearance:none;-webkit-appearance:none;background:transparent;border:0;color:var(--txt);font-family:'Saira Condensed';font-weight:700;font-size:21px;padding:13px 24px 13px 2px;width:100%;outline:none;text-transform:uppercase;}
.pf-select option{background:#15181d;color:#fff;text-transform:none;}
.pf-chev{position:absolute;right:10px;color:var(--dim);pointer-events:none;}
.pf-team-meta{display:flex;align-items:center;justify-content:space-between;margin-top:7px;padding:0 2px;}
.pf-elo{font-family:'JetBrains Mono';font-size:11px;color:var(--dim);}
.pf-form{display:flex;gap:4px;}
.pf-pill{width:18px;height:18px;border-radius:5px;font-family:'JetBrains Mono';font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.pf-pill.pf-W{background:var(--lime);color:#0b0d10;}.pf-pill.pf-L{background:var(--red);color:#fff;}.pf-pill.pf-D{background:#4a525e;color:#fff;}
.pf-swap{justify-self:center;background:#0e1116;border:1px solid var(--line);color:var(--lime);width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s;margin:-4px 0;}
.pf-swap:active{transform:rotate(180deg) scale(.92);}
.pf-neutral{display:flex;align-items:center;gap:9px;color:var(--dim);font-size:13.5px;cursor:pointer;}
.pf-neutral input{width:17px;height:17px;accent-color:var(--lime);}
.pf-warn{color:var(--amber);font-size:13.5px;text-align:center;padding:4px;}
.pf-result-head,.pf-odds-head{font-family:'Saira Condensed';font-weight:700;font-size:12px;letter-spacing:.16em;color:var(--dim);text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:7px;}
.pf-odds-head span{font-family:'Saira';letter-spacing:0;text-transform:none;font-size:11px;opacity:.7;}
.pf-bar{display:flex;height:13px;border-radius:7px;overflow:hidden;background:#0e1116;margin-bottom:14px;}
.pf-seg{height:100%;transition:width .5s cubic-bezier(.4,0,.2,1);}
.pf-seg-h{background:var(--lime);}.pf-seg-d{background:var(--grey);}.pf-seg-a{background:var(--cyan);}
.pf-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;}
.pf-tile{background:#0e1116;border:1px solid var(--line);border-radius:13px;padding:12px 8px;text-align:center;}
.pf-tile-label{font-size:11px;color:var(--dim);min-height:28px;display:flex;align-items:center;justify-content:center;line-height:1.15;}
.pf-tile-val{font-family:'JetBrains Mono';font-weight:700;font-size:24px;margin-top:4px;}
.pf-pctsign{font-size:13px;color:var(--dim);margin-left:1px;}
.pf-tile-h{border-color:rgba(200,255,66,.35);}.pf-tile-h .pf-tile-val{color:var(--lime);}
.pf-tile-d .pf-tile-val{color:#c4cbd4;}
.pf-tile-a{border-color:rgba(70,211,255,.3);}.pf-tile-a .pf-tile-val{color:var(--cyan);}
.pf-stats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);padding:1px;}
.pf-stat{background:var(--card);padding:14px;}
.pf-stat-k{font-size:11.5px;color:var(--dim);}
.pf-stat-v{font-family:'JetBrains Mono';font-weight:700;font-size:22px;margin-top:3px;}
.pf-accent{color:var(--lime);}
.pf-stat-x{font-size:10.5px;color:var(--dim);font-family:'JetBrains Mono';}
.pf-odds-inputs{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px;}
.pf-odds-inputs label{font-family:'Saira Condensed';font-weight:700;font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:5px;text-align:center;}
.pf-odds-inputs input{background:#0e1116;border:1px solid var(--line);border-radius:11px;color:var(--txt);font-family:'JetBrains Mono';font-size:17px;font-weight:700;text-align:center;padding:11px 6px;outline:none;}
.pf-odds-inputs input:focus{border-color:var(--lime);}
.pf-odds-hint,.wc-hint{color:var(--dim);font-size:12.5px;line-height:1.5;}
.wc-hint{padding:2px 4px 2px;}.wc-hint b{color:var(--txt);}
.pf-edges{display:flex;flex-direction:column;gap:8px;}
.pf-edge{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;background:#0e1116;border:1px solid var(--line);border-radius:11px;padding:10px 12px;}
.pf-edge-label{font-weight:600;font-size:13.5px;}
.pf-edge-nums{display:flex;gap:10px;font-family:'JetBrains Mono';font-size:11px;color:var(--dim);}
.pf-edge-badge{grid-row:1/3;grid-column:2;font-family:'JetBrains Mono';font-weight:700;font-size:12px;padding:6px 9px;border-radius:9px;white-space:nowrap;}
.pf-val{background:rgba(200,255,66,.14);color:var(--lime);}.pf-neg{background:rgba(255,90,90,.13);color:var(--red);}.pf-neu{background:#1b1f25;color:var(--dim);}
.pf-margin{font-family:'JetBrains Mono';font-size:11px;color:var(--dim);text-align:right;}
.pf-fold{padding:0;overflow:hidden;}
.pf-fold-btn{width:100%;background:transparent;border:0;color:var(--txt);padding:15px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:'Saira';font-size:14px;font-weight:600;}
.pf-fold-btn span{display:flex;align-items:center;gap:9px;color:var(--lime);}
.pf-rot{transform:rotate(180deg);}
.pf-fold-body{padding:0 16px 16px;color:var(--dim);font-size:13.5px;line-height:1.55;}
.pf-fold-body p{margin:0 0 9px;}.pf-fold-body b{color:var(--txt);}.pf-fold-body code{font-family:'JetBrains Mono';font-size:12px;background:#0e1116;padding:1px 6px;border-radius:5px;color:var(--lime);}
.pf-footer{display:flex;gap:9px;align-items:flex-start;color:var(--dim);font-size:11.5px;line-height:1.5;padding:8px 4px 0;}
.pf-footer svg{flex-shrink:0;margin-top:1px;color:var(--amber);}
.pf-footer b{color:var(--txt);font-family:'JetBrains Mono';}
/* world cup */
.wc-subnav{display:flex;gap:8px;align-items:stretch;}
.wc-sb{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--card);border:1px solid var(--line);color:var(--dim);font-weight:600;font-size:13.5px;padding:10px;border-radius:12px;cursor:pointer;}
.wc-sb.on{color:#0b0d10;background:var(--cyan);border-color:var(--cyan);}
.wc-reset{background:var(--card);border:1px solid var(--line);color:var(--dim);width:42px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.wc-champ{display:flex;align-items:center;gap:13px;border-color:rgba(255,186,58,.4);background:linear-gradient(120deg,rgba(255,186,58,.10),var(--card));}
.wc-champ svg{color:var(--amber);}
.wc-champ-k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);}
.wc-champ-v{font-family:'Saira Condensed';font-weight:800;font-size:25px;text-transform:uppercase;}
.wc-group,.wc-round{padding:0;overflow:hidden;}
.wc-group-head{width:100%;background:transparent;border:0;color:var(--txt);padding:13px 15px;display:flex;align-items:center;gap:10px;cursor:pointer;}
.wc-glabel{font-family:'Saira Condensed';font-weight:700;font-size:16px;letter-spacing:.04em;text-transform:uppercase;flex:1;text-align:left;}
.wc-gprog{font-family:'JetBrains Mono';font-size:11px;color:var(--dim);}
.wc-group-body{padding:0 13px 14px;}
.wc-st{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:12px;}
.wc-st th{font-family:'Saira Condensed';font-weight:600;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);text-align:center;padding:4px 3px;border-bottom:1px solid var(--line);}
.wc-st th:nth-child(2){text-align:left;}
.wc-st td{text-align:center;padding:6px 3px;border-bottom:1px solid rgba(255,255,255,.04);font-family:'JetBrains Mono';}
.wc-tn{text-align:left!important;font-family:'Saira'!important;font-weight:600;display:flex;align-items:center;gap:6px;}
.wc-flag{font-size:16px;}
.wc-pts{color:var(--txt);font-weight:700;}
.wc-row-q td{color:#dfeecf;}.wc-row-q .wc-pts{color:var(--lime);}
.wc-row-q3 .wc-pts{color:var(--amber);}
.wc-qb{font-family:'Saira Condensed';font-size:9px;font-weight:700;background:var(--lime);color:#0b0d10;border-radius:4px;padding:1px 4px;margin-left:3px;}
.wc-qb3{background:var(--amber);}
.wc-edit{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;}
.wc-editrow{display:flex;align-items:center;gap:5px;background:#0e1116;border:1px solid var(--line);border-radius:9px;padding:4px 7px;}
.wc-editrow select{appearance:none;-webkit-appearance:none;background:transparent;border:0;color:var(--txt);font-size:12px;width:100%;outline:none;}
.wc-editrow select option{background:#15181d;}
.wc-matches{display:flex;flex-direction:column;gap:7px;}
.wc-m{background:#0e1116;border:1px solid var(--line);border-radius:10px;padding:8px 10px;}
.wc-mline{display:flex;align-items:center;gap:8px;}
.wc-mt{flex:1;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wc-r{text-align:right;}
.wc-mscore{display:flex;align-items:center;gap:5px;}
.wc-mscore i{color:var(--dim);font-style:normal;}
.wc-score{width:34px;height:32px;background:#15181d;border:1px solid var(--line);border-radius:8px;color:var(--txt);font-family:'JetBrains Mono';font-weight:700;font-size:16px;text-align:center;outline:none;}
.wc-score:focus{border-color:var(--cyan);}
.wc-mp{font-family:'JetBrains Mono';font-size:10px;color:var(--dim);margin-top:5px;text-align:center;}
.wc-ties{padding:6px 13px 14px;display:flex;flex-direction:column;gap:8px;}
.wc-tie{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.wc-side{display:flex;align-items:center;gap:7px;background:#0e1116;border:1px solid var(--line);border-radius:10px;padding:9px 10px;cursor:pointer;color:var(--txt);text-align:left;}
.wc-side:disabled{opacity:.4;}
.wc-sn{flex:1;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wc-sp{font-family:'JetBrains Mono';font-size:11px;color:var(--dim);}
.wc-win{border-color:var(--cyan);background:rgba(70,211,255,.12);}
.wc-win .wc-sp{color:var(--cyan);}
.wc-out{opacity:.5;}
.wc-tag{position:absolute;top:-7px;right:8px;font-size:9px;font-family:'Saira Condensed';font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:5px;}
.wc-tag-real{background:var(--cyan);color:#0b0d10;}
.wc-tag-proj{background:#1b1f25;color:var(--dim);border:1px solid var(--line);}
/* live */
.lv-ctrl{display:flex;gap:8px;margin-bottom:8px;}
.lv-ctrl select{flex:1;background:#0e1116;border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:11px;font-size:13px;}
.lv-season{width:78px;background:#0e1116;border:1px solid var(--line);border-radius:10px;color:var(--txt);text-align:center;font-family:'JetBrains Mono';font-weight:700;outline:none;}
.lv-refresh{width:46px;background:var(--cyan);border:0;border-radius:10px;color:#0b0d10;font-weight:700;font-size:17px;cursor:pointer;}
.lv-meta{font-family:'JetBrains Mono';font-size:11px;color:var(--dim);}
.lv-err{margin-top:10px;background:rgba(255,90,90,.1);border:1px solid rgba(255,90,90,.3);border-radius:10px;padding:11px;font-size:12.5px;color:#ffd1d1;line-height:1.5;}
.lv-err span{color:var(--dim);}.lv-err code{font-family:'JetBrains Mono';color:var(--cyan);}
.lv-pick{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
.lv-pick select{flex:1;background:#0e1116;border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:11px;font-size:13px;}
.lv-pick span{color:var(--dim);font-size:12px;}
`;
