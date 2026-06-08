/* ============================================================================
 * dataSources.js — couche d'intégration des statistiques pour PronosticFoot
 * ----------------------------------------------------------------------------
 * Objectif : ramener 6 sources hétérogènes à UN schéma commun (TeamStats),
 * puis convertir ce schéma en ratings att/def utilisés par le modèle
 * (mêmes conventions que le tableau POOL de PronosticFoot.jsx).
 *
 * Idée clé : la statistique la plus prédictive n'est PAS "toutes les stats",
 * c'est le xG / xGA (buts attendus pour / contre). Le reste (tirs, possession)
 * affine à la marge. On privilégie donc le xG quand il existe, sinon les buts.
 *
 * Réalité technique (CORS / clés) — résumé par source en bas de fichier :
 *   - Appelables depuis le navigateur : StatsBomb (JSON statique GitHub),
 *     TheSportsDB (clé dans l'URL).
 *   - Exigent un petit backend/proxy (clé secrète, CORS) : Sportmonks,
 *     API-Football, football-data.org, footballdata.io.
 * ==========================================================================*/

export const BASE_GOALS = 1.35; // doit rester aligné avec PronosticFoot.jsx

/* ----------------------------------------------------------------------------
 * 1) SCHÉMA UNIFIÉ
 * Tout adaptateur remplit (partiellement) cet objet par équipe.
 * Les champs null = "non fourni par cette source".
 * --------------------------------------------------------------------------*/
export function emptyTeamStats(name) {
  return {
    name,
    matches: 0,
    goalsFor: 0, goalsAgainst: 0,
    xgFor: null, xgAgainst: null,   // <- levier principal de prédiction
    shotsFor: null, shotsAgainst: null,
    possession: null,               // moyenne 0..1
    sources: [],                    // provenance, pour le debug
  };
}

/* ----------------------------------------------------------------------------
 * 2) CONVERSION TeamStats -> ratings att/def du modèle
 * att = production offensive relative ; def = encaissements relatifs (<1 = solide)
 * On utilise xG/match si dispo (signal plus stable que les buts), sinon buts/match.
 * leagueAvg = buts attendus moyens par équipe et par match dans l'échantillon.
 * --------------------------------------------------------------------------*/
export function ratingsFromStats(ts, leagueAvg = BASE_GOALS) {
  if (!ts || !ts.matches) return null;
  const useXg = ts.xgFor != null && ts.xgAgainst != null;
  const forPg = (useXg ? ts.xgFor : ts.goalsFor) / ts.matches;
  const agaPg = (useXg ? ts.xgAgainst : ts.goalsAgainst) / ts.matches;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  return {
    att: clamp(forPg / leagueAvg, 0.6, 1.7),
    def: clamp(agaPg / leagueAvg, 0.6, 1.7),
    basis: useXg ? "xG" : "buts",
    sample: ts.matches,
  };
}

/* ----------------------------------------------------------------------------
 * 3) FUSION DE PLUSIEURS SOURCES
 * On préfère les sources qui apportent du xG ; les autres complètent les buts.
 * --------------------------------------------------------------------------*/
export function mergeTeamStats(list) {
  const out = emptyTeamStats(list.find((s) => s && s.name)?.name || "");
  for (const s of list) {
    if (!s || !s.matches) continue;
    out.matches = Math.max(out.matches, s.matches);
    out.goalsFor += s.goalsFor; out.goalsAgainst += s.goalsAgainst;
    if (s.xgFor != null) out.xgFor = (out.xgFor || 0) + s.xgFor;
    if (s.xgAgainst != null) out.xgAgainst = (out.xgAgainst || 0) + s.xgAgainst;
    if (s.shotsFor != null) out.shotsFor = (out.shotsFor || 0) + s.shotsFor;
    out.sources.push(...s.sources);
  }
  return out;
}

