/* Simulation "qui gagne le Mondial ?" avec le moteur exact de l'appli.
 * Fonctions copiées de src/App.jsx (predict, predictKnockout, formScore, dcTau)
 * + réinjection des 25 résultats KO réels (Elo K=40, buts observés, forme),
 * comme le fait le memo `wc`. Groupes/historique pré-Mondial non inclus
 * (données API absentes en local) — voir note dans la sortie. */
const WC_AVG = 1.18, RHO_WC = -0.08, ELO_BETA = 0.25, FORM_DECAY = 0.75, MAXG = 10;
const FACT = [1]; for (let i = 1; i <= 12; i++) FACT[i] = FACT[i - 1] * i;
const poisson = (k, l) => (Math.exp(-l) * Math.pow(l, k)) / FACT[k];
function formScore(form) {
  if (!form || !form.length) return 0;
  let sum = 0, w = 0;
  form.forEach((r, i) => { const wi = Math.pow(FORM_DECAY, form.length - 1 - i); sum += (r === "W" ? 1 : r === "L" ? -1 : 0) * wi; w += wi; });
  return w ? sum / w : 0;
}
function dcTau(i, j, lh, la, rho) {
  let t = 1;
  if (i === 0 && j === 0) t = 1 - lh * la * rho;
  else if (i === 0 && j === 1) t = 1 + lh * rho;
  else if (i === 1 && j === 0) t = 1 + la * rho;
  else if (i === 1 && j === 1) t = 1 - rho;
  return Math.max(0, t);
}
function predict(home, away, leagueAvg = WC_AVG, rho = RHO_WC) {
  const fh = formScore(home.form), fa = formScore(away.form);
  const attH = home.att * (1 + 0.08 * fh), defH = home.def * (1 - 0.05 * fh);
  const attA = away.att * (1 + 0.08 * fa), defA = away.def * (1 - 0.05 * fa);
  let lh = leagueAvg * attH * defA, la = leagueAvg * attA * defH;
  const f = Math.exp(ELO_BETA * (home.elo - away.elo) / 400);
  lh *= f; la /= f;
  let pH = 0, pD = 0, pA = 0;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = poisson(i, lh) * poisson(j, la) * dcTau(i, j, lh, la, rho);
    if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
  }
  const tot = pH + pD + pA;
  return { lh, la, pH: pH / tot, pD: pD / tot, pA: pA / tot };
}
function predictKnockout(home, away) {
  const base = predict(home, away);
  const lhE = base.lh / 3, laE = base.la / 3;
  let etA = 0, etB = 0, etD = 0;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const p = poisson(i, lhE) * poisson(j, laE);
    if (i > j) etA += p; else if (i < j) etB += p; else etD += p;
  }
  const etTot = etA + etB + etD; etA /= etTot; etB /= etTot; etD /= etTot;
  const denom = base.pH + base.pA || 1;
  const penA = 0.5 * 0.6 + (base.pH / denom) * 0.4;
  const drawMass = base.pD;
  return { advA: base.pH + drawMass * etA + drawMass * etD * penA,
           advB: base.pA + drawMass * etB + drawMass * etD * (1 - penA) };
}
function applyEloResult(elo, a, b, sa, K) {
  const ea = 1 / (1 + Math.pow(10, (elo[b] - elo[a]) / 400));
  elo[a] += K * (sa - ea); elo[b] += K * ((1 - sa) - (1 - ea));
}
/* Ratings de base du POOL (App.jsx) pour les nations concernées par le KO. */
const BASE = {
  GER: { elo: 1990, att: 1.38, def: 0.84 }, PAR: { elo: 1740, att: 0.86, def: 0.94 },
  FRA: { elo: 2085, att: 1.65, def: 0.72 }, SWE: { elo: 1785, att: 1.06, def: 0.92 },
  RSA: { elo: 1720, att: 0.90, def: 1.02 }, CAN: { elo: 1770, att: 1.02, def: 0.96 },
  NED: { elo: 1985, att: 1.32, def: 0.82 }, MAR: { elo: 1885, att: 1.10, def: 0.76 },
  POR: { elo: 2030, att: 1.60, def: 0.84 }, CRO: { elo: 1940, att: 1.14, def: 0.84 },
  ESP: { elo: 2075, att: 1.70, def: 0.74 }, AUT: { elo: 1830, att: 1.10, def: 0.92 },
  USA: { elo: 1800, att: 1.06, def: 0.92 }, BIH: { elo: 1720, att: 0.94, def: 1.04 },
  BEL: { elo: 1955, att: 1.28, def: 0.88 }, SEN: { elo: 1850, att: 1.10, def: 0.84 },
  BRA: { elo: 2060, att: 1.62, def: 0.72 }, JPN: { elo: 1835, att: 1.10, def: 0.92 },
  CIV: { elo: 1775, att: 1.02, def: 0.94 }, NOR: { elo: 1865, att: 1.28, def: 0.92 },
  MEX: { elo: 1810, att: 1.06, def: 0.92 }, ECU: { elo: 1820, att: 1.02, def: 0.84 },
  ENG: { elo: 2035, att: 1.55, def: 0.76 }, COD: { elo: 1730, att: 1.02, def: 1.02 },
  ARG: { elo: 2090, att: 1.70, def: 0.68 }, CPV: { elo: 1640, att: 0.82, def: 1.04 },
  AUS: { elo: 1720, att: 0.86, def: 1.02 }, EGY: { elo: 1760, att: 0.98, def: 0.92 },
  SUI: { elo: 1840, att: 1.02, def: 0.90 }, ALG: { elo: 1770, att: 1.06, def: 0.90 },
  COL: { elo: 1900, att: 1.16, def: 0.88 }, GHA: { elo: 1730, att: 0.98, def: 1.02 },
};
/* Les 25 matchs KO réels (bracket vérifié), ordre chronologique. sa = résultat
 * 90'/120' du 1er nommé (0.5 si t.a.b.). Buts = score final (prol. incluse). */
