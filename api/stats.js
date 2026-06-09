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

  if (!token) return res.status(500).json({ error: "FOOTBALLDATA_TOKEN non configurée sur Vercel" });

  try {
    /* ---- BUTEURS / PASSEURS ---- */
    if (source === "scorers") {
      if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });
      const r = await fetch("https://api.football-data.org/v4/competitions/" + league + "/scorers?limit=40", { headers: H });
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
        homeId: m.homeTeam.id, awayId: m.awayTeam.id,
        home: m.homeTeam.shortName || m.homeTeam.name, away: m.awayTeam.shortName || m.awayTeam.name,
        homeGoals: m.score && m.score.fullTime ? m.score.fullTime.home : null,
        awayGoals: m.score && m.score.fullTime ? m.score.fullTime.away : null,
        // Cotes UNIQUEMENT si l'API les fournit (sinon null : non incluses dans le tier gratuit).
        odds: m.odds && typeof m.odds.homeWin === "number" ? { h: m.odds.homeWin, d: m.odds.draw, a: m.odds.awayWin } : null,
      });
      const finished = all.filter((m) => m.status === "FINISHED").sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate)).slice(0, 12).map(map);
      const upcoming = all.filter((m) => ["TIMED", "SCHEDULED"].includes(m.status)).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)).slice(0, 12).map(map);
      return res.status(200).json({ source, league, updated: new Date().toISOString(), finished, upcoming });
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