/* ============================================================================
 * 4) ADAPTATEURS PAR SOURCE
 * Chaque adaptateur expose : meta (capacités) + fetch (récupération + mapping).
 * Les chemins exigeant une clé sont laissés en TODO clair.
 * ==========================================================================*/

/* --- 4.1 StatsBomb Open Data (GRATUIT, JSON statique sur GitHub) -------------
 * Données ÉVÉNEMENTIELLES réelles : chaque tir porte un xG (shot.statsbomb_xg).
 * Pas une API live : compétitions sélectionnées (Coupes du Monde, FA WSL,
 * Women's WC 2023, sélections de Liga/Champions League...). Idéal pour
 * CALCULER de vrais xG d'équipe hors-ligne et calibrer les ratings.
 * CORS : raw.githubusercontent.com est servi avec CORS -> appelable navigateur.
 * --------------------------------------------------------------------------*/
export const StatsBomb = {
  meta: {
    name: "StatsBomb Open Data", free: true, auth: "aucune", cors: true,
    live: false, provides: ["xG", "tirs", "événements", "compositions", "360 (partiel)"],
    note: "Historique de compétitions sélectionnées. À utiliser pour calibrer le modèle.",
  },
  base: "https://raw.githubusercontent.com/statsbomb/open-data/master/data",
  async listCompetitions() {
    const r = await fetch(`${this.base}/competitions.json`);
    return r.json();
  },
  async matches(competitionId, seasonId) {
    const r = await fetch(`${this.base}/matches/${competitionId}/${seasonId}.json`);
    return r.json();
  },
  async events(matchId) {
    const r = await fetch(`${this.base}/events/${matchId}.json`);
    return r.json();
  },
  // Agrège xG pour/contre et buts pour toutes les équipes d'une saison.
  async teamStatsForSeason(competitionId, seasonId) {
    const matches = await this.matches(competitionId, seasonId);
    const acc = {}; // name -> TeamStats
    const get = (n) => (acc[n] = acc[n] || emptyTeamStats(n));
    for (const m of matches) {
      const home = m.home_team.home_team_name, away = m.away_team.away_team_name;
      get(home).matches++; get(away).matches++;
      get(home).goalsFor += m.home_score; get(home).goalsAgainst += m.away_score;
      get(away).goalsFor += m.away_score; get(away).goalsAgainst += m.home_score;
      get(home).xgFor = get(home).xgFor || 0; get(home).xgAgainst = get(home).xgAgainst || 0;
      get(away).xgFor = get(away).xgFor || 0; get(away).xgAgainst = get(away).xgAgainst || 0;
      const events = await this.events(m.match_id);
      for (const e of events) {
        if (e.type?.name !== "Shot" || e.shot?.statsbomb_xg == null) continue;
        const t = e.team.name, opp = t === home ? away : home;
        get(t).xgFor += e.shot.statsbomb_xg;
        get(opp).xgAgainst += e.shot.statsbomb_xg;
        get(t).sources.push("StatsBomb");
      }
    }
    return acc;
  },
};

/* --- 4.2 Sportmonks (PAYANT ; gratuit = 2 ligues seulement) ------------------
 * REST v3 avec système d'"includes". xG via endpoints /expected/* (add-on
 * payant : Basic = +12 h après match, Advanced = live). Aussi : prédictions,
 * Pressure Index, cotes 50+ bookmakers. World Cup 2026 : forfaits dédiés.
 * Backend requis (token secret). --------------------------------------------*/
export const Sportmonks = {
  meta: {
    name: "Sportmonks", free: false, auth: "api_token (query)", cors: false, live: true,
    provides: ["xG (add-on)", "stats équipe/joueur", "prédictions", "cotes", "Pressure Index"],
    note: "Gratuit limité au Superliga danois + Premiership écossaise. xG = add-on.",
  },
  base: "https://api.sportmonks.com/v3/football",
  async teamSeasonStats({ token, seasonId, teamId }) {
    // includes : statistics + expected (xG) selon abonnement
    const url = `${this.base}/teams/${teamId}?api_token=${token}&include=statistics.details;` +
                `&filters=seasonStatisticTypes`;
    const r = await fetch(url);
    const j = await r.json();
    const ts = emptyTeamStats(j.data?.name || "");
    ts.sources.push("Sportmonks");
    // TODO mapping : parcourir j.data.statistics.details (type_id buts pour/contre,
    // tirs, possession). xG via /expected/fixtures?api_token=...&filters=fixtureSeasons:seasonId
    return ts;
  },
};

