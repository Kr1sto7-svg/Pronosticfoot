/* Proxy serverless Vercel : récupère les stats réelles d'un championnat,
 * calcule les forces att/def, et renvoie un JSON normalisé.
 * - garde la clé API secrète côté serveur (jamais exposée au navigateur)
 * - règle le CORS
 * - met en cache au bord (Vercel Edge) pour respecter les quotas gratuits
 *
 * Une seule requête API par appel : on lit le CLASSEMENT (standings), qui
 * contient déjà, pour chaque équipe, matchs joués + buts pour/contre.
 * => "temps réel" sûr : à chaque chargement on relit le classement courant,
 *    mais le cache limite à ~1 requête / 10 min vers le fournisseur.
 */

function ratings(matches, gf, ga, leagueAvg) {
  const fp = gf / matches, ap = ga / matches;
  const clamp = (x) => Math.max(0.6, Math.min(1.7, x));
  return { att: clamp(fp / leagueAvg), def: clamp(ap / leagueAvg) };
}

export default async function handler(req, res) {
  const { source = "apifootball", league, season } = req.query;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
  if (!league) return res.status(400).json({ error: "paramètre 'league' requis" });

  try {
    let rows = [];

    if (source === "apifootball") {
      const key = process.env.APIFOOTBALL_KEY;
      if (!key) return res.status(500).json({ error: "APIFOOTBALL_KEY non configurée sur Vercel" });
      const r = await fetch(
        "https://v3.football.api-sports.io/standings?league=" + league + "&season=" + (season || ""),
        { headers: { "x-apisports-key": key } }
      );
      const j = await r.json();
      const table = j?.response?.[0]?.league?.standings?.[0] || [];
      rows = table.map((row) => ({
        name: row.team.name,
        matches: row.all.played,
        goalsFor: row.all.goals.for,
        goalsAgainst: row.all.goals.against,
      }));
    } else if (source === "footballdata") {
      const token = process.env.FOOTBALLDATA_TOKEN;
      if (!token) return res.status(500).json({ error: "FOOTBALLDATA_TOKEN non configurée sur Vercel" });
      // ici 'league' est un code : PL, FL1, PD, SA, BL1, CL...
      const r = await fetch(
        "https://api.football-data.org/v4/competitions/" + league + "/standings",
        { headers: { "X-Auth-Token": token } }
      );
      const j = await r.json();
      const table = (j.standings || []).find((s) => s.type === "TOTAL")?.table || [];
      rows = table.map((row) => ({
        name: row.team.name,
        matches: row.playedGames,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
      }));
    } else {
      return res.status(400).json({ error: "source inconnue (apifootball | footballdata)" });
    }

    rows = rows.filter((t) => t.matches > 0);
    if (!rows.length) return res.status(200).json({ source, league, season, teams: [] });

    const totM = rows.reduce((s, t) => s + t.matches, 0);
    const totG = rows.reduce((s, t) => s + t.goalsFor, 0);
    const leagueAvg = totM ? totG / totM : 1.35;

    const teams = rows.map((t) => {
      const r = ratings(t.matches, t.goalsFor, t.goalsAgainst, leagueAvg);
      return { ...t, att: r.att, def: r.def, basis: "buts" };
    });

    res.status(200).json({ source, league, season, leagueAvg, updated: new Date().toISOString(), teams });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
