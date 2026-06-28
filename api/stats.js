/* Proxy serverless Vercel — football-data.org (saison en cours, gratuit).
 * Routes (paramètre ?source=) :
 *   standings (défaut) : forces att/def d'un championnat (?league=CODE)
 *   scorers            : meilleurs buteurs/passeurs (?league=CODE)
 *   h2h                : dernières confrontations (?home=ID&away=ID)
 * Garde le jeton secret, règle le CORS, met en cache au bord (quota-safe).
 */
function ratings(matches, gf, ga, leagueAvg) {
  const fp = gf / matches, ap = ga / matches;
  const clamp = (x) => Math.max(0.6, Math.min(1.7, x));
  return { att: clamp(fp / leagueAvg), def: clamp(ap / leagueAvg) };
}

export default async function handler(req, res) {
  const { source = "standings", league, home, away } = req.query;
  const token = process.env.FOOTBALLDATA_TOKEN;
  const H = { "X-Auth-Token": token || "" };
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");

  /* ---- xG RÉEL via Understat (gratuit, sans clé) : 5 grands championnats ---- */
  /* NB : Understat n'expose pas d'API officielle (JSON intégré au HTML) et ne
     couvre PAS les sélections / la Coupe du Monde. À vérifier après déploiement. */
  if (source === "understat") {
    const MAP = { PL: "EPL", PD: "La_liga", BL1: "Bundesliga", SA: "Serie_A", FL1: "Ligue_1" };
    const lg = MAP[league];
    if (!lg) return res.status(200).json({ source, supported: false, teams: [], note: "xG Understat dispo seulement pour PL, PD, BL1, SA, FL1." });
    const now = new Date(), season = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    try {
      const r = await fetch("https://understat.com/league/" + lg + "/" + season, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await r.text();
      const m = html.match(/teamsData\s*=\s*JSON\.parse\('([^']+)'\)/);
      if (!m) return res.status(200).json({ source, teams: [], note: "Parsing Understat impossible (structure changée ?)." });
      const data = JSON.parse(decodeURIComponent(m[1].replace(/\\x/g, "%")));
      const teams = Object.values(data).map((t) => {
        const h = t.history || [];
        const xg = h.reduce((s, g) => s + (+g.xG || 0), 0), xga = h.reduce((s, g) => s + (+g.xGA || 0), 0);
        return { name: t.title, matches: h.length, xgFor: h.length ? xg / h.length : 0, xgAgainst: h.length ? xga / h.length : 0 };
      });
      return res.status(200).json({ source, league, season, count: teams.length, teams });
    } catch (e) {
      return res.status(200).json({ source, teams: [], note: "Understat injoignable : " + String(e.message || e) });
    }
  }

  /* ---- COTES MULTI-BOOKMAKERS via The Odds API (clé gratuite the-odds-api.com) ---- */
  if (source === "odds") {
    const key = process.env.ODDS_API_KEY;
    if (!key) return res.status(500).json({ error: "ODDS_API_KEY non configurée (clé the-odds-api.com)" });
    const SK = { FL1: "soccer_france_ligue_one", PL: "soccer_epl", PD: "soccer_spain_la_liga", SA: "soccer_italy_serie_a", BL1: "soccer_germany_bundesliga", CL: "soccer_uefa_champs_league", WC: "soccer_fifa_world_cup" };
    const sk = SK[league];
    if (!sk) return res.status(200).json({ source, events: [], note: "Cotes non disponibles pour cette compétition." });
    try {
      const u = "https://api.the-odds-api.com/v4/sports/" + sk + "/odds?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=" + key;
      const r = await fetch(u);
      if (!r.ok) return res.status(200).json({ source, events: [], note: "API cotes indisponible (HTTP " + r.status + ") — vérifie que ton plan couvre le football." });
      const data = await r.json();
      const events = (Array.isArray(data) ? data : []).map((ev) => {
        let bh = 0, bd = 0, ba = 0, sh = "", sd = "", sa = "";
        (ev.bookmakers || []).forEach((bk) => {
          const mk = (bk.markets || []).find((m) => m.key === "h2h"); if (!mk) return;
          (mk.outcomes || []).forEach((o) => {
            if (o.name === ev.home_team && o.price > bh) { bh = o.price; sh = bk.title; }
            else if (o.name === ev.away_team && o.price > ba) { ba = o.price; sa = bk.title; }
            else if (o.name === "Draw" && o.price > bd) { bd = o.price; sd = bk.title; }
          });
        });
        const ih = bh ? 1 / bh : 0, idr = bd ? 1 / bd : 0, ia = ba ? 1 / ba : 0, s = ih + idr + ia || 1;
        return { id: ev.id, date: ev.commence_time, home: ev.home_team, away: ev.away_team, oddsH: bh, oddsD: bd, oddsA: ba, bookH: sh, bookD: sd, bookA: sa, impH: ih / s, impD: idr / s, impA: ia / s };
      });
      return res.status(200).json({ source, league, count: events.length, updated: new Date().toISOString(), events });
    } catch (e) {
      return res.status(200).json({ source, events: [], note: "Cotes injoignables : " + String(e.message || e) });
    }
  }

  /* ---- ABSENCES (blessures + suspensions/cartons rouges) via API-Football ----
   * Endpoint injuries : type "Missing Fixture" (absent) ou "Questionable" (incertain),
   * reason "Suspended" / "Red Card" / blessure. Les postes (G/D/M/A) sont joints
   * depuis les effectifs football-data.org pour pondérer l'impact att/def. */
  if (source === "absences") {
    const key = process.env.APIFOOTBALL_KEY;
    if (!key) return res.status(200).json({ source, supported: false, teams: [], note: "APIFOOTBALL_KEY non configurée — blessures/suspensions indisponibles." });
    const LG = { WC: 1 }; // ids de compétitions API-Football
    const lgId = LG[league || "WC"] || 1;
    const season = req.query.season || "2026";
    try {
      const r = await fetch("https://v3.football.api-sports.io/injuries?league=" + lgId + "&season=" + season, { headers: { "x-apisports-key": key } });
      const j = await r.json();
      const rows = j.response || [];
      // Une entrée par joueur (la plus récente), fixtures récentes ou à venir uniquement.
      const cutoff = Date.now() - 4 * 24 * 3600 * 1000;
      const byPlayer = {};
      for (const it of rows) {
        const d = new Date((it.fixture && it.fixture.date) || 0).getTime();
        if (!d || d < cutoff) continue;
        const pid = it.player && (it.player.id || it.player.name);
        if (!pid || !it.team) continue;
        const prev = byPlayer[pid];
        if (!prev || d > prev._d) byPlayer[pid] = { _d: d, team: it.team.name, name: it.player.name, type: it.player.type || "", reason: it.player.reason || "" };
      }
      // Postes depuis les effectifs football-data.org (gratuit pour la WC).
      const normP = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
      const posCode = (p) => {
        const s = (p || "").toLowerCase();
        if (s.includes("keeper")) return "G";
        if (s.includes("midfield")) return "M";
        if (s.includes("back") || s.includes("defen")) return "D";
        if (s.includes("wing") || s.includes("forward") || s.includes("striker") || s.includes("offence") || s.includes("attack")) return "A";
        return "";
      };
      const posIdx = {}; // nom de famille -> [{first, pos}]
      if (token) {
        try {
          const tr = await fetch("https://api.football-data.org/v4/competitions/WC/teams", { headers: H });
          if (tr.ok) {
            const tj = await tr.json();
            (tj.teams || []).forEach((t) => (t.squad || []).forEach((p) => {
              const toks = normP(p.name).split(" ").filter(Boolean);
              if (!toks.length) return;
              const last = toks[toks.length - 1];
              (posIdx[last] = posIdx[last] || []).push({ first: toks[0][0], pos: posCode(p.position) });
            }));
          }
        } catch {}
      }
      const findPos = (name) => {
        const toks = normP(name).split(" ").filter(Boolean);
        if (!toks.length) return "";
        const cands = posIdx[toks[toks.length - 1]] || [];
        if (cands.length === 1) return cands[0].pos;
        const hit = cands.find((c) => c.first === toks[0][0]);
        return hit ? hit.pos : "";
      };
      const kindOf = (type, reason) => {
        if (/question/i.test(type)) return "doubt";
        if (/susp|red|yellow|card/i.test(reason)) return "sus";
        return "inj";
      };
      const teamsMap = {};
      Object.values(byPlayer).forEach((p) => {
        (teamsMap[p.team] = teamsMap[p.team] || []).push({ name: p.name, reason: p.reason, kind: kindOf(p.type, p.reason), position: findPos(p.name) });
      });
      const teams = Object.entries(teamsMap).map(([team, players]) => ({ team, players }));
      return res.status(200).json({ source, supported: true, league: league || "WC", season, updated: new Date().toISOString(), count: teams.length, teams });
    } catch (e) {
      return res.status(200).json({ source, supported: false, teams: [], note: "API-Football injoignable : " + String(e.message || e) });
    }
  }

  /* ---- COMPOSITIONS / XI DE DÉPART (?home=NomAnglais&away=NomAnglais) ----
   * Via API-Football (compos confirmées ~1 h avant le coup d'envoi). Calcule un
   * facteur att/déf par équipe à partir de TROIS signaux demandés :
   *   1) la formation (offensive type 4-3-3 / 4-2-3-1 vs défensive type 5-4-1) ;
   *   2) les titulaires habituels ou non (rotation = top apparitions sur le banc) ;
   *   3) la qualité offensive du XI (buts + passes décisives des titulaires). */
  if (source === "lineup") {
    const qh = req.query.home, qa = req.query.away;
    if (!qh || !qa) return res.status(400).json({ error: "paramètres 'home' et 'away' requis" });
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    const key = process.env.APIFOOTBALL_KEY;
    if (!key) return res.status(200).json({ source, supported: false, note: "APIFOOTBALL_KEY non configurée — compositions indisponibles." });
    const AH = { "x-apisports-key": key };
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    const posCode = (p) => { const s = (p || "").toUpperCase(); return s === "G" ? "G" : s === "D" ? "D" : s === "M" ? "M" : s === "F" ? "A" : ""; };
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    // Indice offensif des formations courantes (1 = neutre, >1 offensive, <1 défensive).
    const FORM_OFF = { "3-4-3": 1.12, "4-3-3": 1.08, "3-5-2": 1.05, "4-2-3-1": 1.05, "3-4-2-1": 1.05, "4-4-2": 1.00, "4-1-4-1": 0.98, "4-4-1-1": 0.97, "4-5-1": 0.93, "5-3-2": 0.92, "5-4-1": 0.88 };
    const season = req.query.season || "2026";
    const matchTeam = (apiName, q) => { const n = norm(apiName), nq = norm(q); return n.includes(nq) || nq.includes(n); };
    try {
      const fr = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=" + season, { headers: AH });
      const fj = await fr.json();
      const fx = (fj.response || []).find((x) => (matchTeam(x.teams.home.name, qh) && matchTeam(x.teams.away.name, qa)) || (matchTeam(x.teams.home.name, qa) && matchTeam(x.teams.away.name, qh)));
      if (!fx) return res.status(200).json({ source, supported: true, found: false, note: "Match introuvable sur API-Football pour cette saison." });
      const lr = await fetch("https://v3.football.api-sports.io/fixtures/lineups?fixture=" + fx.fixture.id, { headers: AH });
      const lj = await lr.json();
      const lineups = lj.response || [];
      if (!lineups.length) return res.status(200).json({ source, supported: true, found: true, ready: false, note: "Compositions pas encore publiées (≈1 h avant le coup d'envoi)." });
      const playerStats = async (teamId) => {
        const out = {};
        for (const s of [season, String(Number(season) - 1)]) {
          try {
            const pr = await fetch("https://v3.football.api-sports.io/players?team=" + teamId + "&season=" + s, { headers: AH });
            const pj = await pr.json();
            (pj.response || []).forEach((p) => { const st = (p.statistics || [])[0] || {}; if (p.player && p.player.name) out[norm(p.player.name)] = { apps: (st.games && st.games.appearences) || 0, goals: (st.goals && st.goals.total) || 0, assists: (st.goals && st.goals.assists) || 0 }; });
            if (Object.keys(out).length) break;
          } catch {}
        }
        return out;
      };
      const buildSide = async (l) => {
        const xi = (l.startXI || []).map((e) => ({ name: e.player.name, pos: posCode(e.player.pos), number: e.player.number }));
        const bench = (l.substitutes || []).map((e) => ({ name: e.player.name, pos: posCode(e.player.pos) }));
        const stats = await playerStats(l.team.id);
        const get = (n) => stats[norm(n)] || { apps: 0, goals: 0, assists: 0 };
        // (2) titulaires habituels = top 11 par apparitions
        const regulars = new Set(Object.entries(stats).sort((a, b) => b[1].apps - a[1].apps).slice(0, 11).map(([n]) => n));
        const xiNorm = xi.map((p) => norm(p.name));
        const xiRegN = xiNorm.filter((n) => regulars.has(n)).length;
        const rotationShare = regulars.size ? clamp((Math.min(11, regulars.size) - xiRegN) / Math.min(11, regulars.size), 0, 1) : 0;
        // (3) qualité offensive : buts + 0,7·passes pondérés par poste, titulaires vs banc
        const off = (p) => { const s = get(p.name); return (p.pos === "A" ? 1 : p.pos === "M" ? 0.8 : p.pos === "D" ? 0.25 : 0) * (s.goals + 0.7 * s.assists); };
        const xiOff = xi.reduce((a, p) => a + off(p), 0), benchOff = bench.reduce((a, p) => a + off(p), 0), totOff = xiOff + benchOff;
        let attMul = 1, defMul = 1; const notes = [];
        // (1) formation : offensive -> +attaque ; moins de défenseurs -> +buts encaissés
        const f = l.formation || "";
        const parts = f.split("-").map(Number).filter((n) => !isNaN(n));
        const formOff = FORM_OFF[f] ?? (parts.length ? clamp(1 + 0.05 * (parts[parts.length - 1] - 3), 0.9, 1.12) : 1);
        attMul *= formOff;
        if (parts.length) defMul *= clamp(1 - 0.05 * (parts[0] - 4), 0.9, 1.12);
        if (formOff >= 1.05) notes.push("formation offensive (" + f + ")"); else if (formOff <= 0.93 && f) notes.push("formation défensive (" + f + ")");
        if (totOff > 0) { const share = xiOff / totOff; attMul *= clamp(0.85 + 0.3 * share, 0.85, 1.12); if (share < 0.6) notes.push("buteurs/passeurs clés sur le banc"); }
        if (rotationShare > 0.3) { attMul *= clamp(1 - 0.15 * rotationShare, 0.88, 1); defMul *= clamp(1 + 0.12 * rotationShare, 1, 1.12); notes.push("équipe remaniée (" + xiRegN + "/11 habituels)"); }
        attMul = clamp(attMul, 0.8, 1.2); defMul = clamp(defMul, 0.85, 1.2);
        return { team: l.team.name, formation: f, xi, bench, factor: { attMul, defMul, notes, xiRegulars: xiRegN } };
      };
      const pick = (q) => lineups.find((l) => matchTeam(l.team.name, q)) || null;
      const lh = pick(qh), la = pick(qa);
      const home = lh ? await buildSide(lh) : null, away = la ? await buildSide(la) : null;
      return res.status(200).json({ source, supported: true, found: true, ready: true, updated: new Date().toISOString(), home, away });
    } catch (e) {
      return res.status(200).json({ source, supported: false, note: "Compositions injoignables : " + String(e.message || e) });
    }
  }

  if (!token) return res.status(500).json({ error: "FOOTBALLDATA_TOKEN non configurée sur Vercel" });

  try {
    /* ---- BUTEURS POTENTIELS D'UN MATCH (?home=NomAnglais&away=NomAnglais) ----
     * Croise : effectifs WC + postes (football-data, gratuit), buteurs réels du
     * tournoi (football-data, gratuit) et stats en sélection (API-Football si clé).
     * Le frontend répartit les buts attendus du match entre les joueurs. */
    if (source === "goalscorers") {
      const qh = req.query.home, qa = req.query.away;
      if (!qh || !qa) return res.status(400).json({ error: "paramètres 'home' et 'away' requis" });
      // Les stats joueurs évoluent lentement : cache long pour préserver les quotas.
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=14400");
      const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
      const posCode = (p) => {
        const s = (p || "").toLowerCase();
        if (s.includes("keeper")) return "G";
        if (s.includes("midfield")) return "M";
        if (s.includes("back") || s.includes("defen")) return "D";
        if (s.includes("wing") || s.includes("forward") || s.includes("striker") || s.includes("offence") || s.includes("attack")) return "A";
        return "";
      };
      const [sr, tr] = await Promise.all([
        fetch("https://api.football-data.org/v4/competitions/WC/scorers?limit=100", { headers: H }),
        fetch("https://api.football-data.org/v4/competitions/WC/teams", { headers: H }),
      ]);
      const sj = sr.ok ? await sr.json() : {};
      const tj = tr.ok ? await tr.json() : {};
      const wcGoals = {}; // nom normalisé -> buts marqués dans le tournoi
      (sj.scorers || []).forEach((s) => { if (s.player && s.player.name) wcGoals[norm(s.player.name)] = s.goals || 0; });
      const findTeam = (q) => {
        const nq = norm(q);
        return (tj.teams || []).find((t) => norm(t.name) === nq || norm(t.shortName || "") === nq)
          || (tj.teams || []).find((t) => norm(t.name).includes(nq) || nq.includes(norm(t.name)));
      };
      const key = process.env.APIFOOTBALL_KEY;
      // Stats en sélection (buts/matchs) via API-Football, saison la plus récente dispo.
      const natStats = async (q) => {
        if (!key) return {};
        try {
          const AH = { "x-apisports-key": key };
          const trr = await fetch("https://v3.football.api-sports.io/teams?search=" + encodeURIComponent(q), { headers: AH });
          const tjj = await trr.json();
          const nat = (tjj.response || []).find((x) => x.team && x.team.national) || (tjj.response || [])[0];
          if (!nat) return {};
          for (const season of ["2026", "2025"]) {
            const pr = await fetch("https://v3.football.api-sports.io/players?team=" + nat.team.id + "&season=" + season, { headers: AH });
            const pj = await pr.json();
            const out = {};
            (pj.response || []).forEach((p) => {
              const st = (p.statistics || [])[0] || {};
              if (p.player && p.player.name) out[norm(p.player.name)] = { goals: (st.goals && st.goals.total) || 0, apps: (st.games && st.games.appearences) || 0 };
            });
            if (Object.keys(out).length) return out;
          }
        } catch {}
        return {};
      };
      const build = async (q) => {
        const t = findTeam(q);
        const stats = await natStats(q);
        // Index par nom de famille : tolère "K. Mbappé" (API-Football) vs "Kylian Mbappé".
        const statIdx = {};
        Object.entries(stats).forEach(([n, v]) => {
          const tk = n.split(" ").filter(Boolean);
          if (!tk.length) return;
          (statIdx[tk[tk.length - 1]] = statIdx[tk[tk.length - 1]] || []).push({ first: tk[0][0], ...v });
        });
        const players = ((t && t.squad) || []).map((p) => {
          const n = norm(p.name), tk = n.split(" ").filter(Boolean);
          const last = tk.length ? tk[tk.length - 1] : "";
          const cands = statIdx[last] || [];
          const st = cands.length === 1 ? cands[0] : cands.find((c) => tk.length && c.first === tk[0][0]);
          let wg = wcGoals[n];
          if (wg == null) { // repli : nom de famille + initiale
            const hit = Object.keys(wcGoals).find((k) => { const kt = k.split(" "); return kt[kt.length - 1] === last && k[0] === n[0]; });
            wg = hit != null ? wcGoals[hit] : 0;
          }
          return { name: p.name, position: posCode(p.position), wcGoals: wg, seasonGoals: st ? st.goals : null, apps: st ? st.apps : null };
        });
        return { team: t ? (t.shortName || t.name) : q, players };
      };
      const homeRes = await build(qh);
      const awayRes = await build(qa);
      return res.status(200).json({ source, updated: new Date().toISOString(), home: homeRes, away: awayRes });
    }

    /* ---- BUTEURS / PASSEURS ---- */
    if (source === "scorers") {
      if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });
      const r = await fetch("https://api.football-data.org/v4/competitions/" + league + "/scorers?limit=100", { headers: H });
      const j = await r.json();
      const players = (j.scorers || []).map((s) => ({
        name: s.player?.name,
        team: s.team?.name,
        goals: s.goals || 0,
        assists: s.assists || 0,
        penalties: s.penalties || 0,
        matches: s.playedMatches || 0,
      }));
      return res.status(200).json({ source, league, season: j.season?.startDate?.slice(0, 4), updated: new Date().toISOString(), players });
    }

    /* ---- CONFRONTATIONS DIRECTES (H2H) ---- */
    if (source === "h2h") {
      if (!home || !away) return res.status(400).json({ error: "paramètres 'home' et 'away' requis" });
      const r = await fetch("https://api.football-data.org/v4/teams/" + home + "/matches?status=FINISHED&limit=200", { headers: H });
      const j = await r.json();
      const meetings = (j.matches || [])
        .filter((m) => String(m.homeTeam.id) === String(away) || String(m.awayTeam.id) === String(away))
        .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
        .slice(0, 8)
        .map((m) => ({
          date: m.utcDate?.slice(0, 10),
          competition: m.competition?.name,
          homeTeam: m.homeTeam.name, awayTeam: m.awayTeam.name,
          homeGoals: m.score?.fullTime?.home, awayGoals: m.score?.fullTime?.away,
        }));
      return res.status(200).json({ source, home, away, updated: new Date().toISOString(), meetings });
    }

    /* ---- SÉLECTION NATIONALE via API-Football (squad + stats joueurs) ---- */
    if (source === "natteam") {
      const key = process.env.APIFOOTBALL_KEY;
      if (!key) return res.status(500).json({ error: "APIFOOTBALL_KEY non configurée (clé api-football.com requise pour les sélections)" });
      const q = req.query.q, season = req.query.season || "2024";
      if (!q) return res.status(400).json({ error: "paramètre 'q' (nom de la sélection) requis" });
      const AH = { "x-apisports-key": key };
      // 1) résoudre l'ID de l'équipe nationale par son nom
      const tr = await fetch("https://v3.football.api-sports.io/teams?search=" + encodeURIComponent(q), { headers: AH });
      const tj = await tr.json();
      const list = tj.response || [];
      const nat = list.find((x) => x.team && x.team.national) || list[0];
      if (!nat) return res.status(200).json({ source, team: q, players: [], note: "Équipe introuvable sur API-Football." });
      const teamId = nat.team.id, teamName = nat.team.name;
      // 2) joueurs + statistiques de la saison (paginé, borné à 3 pages pour le quota)
      let players = [], page = 1, totalPages = 1;
      do {
        const pr = await fetch("https://v3.football.api-sports.io/players?team=" + teamId + "&season=" + season + "&page=" + page, { headers: AH });
        const pj = await pr.json();
        totalPages = (pj.paging && pj.paging.total) || 1;
        (pj.response || []).forEach((p) => {
          const st = (p.statistics || [])[0] || {};
          players.push({
            name: p.player && p.player.name,
            nationality: p.player && p.player.nationality,
            age: p.player && p.player.age,
            position: (st.games && st.games.position) || "",
            appearances: (st.games && st.games.appearences) || 0,
            goals: (st.goals && st.goals.total) || 0,
            assists: (st.goals && st.goals.assists) || 0,
          });
        });
        page++;
      } while (page <= totalPages && page <= 2);
      players.sort((a, b) => b.goals - a.goals || b.assists - a.assists);
      return res.status(200).json({ source, team: teamName, season, count: players.length, players });
    }

    /* ---- APERÇU COMPÉTITION (saison, journée en cours) ---- */
    if (source === "competition") {
      if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });
      const r = await fetch("https://api.football-data.org/v4/competitions/" + league, { headers: H });
      const j = await r.json();
      return res.status(200).json({
        source, name: j.name, emblem: j.emblem, area: j.area ? j.area.name : "",
        season: j.currentSeason ? { start: j.currentSeason.startDate, end: j.currentSeason.endDate, matchday: j.currentSeason.currentMatchday } : null,
        updated: new Date().toISOString(),
      });
    }

    /* ---- ÉQUIPES D'UNE COMPÉTITION + EFFECTIFS (gratuit) ---- */
    if (source === "teams") {
      if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });
      const r = await fetch("https://api.football-data.org/v4/competitions/" + league + "/teams", { headers: H });
      const j = await r.json();
      const teams = (j.teams || []).map((t) => ({
        id: t.id, name: t.shortName || t.name, crest: t.crest,
        squad: (t.squad || []).map((p) => ({ name: p.name, position: p.position || "", nationality: p.nationality || "", dob: p.dateOfBirth || "" })),
      }));
      return res.status(200).json({ source, league, count: teams.length, teams });
    }

    /* ---- RÉSULTATS + PROCHAINS MATCHS d'une compétition ---- */
    if (source === "matches") {
      if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });
      const r = await fetch("https://api.football-data.org/v4/competitions/" + league + "/matches", { headers: H });
      const j = await r.json();
      const all = j.matches || [];
      const map = (m) => ({
        id: m.id, date: m.utcDate, status: m.status, matchday: m.matchday,
        // stage = tour (GROUP_STAGE, LAST_32, LAST_16, QUARTER_FINALS, SEMI_FINALS, FINAL…)
        // winner = vainqueur officiel (gère prolongation + tirs au but) : HOME_TEAM / AWAY_TEAM / DRAW.
        stage: m.stage, winner: m.score ? m.score.winner : null,
        homeId: m.homeTeam.id, awayId: m.awayTeam.id,
        home: m.homeTeam.shortName || m.homeTeam.name, away: m.awayTeam.shortName || m.awayTeam.name,
        homeGoals: m.score && m.score.fullTime ? m.score.fullTime.home : null,
        awayGoals: m.score && m.score.fullTime ? m.score.fullTime.away : null,
        // Cotes UNIQUEMENT si l'API les fournit (sinon null : non incluses dans le tier gratuit).
        odds: m.odds && typeof m.odds.homeWin === "number" ? { h: m.odds.homeWin, d: m.odds.draw, a: m.odds.awayWin } : null,
      });
      const noLimit = req.query.all === "1";
      const finished = all.filter((m) => m.status === "FINISHED").sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));
      const upcoming = all.filter((m) => ["TIMED", "SCHEDULED"].includes(m.status)).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
      return res.status(200).json({ source, league, updated: new Date().toISOString(), finished: (noLimit ? finished : finished.slice(0, 12)).map(map), upcoming: (noLimit ? upcoming : upcoming.slice(0, 12)).map(map) });
    }

    /* ---- RÉSULTATS INTERNATIONAUX (WC + EC multi-saisons pour H2H et forme) ---- */
    if (source === "intl") {
      const mapM = (m, comp) => {
        const hg = m.score?.fullTime?.home, ag = m.score?.fullTime?.away;
        if (hg == null || ag == null) return null;
        return {
          date: m.utcDate, comp,
          home: m.homeTeam.shortName || m.homeTeam.name,
          away: m.awayTeam.shortName || m.awayTeam.name,
          homeId: m.homeTeam.id, awayId: m.awayTeam.id,
          hg, ag,
        };
      };
      const endpoints = [
        ["WC26", "https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED"],
        ["WC22", "https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED&season=2022"],
        ["EC24", "https://api.football-data.org/v4/competitions/EC/matches?status=FINISHED&season=2024"],
        ["EC20", "https://api.football-data.org/v4/competitions/EC/matches?status=FINISHED&season=2020"],
      ];
      const all = [];
      await Promise.all(endpoints.map(async ([comp, url]) => {
        try {
          const r = await fetch(url, { headers: H });
          if (!r.ok) return;
          const d = await r.json();
          for (const m of (d.matches || [])) { const mm = mapM(m, comp); if (mm) all.push(mm); }
        } catch {}
      }));
      all.sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.status(200).json({ source: "intl", count: all.length, matches: all });
    }

    /* ---- CLASSEMENT -> FORCES (défaut) ---- */
    if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });
    const r = await fetch("https://api.football-data.org/v4/competitions/" + league + "/standings", { headers: H });
    const j = await r.json();
    const table = (j.standings || []).find((s) => s.type === "TOTAL")?.table || [];
    const homeTable = (j.standings || []).find((s) => s.type === "HOME")?.table || [];
    const awayTable = (j.standings || []).find((s) => s.type === "AWAY")?.table || [];
    const homeIdx = {}; homeTable.forEach(row => { homeIdx[row.team.id] = row; });
    const awayIdx = {}; awayTable.forEach(row => { awayIdx[row.team.id] = row; });
    let rows = table.map((row) => {
      const h = homeIdx[row.team.id], a = awayIdx[row.team.id];
      return {
        id: row.team.id,
        name: row.team.name,
        crest: row.team.crest,
        matches: row.playedGames,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        form: row.form || "",
        homeMatches: h?.playedGames || 0,
        homeGoalsFor: h?.goalsFor || 0,
        homeGoalsAgainst: h?.goalsAgainst || 0,
        awayMatches: a?.playedGames || 0,
        awayGoalsFor: a?.goalsFor || 0,
        awayGoalsAgainst: a?.goalsAgainst || 0,
      };
    }).filter((t) => t.matches > 0);
    if (!rows.length) return res.status(200).json({ source: "standings", league, teams: [] });
    const totM = rows.reduce((s, t) => s + t.matches, 0);
    const totG = rows.reduce((s, t) => s + t.goalsFor, 0);
    const leagueAvg = totM ? totG / totM : 1.35;
    const clamp = (x) => Math.max(0.6, Math.min(1.7, x));
    const teams = rows.map((t) => {
      const rr = ratings(t.matches, t.goalsFor, t.goalsAgainst, leagueAvg);
      const homeAtt = t.homeMatches >= 4 ? clamp((t.homeGoalsFor / t.homeMatches) / leagueAvg) : null;
      const awayAtt = t.awayMatches >= 4 ? clamp((t.awayGoalsFor / t.awayMatches) / leagueAvg) : null;
      const homeDef = t.homeMatches >= 4 ? clamp((t.homeGoalsAgainst / t.homeMatches) / leagueAvg) : null;
      const awayDef = t.awayMatches >= 4 ? clamp((t.awayGoalsAgainst / t.awayMatches) / leagueAvg) : null;
      return { ...t, att: rr.att, def: rr.def, homeAtt, awayAtt, homeDef, awayDef };
    });
    res.status(200).json({ source: "standings", league, leagueAvg, updated: new Date().toISOString(), teams });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