/* --- 4.3 API-Football (api-sports.io / RapidAPI) ----------------------------
 * Gratuit 100 req/jour, ~1236 ligues, TOUS les endpoints sur tous les tiers,
 * dont /teams/statistics (moyennes buts pour/contre) et /predictions
 * (probas pré-calculées). Pas de xG natif fiable -> on prend les moyennes buts.
 * Backend requis (clé). ------------------------------------------------------*/
export const ApiFootball = {
  meta: {
    name: "API-Football", free: true, auth: "x-apisports-key (header)", cors: false, live: true,
    provides: ["moyennes buts", "stats équipe/joueur", "prédictions", "cotes", "h2h"],
    note: "Gratuit = 100 req/jour. Cache agressif obligatoire.",
  },
  base: "https://v3.football.api-sports.io",
  async teamStatistics({ key, league, season, team }) {
    const r = await fetch(`${this.base}/teams/statistics?league=${league}&season=${season}&team=${team}`,
      { headers: { "x-apisports-key": key } });
    const d = (await r.json()).response;
    const ts = emptyTeamStats(d?.team?.name || "");
    if (d) {
      ts.matches = d.fixtures.played.total;
      ts.goalsFor = d.goals.for.total.total;
      ts.goalsAgainst = d.goals.against.total.total;
      ts.sources.push("API-Football");
    }
    return ts;
  },
  // Prédictions toutes faites (à éventuellement ensembler avec le modèle Poisson)
  async predictions({ key, fixture }) {
    const r = await fetch(`${this.base}/predictions?fixture=${fixture}`,
      { headers: { "x-apisports-key": key } });
    const p = (await r.json()).response?.[0]?.predictions?.percent;
    if (!p) return null;
    return { pH: parseFloat(p.home) / 100, pD: parseFloat(p.draw) / 100, pA: parseFloat(p.away) / 100 };
  },
};

/* --- 4.4 Football-Data.org (GRATUIT, 12 grandes compétitions) ----------------
 * 10 req/min, saison en cours, PAS de stats joueurs ni xG en gratuit.
 * Sert les résultats/classements -> buts pour/contre. Backend requis (token).
 * --------------------------------------------------------------------------*/
export const FootballDataOrg = {
  meta: {
    name: "football-data.org", free: true, auth: "X-Auth-Token (header)", cors: false, live: false,
    provides: ["résultats", "classements", "calendrier", "buteurs"],
    note: "12 compétitions, 10 req/min, saison courante. Pas de xG.",
  },
  base: "https://api.football-data.org/v4",
  async teamFinishedMatches({ token, teamId }) {
    const r = await fetch(`${this.base}/teams/${teamId}/matches?status=FINISHED`,
      { headers: { "X-Auth-Token": token } });
    const j = await r.json();
    const ts = emptyTeamStats("");
    for (const m of j.matches || []) {
      const home = m.homeTeam.id === teamId;
      ts.name = home ? m.homeTeam.name : m.awayTeam.name;
      ts.matches++;
      ts.goalsFor += home ? m.score.fullTime.home : m.score.fullTime.away;
      ts.goalsAgainst += home ? m.score.fullTime.away : m.score.fullTime.home;
    }
    ts.sources.push("football-data.org");
    return ts;
  },
};

