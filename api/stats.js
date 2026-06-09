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

    /* ---- CLASSEMENT -> FORCES (défaut) ---- */
    if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });
    const r = await fetch("https://api.football-data.org/v4/competitions/" + league + "/standings", { headers: H });
    const j = await r.json();
    const table = (j.standings || []).find((s) => s.type === "TOTAL")?.table || [];
    let rows = table.map((row) => ({
      id: row.team.id,
      name: row.team.name,
      crest: row.team.crest,
      matches: row.playedGames,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
    })).filter((t) => t.matches > 0);
    if (!rows.length) return res.status(200).json({ source: "standings", league, teams: [] });
    const totM = rows.reduce((s, t) => s + t.matches, 0);
    const totG = rows.reduce((s, t) => s + t.goalsFor, 0);
    const leagueAvg = totM ? totG / totM : 1.35;
    const teams = rows.map((t) => { const rr = ratings(t.matches, t.goalsFor, t.goalsAgainst, leagueAvg); return { ...t, att: rr.att, def: rr.def }; });
    res.status(200).json({ source: "standings", league, leagueAvg, updated: new Date().toISOString(), teams });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