const KO = [
  ["GER","PAR",1,1,.5],["FRA","SWE",3,0,1],["RSA","CAN",0,1,0],["NED","MAR",1,1,.5],
  ["POR","CRO",2,1,1],["ESP","AUT",3,0,1],["USA","BIH",2,0,1],["BEL","SEN",3,2,1],
  ["BRA","JPN",2,1,1],["CIV","NOR",1,2,0],["MEX","ECU",2,0,1],["ENG","COD",2,1,1],
  ["ARG","CPV",3,2,1],["AUS","EGY",1,1,.5],["SUI","ALG",2,0,1],["COL","GHA",1,0,1],
  ["PAR","FRA",0,1,0],["CAN","MAR",0,3,0],["POR","ESP",0,1,0],["USA","BEL",1,4,0],
  ["BRA","NOR",1,2,0],["MEX","ENG",2,3,0],["ARG","EGY",3,2,1],["SUI","COL",0,0,.5],
  ["FRA","MAR",2,0,1],
];
// Réinjection : Elo K=40 + buts observés + forme, comme knockoutOutcomes/mkEff.
const elo = {}, st = {}, form = {};
for (const k in BASE) { elo[k] = BASE[k].elo; st[k] = { gf: 0, ga: 0, gp: 0 }; form[k] = []; }
for (const [a, b, hg, ag, sa] of KO) {
  applyEloResult(elo, a, b, sa, 40);
  st[a].gf += hg; st[a].ga += ag; st[a].gp++;
  st[b].gf += ag; st[b].ga += hg; st[b].gp++;
  form[a].push(hg > ag ? "W" : hg === ag ? "D" : "L");
  form[b].push(ag > hg ? "W" : hg === ag ? "D" : "L");
}
const team = (k) => {
  const s = st[k], t = BASE[k];
  if (!s.gp) return { n: k, elo: elo[k], att: t.att, def: t.def, form: [] };
  const w = Math.min(0.5, 0.15 * s.gp);
  const attObs = Math.max(0.2, s.gf / s.gp) / WC_AVG, defObs = Math.max(0.2, s.ga / s.gp) / WC_AVG;
  return { n: k, elo: elo[k], form: form[k].slice(-5),
    att: Math.pow(t.att, 1 - w) * Math.pow(attObs, w),
    def: Math.pow(t.def, 1 - w) * Math.pow(defObs, w) };
};
/* Tableau restant : QF2 ESP–BEL, QF3 NOR–ENG, QF4 ARG–SUI ;
 * SF1 FRA–W(QF2), SF2 W(QF3)–W(QF4) ; F W(SF1)–W(SF2). Énumération exacte. */
const T = Object.fromEntries(["FRA","ESP","BEL","NOR","ENG","ARG","SUI"].map((k) => [k, team(k)]));
const champ = {}, finalP = {};
const kAdv = (a, b) => { const r = predictKnockout(T[a], T[b]); return [r.advA, r.advB]; };
const [espQ, belQ] = kAdv("ESP", "BEL");
const [norQ, engQ] = kAdv("NOR", "ENG");
const [argQ, suiQ] = kAdv("ARG", "SUI");
const qf = [[["ESP", espQ], ["BEL", belQ]], [["NOR", norQ], ["ENG", engQ]], [["ARG", argQ], ["SUI", suiQ]]];
for (const [w2, p2] of qf[0]) for (const [w3, p3] of qf[1]) for (const [w4, p4] of qf[2]) {
  const pBranch = p2 * p3 * p4;
  const [fraS, oppS] = kAdv("FRA", w2);            // SF1
  const [w3S, w4S] = kAdv(w3, w4);                 // SF2
  for (const [f1, pf1] of [["FRA", fraS], [w2, oppS]])
    for (const [f2, pf2] of [[w3, w3S], [w4, w4S]]) {
      const pF = pBranch * pf1 * pf2;
      finalP[f1] = (finalP[f1] || 0) + pF; finalP[f2] = (finalP[f2] || 0) + pF;
      const [c1, c2] = kAdv(f1, f2);
      champ[f1] = (champ[f1] || 0) + pF * c1;
      champ[f2] = (champ[f2] || 0) + pF * c2;
    }
}
const pc = (x) => (100 * x).toFixed(1) + "%";
console.log("Forces ajustées (Elo / att / déf / forme KO) :");
for (const k of Object.keys(T)) console.log(`  ${k}: Elo ${T[k].elo.toFixed(0)}, att ${T[k].att.toFixed(2)}, déf ${T[k].def.toFixed(2)}, forme [${T[k].form.join("")}]`);
console.log("\nQuarts restants (proba de qualification) :");
console.log(`  ESP ${pc(espQ)} – BEL ${pc(belQ)} · NOR ${pc(norQ)} – ENG ${pc(engQ)} · ARG ${pc(argQ)} – SUI ${pc(suiQ)}`);
console.log("\nProba d'atteindre la FINALE :");
Object.entries(finalP).sort((a, b) => b[1] - a[1]).forEach(([k, p]) => console.log(`  ${k}: ${pc(p)}`));
console.log("\n🏆 CHAMPION DU MONDE (proba) :");
Object.entries(champ).sort((a, b) => b[1] - a[1]).forEach(([k, p]) => console.log(`  ${k}: ${pc(p)}`));