/* --- 4.5 TheSportsDB (GRATUIT clé "123", appelable navigateur) ---------------
 * Métadonnées + résultats + classements (W/D/L, buts). PAS de xG/stats avancées.
 * Free ~30 req/min, renvoie ~10 résultats. Bon pour logos/résultats, pas pour
 * un modèle exigeant. ---------------------------------------------------------*/
export const TheSportsDB = {
  meta: {
    name: "TheSportsDB", free: true, auth: "clé dans l'URL (123)", cors: true, live: false,
    provides: ["résultats", "classements", "logos", "métadonnées"],
    note: "Communautaire. Pas de xG. Idéal habillage/logos + résultats simples.",
  },
  base: "https://www.thesportsdb.com/api/v1/json/123",
  async lastEvents(teamId) {
    const r = await fetch(`${this.base}/eventslast.php?id=${teamId}`);
    const j = await r.json();
    const ts = emptyTeamStats("");
    for (const e of j.results || []) {
      const home = String(e.idHomeTeam) === String(teamId);
      ts.name = home ? e.strHomeTeam : e.strAwayTeam;
      const gf = parseInt(home ? e.intHomeScore : e.intAwayScore, 10);
      const ga = parseInt(home ? e.intAwayScore : e.intHomeScore, 10);
      if (Number.isNaN(gf) || Number.isNaN(ga)) continue;
      ts.matches++; ts.goalsFor += gf; ts.goalsAgainst += ga;
    }
    ts.sources.push("TheSportsDB");
    return ts;
  },
};

/* --- 4.6 Footballdata.io (PAYANT, axé prédictions) --------------------------
 * "Football Predictions API" : renvoie directement les probas
 * domicile / nul / extérieur en JSON. À utiliser tel quel OU à ensembler avec
 * le modèle Poisson. Backend requis (clé). ----------------------------------*/
export const FootballDataIO = {
  meta: {
    name: "footballdata.io", free: false, auth: "clé API", cors: false, live: true,
    provides: ["prédictions (1/N/2)", "données match prêtes"],
    note: "Renvoie des probabilités déjà calculées.",
  },
  base: "https://api.footballdata.io", // cf. docs du compte pour le chemin exact
  async predictions({ key, fixtureId }) {
    const r = await fetch(`${this.base}/predictions/${fixtureId}`,
      { headers: { Authorization: `Bearer ${key}` } });
    const p = await r.json();
    // TODO : adapter aux noms de champs renvoyés par ton compte
    return p?.probabilities
      ? { pH: p.probabilities.home, pD: p.probabilities.draw, pA: p.probabilities.away }
      : null;
  },
};

export const SOURCES = [StatsBomb, Sportmonks, ApiFootball, FootballDataOrg, TheSportsDB, FootballDataIO];

/* ============================================================================
 * 5) EXEMPLE D'USAGE -> alimenter le POOL de PronosticFoot.jsx
 * ----------------------------------------------------------------------------
 *   import { TheSportsDB, ratingsFromStats } from "./dataSources";
 *   const ts = await TheSportsDB.lastEvents("133604");      // ex: un teamId
 *   const r = ratingsFromStats(ts);                          // {att, def, basis}
 *   // puis : POOL[i].att = r.att ; POOL[i].def = r.def ;
 *
 * STRATÉGIE RECOMMANDÉE
 *   - Calibrer att/def hors-ligne avec StatsBomb (xG réels) quand la compétition
 *     y est couverte ; sinon partir des moyennes buts (API-Football /
 *     football-data.org) et viser le xG dès que le budget le permet (Sportmonks).
 *   - Ensembler éventuellement : proba finale = 0.7 * modèle_Poisson
 *     + 0.3 * prédiction_fournisseur (API-Football / footballdata.io).
 *   - Mettre en cache classements/historiques (changent peu) pour épargner les quotas.
 *   - Côté navigateur, seules StatsBomb et TheSportsDB passent sans proxy ;
 *     les autres -> route via une petite fonction serveur (Vercel/Supabase) qui
 *     garde la clé secrète et règle le CORS.
 * ==========================================================================*/
