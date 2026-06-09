import React, { useState, useMemo, useEffect } from "react";
import { ArrowLeftRight, ChevronDown, Info, Plug, ShieldAlert, TrendingUp, Trophy, RotateCcw, Target, Layers, Radio, Users } from "lucide-react";

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
const FORM_DECAY = 0.75;
const WC_AVG = 1.18;
const LEAGUE_GOALS_AVG = { PL: 1.38, PD: 1.30, BL1: 1.57, SA: 1.28, FL1: 1.35, CL: 1.40, DED: 1.45, PPL: 1.32, WC: 1.18, EC: 1.20 };
const LETTERS = "ABCDEFGHIJKL".split("");
const GROUP_PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

/* Les 48 équipes RÉELLEMENT qualifiées pour la Coupe du Monde 2026.
 * Ratings att/def illustratifs (par niveau) ; ils se recalibrent dès que tu
 * saisis de vrais scores ou via l'onglet Live. */
const POOL = [
  { n: "Argentine", f: "🇦🇷", elo: 2090, att: 1.38, def: 0.74 },
  { n: "France", f: "🇫🇷", elo: 2085, att: 1.40, def: 0.74 },
  { n: "Espagne", f: "🇪🇸", elo: 2075, att: 1.42, def: 0.76 },
  { n: "Brésil", f: "🇧🇷", elo: 2060, att: 1.40, def: 0.80 },
  { n: "Angleterre", f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 2035, att: 1.34, def: 0.74 },
  { n: "Portugal", f: "🇵🇹", elo: 2030, att: 1.40, def: 0.82 },
  { n: "Allemagne", f: "🇩🇪", elo: 1990, att: 1.34, def: 0.86 },
  { n: "Pays-Bas", f: "🇳🇱", elo: 1985, att: 1.32, def: 0.84 },
  { n: "Belgique", f: "🇧🇪", elo: 1955, att: 1.30, def: 0.90 },
  { n: "Croatie", f: "🇭🇷", elo: 1940, att: 1.18, def: 0.86 },
  { n: "Uruguay", f: "🇺🇾", elo: 1930, att: 1.22, def: 0.84 },
  { n: "Colombie", f: "🇨🇴", elo: 1900, att: 1.20, def: 0.86 },
  { n: "Maroc", f: "🇲🇦", elo: 1885, att: 1.16, def: 0.80 },
  { n: "Norvège", f: "🇳🇴", elo: 1865, att: 1.30, def: 0.92 },
  { n: "Sénégal", f: "🇸🇳", elo: 1850, att: 1.18, def: 0.84 },
  { n: "Suisse", f: "🇨🇭", elo: 1840, att: 1.10, def: 0.86 },
  { n: "Japon", f: "🇯🇵", elo: 1835, att: 1.20, def: 0.88 },
  { n: "Autriche", f: "🇦🇹", elo: 1830, att: 1.18, def: 0.90 },
  { n: "Équateur", f: "🇪🇨", elo: 1820, att: 1.10, def: 0.84 },
  { n: "Turquie", f: "🇹🇷", elo: 1815, att: 1.20, def: 0.92 },
  { n: "Mexique", f: "🇲🇽", elo: 1810, att: 1.16, def: 0.92 },
  { n: "Tchéquie", f: "🇨🇿", elo: 1800, att: 1.14, def: 0.90 },
  { n: "États-Unis", f: "🇺🇸", elo: 1800, att: 1.16, def: 0.92 },
  { n: "Corée du Sud", f: "🇰🇷", elo: 1790, att: 1.14, def: 0.90 },
  { n: "Suède", f: "🇸🇪", elo: 1785, att: 1.18, def: 0.92 },
  { n: "Côte d'Ivoire", f: "🇨🇮", elo: 1775, att: 1.14, def: 0.90 },
  { n: "Canada", f: "🇨🇦", elo: 1770, att: 1.14, def: 0.92 },
  { n: "Algérie", f: "🇩🇿", elo: 1770, att: 1.16, def: 0.90 },
  { n: "Iran", f: "🇮🇷", elo: 1760, att: 1.06, def: 0.86 },
  { n: "Égypte", f: "🇪🇬", elo: 1760, att: 1.10, def: 0.90 },
  { n: "Écosse", f: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", elo: 1760, att: 1.10, def: 0.90 },
  { n: "RD Congo", f: "🇨🇩", elo: 1730, att: 1.14, def: 0.94 },
  { n: "Ghana", f: "🇬🇭", elo: 1730, att: 1.12, def: 0.96 },
  { n: "Paraguay", f: "🇵🇾", elo: 1740, att: 1.04, def: 0.92 },
  { n: "Australie", f: "🇦🇺", elo: 1720, att: 1.04, def: 0.96 },
  { n: "Afrique du Sud", f: "🇿🇦", elo: 1720, att: 1.08, def: 0.92 },
  { n: "Bosnie-Herzégovine", f: "🇧🇦", elo: 1720, att: 1.12, def: 0.94 },
  { n: "Tunisie", f: "🇹🇳", elo: 1710, att: 1.02, def: 0.90 },
  { n: "Ouzbékistan", f: "🇺🇿", elo: 1680, att: 1.04, def: 0.94 },
  { n: "Panama", f: "🇵🇦", elo: 1670, att: 1.02, def: 0.98 },
  { n: "Qatar", f: "🇶🇦", elo: 1665, att: 0.98, def: 1.00 },
  { n: "Arabie saoudite", f: "🇸🇦", elo: 1660, att: 0.98, def: 0.98 },
  { n: "Jordanie", f: "🇯🇴", elo: 1660, att: 1.00, def: 0.94 },
  { n: "Irak", f: "🇮🇶", elo: 1650, att: 0.98, def: 0.96 },
  { n: "Cap-Vert", f: "🇨🇻", elo: 1640, att: 1.02, def: 0.98 },
  { n: "Haïti", f: "🇭🇹", elo: 1600, att: 0.96, def: 1.02 },
  { n: "Curaçao", f: "🇨🇼", elo: 1580, att: 0.92, def: 1.04 },
  { n: "Nouvelle-Zélande", f: "🇳🇿", elo: 1560, att: 0.92, def: 1.06 },
];

/* Tirage OFFICIEL de la Coupe du Monde 2026 (groupes A à L). */
const GROUPS_2026 = [
  ["Mexique", "Corée du Sud", "Afrique du Sud", "Tchéquie"],
  ["Canada", "Suisse", "Qatar", "Bosnie-Herzégovine"],
  ["Brésil", "Maroc", "Écosse", "Haïti"],
  ["États-Unis", "Paraguay", "Australie", "Turquie"],
  ["Allemagne", "Équateur", "Côte d'Ivoire", "Curaçao"],
  ["Pays-Bas", "Japon", "Tunisie", "Suède"],
  ["Belgique", "Iran", "Égypte", "Nouvelle-Zélande"],
  ["Espagne", "Uruguay", "Arabie saoudite", "Cap-Vert"],
  ["France", "Sénégal", "Norvège", "Irak"],
  ["Argentine", "Autriche", "Algérie", "Jordanie"],
  ["Portugal", "Colombie", "Ouzbékistan", "RD Congo"],
  ["Angleterre", "Croatie", "Panama", "Ghana"],
];

/* ---------- maths ---------- */
function factorial(k) { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; }
function poisson(k, l) { return (Math.exp(-l) * Math.pow(l, k)) / factorial(k); }
function formScore(form) {
  if (!form || !form.length) return 0;
  let sum = 0, w = 0;
  form.forEach((r, i) => { const wi = Math.pow(FORM_DECAY, form.length - 1 - i); sum += (r === "W" ? 1 : r === "L" ? -1 : 0) * wi; w += wi; });
  return w ? sum / w : 0;
}
function dcTau(i, j, lh, la) {
  if (i === 0 && j === 0) return 1 - lh * la * RHO;
  if (i === 0 && j === 1) return 1 + lh * RHO;
  if (i === 1 && j === 0) return 1 + la * RHO;
  if (i === 1 && j === 1) return 1 - RHO;
  return 1;
}
function predict(home, away, neutral, leagueAvg = BASE_GOALS) {
  const fh = formScore(home.form), fa = formScore(away.form);
  const attH = home.att * (1 + 0.08 * fh), defH = home.def * (1 - 0.05 * fh);
  const attA = away.att * (1 + 0.08 * fa), defA = away.def * (1 - 0.05 * fa);
  let lh = leagueAvg * attH * defA, la = leagueAvg * attA * defH;
  if (!neutral) { lh *= HOME_MULT; la *= AWAY_MULT; }
  // Une seule distribution : produit de deux Poisson sur les buts attendus (xG).
  // Tout (1/N/2, +2,5, BTTS, scores) en découle -> cohérent, sans biais 1-1.
  let pH = 0, pD = 0, pA = 0, over25 = 0, btts = 0;
  const scores = [];
  let bH = { s: "", p: 0 }, bD = { s: "", p: 0 }, bA = { s: "", p: 0 };
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = poisson(i, lh) * poisson(j, la);
    if (i > j) { pH += p; if (p > bH.p) bH = { s: i + "–" + j, p }; }
    else if (i === j) { pD += p; if (p > bD.p) bD = { s: i + "–" + j, p }; }
    else { pA += p; if (p > bA.p) bA = { s: i + "–" + j, p }; }
    if (i + j >= 3) over25 += p; if (i >= 1 && j >= 1) btts += p;
    if (i <= 6 && j <= 6) scores.push({ s: i + "–" + j, p });
  }
  const total = pH + pD + pA || 1;
  pH /= total; pD /= total; pA /= total; over25 /= total; btts /= total;
  scores.forEach((s) => (s.p /= total)); bH.p /= total; bD.p /= total; bA.p /= total;
  scores.sort((a, b) => b.p - a.p);
  const topScores = scores.slice(0, 6);
  return { lh, la, pH, pD, pA, over25, btts, score: topScores[0].s, scoreP: topScores[0].p, topScores, topHome: bH, topDraw: bD, topAway: bA };
}
// Match à élimination directe : prolongation (30') puis tirs au but si nul après 90'.
function predictKnockout(home, away, leagueAvg = BASE_GOALS) {
  const base = predict(home, away, true, leagueAvg);
  const lhE = base.lh / 3, laE = base.la / 3; // ~30 min = 1/3 de match
  let etA = 0, etB = 0, etD = 0;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const p = poisson(i, lhE) * poisson(j, laE);
    if (i > j) etA += p; else if (i < j) etB += p; else etD += p;
  }
  const denom = base.pH + base.pA || 1;
  const penA = 0.5 * 0.6 + (base.pH / denom) * 0.4; // t.a.b. ~50/50, léger avantage au plus fort
  const regA = base.pH, regB = base.pA, drawMass = base.pD;
  const etAm = drawMass * etA, etBm = drawMass * etB, penMass = drawMass * etD;
  const penAm = penMass * penA, penBm = penMass * (1 - penA);
  return {
    regA, regB, etA: etAm, etB: etBm, penA: penAm, penB: penBm,
    advA: regA + etAm + penAm, advB: regB + etBm + penBm,
  };
}
function twoWay(p) { const d = p.pH + p.pA || 1; return { a: p.pH + p.pD * p.pH / d, b: p.pA + p.pD * p.pA / d }; }
function parseForm(s) { return s ? String(s).split(/[^WDL]+/).filter(Boolean).slice(-5) : []; }
function blendProbs(base, emp, w) {
  const pH = base.pH * (1 - w) + emp.pH * w, pD = base.pD * (1 - w) + emp.pD * w, pA = base.pA * (1 - w) + emp.pA * w;
  const s = pH + pD + pA || 1;
  return { ...base, pH: pH / s, pD: pD / s, pA: pA / s };
}
function h2hEmpirical(homeName, meetings) {
  let hw = 0, d = 0, aw = 0, n = 0;
  for (const m of meetings) {
    if (m.homeGoals == null || m.awayGoals == null) continue;
    const first = m.homeTeam === homeName, second = m.awayTeam === homeName;
    if (!first && !second) continue;
    n++;
    const gf = first ? m.homeGoals : m.awayGoals, ga = first ? m.awayGoals : m.homeGoals;
    if (gf > ga) hw++; else if (gf < ga) aw++; else d++;
  }
  return n ? { n, pH: hw / n, pD: d / n, pA: aw / n } : null;
}
// 1/N/2 enrichi : forces de la saison + forme récente (via predict) + confrontations directes.
function predictWithHistory(home, away, meetings, leagueAvg = BASE_GOALS) {
  const base = predict(home, away, true, leagueAvg);
  const emp = meetings && meetings.length ? h2hEmpirical(home.name, meetings) : null;
  if (!emp || emp.n < 3) return { R: base, h2hN: emp ? emp.n : 0, w: 0 };
  const w = Math.min(0.22, emp.n * 0.035); // poids croissant, plafonné (le H2H reste peu fiable)
  return { R: blendProbs(base, emp, w), h2hN: emp.n, w };
}
function parseOdds(s) { const v = parseFloat(String(s).replace(",", ".")); return v > 1 ? v : null; }
function fairProbs(o1, ox, o2) { const a = parseOdds(o1), b = parseOdds(ox), c = parseOdds(o2); if (!a || !b || !c) return null; const i1 = 1/a, ix = 1/b, i2 = 1/c, s = i1+ix+i2; return { p1: i1/s, px: ix/s, p2: i2/s, margin: s-1 }; }
const pct = (x) => (x * 100).toFixed(1);
const short = (n) => n.length > 11 ? n.slice(0, 10) + "." : n;
const normName = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(fc|cf|afc|ac|ssc|rc|as|sc|cd|ca|sv|bk)\b/g, "").replace(/[^a-z]/g, "");

/* ---------- tournoi ---------- */
function defaultGroups() {
  const idxOf = (name) => POOL.findIndex((t) => t.n === name);
  return GROUPS_2026.map((g) => g.map(idxOf));
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
function buildKnockout(eff, qualRanked, ko, results, leagueAvg = BASE_GOALS) {
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
      let prob = 0.5, winner = null, decided = false, kb = null;
      if (a != null && b != null) {
        kb = predictKnockout(eff[a], eff[b], leagueAvg);
        prob = kb.advA;
        const m = ko[id], sc = results[id];
        if (m != null) { winner = m; decided = true; }
        else if (sc && sc.hg != null && sc.ag != null && sc.hg !== sc.ag) { winner = sc.hg > sc.ag ? a : b; decided = true; }
        else winner = prob >= 0.5 ? a : b;
      } else winner = a != null ? a : b;
      out.ties.push({ id, a, b, prob, winner, decided, kb });
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
        <section className="pf-card">
          <div className="pf-result-head">Scores les plus probables</div>
          <div className="pf-scores">{R.topScores.map((s, i) => (
            <div key={i} className={"pf-scell" + (i === 0 ? " pf-scell-top" : "")}>
              <div className="pf-scell-s">{s.s}</div><div className="pf-scell-p">{pct(s.p)}%</div>
            </div>))}</div>
          <div className="pf-byout">
            <div className="pf-bo"><span className="pf-bo-k">Si victoire {short(home.n)}</span><span className="pf-bo-v pf-bo-h">{R.topHome.s} <i>{pct(R.topHome.p)}%</i></span></div>
            <div className="pf-bo"><span className="pf-bo-k">Si match nul</span><span className="pf-bo-v">{R.topDraw.s} <i>{pct(R.topDraw.p)}%</i></span></div>
            <div className="pf-bo"><span className="pf-bo-k">Si victoire {short(away.n)}</span><span className="pf-bo-v pf-bo-a">{R.topAway.s} <i>{pct(R.topAway.p)}%</i></span></div>
          </div>
          <div className="pf-scores-note">Tout est calculé à partir des buts attendus (xG) : 1/N/2, +2,5 buts et scores proviennent de la même distribution. Pour deux équipes proches, 1-0 / 1-1 restent les scores exacts les plus fréquents — c'est le foot réel ; le détail par issue ci-dessus fait ressortir les autres scores.</div>
        </section>
        <section className="pf-card pf-stats">
          <div className="pf-stat"><div className="pf-stat-k">Buts attendus (xG)</div><div className="pf-stat-v pf-accent">{R.lh.toFixed(2)} – {R.la.toFixed(2)}</div><div className="pf-stat-x">dom. – ext.</div></div>
          <div className="pf-stat"><div className="pf-stat-k">Total de buts attendu</div><div className="pf-stat-v">{(R.lh + R.la).toFixed(2)}</div></div>
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
          const p = !done ? predict(eff[group[x]], eff[group[y]], true, WC_AVG) : null;
          return (<div key={id} className="wc-m">
            <div className="wc-mline"><span className="wc-mt">{ta.f} {short(ta.n)}</span>
              <span className="wc-mscore"><ScoreInput value={r.hg} onChange={(v) => onScore(id, "hg", v)} /><i>–</i><ScoreInput value={r.ag} onChange={(v) => onScore(id, "ag", v)} /></span>
              <span className="wc-mt wc-r">{short(tb.n)} {tb.f}</span></div>
            {p && <div className="wc-mp">1/N/2 : {pct(p.pH)} / {pct(p.pD)} / {pct(p.pA)}</div>}
            {p && <div className="wc-mscores">{p.topScores.slice(0, 3).map((s, k) => (
              <span key={k} className={"wc-sc" + (k === 0 ? " wc-sc-top" : "")}>{s.s} <b>{pct(s.p)}%</b></span>))}</div>}
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
  const kb = tie.kb;
  let bd = null;
  if (kb && A && B) {
    const favA = kb.advA >= kb.advB, fav = favA ? A : B;
    bd = { fav, advP: favA ? kb.advA : kb.advB, reg: favA ? kb.regA : kb.regB, et: favA ? kb.etA : kb.etB, pen: favA ? kb.penA : kb.penB };
  }
  return (
    <div className="wc-tie">
      <div className="wc-tie-sides">
        <button className={"wc-side " + (sel(tie.a) ? "wc-win" : "") + (tie.decided && !sel(tie.a) ? " wc-out" : "")} onClick={() => A && onPick(tie.id, tie.a)} disabled={!A}>
          <span className="wc-flag">{A ? A.f : "·"}</span><span className="wc-sn">{A ? short(A.n) : "—"}</span><span className="wc-sp">{A ? pa + "%" : ""}</span>
        </button>
        <button className={"wc-side " + (sel(tie.b) ? "wc-win" : "") + (tie.decided && !sel(tie.b) ? " wc-out" : "")} onClick={() => B && onPick(tie.id, tie.b)} disabled={!B}>
          <span className="wc-flag">{B ? B.f : "·"}</span><span className="wc-sn">{B ? short(B.n) : "—"}</span><span className="wc-sp">{B ? pb + "%" : ""}</span>
        </button>
      </div>
      {bd && !tie.decided && <div className="wc-kb">{short(bd.fav.n)} qualif. <b>{pct(bd.advP)}%</b> · 90′ {pct(bd.reg)}% · prol. {pct(bd.et)}% · t.a.b. {pct(bd.pen)}%</div>}
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
    const g = await store.get("wc:groups:v2"), r = await store.get("wc:results:v2"), k = await store.get("wc:ko:v2");
    if (g && g.length === 12) setGroups(g); if (r) setResults(r); if (k) setKo(k); setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) store.set("wc:groups:v2", groups); }, [groups, loaded]);
  useEffect(() => { if (loaded) store.set("wc:results:v2", results); }, [results, loaded]);
  useEffect(() => { if (loaded) store.set("wc:ko:v2", ko); }, [ko, loaded]);

  const wc = useMemo(() => {
    const stats = tournamentStats(groups, results);
    const eff = effectivePool(stats);
    const tables = groups.map((g, gi) => groupTable(g, gi, results));
    const thirds = tables.map((t, gi) => ({ ...t[2], gi })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || POOL[b.ti].elo - POOL[a.ti].elo);
    const bestThirds = new Set(thirds.slice(0, 8).map((t) => t.ti));
    // Lignes des qualifiés (objets {ti,pts,gd,gf}) — 2 par groupe + 8 meilleurs 3es.
    const qualRows = [];
    tables.forEach((t) => { qualRows.push(t[0], t[1]); });
    thirds.slice(0, 8).forEach((th) => qualRows.push(th));
    const rank = [...qualRows]
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || POOL[b.ti].elo - POOL[a.ti].elo)
      .map((r) => r.ti);
    const rounds = buildKnockout(eff, rank, ko, results, WC_AVG);
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
/* Source : football-data.org -> saison EN COURS (gratuite, toujours à jour).
 * Codes de compétitions football-data.org. */
const LIVE_LEAGUES = [
  { code: "FL1", n: "Ligue 1 🇫🇷" },
  { code: "PL", n: "Premier League 🏴" },
  { code: "PD", n: "La Liga 🇪🇸" },
  { code: "SA", n: "Serie A 🇮🇹" },
  { code: "BL1", n: "Bundesliga 🇩🇪" },
  { code: "PPL", n: "Primeira Liga 🇵🇹" },
  { code: "DED", n: "Eredivisie 🇳🇱" },
  { code: "CL", n: "Ligue des Champions 🏆" },
];
/* Pour l'onglet Buteurs : clubs + sélections nationales (football-data.org). */
const SCORER_LEAGUES = [
  { code: "WC", n: "Coupe du Monde 2026 🌍" },
  { code: "EC", n: "Euro (sélections) 🇪🇺" },
  { code: "FL1", n: "Ligue 1 🇫🇷" },
  { code: "PL", n: "Premier League 🏴" },
  { code: "PD", n: "La Liga 🇪🇸" },
  { code: "SA", n: "Serie A 🇮🇹" },
  { code: "BL1", n: "Bundesliga 🇩🇪" },
  { code: "CL", n: "Ligue des Champions 🏆" },
];
function LiveTab() {
  const [league, setLeague] = useState("FL1");
  const [teams, setTeams] = useState([]);
  const [a, setA] = useState(0), [b, setB] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [xgOn, setXgOn] = useState(false);
  const [leagueAvg, setLeagueAvg] = useState(BASE_GOALS);
  const load = async () => {
    setLoading(true); setErr(null);
    setLeagueAvg(LEAGUE_GOALS_AVG[league] || BASE_GOALS);
    try {
      // pas de paramètre season -> football-data.org renvoie la saison EN COURS
      const r = await fetch("/api/stats?source=footballdata&league=" + league);
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("HTTP " + r.status)); }
      const d = await r.json();
      if (!d.teams || !d.teams.length) throw new Error("Aucune donnée (saison pas encore commencée ?)");
      let tm = d.teams, xgActive = false;
      // xG RÉEL (Understat) prioritaire quand disponible : remplace les forces basées sur les buts.
      try {
        const xr = await fetch("/api/stats?source=understat&league=" + league);
        const xd = await xr.json();
        if (xd.teams && xd.teams.length) {
          const norm = normName;
          const clampR = (x) => Math.max(0.6, Math.min(1.7, x));
          const byN = {}; xd.teams.forEach((t) => (byN[norm(t.name)] = t));
          tm = tm.map((t) => {
            const x = byN[norm(t.name)];
            if (x && x.matches) { xgActive = true; return { ...t, att: clampR(x.xgFor / BASE_GOALS), def: clampR(x.xgAgainst / BASE_GOALS), xgFor: x.xgFor, xgAgainst: x.xgAgainst }; }
            return t;
          });
        }
      } catch { /* repli silencieux sur les forces basées sur les buts */ }
      setTeams(tm); setXgOn(xgActive); setLeagueAvg(d.leagueAvg || LEAGUE_GOALS_AVG[league] || BASE_GOALS); setUpdated(new Date()); setA(0); setB(Math.min(1, tm.length - 1));
    } catch (e) { setErr(String(e.message || e)); setTeams([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [league]);
  useEffect(() => { if (!teams.length) return; const t = setInterval(load, 600000); return () => clearInterval(t); }, [teams.length, league]);
  const [h2h, setH2h] = useState([]);
  const [h2hMsg, setH2hMsg] = useState("");
  const [fin, setFin] = useState([]);
  const [up, setUp] = useState([]);
  const [odds, setOdds] = useState([]);
  const [oddsNote, setOddsNote] = useState("");
  const ta = teams[a], tb = teams[b];
  const hist = ta && tb && a !== b
    ? predictWithHistory({ ...ta, form: parseForm(ta.form) }, { ...tb, form: parseForm(tb.form) }, h2h, leagueAvg)
    : null;
  const R = hist ? hist.R : null;
  useEffect(() => {
    if (!ta || !tb || a === b || !ta.id || !tb.id) { setH2h([]); setH2hMsg(""); return; }
    let on = true; setH2hMsg("Chargement…"); setH2h([]);
    fetch("/api/stats?source=h2h&home=" + ta.id + "&away=" + tb.id)
      .then((r) => r.json())
      .then((d) => { if (!on) return; const m = d.meetings || []; setH2h(m); setH2hMsg(m.length ? "" : "Aucune confrontation récente trouvée."); })
      .catch(() => { if (on) setH2hMsg("Confrontations indisponibles (déploie le proxy)."); });
    return () => { on = false; };
  }, [ta && ta.id, tb && tb.id]);
  useEffect(() => {
    let on = true; setFin([]); setUp([]);
    fetch("/api/stats?source=matches&league=" + league)
      .then((r) => r.json()).then((d) => { if (!on) return; setFin(d.finished || []); setUp(d.upcoming || []); })
      .catch(() => {});
    return () => { on = false; };
  }, [league]);
  useEffect(() => {
    let on = true; setOdds([]); setOddsNote("");
    fetch("/api/stats?source=odds&league=" + league)
      .then((r) => r.json()).then((d) => { if (!on) return; setOdds(d.events || []); if (!(d.events || []).length) setOddsNote(d.note || ""); })
      .catch(() => { if (on) setOddsNote("Cotes indisponibles."); });
    return () => { on = false; };
  }, [league]);
  const byId = (id) => teams.find((t) => t.id === id);
  const byName = (n) => teams.find((t) => normName(t.name) === normName(n));
  const fixtureProbs = (m) => {
    const hh = byId(m.homeId), aw = byId(m.awayId);
    if (!hh || !aw) return null;
    return predict({ ...hh, form: parseForm(hh.form) }, { ...aw, form: parseForm(aw.form) }, true, leagueAvg);
  };
  // Value = proba modèle × meilleure cote. > 1,05 -> le modèle voit de la valeur.
  const oddsValue = (ev) => {
    const hh = byName(ev.home), aw = byName(ev.away);
    if (!hh || !aw) return null;
    const p = predict({ ...hh, form: parseForm(hh.form) }, { ...aw, form: parseForm(aw.form) }, false, leagueAvg);
    const v = [
      { k: "1", lbl: short(ev.home), ev: p.pH * ev.oddsH, pm: p.pH },
      { k: "N", lbl: "Nul", ev: p.pD * ev.oddsD, pm: p.pD },
      { k: "2", lbl: short(ev.away), ev: p.pA * ev.oddsA, pm: p.pA },
    ];
    const best = v.reduce((a, b) => (b.ev > a.ev ? b : a));
    return { p, best, value: best.ev > 1.05 };
  };
  return (
    <>
      <section className="pf-card">
        <div className="pf-result-head"><Radio size={15} /> Forces — saison en cours</div>
        <div className="lv-ctrl">
          <select value={league} onChange={(e) => setLeague(e.target.value)}>{LIVE_LEAGUES.map((l) => <option key={l.code} value={l.code}>{l.n}</option>)}</select>
          <button className="lv-refresh" onClick={load} disabled={loading}>{loading ? "…" : "↻"}</button>
        </div>
        <div className="lv-meta">{updated ? "MAJ " + updated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + " · saison en cours · cache 10 min" : "Chargement…"}</div>
        {err && <div className="lv-err">⚠️ {err}<br /><span>Le proxy <code>/api/stats</code> répond une fois l'app déployée sur Vercel avec <code>FOOTBALLDATA_TOKEN</code> configuré (jeton gratuit sur football-data.org).</span></div>}
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
            <div className="pf-scores">{R.topScores.map((s, i) => (<div key={i} className={"pf-scell" + (i === 0 ? " pf-scell-top" : "")}><div className="pf-scell-s">{s.s}</div><div className="pf-scell-p">{pct(s.p)}%</div></div>))}</div>
            <div className="lv-meta">xG {R.lh.toFixed(2)}–{R.la.toFixed(2)} · +2,5 buts {pct(R.over25)}% · les deux marquent {pct(R.btts)}%</div>
            <div className="lv-meta">Pris en compte : {xgOn ? "xG réel (Understat)" : "xG estimé d'après les buts"} + forme récente (5 derniers) + {hist.h2hN || 0} confrontation(s){hist.w ? " · poids historique " + pct(hist.w) + "%" : ""}</div></>)}
        </section>
        {R && (
        <section className="pf-card">
          <div className="pf-result-head">Confrontations directes</div>
          {h2h.length > 0 ? (
            <div className="h2h">{h2h.map((m, i) => (
              <div key={i} className="h2h-row">
                <span className="h2h-date">{m.date}</span>
                <span className="h2h-match">{short(m.homeTeam)} <b>{m.homeGoals}–{m.awayGoals}</b> {short(m.awayTeam)}</span>
              </div>))}</div>
          ) : <div className="lv-meta">{h2hMsg || "—"}</div>}
        </section>)}
        {up.length > 0 && (
        <section className="pf-card">
          <div className="pf-result-head">Prochains matchs · pronostic 1/N/2</div>
          <div className="res">{up.map((m, i) => { const p = fixtureProbs(m); return (
            <div key={i} className="res-row">
              <span className="res-d">{(m.date || "").slice(5, 10)}</span>
              <span className="res-m">{short(m.home)} – {short(m.away)}</span>
              {p ? <span className="up-p">{pct(p.pH)}/{pct(p.pD)}/{pct(p.pA)}</span> : <span className="up-p">—</span>}
            </div>); })}</div>
        </section>)}
        <section className="pf-card">
          <div className="pf-result-head"><TrendingUp size={15} /> Cotes & value (multi-bookmakers)</div>
          {odds.length > 0 ? (
            <div className="res">{odds.map((ev, i) => { const vv = oddsValue(ev); return (
              <div key={i} className="odd-row">
                <div className="odd-line"><span className="res-d">{(ev.date || "").slice(5, 10)}</span>
                  <span className="res-m">{short(ev.home)} – {short(ev.away)}</span>
                  {vv && vv.value && <span className="odd-val">value {vv.best.k}</span>}</div>
                <div className="odd-cotes">
                  <span className="odd-c"><i>1</i> {ev.oddsH ? ev.oddsH.toFixed(2) : "—"}<u>{ev.bookH}</u></span>
                  <span className="odd-c"><i>N</i> {ev.oddsD ? ev.oddsD.toFixed(2) : "—"}<u>{ev.bookD}</u></span>
                  <span className="odd-c"><i>2</i> {ev.oddsA ? ev.oddsA.toFixed(2) : "—"}<u>{ev.bookA}</u></span>
                </div>
                {vv && <div className="odd-model">modèle {pct(vv.p.pH)}/{pct(vv.p.pD)}/{pct(vv.p.pA)} · meilleure attente : {vv.best.lbl} ({vv.best.ev.toFixed(2)}× la mise)</div>}
              </div>); })}</div>
          ) : <div className="lv-meta">{oddsNote || "Aucune cote (ajoute ODDS_API_KEY sur Vercel, et vérifie que ton plan couvre le football)."}</div>}
          <div className="lv-meta">Cotes les plus élevées trouvées chez les bookmakers (regions EU). « value » = le modèle estime un rendement &gt; 1 sur cette issue — un signal, jamais une certitude.</div>
        </section>
        {fin.length > 0 && (
        <section className="pf-card">
          <div className="pf-result-head">Derniers résultats <span className="res-live">MAJ auto</span></div>
          <div className="res">{fin.map((m, i) => (
            <div key={i} className="res-row">
              <span className="res-d">{(m.date || "").slice(5, 10)}</span>
              <span className="res-m">{short(m.home)} <b>{m.homeGoals}–{m.awayGoals}</b> {short(m.away)}</span>
            </div>))}</div>
        </section>)}
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

/* ========================= Onglet BUTEURS ========================= */
/* Noms anglais pour la recherche d'équipe nationale sur API-Football. */
const NAT_EN = {
  "Argentine": "Argentina", "France": "France", "Espagne": "Spain", "Brésil": "Brazil",
  "Angleterre": "England", "Portugal": "Portugal", "Allemagne": "Germany", "Pays-Bas": "Netherlands",
  "Belgique": "Belgium", "Croatie": "Croatia", "Uruguay": "Uruguay", "Colombie": "Colombia",
  "Maroc": "Morocco", "Norvège": "Norway", "Sénégal": "Senegal", "Suisse": "Switzerland",
  "Japon": "Japan", "Autriche": "Austria", "Équateur": "Ecuador", "Turquie": "Turkey",
  "Mexique": "Mexico", "Tchéquie": "Czech Republic", "États-Unis": "USA", "Corée du Sud": "South Korea",
  "Suède": "Sweden", "Côte d'Ivoire": "Ivory Coast", "Canada": "Canada", "Algérie": "Algeria",
  "Iran": "Iran", "Égypte": "Egypt", "Écosse": "Scotland", "RD Congo": "Congo DR",
  "Ghana": "Ghana", "Paraguay": "Paraguay", "Australie": "Australia", "Afrique du Sud": "South Africa",
  "Bosnie-Herzégovine": "Bosnia", "Tunisie": "Tunisia", "Ouzbékistan": "Uzbekistan", "Panama": "Panama",
  "Qatar": "Qatar", "Arabie saoudite": "Saudi Arabia", "Jordanie": "Jordan", "Irak": "Iraq",
  "Cap-Vert": "Cape Verde", "Haïti": "Haiti", "Curaçao": "Curacao", "Nouvelle-Zélande": "New Zealand",
};
function ScorersTab() {
  const [mode, setMode] = useState("comp");
  // mode compétition (football-data.org)
  const [league, setLeague] = useState("WC");
  const [players, setPlayers] = useState([]);
  const [team, setTeam] = useState("Toutes");
  // mode sélection (API-Football)
  const [nation, setNation] = useState("France");
  const [season, setSeason] = useState(2023);
  const [squad, setSquad] = useState([]);
  const [natTeam, setNatTeam] = useState("");
  // commun
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [updated, setUpdated] = useState(null);

  const loadComp = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/stats?source=scorers&league=" + league);
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("HTTP " + r.status)); }
      const d = await r.json();
      if (!d.players || !d.players.length) throw new Error("Aucune donnée (saison pas encore commencée ?)");
      setPlayers(d.players); setUpdated(new Date()); setTeam("Toutes");
    } catch (e) { setErr(String(e.message || e)); setPlayers([]); }
    finally { setLoading(false); }
  };
  const loadNat = async () => {
    setLoading(true); setErr(null); setSquad([]);
    try {
      const q = NAT_EN[nation] || nation;
      const r = await fetch("/api/stats?source=natteam&q=" + encodeURIComponent(q) + "&season=" + season);
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("HTTP " + r.status)); }
      const d = await r.json();
      if (!d.players || !d.players.length) throw new Error("Aucune donnée (saison hors du plan gratuit, ou effectif pas encore publié).");
      setSquad(d.players); setNatTeam(d.team || q); setUpdated(new Date());
    } catch (e) { setErr(String(e.message || e)); setSquad([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (mode === "comp") loadComp(); }, [league, mode]);
  useEffect(() => { if (mode === "nat") loadNat(); }, [mode, nation, season]);

  const teamsList = ["Toutes", ...Array.from(new Set(players.map((p) => p.team)))];
  const shown = team === "Toutes" ? players : players.filter((p) => p.team === team);

  return (
    <>
      <section className="pf-card">
        <div className="pf-result-head"><Target size={15} /> Buteurs & joueurs</div>
        <div className="sc-modes">
          <button className={mode === "comp" ? "sc-mode on" : "sc-mode"} onClick={() => setMode("comp")}>Compétition</button>
          <button className={mode === "nat" ? "sc-mode on" : "sc-mode"} onClick={() => setMode("nat")}>Sélection nationale</button>
        </div>
        {mode === "comp" ? (
          <>
            <div className="lv-ctrl">
              <select value={league} onChange={(e) => setLeague(e.target.value)}>{SCORER_LEAGUES.map((l) => <option key={l.code} value={l.code}>{l.n}</option>)}</select>
              <button className="lv-refresh" onClick={loadComp} disabled={loading}>{loading ? "…" : "↻"}</button>
            </div>
            {players.length > 0 && <select className="sc-team" value={team} onChange={(e) => setTeam(e.target.value)}>{teamsList.map((t, i) => <option key={i} value={t}>{t === "Toutes" ? "Toutes les équipes" : t}</option>)}</select>}
          </>
        ) : (
          <div className="lv-ctrl">
            <select value={nation} onChange={(e) => setNation(e.target.value)}>{POOL.map((t, i) => <option key={i} value={t.n}>{t.f} {t.n}</option>)}</select>
            <input className="lv-season" inputMode="numeric" value={season} onChange={(e) => setSeason(Number(e.target.value) || season)} />
            <button className="lv-refresh" onClick={loadNat} disabled={loading}>{loading ? "…" : "↻"}</button>
          </div>
        )}
        <div className="lv-meta">{updated ? "MAJ " + updated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "Chargement…"}</div>
        {err && <div className="lv-err">⚠️ {err}<br /><span>{mode === "comp" ? <>Nécessite <code>FOOTBALLDATA_TOKEN</code> (gratuit).</> : <>Nécessite <code>APIFOOTBALL_KEY</code> (api-football.com). Tier gratuit : 100 requêtes/jour et saisons limitées ; les effectifs du Mondial 2026 se finalisent au coup d'envoi.</>}</span></div>}
      </section>
      {mode === "comp" && shown.length > 0 && (
        <section className="pf-card">
          <table className="wc-st sc-tbl"><thead><tr><th>#</th><th>Joueur</th><th>Équipe</th><th>B</th><th>PD</th><th>J</th></tr></thead>
            <tbody>{shown.map((p, i) => (
              <tr key={i}><td>{i + 1}</td><td className="wc-tn">{p.name}</td><td className="sc-team-c">{short(p.team || "")}</td><td className="wc-pts">{p.goals}</td><td>{p.assists}</td><td>{p.matches}</td></tr>))}</tbody>
          </table>
          <div className="lv-meta">B = buts · PD = passes décisives. Données football-data.org (offensives).</div>
        </section>)}
      {mode === "nat" && squad.length > 0 && (
        <section className="pf-card">
          <div className="pf-result-head">{natTeam} · {squad.length} joueurs · saison {season}</div>
          <table className="wc-st sc-tbl"><thead><tr><th>Joueur</th><th>Nat.</th><th>Poste</th><th>B</th><th>PD</th><th>J</th></tr></thead>
            <tbody>{squad.map((p, i) => (
              <tr key={i}><td className="wc-tn">{p.name}</td><td className="sc-team-c">{p.nationality || "—"}</td><td className="sc-team-c">{p.position || "—"}</td><td className="wc-pts">{p.goals}</td><td>{p.assists}</td><td>{p.appearances}</td></tr>))}</tbody>
          </table>
          <div className="lv-meta">Source API-Football (api-football.com) : nationalités et stats des joueurs de la sélection. Vérifie la liste officielle FIFA pour l'effectif définitif du Mondial.</div>
        </section>)}
    </>
  );
}

/* ========================= Onglet EFFECTIFS ========================= */
const POS_FR = { Goalkeeper: "Gardien", Defence: "Défenseur", Midfield: "Milieu", Offence: "Attaquant", "Centre-Back": "Déf. central", "Right-Back": "Arrière droit", "Left-Back": "Arrière gauche", "Defensive Midfield": "Milieu déf.", "Central Midfield": "Milieu", "Attacking Midfield": "Milieu off.", "Centre-Forward": "Avant-centre", "Right Winger": "Ailier droit", "Left Winger": "Ailier gauche" };
const posFr = (p) => POS_FR[p] || p || "—";
function SquadsTab() {
  const [league, setLeague] = useState("WC");
  const [teams, setTeams] = useState([]);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [updated, setUpdated] = useState(null);
  const load = async () => {
    setLoading(true); setErr(null); setTeams([]);
    try {
      const r = await fetch("/api/stats?source=teams&league=" + league);
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("HTTP " + r.status)); }
      const d = await r.json();
      if (!d.teams || !d.teams.length) throw new Error("Aucune équipe (compétition pas encore active ?)");
      setTeams(d.teams); setSel(0); setUpdated(new Date());
    } catch (e) { setErr(String(e.message || e)); setTeams([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [league]);
  const age = (dob) => { if (!dob) return "—"; const d = new Date(dob); if (isNaN(d)) return "—"; const t = new Date(); let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a; };
  const team = teams[sel];
  return (
    <>
      <section className="pf-card">
        <div className="pf-result-head"><Users size={15} /> Effectifs — football-data.org</div>
        <div className="lv-ctrl">
          <select value={league} onChange={(e) => setLeague(e.target.value)}>{SCORER_LEAGUES.map((l) => <option key={l.code} value={l.code}>{l.n}</option>)}</select>
          <button className="lv-refresh" onClick={load} disabled={loading}>{loading ? "…" : "↻"}</button>
        </div>
        {teams.length > 0 && <select className="sc-team" value={sel} onChange={(e) => setSel(Number(e.target.value))}>{teams.map((t, i) => <option key={i} value={i}>{t.name} ({t.squad.length})</option>)}</select>}
        <div className="lv-meta">{updated ? "MAJ " + updated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "Chargement…"}</div>
        {err && <div className="lv-err">⚠️ {err}<br /><span>Nécessite <code>FOOTBALLDATA_TOKEN</code> (gratuit). Les effectifs du Mondial se renseignent à l'approche du tournoi.</span></div>}
      </section>
      {team && team.squad.length > 0 && (
        <section className="pf-card">
          <div className="pf-result-head">{team.name} · {team.squad.length} joueurs</div>
          <table className="wc-st sc-tbl"><thead><tr><th>Joueur</th><th>Poste</th><th>Nat.</th><th>Âge</th></tr></thead>
            <tbody>{team.squad.map((p, i) => (
              <tr key={i}><td className="wc-tn">{p.name}</td><td className="sc-team-c">{posFr(p.position)}</td><td className="sc-team-c">{p.nationality || "—"}</td><td>{age(p.dob)}</td></tr>))}</tbody>
          </table>
          <div className="lv-meta">Source football-data.org (gratuit) : nom, poste, nationalité, âge. Compositions et blessures ne sont pas disponibles en gratuit.</div>
        </section>)}
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
        <div className="pf-sub">Elo + Poisson · groupes officiels Mondial 2026 · données live</div>
      </header>
      <nav className="pf-tabs">
        <button className={tab === "match" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("match")}>Match</button>
        <button className={tab === "cdm" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("cdm")}>Mondial 26</button>
        <button className={tab === "live" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("live")}>Live</button>
        <button className={tab === "scorers" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("scorers")}>Buteurs</button>
        <button className={tab === "squads" ? "pf-tab on" : "pf-tab"} onClick={() => setTab("squads")}>Effectifs</button>
      </nav>
      <main className="pf-main">
        {tab === "match" ? <MatchTab /> : tab === "cdm" ? <WorldCupTab /> : tab === "live" ? <LiveTab /> : tab === "scorers" ? <ScorersTab /> : <SquadsTab />}
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
.pf-tabs{max-width:560px;margin:6px auto 0;padding:0 14px;display:flex;gap:6px;flex-wrap:wrap;}
.pf-tab{flex:1 1 22%;min-width:70px;background:var(--card);border:1px solid var(--line);color:var(--dim);font-family:'Saira Condensed';font-weight:700;font-size:13px;letter-spacing:.03em;text-transform:uppercase;padding:10px 6px;border-radius:11px;cursor:pointer;transition:.15s;}
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
.pf-odds-inputs label{font-family:'Saira Condensed';font-weight:700;font-size:13px;color:var(--dim);display:flex;flex-direction:column;gap:5px;text-align:center;min-width:0;}
.pf-odds-inputs input{width:100%;min-width:0;box-sizing:border-box;background:#0e1116;border:1px solid var(--line);border-radius:11px;color:var(--txt);font-family:'JetBrains Mono';font-size:17px;font-weight:700;text-align:center;padding:11px 4px;outline:none;}
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
.wc-mscores{display:flex;justify-content:center;gap:8px;margin-top:4px;flex-wrap:wrap;}
.wc-sc{font-family:'JetBrains Mono';font-size:10.5px;color:var(--dim);}
.wc-sc b{color:#c4cbd4;font-weight:700;}
.wc-sc-top{color:var(--lime);}.wc-sc-top b{color:var(--lime);}
.wc-ties{padding:6px 13px 14px;display:flex;flex-direction:column;gap:8px;}
.wc-tie{position:relative;display:flex;flex-direction:column;gap:6px;}
.wc-tie-sides{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.wc-kb{font-family:'JetBrains Mono';font-size:10px;color:var(--dim);text-align:center;}
.wc-kb b{color:var(--cyan);}
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
.sc-team{width:100%;background:#0e1116;border:1px solid var(--line);border-radius:10px;color:var(--txt);padding:10px;font-size:13px;margin-bottom:8px;}
.sc-modes{display:flex;gap:8px;margin-bottom:10px;}
.sc-mode{flex:1;background:#0e1116;border:1px solid var(--line);color:var(--dim);font-size:13px;font-weight:600;padding:9px;border-radius:10px;cursor:pointer;}
.sc-mode.on{color:#0b0d10;background:var(--cyan);border-color:var(--cyan);}
.sc-tbl td{font-size:12px;}
.sc-team-c{font-family:'Saira'!important;color:var(--dim);font-size:11px;text-align:left!important;}
/* scores probables */
.pf-scores{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.pf-byout{display:flex;flex-direction:column;gap:6px;margin-top:12px;}
.pf-bo{display:flex;align-items:center;justify-content:space-between;background:#0e1116;border:1px solid var(--line);border-radius:10px;padding:9px 12px;}
.pf-bo-k{font-size:12.5px;color:var(--dim);}
.pf-bo-v{font-family:'JetBrains Mono';font-weight:700;font-size:15px;}
.pf-bo-v i{font-style:normal;font-size:11px;color:var(--dim);font-weight:500;margin-left:5px;}
.pf-bo-h{color:var(--lime);}.pf-bo-a{color:var(--cyan);}
.pf-scell{background:#0e1116;border:1px solid var(--line);border-radius:11px;padding:10px 4px;text-align:center;}
.pf-scell-top{border-color:rgba(200,255,66,.4);}
.pf-scell-s{font-family:'JetBrains Mono';font-weight:700;font-size:18px;}
.pf-scell-top .pf-scell-s{color:var(--lime);}
.pf-scell-p{font-family:'JetBrains Mono';font-size:11px;color:var(--dim);margin-top:2px;}
.pf-scores-note{color:var(--dim);font-size:11.5px;line-height:1.5;margin-top:10px;}
/* h2h */
.h2h{display:flex;flex-direction:column;gap:6px;}
.h2h-row{display:flex;align-items:center;gap:10px;background:#0e1116;border:1px solid var(--line);border-radius:9px;padding:8px 11px;}
.h2h-date{font-family:'JetBrains Mono';font-size:10.5px;color:var(--dim);width:74px;flex-shrink:0;}
.h2h-match{font-size:12.5px;}.h2h-match b{font-family:'JetBrains Mono';color:var(--lime);margin:0 3px;}
.res{display:flex;flex-direction:column;gap:6px;}
.res-row{display:flex;align-items:center;gap:9px;background:#0e1116;border:1px solid var(--line);border-radius:9px;padding:8px 11px;}
.res-d{font-family:'JetBrains Mono';font-size:10px;color:var(--dim);width:42px;flex-shrink:0;}
.res-m{flex:1;font-size:12.5px;}.res-m b{font-family:'JetBrains Mono';color:var(--lime);margin:0 4px;}
.up-p{font-family:'JetBrains Mono';font-size:10.5px;color:var(--cyan);flex-shrink:0;}
.res-live{font-family:'Saira Condensed';font-size:9px;background:var(--red);color:#fff;border-radius:5px;padding:1px 6px;letter-spacing:.05em;}
.odd-row{background:#0e1116;border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin-bottom:6px;}
.odd-line{display:flex;align-items:center;gap:9px;}
.odd-val{font-family:'Saira Condensed';font-size:9px;background:var(--lime);color:#0b0d10;border-radius:5px;padding:1px 6px;letter-spacing:.05em;margin-left:auto;}
.odd-cotes{display:flex;gap:8px;margin-top:6px;}
.odd-c{flex:1;display:flex;flex-direction:column;align-items:center;background:#15191f;border:1px solid var(--line);border-radius:8px;padding:5px 3px;font-family:'JetBrains Mono';font-size:13px;font-weight:700;color:var(--txt);}
.odd-c i{font-style:normal;font-size:9px;color:var(--dim);font-weight:500;}
.odd-c u{text-decoration:none;font-size:8.5px;color:var(--dim);font-weight:500;font-family:'Saira Condensed';margin-top:1px;}
.odd-model{font-family:'JetBrains Mono';font-size:9.5px;color:var(--dim);margin-top:5px;}
`;
