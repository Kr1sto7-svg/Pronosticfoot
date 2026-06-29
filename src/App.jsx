import React, { useState, useMemo, useEffect } from "react";
import { ArrowLeftRight, Check, ChevronDown, Info, Pencil, Plug, ShieldAlert, TrendingUp, Trophy, RotateCcw, Target, Layers, Radio, Users, X } from "lucide-react";

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
const ELO_BETA = 0.25; // poids de l'écart Elo sur les xG : ±400 Elo ≈ ×1.28 / ÷1.28
const WC_AVG = 1.18;
const LEAGUE_GOALS_AVG = { PL: 1.38, PD: 1.30, BL1: 1.57, SA: 1.28, FL1: 1.35, CL: 1.40, DED: 1.45, PPL: 1.32, WC: 1.18, EC: 1.20 };
const LEAGUE_RHO = { PL: -0.12, PD: -0.11, BL1: -0.10, SA: -0.15, FL1: -0.12, CL: -0.13, DED: -0.11, PPL: -0.12, WC: -0.08, EC: -0.09 };
const LETTERS = "ABCDEFGHIJKL".split("");
/* Calendrier OFFICIEL des matchs de groupes (FIFA), dans l'ordre chronologique réel.
 * x / y = position des équipes dans GROUPS_2026 (orientation domicile/extérieur officielle) ;
 * iso = coup d'envoi en UTC, affiché en heure française via formatFrDate ;
 * m6 = diffusé en clair sur M6 (les 104 matchs sont sur beIN Sports). */
const WC_MATCHES = [
  /* A */ [{ x: 0, y: 2, iso: "2026-06-11T19:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-12T02:00:00Z" }, { x: 3, y: 2, iso: "2026-06-18T16:00:00Z", m6: 1 }, { x: 0, y: 1, iso: "2026-06-19T01:00:00Z" }, { x: 3, y: 0, iso: "2026-06-25T01:00:00Z" }, { x: 2, y: 1, iso: "2026-06-25T01:00:00Z" }],
  /* B */ [{ x: 0, y: 3, iso: "2026-06-12T19:00:00Z", m6: 1 }, { x: 2, y: 1, iso: "2026-06-13T19:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-18T19:00:00Z", m6: 1 }, { x: 0, y: 2, iso: "2026-06-18T22:00:00Z" }, { x: 1, y: 0, iso: "2026-06-24T19:00:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-24T19:00:00Z" }],
  /* C */ [{ x: 0, y: 1, iso: "2026-06-13T22:00:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-14T01:00:00Z" }, { x: 2, y: 1, iso: "2026-06-19T22:00:00Z", m6: 1 }, { x: 0, y: 3, iso: "2026-06-20T00:30:00Z" }, { x: 2, y: 0, iso: "2026-06-24T22:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-24T22:00:00Z" }],
  /* D */ [{ x: 0, y: 1, iso: "2026-06-13T01:00:00Z" }, { x: 2, y: 3, iso: "2026-06-14T04:00:00Z" }, { x: 0, y: 2, iso: "2026-06-19T19:00:00Z", m6: 1 }, { x: 3, y: 1, iso: "2026-06-20T03:00:00Z" }, { x: 3, y: 0, iso: "2026-06-26T02:00:00Z" }, { x: 1, y: 2, iso: "2026-06-26T02:00:00Z" }],
  /* E */ [{ x: 0, y: 3, iso: "2026-06-14T17:00:00Z", m6: 1 }, { x: 2, y: 1, iso: "2026-06-14T23:00:00Z" }, { x: 0, y: 2, iso: "2026-06-20T20:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-21T00:00:00Z" }, { x: 3, y: 2, iso: "2026-06-25T20:00:00Z" }, { x: 1, y: 0, iso: "2026-06-25T20:00:00Z", m6: 1 }],
  /* F */ [{ x: 0, y: 1, iso: "2026-06-14T20:00:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-15T02:00:00Z" }, { x: 0, y: 3, iso: "2026-06-20T17:00:00Z", m6: 1 }, { x: 2, y: 1, iso: "2026-06-21T04:00:00Z" }, { x: 1, y: 3, iso: "2026-06-25T23:00:00Z" }, { x: 2, y: 0, iso: "2026-06-25T23:00:00Z", m6: 1 }],
  /* G */ [{ x: 0, y: 2, iso: "2026-06-15T19:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-16T01:00:00Z" }, { x: 0, y: 1, iso: "2026-06-21T19:00:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-22T01:00:00Z" }, { x: 2, y: 1, iso: "2026-06-27T03:00:00Z" }, { x: 3, y: 0, iso: "2026-06-27T03:00:00Z" }],
  /* H */ [{ x: 0, y: 3, iso: "2026-06-15T16:00:00Z", m6: 1 }, { x: 2, y: 1, iso: "2026-06-15T22:00:00Z", m6: 1 }, { x: 0, y: 2, iso: "2026-06-21T16:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-21T22:00:00Z" }, { x: 3, y: 2, iso: "2026-06-27T00:00:00Z" }, { x: 1, y: 0, iso: "2026-06-27T00:00:00Z" }],
  /* I */ [{ x: 0, y: 1, iso: "2026-06-16T19:00:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-16T22:00:00Z", m6: 1 }, { x: 0, y: 3, iso: "2026-06-22T21:00:00Z", m6: 1 }, { x: 2, y: 1, iso: "2026-06-23T00:00:00Z" }, { x: 2, y: 0, iso: "2026-06-26T19:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-26T19:00:00Z" }],
  /* J */ [{ x: 0, y: 2, iso: "2026-06-17T01:00:00Z" }, { x: 1, y: 3, iso: "2026-06-17T04:00:00Z" }, { x: 0, y: 1, iso: "2026-06-22T17:00:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-23T03:00:00Z" }, { x: 2, y: 1, iso: "2026-06-28T02:00:00Z" }, { x: 3, y: 0, iso: "2026-06-28T02:00:00Z" }],
  /* K */ [{ x: 0, y: 3, iso: "2026-06-17T17:00:00Z", m6: 1 }, { x: 2, y: 1, iso: "2026-06-18T02:00:00Z" }, { x: 0, y: 2, iso: "2026-06-23T17:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-24T02:00:00Z" }, { x: 1, y: 0, iso: "2026-06-27T23:30:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-27T23:30:00Z" }],
  /* L */ [{ x: 0, y: 1, iso: "2026-06-17T20:00:00Z", m6: 1 }, { x: 3, y: 2, iso: "2026-06-17T23:00:00Z" }, { x: 0, y: 3, iso: "2026-06-23T20:00:00Z", m6: 1 }, { x: 2, y: 1, iso: "2026-06-23T23:00:00Z" }, { x: 2, y: 0, iso: "2026-06-27T21:00:00Z", m6: 1 }, { x: 1, y: 3, iso: "2026-06-27T21:00:00Z" }],
];
const groupPairs = (gi) => WC_MATCHES[gi].map((m) => [m.x, m.y]);

/* Les 48 équipes RÉELLEMENT qualifiées pour la Coupe du Monde 2026.
 * Ratings att/def illustratifs (par niveau) ; ils se recalibrent dès que tu
 * saisis de vrais scores ou via l'onglet Live. */
const POOL = [
  { n: "Argentine",        f: "🇦🇷", elo: 2090, att: 1.70, def: 0.68 },
  { n: "France",           f: "🇫🇷", elo: 2085, att: 1.65, def: 0.72 },
  { n: "Espagne",          f: "🇪🇸", elo: 2075, att: 1.70, def: 0.74 },
  { n: "Brésil",           f: "🇧🇷", elo: 2060, att: 1.62, def: 0.72 },
  { n: "Angleterre",       f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 2035, att: 1.55, def: 0.76 },
  { n: "Portugal",         f: "🇵🇹", elo: 2030, att: 1.60, def: 0.84 },
  { n: "Allemagne",        f: "🇩🇪", elo: 1990, att: 1.38, def: 0.84 },
  { n: "Pays-Bas",         f: "🇳🇱", elo: 1985, att: 1.32, def: 0.82 },
  { n: "Belgique",         f: "🇧🇪", elo: 1955, att: 1.28, def: 0.88 },
  { n: "Croatie",          f: "🇭🇷", elo: 1940, att: 1.14, def: 0.84 },
  { n: "Uruguay",          f: "🇺🇾", elo: 1930, att: 1.20, def: 0.84 },
  { n: "Colombie",         f: "🇨🇴", elo: 1900, att: 1.16, def: 0.88 },
  { n: "Maroc",            f: "🇲🇦", elo: 1885, att: 1.10, def: 0.76 },
  { n: "Norvège",          f: "🇳🇴", elo: 1865, att: 1.28, def: 0.92 },
  { n: "Sénégal",          f: "🇸🇳", elo: 1850, att: 1.10, def: 0.84 },
  { n: "Suisse",           f: "🇨🇭", elo: 1840, att: 1.02, def: 0.90 },
  { n: "Japon",            f: "🇯🇵", elo: 1835, att: 1.10, def: 0.92 },
  { n: "Autriche",         f: "🇦🇹", elo: 1830, att: 1.10, def: 0.92 },
  { n: "Équateur",         f: "🇪🇨", elo: 1820, att: 1.02, def: 0.84 },
  { n: "Turquie",          f: "🇹🇷", elo: 1815, att: 1.10, def: 0.92 },
  { n: "Mexique",          f: "🇲🇽", elo: 1810, att: 1.06, def: 0.92 },
  { n: "Tchéquie",         f: "🇨🇿", elo: 1800, att: 1.02, def: 0.92 },
  { n: "États-Unis",       f: "🇺🇸", elo: 1800, att: 1.06, def: 0.92 },
  { n: "Corée du Sud",     f: "🇰🇷", elo: 1790, att: 1.02, def: 0.92 },
  { n: "Suède",            f: "🇸🇪", elo: 1785, att: 1.06, def: 0.92 },
  { n: "Côte d'Ivoire",    f: "🇨🇮", elo: 1775, att: 1.02, def: 0.94 },
  { n: "Canada",           f: "🇨🇦", elo: 1770, att: 1.02, def: 0.96 },
  { n: "Algérie",          f: "🇩🇿", elo: 1770, att: 1.06, def: 0.90 },
  { n: "Iran",             f: "🇮🇷", elo: 1760, att: 0.94, def: 0.86 },
  { n: "Égypte",           f: "🇪🇬", elo: 1760, att: 0.98, def: 0.92 },
  { n: "Écosse",           f: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", elo: 1760, att: 0.98, def: 0.92 },
  { n: "RD Congo",         f: "🇨🇩", elo: 1730, att: 1.02, def: 1.02 },
  { n: "Ghana",            f: "🇬🇭", elo: 1730, att: 0.98, def: 1.02 },
  { n: "Paraguay",         f: "🇵🇾", elo: 1740, att: 0.86, def: 0.94 },
  { n: "Australie",        f: "🇦🇺", elo: 1720, att: 0.86, def: 1.02 },
  { n: "Afrique du Sud",   f: "🇿🇦", elo: 1720, att: 0.90, def: 1.02 },
  { n: "Bosnie-Herzégovine",f: "🇧🇦", elo: 1720, att: 0.94, def: 1.04 },
  { n: "Tunisie",          f: "🇹🇳", elo: 1710, att: 0.86, def: 0.94 },
  { n: "Ouzbékistan",      f: "🇺🇿", elo: 1680, att: 0.86, def: 1.02 },
  { n: "Panama",           f: "🇵🇦", elo: 1670, att: 0.82, def: 1.04 },
  { n: "Qatar",            f: "🇶🇦", elo: 1665, att: 0.82, def: 1.06 },
  { n: "Arabie saoudite",  f: "🇸🇦", elo: 1660, att: 0.82, def: 1.04 },
  { n: "Jordanie",         f: "🇯🇴", elo: 1660, att: 0.82, def: 0.98 },
  { n: "Irak",             f: "🇮🇶", elo: 1650, att: 0.80, def: 1.04 },
  { n: "Cap-Vert",         f: "🇨🇻", elo: 1640, att: 0.82, def: 1.04 },
  { n: "Haïti",            f: "🇭🇹", elo: 1600, att: 0.76, def: 1.10 },
  { n: "Curaçao",          f: "🇨🇼", elo: 1580, att: 0.70, def: 1.14 },
  { n: "Nouvelle-Zélande", f: "🇳🇿", elo: 1560, att: 0.70, def: 1.20 },
];

/* Sélections NON qualifiées pour le Mondial 2026, disponibles dans l'onglet
 * Match (mode International) uniquement — le POOL ci-dessus reste la référence
 * des 48 qualifiés pour l'onglet Mondial 26. Mêmes conventions de ratings. */
const EXTRA_NATIONS = [
  { n: "Albanie",             f: "🇦🇱", elo: 1690, att: 0.82, def: 1.00 },
  { n: "Bahreïn",             f: "🇧🇭", elo: 1620, att: 0.75, def: 1.08 },
  { n: "Bolivie",             f: "🇧🇴", elo: 1640, att: 0.80, def: 1.15 },
  { n: "Burkina Faso",        f: "🇧🇫", elo: 1720, att: 0.95, def: 1.00 },
  { n: "Cameroun",            f: "🇨🇲", elo: 1780, att: 1.05, def: 0.95 },
  { n: "Chili",               f: "🇨🇱", elo: 1760, att: 0.95, def: 1.00 },
  { n: "Chine",               f: "🇨🇳", elo: 1600, att: 0.72, def: 1.12 },
  { n: "Costa Rica",          f: "🇨🇷", elo: 1720, att: 0.85, def: 1.00 },
  { n: "Danemark",            f: "🇩🇰", elo: 1865, att: 1.15, def: 0.85 },
  { n: "Émirats arabes unis", f: "🇦🇪", elo: 1680, att: 0.85, def: 1.05 },
  { n: "Finlande",            f: "🇫🇮", elo: 1650, att: 0.80, def: 1.08 },
  { n: "Gabon",               f: "🇬🇦", elo: 1710, att: 0.95, def: 1.05 },
  { n: "Géorgie",             f: "🇬🇪", elo: 1700, att: 0.95, def: 1.05 },
  { n: "Grèce",               f: "🇬🇷", elo: 1790, att: 1.10, def: 0.95 },
  { n: "Guinée",              f: "🇬🇳", elo: 1680, att: 0.85, def: 1.05 },
  { n: "Honduras",            f: "🇭🇳", elo: 1670, att: 0.80, def: 1.05 },
  { n: "Hongrie",             f: "🇭🇺", elo: 1760, att: 1.00, def: 1.00 },
  { n: "Irlande",             f: "🇮🇪", elo: 1720, att: 0.90, def: 1.00 },
  { n: "Italie",              f: "🇮🇹", elo: 1950, att: 1.30, def: 0.80 },
  { n: "Jamaïque",            f: "🇯🇲", elo: 1690, att: 0.85, def: 1.05 },
  { n: "Macédoine du Nord",   f: "🇲🇰", elo: 1680, att: 0.82, def: 1.05 },
  { n: "Mali",                f: "🇲🇱", elo: 1760, att: 1.00, def: 0.92 },
  { n: "Nigeria",             f: "🇳🇬", elo: 1800, att: 1.10, def: 0.92 },
  { n: "Oman",                f: "🇴🇲", elo: 1640, att: 0.78, def: 1.05 },
  { n: "Pays de Galles",      f: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", elo: 1740, att: 0.95, def: 1.00 },
  { n: "Pérou",               f: "🇵🇪", elo: 1740, att: 0.85, def: 0.98 },
  { n: "Pologne",             f: "🇵🇱", elo: 1800, att: 1.05, def: 0.95 },
  { n: "Roumanie",            f: "🇷🇴", elo: 1730, att: 0.95, def: 1.02 },
  { n: "Serbie",              f: "🇷🇸", elo: 1780, att: 1.00, def: 0.98 },
  { n: "Slovaquie",           f: "🇸🇰", elo: 1740, att: 0.90, def: 0.98 },
  { n: "Slovénie",            f: "🇸🇮", elo: 1700, att: 0.85, def: 1.00 },
  { n: "Ukraine",             f: "🇺🇦", elo: 1790, att: 1.05, def: 0.95 },
  { n: "Venezuela",           f: "🇻🇪", elo: 1720, att: 0.90, def: 1.02 },
  { n: "Zambie",              f: "🇿🇲", elo: 1650, att: 0.85, def: 1.10 },
];

/* ---------- Championnats nationaux (onglet Match, mode "National") ----------
 * Effectifs 2025-26 des 5 grands championnats. Ratings att/def ILLUSTRATIFS
 * (mêmes conventions que POOL : att/def relatifs à la moyenne de la ligue,
 * elo sur l'échelle clubelo). Le modèle de calcul est identique. */
const CLUB_LEAGUES = [
  { code: "FL1", n: "Ligue 1", f: "🇫🇷" },
  { code: "PD",  n: "La Liga", f: "🇪🇸" },
  { code: "PL",  n: "Premier League", f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "BL1", n: "Bundesliga", f: "🇩🇪" },
  { code: "SA",  n: "Serie A (Calcio)", f: "🇮🇹" },
];
const CLUB_POOL = {
  /* Ligue 1 calibrée sur la saison 2025-26 : PSG intouchable, Lens (meilleure
   * défense) et Marseille (meilleure attaque) en dauphins, Strasbourg/Lyon/Lille
   * en chasse ; Nice et Monaco en retrait ; Metz/Auxerre/Lorient à la peine. */
  FL1: [
    { n: "Angers",        f: "🇫🇷", elo: 1670, att: 0.72, def: 1.12 },
    { n: "Auxerre",       f: "🇫🇷", elo: 1650, att: 0.70, def: 1.18 },
    { n: "Brest",         f: "🇫🇷", elo: 1700, att: 0.92, def: 1.15 },
    { n: "Le Havre",      f: "🇫🇷", elo: 1690, att: 0.80, def: 1.05 },
    { n: "Lens",          f: "🇫🇷", elo: 1850, att: 1.20, def: 0.72 },
    { n: "Lille",         f: "🇫🇷", elo: 1810, att: 1.20, def: 0.95 },
    { n: "Lorient",       f: "🇫🇷", elo: 1660, att: 0.85, def: 1.25 },
    { n: "Lyon",          f: "🇫🇷", elo: 1800, att: 1.05, def: 0.85 },
    { n: "Marseille",     f: "🇫🇷", elo: 1870, att: 1.45, def: 0.90 },
    { n: "Metz",          f: "🇫🇷", elo: 1620, att: 0.65, def: 1.30 },
    { n: "Monaco",        f: "🇫🇷", elo: 1790, att: 1.15, def: 1.05 },
    { n: "Nantes",        f: "🇫🇷", elo: 1670, att: 0.75, def: 1.10 },
    { n: "Nice",          f: "🇫🇷", elo: 1730, att: 0.95, def: 1.10 },
    { n: "Paris FC",      f: "🇫🇷", elo: 1710, att: 0.95, def: 1.15 },
    { n: "Paris SG",      f: "🇫🇷", elo: 2050, att: 1.55, def: 0.70 },
    { n: "Rennes",        f: "🇫🇷", elo: 1760, att: 1.05, def: 1.05 },
    { n: "Strasbourg",    f: "🇫🇷", elo: 1800, att: 1.20, def: 1.00 },
    { n: "Toulouse",      f: "🇫🇷", elo: 1730, att: 0.95, def: 1.00 },
  ],
  /* Liga calibrée sur la saison 2025-26 : duel Barça (attaque record, défense
   * friable) / Real Madrid ; Villarreal excellent 3e, Atlético solide ; Betis et
   * Espanyol bonnes surprises, Athletic en retrait ; Girona, Levante, Oviedo,
   * Valence et Majorque dans le dur. */
  PD: [
    { n: "Alavés",          f: "🇪🇸", elo: 1700, att: 0.80, def: 0.95 },
    { n: "Athletic Bilbao", f: "🇪🇸", elo: 1810, att: 0.95, def: 0.90 },
    { n: "Atlético Madrid", f: "🇪🇸", elo: 1920, att: 1.25, def: 0.80 },
    { n: "Barcelone",       f: "🇪🇸", elo: 2030, att: 1.65, def: 0.90 },
    { n: "Betis Séville",   f: "🇪🇸", elo: 1840, att: 1.15, def: 0.92 },
    { n: "Celta Vigo",      f: "🇪🇸", elo: 1760, att: 1.00, def: 1.00 },
    { n: "Elche",           f: "🇪🇸", elo: 1730, att: 0.95, def: 0.98 },
    { n: "Espanyol",        f: "🇪🇸", elo: 1770, att: 1.00, def: 0.98 },
    { n: "Getafe",          f: "🇪🇸", elo: 1740, att: 0.85, def: 0.95 },
    { n: "Girona",          f: "🇪🇸", elo: 1690, att: 0.80, def: 1.20 },
    { n: "Levante",         f: "🇪🇸", elo: 1660, att: 0.85, def: 1.20 },
    { n: "Majorque",        f: "🇪🇸", elo: 1690, att: 0.85, def: 1.10 },
    { n: "Osasuna",         f: "🇪🇸", elo: 1710, att: 0.82, def: 1.02 },
    { n: "Rayo Vallecano",  f: "🇪🇸", elo: 1750, att: 0.95, def: 1.00 },
    { n: "Real Madrid",     f: "🇪🇸", elo: 2010, att: 1.50, def: 0.75 },
    { n: "Real Oviedo",     f: "🇪🇸", elo: 1640, att: 0.65, def: 1.18 },
    { n: "Real Sociedad",   f: "🇪🇸", elo: 1760, att: 0.95, def: 1.05 },
    { n: "Séville FC",      f: "🇪🇸", elo: 1730, att: 0.95, def: 1.10 },
    { n: "Valence",         f: "🇪🇸", elo: 1700, att: 0.80, def: 1.12 },
    { n: "Villarreal",      f: "🇪🇸", elo: 1870, att: 1.30, def: 0.85 },
  ],
  /* Premier League calibrée sur la saison 2025-26 : Arsenal leader (meilleure
   * défense), City dauphin ; Villa, Chelsea et Crystal Palace en embuscade ;
   * Liverpool en crise (défense friable), Sunderland promu sensation ;
   * Forest/West Ham dans le dur, Wolves catastrophiques. */
  PL: [
    { n: "Arsenal",           f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 2050, att: 1.45, def: 0.65 },
    { n: "Aston Villa",       f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1880, att: 1.15, def: 0.85 },
    { n: "Bournemouth",       f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1810, att: 1.10, def: 1.00 },
    { n: "Brentford",         f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1780, att: 1.05, def: 1.05 },
    { n: "Brighton",          f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1820, att: 1.10, def: 1.00 },
    { n: "Burnley",           f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1680, att: 0.80, def: 1.20 },
    { n: "Chelsea",           f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1920, att: 1.25, def: 0.88 },
    { n: "Crystal Palace",    f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1860, att: 1.05, def: 0.82 },
    { n: "Everton",           f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1770, att: 0.90, def: 0.95 },
    { n: "Fulham",            f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1760, att: 0.95, def: 1.05 },
    { n: "Leeds",             f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1700, att: 0.80, def: 1.15 },
    { n: "Liverpool",         f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1900, att: 1.30, def: 1.00 },
    { n: "Manchester City",   f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1990, att: 1.50, def: 0.85 },
    { n: "Manchester United", f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1850, att: 1.15, def: 1.00 },
    { n: "Newcastle",         f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1810, att: 1.05, def: 0.95 },
    { n: "Nottingham Forest", f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1720, att: 0.80, def: 1.10 },
    { n: "Sunderland",        f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1830, att: 1.00, def: 0.85 },
    { n: "Tottenham",         f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1800, att: 1.05, def: 0.95 },
    { n: "West Ham",          f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1710, att: 0.85, def: 1.20 },
    { n: "Wolverhampton",     f: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", elo: 1650, att: 0.70, def: 1.25 },
  ],
  /* Bundesliga calibrée sur la saison 2025-26 : Bayern écrasant (départ record,
   * Kane), Leipzig dauphin surprise, Dortmund solide derrière ; Leverkusen en
   * reconstruction ; Francfort spectaculaire mais friable ; Mayence, St. Pauli
   * et Heidenheim dans la zone rouge. */
  BL1: [
    { n: "Augsbourg",            f: "🇩🇪", elo: 1700, att: 0.85, def: 1.15 },
    { n: "Bayer Leverkusen",     f: "🇩🇪", elo: 1850, att: 1.15, def: 0.95 },
    { n: "Bayern Munich",        f: "🇩🇪", elo: 2070, att: 1.70, def: 0.75 },
    { n: "Borussia Dortmund",    f: "🇩🇪", elo: 1870, att: 1.15, def: 0.85 },
    { n: "Borussia M'gladbach",  f: "🇩🇪", elo: 1720, att: 0.90, def: 1.10 },
    { n: "Cologne",              f: "🇩🇪", elo: 1740, att: 0.95, def: 1.05 },
    { n: "Eintracht Francfort",  f: "🇩🇪", elo: 1800, att: 1.20, def: 1.10 },
    { n: "Fribourg",             f: "🇩🇪", elo: 1770, att: 0.95, def: 1.00 },
    { n: "Hambourg",             f: "🇩🇪", elo: 1690, att: 0.75, def: 1.10 },
    { n: "Heidenheim",           f: "🇩🇪", elo: 1640, att: 0.70, def: 1.20 },
    { n: "Hoffenheim",           f: "🇩🇪", elo: 1800, att: 1.15, def: 1.00 },
    { n: "Mayence",              f: "🇩🇪", elo: 1680, att: 0.80, def: 1.15 },
    { n: "RB Leipzig",           f: "🇩🇪", elo: 1880, att: 1.20, def: 0.90 },
    { n: "St. Pauli",            f: "🇩🇪", elo: 1690, att: 0.75, def: 1.15 },
    { n: "Stuttgart",            f: "🇩🇪", elo: 1840, att: 1.10, def: 0.95 },
    { n: "Union Berlin",         f: "🇩🇪", elo: 1720, att: 0.90, def: 1.10 },
    { n: "Werder Brême",         f: "🇩🇪", elo: 1720, att: 0.90, def: 1.15 },
    { n: "Wolfsburg",            f: "🇩🇪", elo: 1700, att: 0.85, def: 1.15 },
  ],
  /* Serie A calibrée sur la saison 2025-26 : sprint à quatre Inter (meilleure
   * attaque) / Naples / Milan (Allegri, défense de fer) / Roma (meilleure
   * défense) ; Côme et Bologne confirment, Juve et Lazio en demi-teinte ;
   * Atalanta décroche, Fiorentina en perdition dans la zone rouge. */
  SA: [
    { n: "AC Milan",       f: "🇮🇹", elo: 1890, att: 1.10, def: 0.75 },
    { n: "AS Rome",        f: "🇮🇹", elo: 1880, att: 1.00, def: 0.75 },
    { n: "Atalanta",       f: "🇮🇹", elo: 1780, att: 1.00, def: 1.00 },
    { n: "Bologne",        f: "🇮🇹", elo: 1840, att: 1.10, def: 0.90 },
    { n: "Cagliari",       f: "🇮🇹", elo: 1690, att: 0.80, def: 1.10 },
    { n: "Côme",           f: "🇮🇹", elo: 1830, att: 1.05, def: 0.85 },
    { n: "Cremonese",      f: "🇮🇹", elo: 1720, att: 0.85, def: 1.05 },
    { n: "Fiorentina",     f: "🇮🇹", elo: 1670, att: 0.80, def: 1.15 },
    { n: "Genoa",          f: "🇮🇹", elo: 1690, att: 0.75, def: 1.08 },
    { n: "Hellas Vérone",  f: "🇮🇹", elo: 1650, att: 0.70, def: 1.15 },
    { n: "Inter Milan",    f: "🇮🇹", elo: 1960, att: 1.45, def: 0.85 },
    { n: "Juventus",       f: "🇮🇹", elo: 1820, att: 1.00, def: 0.92 },
    { n: "Lazio",          f: "🇮🇹", elo: 1780, att: 0.95, def: 0.90 },
    { n: "Lecce",          f: "🇮🇹", elo: 1680, att: 0.72, def: 1.08 },
    { n: "Naples",         f: "🇮🇹", elo: 1900, att: 1.10, def: 0.85 },
    { n: "Parme",          f: "🇮🇹", elo: 1680, att: 0.72, def: 1.10 },
    { n: "Pise",           f: "🇮🇹", elo: 1660, att: 0.70, def: 1.10 },
    { n: "Sassuolo",       f: "🇮🇹", elo: 1730, att: 0.90, def: 1.05 },
    { n: "Torino",         f: "🇮🇹", elo: 1710, att: 0.80, def: 1.10 },
    { n: "Udinese",        f: "🇮🇹", elo: 1730, att: 0.85, def: 1.05 },
  ],
};

/* Classement FIFA officiel (juin 2025) — utilisé pour affiner Elo + att/def. */
const FIFA_RANK = {
  "Argentine":1,"France":2,"Espagne":3,"Angleterre":4,"Brésil":5,
  "Portugal":6,"Pays-Bas":7,"Belgique":8,"Allemagne":9,"Croatie":10,
  "Uruguay":11,"Colombie":12,"Maroc":13,"Norvège":15,"États-Unis":16,
  "Mexique":17,"Japon":18,"Sénégal":19,"Suisse":20,"Autriche":21,
  "Corée du Sud":23,"Tchéquie":24,"Côte d'Ivoire":25,"Turquie":26,
  "Équateur":27,"Suède":28,"Algérie":29,"Canada":30,"Écosse":31,
  "Iran":32,"Australie":33,"RD Congo":34,"Égypte":35,"Tunisie":36,
  "Paraguay":38,"Bosnie-Herzégovine":40,"Ghana":43,"Panama":48,
  "Afrique du Sud":50,"Ouzbékistan":55,"Arabie saoudite":56,"Qatar":58,
  "Jordanie":62,"Irak":66,"Cap-Vert":70,"Haïti":80,"Curaçao":88,
  "Nouvelle-Zélande":96,
  /* Sélections non qualifiées (onglet Match, mode International). */
  "Italie":12,"Danemark":22,"Ukraine":27,"Pays de Galles":30,"Pologne":36,
  "Serbie":33,"Grèce":39,"Hongrie":42,"Nigeria":44,"Venezuela":46,
  "Costa Rica":47,"Cameroun":50,"Pérou":52,"Mali":53,"Chili":57,
  "Slovaquie":44,"Roumanie":48,"Slovénie":54,"Irlande":60,"Burkina Faso":61,
  "Jamaïque":63,"Albanie":65,"Macédoine du Nord":66,"Géorgie":67,
  "Émirats arabes unis":68,"Finlande":72,"Honduras":75,"Gabon":77,
  "Bolivie":78,"Oman":79,"Guinée":80,"Bahreïn":81,"Zambie":88,"Chine":94,
};

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
function dcTau(i, j, lh, la, rho = RHO) {
  let t = 1;
  if (i === 0 && j === 0) t = 1 - lh * la * rho;
  else if (i === 0 && j === 1) t = 1 + lh * rho;
  else if (i === 1 && j === 0) t = 1 + la * rho;
  else if (i === 1 && j === 1) t = 1 - rho;
  return Math.max(0, t); // une correction DC ne doit jamais produire une probabilité négative
}
function predict(home, away, neutral, leagueAvg = BASE_GOALS, rho = RHO) {
  const fh = formScore(home.form), fa = formScore(away.form);
  const useSplit = !neutral && home.homeAtt != null && away.awayDef != null;
  let attH, defH, attA, defA;
  if (useSplit) {
    attH = home.homeAtt * (1 + 0.08 * fh);
    defH = (home.homeDef ?? home.def) * (1 - 0.05 * fh);
    attA = (away.awayAtt ?? away.att) * (1 + 0.08 * fa);
    defA = away.awayDef * (1 - 0.05 * fa);
  } else {
    attH = home.att * (1 + 0.08 * fh);
    defH = home.def * (1 - 0.05 * fh);
    attA = away.att * (1 + 0.08 * fa);
    defA = away.def * (1 - 0.05 * fa);
  }
  let lh = leagueAvg * attH * defA, la = leagueAvg * attA * defH;
  if (!neutral && !useSplit) { lh *= HOME_MULT; la *= AWAY_MULT; }
  // Écart Elo : signal de force complémentaire aux ratings att/def.
  if (home.elo != null && away.elo != null) {
    const f = Math.exp(ELO_BETA * (home.elo - away.elo) / 400);
    lh *= f; la /= f;
  }
  let pH = 0, pD = 0, pA = 0, over25 = 0, btts = 0;
  let bestH = null, bestD = null, bestA = null;
  const scores = [];
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = poisson(i, lh) * poisson(j, la) * dcTau(i, j, lh, la, rho);
    if (i > j) { pH += p; if (!bestH || p > bestH.p) bestH = { s: i + "–" + j, p }; }
    else if (i === j) { pD += p; if (!bestD || p > bestD.p) bestD = { s: i + "–" + j, p }; }
    else { pA += p; if (!bestA || p > bestA.p) bestA = { s: i + "–" + j, p }; }
    if (i + j >= 3) over25 += p; if (i >= 1 && j >= 1) btts += p;
    if (i <= 6 && j <= 6) scores.push({ s: i + "–" + j, p });
  }
  const total = pH + pD + pA || 1;
  pH /= total; pD /= total; pA /= total; over25 /= total; btts /= total;
  scores.forEach((s) => (s.p /= total));
  scores.sort((a, b) => b.p - a.p);
  const topScores = scores.slice(0, 6);
  // Score le plus probable conditionné à chaque issue — la probabilité affichée
  // est celle de CE score (cohérence score/proba garantie).
  const topHome = { s: bestH.s, p: bestH.p / total };
  const topDraw = { s: bestD.s, p: bestD.p / total };
  const topAway = { s: bestA.s, p: bestA.p / total };
  let score, scoreP;
  if (pH >= pD && pH >= pA) { score = topHome.s; scoreP = topHome.p; }
  else if (pA > pH && pA >= pD) { score = topAway.s; scoreP = topAway.p; }
  else { score = topDraw.s; scoreP = topDraw.p; }
  return { lh, la, pH, pD, pA, over25, btts, score, scoreP, topScores, topHome, topDraw, topAway };
}
// Match à élimination directe : prolongation (30') puis tirs au but si nul après 90'.
function predictKnockout(home, away, leagueAvg = BASE_GOALS, rho = RHO) {
  const base = predict(home, away, true, leagueAvg, rho);
  const lhE = base.lh / 3, laE = base.la / 3; // ~30 min = 1/3 de match
  let etA = 0, etB = 0, etD = 0;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const p = poisson(i, lhE) * poisson(j, laE);
    if (i > j) etA += p; else if (i < j) etB += p; else etD += p;
  }
  const etTot = etA + etB + etD || 1;
  etA /= etTot; etB /= etTot; etD /= etTot;
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
function predictWithHistory(home, away, meetings, leagueAvg = BASE_GOALS, rho = RHO) {
  const base = predict(home, away, true, leagueAvg, rho);
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
  groups.forEach((g, gi) => groupPairs(gi).forEach(([x, y]) => {
    const r = results["G" + LETTERS[gi] + "-" + x + "-" + y];
    if (r && r.hg != null && r.ag != null) {
      const ti = g[x], tj = g[y];
      st[ti].gf += r.hg; st[ti].ga += r.ag; st[ti].gp++;
      st[tj].gf += r.ag; st[tj].ga += r.hg; st[tj].gp++;
    }
  }));
  return st;
}
function eloAfterGroups(groups, results) {
  const elo = POOL.map(t => t.elo);
  const K = 30;
  groups.forEach((g, gi) => {
    groupPairs(gi).forEach(([x, y]) => {
      const r = results["G" + LETTERS[gi] + "-" + x + "-" + y];
      if (!r || r.hg == null || r.ag == null) return;
      const ti = g[x], tj = g[y];
      const sa = r.hg > r.ag ? 1 : r.hg === r.ag ? 0.5 : 0;
      const ea = 1 / (1 + Math.pow(10, (elo[tj] - elo[ti]) / 400));
      elo[ti] += K * (sa - ea);
      elo[tj] += K * ((1 - sa) - (1 - ea));
    });
  });
  return elo;
}
function effectivePool(stats, eloArr, basePool = POOL) {
  return basePool.map((t, i) => {
    const s = stats[i];
    const newElo = eloArr ? eloArr[i] : t.elo;
    if (!s.gp) return { ...t, elo: newElo };
    const w = Math.min(0.5, 0.15 * s.gp);
    const attObs = Math.max(0.2, s.gf / s.gp) / WC_AVG;
    const defObs = Math.max(0.2, s.ga / s.gp) / WC_AVG;
    return { ...t, elo: newElo, att: Math.pow(t.att, 1 - w) * Math.pow(attObs, w), def: Math.pow(t.def, 1 - w) * Math.pow(defObs, w) };
  });
}
/* Malus de force par joueur absent (suspension/carton rouge ou blessure),
 * pondéré par poste : un attaquant absent pèse sur l'attaque, un défenseur ou
 * gardien sur la défense (def = buts encaissés : plus haut = pire). Les joueurs
 * "incertains" (doubt) sont affichés mais ne comptent pas. Impact cumulé borné. */
function applyAbsences(pool, absences) {
  if (!absences) return pool;
  return pool.map((t, ti) => {
    const list = (absences[ti] || []).filter((p) => p.kind !== "doubt");
    if (!list.length) return t;
    let am = 1, dm = 1;
    for (const p of list) {
      if (p.position === "G") dm *= 1.04;
      else if (p.position === "D") dm *= 1.05;
      else if (p.position === "M") { am *= 0.97; dm *= 1.025; }
      else if (p.position === "A") am *= 0.94;
      else { am *= 0.975; dm *= 1.025; } // poste inconnu : impact modéré réparti
    }
    am = Math.max(0.85, am); dm = Math.min(1.15, dm);
    return { ...t, att: t.att * am, def: t.def * dm };
  });
}
function groupTable(group, gi, results, eff) {
  const rows = group.map((ti) => ({ ti, pts: 0, gf: 0, ga: 0, gp: 0 }));
  groupPairs(gi).forEach(([x, y]) => {
    const r = results["G" + LETTERS[gi] + "-" + x + "-" + y];
    if (r && r.hg != null && r.ag != null) {
      const X = rows[x], Y = rows[y];
      X.gf += r.hg; X.ga += r.ag; X.gp++; Y.gf += r.ag; Y.ga += r.hg; Y.gp++;
      if (r.hg > r.ag) X.pts += 3; else if (r.hg < r.ag) Y.pts += 3; else { X.pts++; Y.pts++; }
    }
  });
  rows.forEach((r) => (r.gd = r.gf - r.ga));
  return [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (eff ? eff[b.ti].elo - eff[a.ti].elo : POOL[b.ti].elo - POOL[a.ti].elo));
}
/* Situation de chaque équipe dans son groupe, dans l'ordre CHRONOLOGIQUE officiel
 * (WC_MATCHES) : points, matchs joués et séquence de résultats (W/L/D). Sert à
 * détecter les équipes qui doivent réagir (défaite au 1er match, dos au mur). */
function teamGroupSituation(group, gi, results) {
  const sit = group.map(() => ({ played: 0, points: 0, seq: [] }));
  WC_MATCHES[gi].forEach(({ x, y }) => {
    const r = results["G" + LETTERS[gi] + "-" + x + "-" + y];
    if (!r || r.hg == null || r.ag == null) return;
    sit[x].played++; sit[y].played++;
    if (r.hg > r.ag) { sit[x].points += 3; sit[x].seq.push("W"); sit[y].seq.push("L"); }
    else if (r.hg < r.ag) { sit[y].points += 3; sit[y].seq.push("W"); sit[x].seq.push("L"); }
    else { sit[x].points++; sit[y].points++; sit[x].seq.push("D"); sit[y].seq.push("D"); }
  });
  return sit;
}
/* Facteur de "prise de risque" (0 → 1) pour les matchs de groupe restants :
 * une équipe qui a perdu son 1er match cherche à gagner le suivant ; dos au mur
 * (0 pt après 2 matchs), elle prend un maximum de risques. Plus le facteur est
 * élevé, plus on pousse l'attaque (et plus on fragilise la défense). */
function riskFactor(s) {
  if (!s || !s.played) return 0;
  const lostOpener = s.seq[0] === "L";
  if (s.played >= 2 && s.points === 0) return 1;            // dos au mur : tout pour la gagne
  if (s.played >= 2 && lostOpener && s.points <= 1) return 0.7;
  if (s.played === 1 && lostOpener) return 0.6;             // a perdu son 1er match
  return 0;
}
/* Applique la prise de risque : attaque dopée, défense plus exposée (def = buts
 * encaissés, donc on l'augmente). Effet borné pour rester réaliste. */
function applyRisk(team, risk) {
  if (!risk) return team;
  return { ...team, att: team.att * (1 + 0.10 * risk), def: team.def * (1 + 0.08 * risk) };
}
/* Applique le facteur "composition" (XI de départ) calculé par le proxy : la
 * formation (offensive/défensive), les titulaires habituels et la qualité
 * offensive (buts/passes) du XI ajustent l'attaque et la défense de l'équipe. */
function applyLineupF(team, f) {
  if (!f) return team;
  return { ...team, att: team.att * (f.attMul ?? 1), def: team.def * (f.defMul ?? 1) };
}
/* Compo saisie par équipe (XI = 11 {name,pos}, reporté d'un match à l'autre).
 * Les effectifs football-data étant payants, le XI est saisi librement : chaque
 * titulaire a un POSTE choisi (G/D/M/A) et un NOM éditable (autocomplété par les
 * buteurs connus, gratuits). Le calcul n'a donc plus besoin de l'effectif. */
const lastNm = (s) => { const t = (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").trim().split(/\s+/); return t[t.length - 1] || ""; };
// Clé de cache d'une affiche (noms anglais), pour la compo live.
const lineupKey = (aN, bN) => (NAT_EN[aN] || aN) + "|" + (NAT_EN[bN] || bN);
const POS_LBL = { G: "G", D: "Déf", M: "Mil", A: "Att" };
// Construit un objet "comp" (formation + XI) à partir d'une compo live de l'API.
function liveToComp(side) {
  if (!side) return null;
  return { formation: side.formation || "", xi: (side.xi || []).map((p) => ({ name: p.name, pos: p.pos || "M" })) };
}
// Poste football-data (Goalkeeper/Defence/Midfield/Offence…) -> G/D/M/A.
function posGroup(p) {
  const s = (p || "").toLowerCase();
  if (s.includes("keeper") || s === "goalkeeper") return "G";
  if (s.includes("back") || s.includes("defen")) return "D";
  if (s.includes("midfield") || s.includes("milieu")) return "M";
  if (s.includes("offence") || s.includes("forward") || s.includes("striker") || s.includes("wing") || s.includes("attack")) return "A";
  return "M";
}
// Postes d'un gabarit de formation (GK + défenseurs + milieux + attaquants).
function posTemplate(formation) {
  const parts = (formation || "4-3-3").split("-").map(Number).filter((n) => !isNaN(n));
  const p = parts.length >= 2 ? parts : [4, 3, 3];
  const def = p[0], fwd = p[p.length - 1], mid = p.slice(1, -1).reduce((a, b) => a + b, 0);
  const out = ["G"];
  for (let i = 0; i < def; i++) out.push("D");
  for (let i = 0; i < mid; i++) out.push("M");
  for (let i = 0; i < fwd; i++) out.push("A");
  while (out.length < 11) out.push("M");
  return out.slice(0, 11);
}
// XI de pré-remplissage : gabarit de la formation + noms des meilleurs buteurs
// (gratuits) placés sur les postes offensifs ; le reste est laissé à compléter.
function seedXI(formation, scorers) {
  const tpl = posTemplate(formation);
  const sc = [...(scorers || [])].sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists));
  let si = 0;
  return tpl.map((pos) => {
    let name = "";
    if ((pos === "A" || pos === "M") && si < sc.length) name = sc[si++].name;
    return { name, pos };
  });
}
// Onze probable depuis l'effectif RÉEL (joueurs avec poste) : remplit le gabarit de
// la formation poste par poste (meilleurs buts+passes d'abord). Renvoie [{name,pos}].
function probableXI(roster, formation) {
  const tpl = posTemplate(formation);
  const pools = { G: [], D: [], M: [], A: [] };
  (roster || []).forEach((p) => { if (pools[p.pos]) pools[p.pos].push(p); });
  Object.values(pools).forEach((a) => a.sort((x, y) => (y.goals + y.assists) - (x.goals + x.assists)));
  const used = new Set();
  return tpl.map((pos) => {
    let pick = (pools[pos] || []).find((p) => !used.has(p.name)) || (roster || []).find((p) => !used.has(p.name));
    if (pick) used.add(pick.name);
    return { name: pick ? pick.name : "", pos };
  });
}
// Formations sélectionnables + PROFIL à deux faces : att = multiplicateur d'attaque,
// def = multiplicateur de buts ENCAISSÉS (>1 = plus vulnérable). Une formation
// offensive marque plus mais encaisse plus ; une défensive l'inverse.
const FORMATIONS = ["", "4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "4-4-2", "4-1-4-1", "4-4-1-1", "4-5-1", "5-3-2", "5-4-1", "3-4-2-1", "4-3-1-2"];
const FORM_PROFILE = {
  "3-4-3":   { att: 1.16, def: 1.14 },
  "3-4-2-1": { att: 1.10, def: 1.09 },
  "4-3-3":   { att: 1.10, def: 1.05 },
  "3-5-2":   { att: 1.08, def: 1.09 },
  "4-3-1-2": { att: 1.06, def: 1.06 },
  "4-2-3-1": { att: 1.05, def: 1.01 },
  "4-4-2":   { att: 1.00, def: 1.00 },
  "4-4-1-1": { att: 0.97, def: 0.98 },
  "4-1-4-1": { att: 0.95, def: 0.95 },
  "4-5-1":   { att: 0.91, def: 0.93 },
  "5-3-2":   { att: 0.89, def: 0.90 },
  "5-4-1":   { att: 0.85, def: 0.87 },
};
/* Facteur att/déf d'une compo. Deux contributions :
 *  1) la FORME — formation choisie (profil att/déf ci-dessus) OU, à défaut, déduite
 *     du XI (nb d'attaquants/défenseurs), à double face (offensif = +buts/+encaissés) ;
 *  2) la QUALITÉ OFFENSIVE du XI (buts/passes des joueurs alignés).
 * Le pronostic combine ensuite les deux équipes : l'attaque ajustée de l'une
 * rencontre la défense ajustée de l'autre (interaction des deux formations).
 * Renvoie null si rien n'est activé -> pronostic "sans compo". */
function compFactor(comp, scorers) {
  const hasXI = comp && comp.xi && comp.xi.length;
  if (!comp || (!hasXI && !comp.formation && !comp.remanie)) return null;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  let attMul = 1, defMul = 1; const notes = [];
  // Forme : la formation choisie prime ; sinon on la déduit des postes du XI.
  if (comp.formation) {
    const pr = FORM_PROFILE[comp.formation] || { att: 1, def: 1 };
    attMul *= pr.att; defMul *= pr.def;
    if (pr.att >= 1.05) notes.push("formation offensive (" + comp.formation + ")");
    else if (pr.att <= 0.95) notes.push("formation défensive (" + comp.formation + ")");
  } else if (hasXI) {
    let nD = 0, nA = 0; comp.xi.forEach((p) => { if (p.pos === "D") nD++; else if (p.pos === "A") nA++; });
    attMul *= clamp(1 + 0.06 * (nA - 3) - 0.03 * (nD - 4), 0.82, 1.18);
    defMul *= clamp(1 + 0.05 * (nA - 3) - 0.05 * (nD - 4), 0.85, 1.16);
  }
  // Qualité offensive : part des buts+passes connus (buteurs WC, gratuits) dans le XI.
  if (hasXI && scorers && scorers.length) {
    const xiSet = new Set(comp.xi.map((p) => lastNm(p.name)).filter(Boolean));
    const w = (p) => (p.goals || 0) + 0.7 * (p.assists || 0);
    const inOff = scorers.filter((p) => xiSet.has(lastNm(p.name))).reduce((a, p) => a + w(p), 0);
    const totOff = scorers.reduce((a, p) => a + w(p), 0);
    if (totOff > 0) { const share = clamp(inOff / totOff, 0, 1); attMul *= clamp(0.78 + 0.34 * share, 0.78, 1.16); if (share < 0.55) notes.push("buteurs/passeurs clés hors du XI"); }
  }
  if (comp.remanie) { attMul *= 0.9; defMul *= 1.08; notes.push("équipe remaniée"); }
  return { attMul: clamp(attMul, 0.74, 1.24), defMul: clamp(defMul, 0.82, 1.24), notes, manual: true };
}
/* ---------- Tableau final OFFICIEL Coupe du Monde 2026 ----------
 * Le bracket 2026 est FIXE : chaque place R32 dépend d'une position de groupe
 * précise (et NON d'un seeding global par classement). Réf. FIFA, matchs 73-88.
 *   ["W","X"] = vainqueur du groupe X · ["R","X"] = 2e du groupe X
 *   ["3",[groupes autorisés]] = un 3e parmi ces groupes (table FIFA des 3es).
 * R32_SLOTS est rangé dans l'ordre "feuilles" du tableau : la mise en paire
 * séquentielle (ties[2k], ties[2k+1]) reproduit alors automatiquement
 * R16 -> Finale dans le bon ordre (matchs 89-102). */
const gIdx = (L) => LETTERS.indexOf(L);
const R32_SLOTS = [
  { m: 74, a: ["W", "E"], b: ["3", ["A", "B", "C", "D", "F"]] },
  { m: 77, a: ["W", "I"], b: ["3", ["C", "D", "F", "G", "H"]] },
  { m: 73, a: ["R", "A"], b: ["R", "B"] },
  { m: 75, a: ["W", "F"], b: ["R", "C"] },
  { m: 83, a: ["R", "K"], b: ["R", "L"] },
  { m: 84, a: ["W", "H"], b: ["R", "J"] },
  { m: 81, a: ["W", "D"], b: ["3", ["B", "E", "F", "I", "J"]] },
  { m: 82, a: ["W", "G"], b: ["3", ["A", "E", "H", "I", "J"]] },
  { m: 76, a: ["W", "C"], b: ["R", "F"] },
  { m: 78, a: ["R", "E"], b: ["R", "I"] },
  { m: 79, a: ["W", "A"], b: ["3", ["C", "E", "F", "H", "I"]] },
  { m: 80, a: ["W", "L"], b: ["3", ["E", "H", "I", "J", "K"]] },
  { m: 86, a: ["W", "J"], b: ["R", "H"] },
  { m: 88, a: ["R", "D"], b: ["R", "G"] },
  { m: 85, a: ["W", "B"], b: ["3", ["E", "F", "G", "I", "J"]] },
  { m: 87, a: ["W", "K"], b: ["3", ["D", "E", "I", "J", "L"]] },
];
/* Attribue les 8 meilleurs 3es aux 8 places "3e" en respectant les groupes
 * autorisés par la FIFA pour chacune (matching exact par backtracking : une
 * affectation complète existe pour toute combinaison de 8 groupes qualifiés). */
function assignThirds(qualThirdGroups) {
  const slots = R32_SLOTS.filter((s) => s.b[0] === "3").sort((x, y) => x.m - y.m);
  const groups = [...qualThirdGroups];
  const res = {}, used = new Set();
  const bt = (i) => {
    if (i === slots.length) return true;
    const allowed = slots[i].b[1].map(gIdx);
    for (const g of groups) {
      if (used.has(g) || !allowed.includes(g)) continue;
      used.add(g); res[slots[i].m] = g;
      if (bt(i + 1)) return true;
      used.delete(g); delete res[slots[i].m];
    }
    return false;
  };
  bt(0);
  return res;
}
// Vainqueur officiel d'une affiche réelle : winner API (gère prolongation/t.a.b.),
// sinon score 90' si non nul, sinon indécis.
function realWinner(f) {
  if (!f) return null;
  if (f.winner === "HOME_TEAM") return f.a;
  if (f.winner === "AWAY_TEAM") return f.b;
  if (f.hg != null && f.ag != null && f.hg !== f.ag) return f.hg > f.ag ? f.a : f.b;
  return null;
}
function buildKnockout(eff, tables, bestThirds, ko, results, koFixtures, leagueAvg = BASE_GOALS, rho = RHO) {
  const real = koFixtures || { R32: [], R16: [], QF: [], SF: [], F: [] };
  // Groupes dont le 3e fait partie des 8 meilleurs (donc qualifié).
  const qualThirdGroups = tables
    .map((t, gi) => ({ gi, ti: t[2] ? t[2].ti : null }))
    .filter((x) => x.ti != null && bestThirds.has(x.ti))
    .map((x) => x.gi);
  const thirdSlot = assignThirds(qualThirdGroups);
  const resolveSide = (side, matchNo) => {
    const [kind, arg] = side;
    if (kind === "W") { const t = tables[gIdx(arg)]; return t && t[0] ? t[0].ti : null; }
    if (kind === "R") { const t = tables[gIdx(arg)]; return t && t[1] ? t[1].ti : null; }
    const g = thirdSlot[matchNo]; // place "3e" -> groupe attribué -> 3e de ce groupe
    return g != null && tables[g] && tables[g][2] ? tables[g][2].ti : null;
  };
  // R32 : la place "a" est toujours un vainqueur/2e (jamais un 3e) -> ancre fiable.
  // Si l'API fournit la vraie affiche contenant cette ancre, on l'utilise telle quelle
  // (cela fixe notamment le 3e adverse exactement comme dans le tirage officiel).
  let ties = R32_SLOTS.map((s) => {
    const anchor = resolveSide(s.a, s.m);
    const projB = resolveSide(s.b, s.m);
    const f = anchor != null ? real.R32.find((x) => x.a === anchor || x.b === anchor) : null;
    if (f) return [anchor, f.a === anchor ? f.b : f.a, f];
    return [anchor, projB, null];
  });
  const defs = [["R32", 16], ["R16", 8], ["QF", 4], ["SF", 2], ["F", 1]];
  const rounds = [];
  for (const [name, count] of defs) {
    const out = { name, ties: [] }, winners = [];
    for (let k = 0; k < count; k++) {
      const [a, b, rfPre] = ties[k] || [null, null, null];
      const id = name + "-" + k;
      let prob = 0.5, winner = null, decided = false, kb = null, isReal = false;
      if (a != null && b != null) {
        kb = predictKnockout(eff[a], eff[b], leagueAvg, rho);
        prob = kb.advA;
        // Affiche réelle de l'API pour ce tour (R32 via l'ancre, sinon par paire d'équipes).
        const rf = rfPre || (real[name] || []).find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) || null;
        const manual = ko[id], sc = results[id], rw = realWinner(rf);
        if (manual != null) { winner = manual; decided = true; }           // choix manuel (simulation) prioritaire
        else if (rw != null) { winner = rw; decided = true; isReal = true; } // résultat réel de l'API
        else if (sc && sc.hg != null && sc.ag != null && sc.hg !== sc.ag) { winner = sc.hg > sc.ag ? a : b; decided = true; }
        else winner = prob >= 0.5 ? a : b;                                   // projection
      } else winner = a != null ? a : b;
      out.ties.push({ id, a, b, prob, winner, decided, kb, isReal });
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
  async get(k) {
    try {
      if (window.storage) { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
      const v = localStorage.getItem("pf:" + k);
      return v == null ? null : JSON.parse(v);
    } catch { return null; }
  },
  async set(k, v) {
    try {
      if (window.storage) { await window.storage.set(k, JSON.stringify(v)); return; }
      localStorage.setItem("pf:" + k, JSON.stringify(v));
    } catch {}
  },
};

/* ========================= UI commun ========================= */
function FormPills({ form }) {
  if (!form || !form.length) return <span className="pf-elo">—</span>;
  return <div className="pf-form">{form.map((r, i) => <span key={i} className={"pf-pill pf-" + r}>{r === "W" ? "V" : r === "L" ? "D" : "N"}</span>)}</div>;
}
function TeamSelect({ label, value, onChange, pool = POOL }) {
  const t = pool[value];
  return (
    <div className="pf-team">
      <div className="pf-team-tag">{label}</div>
      <div className="pf-select-wrap">
        <span className="pf-flag">{t.f}</span>
        <select className="pf-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {pool.map((tm, i) => <option key={i} value={i}>{tm.n}</option>)}
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
/* Recalibrage live (mode National) : noms officiels football-data.org des clubs
 * dont le nom court français ne suffit pas à la correspondance automatique. */
const CLUB_API_ALIAS = {
  "Angers": "Angers SCO", "Auxerre": "AJ Auxerre", "Brest": "Stade Brestois 29",
  "Le Havre": "Le Havre AC", "Lens": "RC Lens", "Lille": "Lille OSC",
  "Lorient": "FC Lorient", "Lyon": "Olympique Lyonnais", "Marseille": "Olympique de Marseille",
  "Metz": "FC Metz", "Monaco": "AS Monaco FC", "Nantes": "FC Nantes", "Nice": "OGC Nice",
  "Paris SG": "Paris Saint-Germain FC", "Rennes": "Stade Rennais FC 1901",
  "Strasbourg": "RC Strasbourg Alsace", "Toulouse": "Toulouse FC",
  "Alavés": "Deportivo Alavés", "Athletic Bilbao": "Athletic Club",
  "Atlético Madrid": "Club Atlético de Madrid", "Barcelone": "FC Barcelona",
  "Betis Séville": "Real Betis Balompié", "Celta Vigo": "RC Celta de Vigo",
  "Espanyol": "RCD Espanyol de Barcelona", "Majorque": "RCD Mallorca",
  "Osasuna": "CA Osasuna", "Rayo Vallecano": "Rayo Vallecano de Madrid",
  "Real Madrid": "Real Madrid CF", "Real Sociedad": "Real Sociedad de Fútbol",
  "Séville FC": "Sevilla FC", "Valence": "Valencia CF", "Villarreal": "Villarreal CF",
  "Bournemouth": "AFC Bournemouth", "Brighton": "Brighton & Hove Albion FC",
  "Leeds": "Leeds United FC", "Newcastle": "Newcastle United FC",
  "Sunderland": "Sunderland AFC", "Tottenham": "Tottenham Hotspur FC",
  "West Ham": "West Ham United FC", "Wolverhampton": "Wolverhampton Wanderers FC",
  "Augsbourg": "FC Augsburg", "Bayer Leverkusen": "Bayer 04 Leverkusen",
  "Bayern Munich": "FC Bayern München", "Borussia M'gladbach": "Borussia Mönchengladbach",
  "Cologne": "1. FC Köln", "Eintracht Francfort": "Eintracht Frankfurt",
  "Fribourg": "SC Freiburg", "Hambourg": "Hamburger SV", "Heidenheim": "1. FC Heidenheim 1846",
  "Hoffenheim": "TSG 1899 Hoffenheim", "Mayence": "1. FSV Mainz 05",
  "St. Pauli": "FC St. Pauli", "Stuttgart": "VfB Stuttgart",
  "Union Berlin": "1. FC Union Berlin", "Werder Brême": "SV Werder Bremen", "Wolfsburg": "VfL Wolfsburg",
  "AS Rome": "AS Roma", "Atalanta": "Atalanta BC", "Bologne": "Bologna FC 1909",
  "Cagliari": "Cagliari Calcio", "Côme": "Como 1907", "Cremonese": "US Cremonese",
  "Fiorentina": "ACF Fiorentina", "Genoa": "Genoa CFC", "Hellas Vérone": "Hellas Verona FC",
  "Inter Milan": "FC Internazionale Milano", "Naples": "SSC Napoli",
  "Parme": "Parma Calcio 1913", "Pise": "Pisa Sporting Club",
  "Sassuolo": "US Sassuolo Calcio", "Udinese": "Udinese Calcio",
};
function matchClubTeam(club, apiTeams) {
  const target = normName(CLUB_API_ALIAS[club.n] || club.n);
  return apiTeams.find((t) => normName(t.name) === target)
    || apiTeams.find((t) => { const n = normName(t.name); return n.includes(target) || target.includes(n); })
    || null;
}
/* Forces réelles de la saison en cours : même pipeline que l'onglet Live
 * (football-data.org pour les buts, xG Understat prioritaire quand dispo).
 * Cache module : 1 requête par championnat et par session (le proxy cache 10 min). */
const clubLiveCache = {};
async function fetchClubLive(league) {
  if (clubLiveCache[league]) return clubLiveCache[league];
  const r = await fetch("/api/stats?source=footballdata&league=" + league);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  if (!d.teams || !d.teams.length) throw new Error("Aucune donnée");
  let teams = d.teams, xgOn = false;
  try {
    const xr = await fetch("/api/stats?source=understat&league=" + league);
    const xd = await xr.json();
    if (xd.teams && xd.teams.length) {
      const clampR = (x) => Math.max(0.6, Math.min(1.7, x));
      const withXg = xd.teams.filter((t) => t.matches);
      const xgAvg = withXg.length ? withXg.reduce((s, t) => s + t.xgFor, 0) / withXg.length : BASE_GOALS;
      const byN = {}; xd.teams.forEach((t) => (byN[normName(t.name)] = t));
      teams = teams.map((t) => {
        const x = byN[normName(t.name)];
        if (x && x.matches) { xgOn = true; return { ...t, att: clampR(x.xgFor / xgAvg), def: clampR(x.xgAgainst / xgAvg) }; }
        return t;
      });
    }
  } catch { /* repli silencieux sur les forces basées sur les buts */ }
  const out = { teams, xgOn, leagueAvg: d.leagueAvg };
  clubLiveCache[league] = out;
  return out;
}
function MatchTab({ intlMatches = [], matchRequest }) {
  const [scope, setScope] = useState("intl"); // "intl" = sélections Mondial, "club" = championnats
  const [clubLeague, setClubLeague] = useState("FL1");
  const [h, setH] = useState(0), [a, setA] = useState(1), [neutral, setNeutral] = useState(true);
  const [o1, setO1] = useState(""), [ox, setOx] = useState(""), [o2, setO2] = useState("");
  const [openHow, setOpenHow] = useState(false), [openApi, setOpenApi] = useState(false);
  // Prise de risque importée du contexte Mondial (par nom d'équipe) : ne s'applique
  // qu'aux équipes du match ouvert via "Détails", pas si on en choisit d'autres.
  const [riskMap, setRiskMap] = useState({});
  const setScopeSafe = (s) => { setScope(s); setH(0); setA(1); setNeutral(s === "intl"); };
  const setLeagueSafe = (l) => { setClubLeague(l); setH(0); setA(1); };
  // Raccourci "Détails" depuis l'onglet Mondial : on bascule en mode International
  // (terrain neutre) et on présélectionne les deux équipes du match cliqué.
  useEffect(() => {
    if (!matchRequest) return;
    const p = intlPool(intlMatches);
    const hi = p.findIndex((t) => t.n === matchRequest.home);
    const ai = p.findIndex((t) => t.n === matchRequest.away);
    if (hi < 0 || ai < 0) return;
    setScope("intl"); setNeutral(true); setH(hi); setA(ai);
    const rm = {};
    if (matchRequest.riskA > 0) rm[matchRequest.home] = matchRequest.riskA;
    if (matchRequest.riskB > 0) rm[matchRequest.away] = matchRequest.riskB;
    setRiskMap(rm);
  }, [matchRequest, intlMatches]);
  // Recalibrage live (mode National) : forces réelles de la saison en cours via le proxy.
  const [liveClub, setLiveClub] = useState({});
  const [liveState, setLiveState] = useState("");
  useEffect(() => {
    if (scope !== "club") return;
    if (liveClub[clubLeague]) { setLiveState("ok"); return; }
    let on = true;
    const league = clubLeague;
    setLiveState("loading");
    fetchClubLive(league)
      .then((d) => { if (!on) return; setLiveClub((p) => ({ ...p, [league]: d })); setLiveState("ok"); })
      .catch(() => { if (on) setLiveState("err"); });
    return () => { on = false; };
  }, [scope, clubLeague]);
  // International : les 48 qualifiés + sélections non qualifiées (EXTRA_NATIONS), ordre
  // alphabétique. National : clubs du championnat choisi, dont les forces att/def sont
  // fusionnées avec les stats live (poids selon matchs joués).
  const pool = useMemo(() => {
    if (scope === "intl") return intlPool(intlMatches);
    const base = CLUB_POOL[clubLeague];
    const live = liveClub[clubLeague];
    if (!live) return base;
    return base.map((c) => {
      const t = matchClubTeam(c, live.teams);
      if (!t || !t.matches) return c;
      const w = Math.min(0.85, 0.12 * t.matches);
      return {
        ...c,
        att: Math.pow(c.att, 1 - w) * Math.pow(t.att, w),
        def: Math.pow(c.def, 1 - w) * Math.pow(t.def, w),
        form: parseForm(t.form),
        live: true,
      };
    });
  }, [scope, clubLeague, intlMatches, liveClub]);
  const liveInfo = scope === "club" ? liveClub[clubLeague] : null;
  const leagueAvg = scope === "intl" ? WC_AVG : ((liveInfo && liveInfo.leagueAvg) || LEAGUE_GOALS_AVG[clubLeague] || BASE_GOALS);
  const rho = scope === "intl" ? LEAGUE_RHO.WC : (LEAGUE_RHO[clubLeague] || RHO);
  const home = pool[h], away = pool[a], same = h === a;
  // Prise de risque appliquée uniquement en mode International, aux équipes du match Mondial ouvert.
  const homeRisk = scope === "intl" ? (riskMap[home.n] || 0) : 0;
  const awayRisk = scope === "intl" ? (riskMap[away.n] || 0) : 0;
  const h2h = useMemo(() => scope === "intl" ? getH2HFromIntl(intlMatches, home.n, away.n) : [], [scope, home.n, away.n, intlMatches]);
  const R = useMemo(() => {
    if (same) return null;
    const p = predict(applyRisk(home, homeRisk), applyRisk(away, awayRisk), neutral, leagueAvg, rho);
    if (h2h.length < 2) return p;
    let hw = 0, dr = 0, aw = 0;
    h2h.forEach((m) => { if (m.hg > m.ag) hw++; else if (m.hg < m.ag) aw++; else dr++; });
    const n = hw + dr + aw; if (!n) return p;
    const w = Math.min(0.20, n * 0.04);
    const pH = (p.pH * (1 - w) + (hw / n) * w), pD = (p.pD * (1 - w) + (dr / n) * w), pA = (p.pA * (1 - w) + (aw / n) * w);
    const s = pH + pD + pA || 1;
    return { ...p, pH: pH / s, pD: pD / s, pA: pA / s, h2hN: n };
  }, [same, home, away, homeRisk, awayRisk, neutral, leagueAvg, rho, h2h]);
  const fair = useMemo(() => fairProbs(o1, ox, o2), [o1, ox, o2]);
  const edges = R && fair ? { e1: R.pH - fair.p1, ex: R.pD - fair.px, e2: R.pA - fair.p2 } : null;
  return (
    <>
      <section className="pf-card pf-match">
        <div className="sc-modes">
          <button className={scope === "intl" ? "sc-mode on" : "sc-mode"} onClick={() => setScopeSafe("intl")}>🌍 International</button>
          <button className={scope === "club" ? "sc-mode on" : "sc-mode"} onClick={() => setScopeSafe("club")}>🏆 National</button>
        </div>
        {scope === "club" && (<>
          <select className="sc-team" value={clubLeague} onChange={(e) => setLeagueSafe(e.target.value)}>
            {CLUB_LEAGUES.map((l) => <option key={l.code} value={l.code}>{l.f} {l.n}</option>)}
          </select>
          <div className="lv-meta">
            {liveState === "loading" ? "Recalibrage sur la saison en cours…"
              : liveState === "ok" ? "✓ " + pool.filter((t) => t.live).length + "/" + pool.length + " clubs recalibrés · saison en cours · " + (liveInfo && liveInfo.xgOn ? "xG réel (Understat)" : "buts réels") + " + forme récente"
              : liveState === "err" ? "Live indisponible — ratings de référence 2025-26 (proxy /api/stats + FOOTBALLDATA_TOKEN requis)"
              : ""}
          </div>
        </>)}
        <TeamSelect label="DOMICILE" value={h} onChange={setH} pool={pool} />
        <button className="pf-swap" onClick={() => { setH(a); setA(h); }}><ArrowLeftRight size={18} /></button>
        <TeamSelect label="EXTÉRIEUR" value={a} onChange={setA} pool={pool} />
        <label className="pf-neutral"><input type="checkbox" checked={neutral} onChange={(e) => setNeutral(e.target.checked)} /><span>Terrain neutre (tournoi)</span></label>
      </section>
      {same && <div className="pf-warn">Choisis deux équipes différentes.</div>}
      {R && (homeRisk > 0 || awayRisk > 0) && <div className="pf-risk-badge">⚡ Contexte Mondial : {[homeRisk > 0 ? home.n : null, awayRisk > 0 ? away.n : null].filter(Boolean).join(" & ")} en quête de points — prise de risque intégrée au pronostic</div>}
      {R && R.h2hN > 0 && <div className="pf-h2h-badge">🔁 {R.h2hN} confrontation{R.h2hN > 1 ? "s" : ""} directe{R.h2hN > 1 ? "s" : ""} prise{R.h2hN > 1 ? "s" : ""} en compte</div>}
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
        <p>Chaque équipe a une force d'<b>attaque</b> et de <b>défense</b>, ajustée par la forme, l'<b>écart Elo</b> et l'avantage du terrain → deux nombres de buts attendus → une <b>loi de Poisson</b> donne chaque score → une <b>correction Dixon-Coles</b> rééquilibre les petits scores. La somme donne victoire / nul / défaite.</p>
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
const formatFrDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");
};
function ScoreInput({ value, onChange, live }) {
  return <input className={"wc-score" + (live ? " wc-score-live" : "")} inputMode="numeric" maxLength={2} value={value == null ? "" : value} placeholder="–" onChange={(e) => onChange(e.target.value)} />;
}
/* Saisie d'un score avec validation explicite : le score tapé reste un brouillon
 * tant qu'il n'est pas validé (✓). Une fois validé, il est sauvegardé, pris en
 * compte dans les calculs, et verrouillé — le crayon permet de le corriger. */
function MatchScoreBox({ id, r, isLive, onValidate, onClear }) {
  const validated = !!r.ok;
  const [editing, setEditing] = useState(false);
  const [hg, setHg] = useState("");
  const [ag, setAg] = useState("");
  useEffect(() => {
    if (!editing) { setHg(r.hg == null ? "" : String(r.hg)); setAg(r.ag == null ? "" : String(r.ag)); }
  }, [r.hg, r.ag, editing]);
  const clamp = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : Math.max(0, Math.min(20, n)); };
  const digits = (v) => v.replace(/\D/g, "").slice(0, 2);
  const canSave = clamp(hg) != null && clamp(ag) != null;
  const canErase = editing && hg === "" && ag === "";
  const save = () => {
    if (canSave) { onValidate(id, clamp(hg), clamp(ag)); setEditing(false); }
    else if (canErase) { onClear(id); setEditing(false); }
  };
  if (validated && !editing) {
    return (
      <span className="wc-mscore">
        <span className="wc-final" title="Score validé">{r.hg}<i>–</i>{r.ag}</span>
        <button className="wc-mbtn wc-mbtn-edit" title="Corriger le score" onClick={() => setEditing(true)}><Pencil size={13} /></button>
      </span>
    );
  }
  return (
    <span className="wc-mscore">
      {isLive && !validated && <span className="wc-live-tag">live</span>}
      <ScoreInput value={hg} onChange={(v) => setHg(digits(v))} live={isLive && !validated} />
      <i>–</i>
      <ScoreInput value={ag} onChange={(v) => setAg(digits(v))} live={isLive && !validated} />
      <button className="wc-mbtn wc-mbtn-ok" disabled={!canSave && !canErase} title={canErase ? "Effacer le score" : "Valider et sauvegarder le score"} onClick={save}><Check size={15} /></button>
      {editing && <button className="wc-mbtn" title="Annuler la correction" onClick={() => setEditing(false)}><X size={14} /></button>}
    </span>
  );
}
/* Buteurs potentiels d'un match : les buts attendus (lh/la) du modèle sont
 * répartis entre les joueurs selon un poids (poste, buts déjà marqués dans le
 * tournoi, stats en sélection). P(marque) = 1 − exp(−λ·part). Les absents
 * (blessés/suspendus) sont exclus. Données chargées à la demande (quota-safe). */
const SCORER_POS_W = { A: 0.3, M: 0.12, D: 0.05, G: 0.01, "": 0.1 };
const lastNameNorm = (s) => {
  const t = (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").trim().split(/\s+/);
  return t[t.length - 1] || "";
};
function scorerProbs(players, lambda, absents) {
  const absSet = new Set((absents || []).filter((p) => p.kind !== "doubt").map((p) => lastNameNorm(p.name)));
  const list = (players || []).filter((p) => p.position !== "G" && !absSet.has(lastNameNorm(p.name)));
  const ws = list.map((p) => {
    let w = SCORER_POS_W[p.position || ""] ?? 0.1;
    if (p.wcGoals) w *= 1 + 1.2 * p.wcGoals;
    if (p.seasonGoals != null && p.apps) w *= 1 + Math.min(2, (p.seasonGoals / Math.max(1, p.apps)) * 2.5);
    return w;
  });
  const tot = ws.reduce((s, x) => s + x, 0) || 1;
  return list
    .map((p, i) => ({ ...p, prob: 1 - Math.exp(-lambda * 0.92 * (ws[i] / tot)) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 4);
}
const scorersFetchCache = {};
function MatchScorers({ ta, tb, lh, la, absA, absB }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [state, setState] = useState("idle");
  const load = async () => {
    setOpen(!open);
    if (data || state === "loading") return;
    const qh = NAT_EN[ta.n] || ta.n, qa = NAT_EN[tb.n] || tb.n;
    const ck = qh + "|" + qa;
    if (scorersFetchCache[ck]) { setData(scorersFetchCache[ck]); return; }
    setState("loading");
    try {
      const r = await fetch("/api/stats?source=goalscorers&home=" + encodeURIComponent(qh) + "&away=" + encodeURIComponent(qa));
      const d = await r.json();
      if (!r.ok || !d.home || !(d.home.players || []).length) { setState("err"); return; }
      scorersFetchCache[ck] = d;
      setData(d);
      setState("idle");
    } catch { setState("err"); }
  };
  const cols = data ? [
    { t: ta, list: scorerProbs(data.home.players, lh, absA) },
    { t: tb, list: scorerProbs(data.away.players, la, absB) },
  ] : null;
  return (
    <div className="wc-sc-wrap">
      <button className="wc-scbtn" onClick={load}>⚽ Buteurs probables <ChevronDown size={13} className={open ? "pf-rot" : ""} /></button>
      {open && state === "loading" && <div className="wc-sc-meta">Chargement…</div>}
      {open && state === "err" && <div className="wc-sc-meta">Données buteurs indisponibles pour ce match.</div>}
      {open && cols && (
        <div className="wc-sc">
          {cols.map((c, ci) => (
            <div key={ci} className="wc-sc-col">
              <div className="wc-sc-team">{c.t.f} {short(c.t.n)}</div>
              {c.list.map((p, i) => (
                <div key={i} className="wc-sc-p">
                  <span className="wc-sc-n">{p.name}{p.wcGoals ? <em> · {p.wcGoals} but{p.wcGoals > 1 ? "s" : ""} CdM</em> : null}</span>
                  <b>{pct(p.prob)}%</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && cols && <div className="wc-sc-meta">Estimation : buts attendus du match répartis selon le poste, les buts en CdM et les stats en sélection. Absents exclus.</div>}
    </div>
  );
}
/* Compositions : éditeur par équipe (reporté d'un match à l'autre, clé = nom).
 * Chaque titulaire = un POSTE (G/D/M/A) + un NOM éditable (autocomplété par
 * l'effectif réel football-data, gratuit). Un badge indique la SOURCE du XI :
 *   🔴 LIVE = compo officielle obtenue via l'API (clé payante) ;
 *   ✅ effectif réel = pré-rempli (onze probable) depuis l'effectif football-data ;
 *   ✏️ saisi = modifié à la main ; ⚠️ à compléter = effectif non publié.
 * Le bouton 🔄 recharge les effectifs et retente la compo live. */
function LineupPanel({ ta, tb, compA, compB, onCompChange, rosterA, rosterB, liveA, liveB, luState, onRefresh }) {
  const [open, setOpen] = useState(false);
  const Editor = ({ t, c, roster, live }) => {
    const hasPos = (roster || []).some((p) => p.pos);
    const liveComp = liveToComp(live);
    const seed = liveComp ? liveComp.xi : (hasPos ? probableXI(roster, c && c.formation) : seedXI(c && c.formation, roster));
    const edited = !!(c && (c.xi || c.formation || c.remanie));
    const xi = (c && c.xi) ? c.xi : seed;
    const formation = (c && c.formation) || (liveComp && liveComp.formation) || "";
    const counts = { G: 0, D: 0, M: 0, A: 0 }; xi.forEach((p) => { counts[p.pos] = (counts[p.pos] || 0) + 1; });
    const setRow = (i, patch) => onCompChange(t.n, { xi: xi.map((p, k) => k === i ? { ...p, ...patch } : p) });
    const setFormation = (f) => { const tpl = posTemplate(f || "4-3-3"); onCompChange(t.n, { formation: f, xi: xi.map((p, i) => ({ name: p.name, pos: tpl[i] })) }); };
    const dlId = "dl-" + normName(t.n);
    // Badge de source (priorité : saisie manuelle > live > effectif réel > rien).
    const src = edited ? { c: "src-edit", t: "✏️ saisi" } : live ? { c: "src-live", t: "🔴 LIVE · compo officielle" } : hasPos ? { c: "src-real", t: "✅ effectif réel" } : { c: "src-none", t: "⚠️ à compléter" };
    return (
      <div className="wc-lu-col">
        <div className="wc-lu-team">{t.f} {short(t.n)} <em>· {formation || counts.D + "-" + counts.M + "-" + counts.A}</em></div>
        <span className={"wc-lu-src " + src.c}>{src.t}</span>
        <select className="wc-lu-fsel" value={(c && c.formation) || ""} onChange={(e) => setFormation(e.target.value)}>
          {FORMATIONS.map((f) => <option key={f} value={f}>{f ? "Formation " + f : "Formation : libre"}</option>)}
        </select>
        <datalist id={dlId}>{(roster || []).map((p, i) => <option key={i} value={p.name} />)}</datalist>
        {xi.map((p, i) => (
          <div key={i} className="wc-lu-row">
            <select className={"wc-lu-pos2 wc-lu-pos-" + p.pos} value={p.pos} onChange={(e) => setRow(i, { pos: e.target.value })}>
              {["G", "D", "M", "A"].map((pc) => <option key={pc} value={pc}>{POS_LBL[pc]}</option>)}
            </select>
            <input className="wc-lu-name" list={dlId} value={p.name} placeholder={"Joueur " + (i + 1)} onChange={(e) => setRow(i, { name: e.target.value })} />
          </div>
        ))}
        <div className="wc-lu-sum">{counts.G} G · {counts.D} D · {counts.M} M · <b>{counts.A} A</b></div>
        {counts.A > 0 && <div className="wc-sc-meta">Attaquants : {xi.filter((p) => p.pos === "A" && p.name).map((p) => p.name).join(" · ") || "à compléter"}</div>}
        <label className="wc-lu-chk"><input type="checkbox" checked={!!(c && c.remanie)} onChange={(e) => onCompChange(t.n, { remanie: e.target.checked })} /> remaniée</label>
      </div>
    );
  };
  const luSt = luState && luState.state;
  return (
    <div className="wc-sc-wrap">
      <div className="wc-lu-head">
        <button className="wc-scbtn" onClick={() => setOpen(!open)}>🧩 Compositions (formation / XI) <ChevronDown size={13} className={open ? "pf-rot" : ""} /></button>
        {open && <button className="wc-lu-refresh" onClick={() => onRefresh && onRefresh()} disabled={luSt === "loading"} title="Recharger les effectifs et tenter la compo officielle (live)">{luSt === "loading" ? "…" : "🔄"}</button>}
      </div>
      {open && (
        <div className="wc-lu">
          <Editor t={ta} c={compA} roster={rosterA} live={liveA} />
          <Editor t={tb} c={compB} roster={rosterB} live={liveB} />
        </div>
      )}
      {open && luSt === "ok" && !(luState && luState.ready) && <div className="wc-sc-meta">Compo officielle (live) indisponible : {(luState && luState.note) || "non fournie par l'API gratuite"}.</div>}
      {open && <div className="wc-sc-meta">XI pré-rempli depuis l'effectif réel (badge ✅) — modifie noms/postes/formation au besoin. 🔄 recharge les données et tente la compo officielle (badge 🔴 LIVE si une clé API payante la fournit). Saisie mémorisée et reprise au match suivant.</div>}
    </div>
  );
}
function GroupCard({ gi, group, results, eff, bestThirds, onTeam, onValidate, onClear, liveIds, matchMeta, absences, onOpenMatch, comp, onCompChange, rosterFor, lineups, onRefresh }) {
  const [open, setOpen] = useState(gi === 0);
  const table = groupTable(group, gi, results, eff);
  const situation = teamGroupSituation(group, gi, results);
  const played = groupPairs(gi).filter(([x, y]) => { const r = results["G" + LETTERS[gi] + "-" + x + "-" + y]; return r && r.hg != null && r.ag != null; }).length;
  const absRows = absences ? group.map((ti) => ({ ti, list: absences[ti] || [] })).filter((r) => r.list.length) : [];
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
        {absRows.length > 0 && <div className="wc-abs">
          <div className="wc-abs-h"><ShieldAlert size={12} /> Absents &amp; incertains — pris en compte dans les pronostics</div>
          {absRows.map((r) => (
            <div key={r.ti} className="wc-abs-row">
              <span className="wc-flag">{POOL[r.ti].f}</span>
              <span className="wc-abs-list">{r.list.map((p, i) => (
                <span key={i} className={"wc-abs-p wc-abs-" + p.kind} title={p.reason || ""}>
                  {p.kind === "sus" ? "🟥" : p.kind === "doubt" ? "❔" : "✚"} {p.name}
                </span>
              ))}</span>
            </div>
          ))}
        </div>}
        <div className="wc-matches">{WC_MATCHES[gi]
          // Date/heure : calendrier officiel intégré (heure française) ; l'API prime pour la date.
          .map((m) => {
            const id = "G" + LETTERS[gi] + "-" + m.x + "-" + m.y;
            return { ...m, id, dateIso: (matchMeta && matchMeta[id] && matchMeta[id].dateIso) || m.iso };
          })
          // Tri chronologique garanti, même si une date API remplace la date statique.
          .sort((a, b) => new Date(a.dateIso) - new Date(b.dateIso))
          .map(({ x, y, id, dateIso, m6 }) => {
          const r = results[id] || {};
          const ta = POOL[group[x]], tb = POOL[group[y]];
          const done = r.hg != null && r.ag != null;
          const isLive = liveIds ? liveIds.has(id) : false;
          const mm = { dateIso, channel: m6 ? "M6 · beIN" : "beIN Sports" };
          // Prise de risque : une équipe qui a perdu son 1er match (ou dos au mur)
          // attaque plus et s'expose davantage pour ses matchs de groupe restants.
          const rx = riskFactor(situation[x]), ry = riskFactor(situation[y]);
          // Facteur composition saisie (formation + XI + remaniée), par équipe.
          // Rien saisi -> null -> le pronostic reste calculé "sans compo".
          const compA = comp ? comp[ta.n] : null, compB = comp ? comp[tb.n] : null;
          const rosA = rosterFor ? rosterFor(ta.n) : [], rosB = rosterFor ? rosterFor(tb.n) : [];
          // Compo officielle LIVE si l'API l'a fournie (sinon null).
          const luM = lineups ? lineups[lineupKey(ta.n, tb.n)] : null;
          const luReady = luM && luM.state === "ok" && luM.ready;
          const liveA = luReady ? luM.home : null, liveB = luReady ? luM.away : null;
          // Priorité : saisie manuelle > compo live > rien (sans compo).
          const hasManA = compA && (compA.xi || compA.formation || compA.remanie);
          const hasManB = compB && (compB.xi || compB.formation || compB.remanie);
          const effCompA = hasManA ? compA : liveToComp(liveA), effCompB = hasManB ? compB : liveToComp(liveB);
          const fx = compFactor(effCompA, rosA), fy = compFactor(effCompB, rosB);
          const liveUsed = (!hasManA && liveA) || (!hasManB && liveB);
          const p = !done ? predict(applyLineupF(applyRisk(eff[group[x]], rx), fx), applyLineupF(applyRisk(eff[group[y]], ry), fy), true, WC_AVG, LEAGUE_RHO.WC) : null;
          return (<div key={id} className="wc-m">
            {mm && <div className="wc-mmeta"><span className="wc-mdate">{formatFrDate(mm.dateIso)}</span><span className={"wc-mchan" + (mm.channel.startsWith("M6") ? " wc-mchan-tf1" : "")}>{mm.channel}</span></div>}
            <div className="wc-mline"><span className="wc-mt">{ta.f} {short(ta.n)}</span>
              <MatchScoreBox id={id} r={r} isLive={isLive} onValidate={onValidate} onClear={onClear} />
              <span className="wc-mt wc-r">{short(tb.n)} {tb.f}</span></div>
            {p && <div className="wc-pred">
              <span className={"wc-pc" + (p.pH >= p.pD && p.pH >= p.pA ? " wc-pc-top" : "")}>
                <b>1 · {pct(p.pH)}%</b><em>{p.topHome.s}</em>
              </span>
              <span className={"wc-pc" + (p.pD >= p.pH && p.pD >= p.pA ? " wc-pc-top" : "")}>
                <b>N · {pct(p.pD)}%</b><em>{p.topDraw.s}</em>
              </span>
              <span className={"wc-pc" + (p.pA > p.pH && p.pA > p.pD ? " wc-pc-top" : "")}>
                <b>2 · {pct(p.pA)}%</b><em>{p.topAway.s}</em>
              </span>
            </div>}
            {p && (rx > 0 || ry > 0) && <div className="wc-risk">⚡ {[rx > 0 ? short(ta.n) : null, ry > 0 ? short(tb.n) : null].filter(Boolean).join(" & ")} en quête de points — prise de risque intégrée au pronostic</div>}
            {p && (fx || fy) && <div className="wc-lineup-badge">{liveUsed ? "🔴 Compo officielle (live) intégrée au pronostic" : "🧩 Composition saisie intégrée au pronostic"}</div>}
            {p && <MatchScorers ta={ta} tb={tb} lh={p.lh} la={p.la} absA={absences ? absences[group[x]] : null} absB={absences ? absences[group[y]] : null} />}
            {p && <LineupPanel ta={ta} tb={tb} compA={compA} compB={compB} onCompChange={onCompChange} rosterA={rosA} rosterB={rosB} liveA={liveA} liveB={liveB} luState={luM} onRefresh={() => onRefresh && onRefresh(ta.n, tb.n)} />}
            <button className="wc-detailsbtn" onClick={() => onOpenMatch && onOpenMatch(ta.n, tb.n, rx, ry)} title="Ouvrir ce match dans l'onglet Match">🔍 Détails dans l'onglet Match</button>
          </div>);
        })}</div>
      </div>)}
    </div>
  );
}
function KnockoutTie({ tie, eff, onPick, onOpenMatch, comp, onCompChange, rosterFor, lineups, onRefresh }) {
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
  // Facteur composition saisie (par équipe), comme en phase de groupes.
  const compA = (comp && A) ? comp[A.n] : null, compB = (comp && B) ? comp[B.n] : null;
  const rosA = (rosterFor && A) ? rosterFor(A.n) : [], rosB = (rosterFor && B) ? rosterFor(B.n) : [];
  const luM = (lineups && A && B) ? lineups[lineupKey(A.n, B.n)] : null;
  const luReady = luM && luM.state === "ok" && luM.ready;
  const liveA = luReady ? luM.home : null, liveB = luReady ? luM.away : null;
  const hasManA = compA && (compA.xi || compA.formation || compA.remanie);
  const hasManB = compB && (compB.xi || compB.formation || compB.remanie);
  const effCompA = hasManA ? compA : liveToComp(liveA), effCompB = hasManB ? compB : liveToComp(liveB);
  const fa = compFactor(effCompA, rosA), fb = compFactor(effCompB, rosB);
  const liveUsed = (!hasManA && liveA) || (!hasManB && liveB);
  const teamA = applyLineupF((eff && tie.a != null) ? eff[tie.a] : A, fa);
  const teamB = applyLineupF((eff && tie.b != null) ? eff[tie.b] : B, fb);
  const p = (!tie.decided && teamA && teamB) ? predict(teamA, teamB, true, WC_AVG, LEAGUE_RHO.WC) : null;
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
      {p && <div className="wc-pred">
        <span className={"wc-pc" + (p.pH >= p.pD && p.pH >= p.pA ? " wc-pc-top" : "")}>
          <b>1 · {pct(p.pH)}%</b><em>{p.topHome.s}</em>
        </span>
        <span className={"wc-pc" + (p.pD >= p.pH && p.pD >= p.pA ? " wc-pc-top" : "")}>
          <b>N · {pct(p.pD)}%</b><em>{p.topDraw.s}</em>
        </span>
        <span className={"wc-pc" + (p.pA > p.pH && p.pA > p.pD ? " wc-pc-top" : "")}>
          <b>2 · {pct(p.pA)}%</b><em>{p.topAway.s}</em>
        </span>
      </div>}
      {p && (fa || fb) && <div className="wc-lineup-badge">{liveUsed ? "🔴 Compo officielle (live) intégrée au pronostic" : "🧩 Composition saisie intégrée au pronostic"}</div>}
      {A && B && !tie.decided && <LineupPanel ta={A} tb={B} compA={compA} compB={compB} onCompChange={onCompChange} rosterA={rosA} rosterB={rosB} liveA={liveA} liveB={liveB} luState={luM} onRefresh={() => onRefresh && onRefresh(A.n, B.n)} />}
      {A && B && <button className="wc-detailsbtn" onClick={() => onOpenMatch && onOpenMatch(A.n, B.n)} title="Ouvrir ce match dans l'onglet Match">🔍 Détails dans l'onglet Match</button>}
      <span className={"wc-tag " + (tie.decided ? "wc-tag-real" : "wc-tag-proj")}>{tie.isReal ? "réel" : tie.decided ? "validé" : "projeté"}</span>
    </div>
  );
}
function RoundBlock({ round, eff, onPick, defaultOpen, onOpenMatch, comp, onCompChange, rosterFor, lineups, onRefresh }) {
  const [open, setOpen] = useState(defaultOpen);
  const names = { R32: "16es de finale (Round of 32)", R16: "8es de finale", QF: "Quarts de finale", SF: "Demi-finales", F: "Finale" };
  /* Dates officielles FIFA + diffusion France : beIN diffuse tout ;
   * M6 choisit ses affiches en clair après le tirage du tableau final. */
  const infos = {
    R32: "28 juin – 3 juil. · beIN Sports (9 matchs sur M6)",
    R16: "4 – 7 juil. · beIN Sports (6 matchs sur M6)",
    QF: "9 – 11 juil. · beIN Sports (3 matchs sur M6)",
    SF: "14 – 15 juil. · M6 · beIN Sports",
    F: "19 juil. · M6 · beIN Sports",
  };
  return (
    <div className="pf-card wc-round">
      <button className="wc-group-head" onClick={() => setOpen(!open)}><span className="wc-glabel">{names[round.name]}</span><ChevronDown size={16} className={open ? "pf-rot" : ""} /></button>
      {open && <><div className="wc-kinfo">{infos[round.name]}</div><div className="wc-ties">{round.ties.map((t) => <KnockoutTie key={t.id} tie={t} eff={eff} onPick={onPick} onOpenMatch={onOpenMatch} comp={comp} onCompChange={onCompChange} rosterFor={rosterFor} lineups={lineups} onRefresh={onRefresh} />)}</div></>}
    </div>
  );
}
// Normalise le "stage" football-data.org (LAST_32, ROUND_OF_16, QUARTER_FINALS…)
// vers nos clés de tour. La petite finale (3e place) est hors bracket.
function stageToRound(stage) {
  const s = (stage || "").toUpperCase();
  if (s.includes("GROUP")) return "group";
  if (s.includes("32")) return "R32";
  if (s.includes("16")) return "R16";
  if (s.includes("QUARTER")) return "QF";
  if (s.includes("SEMI")) return "SF";
  if (s.includes("THIRD") || s.includes("3RD")) return null;
  if (s.includes("FINAL")) return "F";
  return null;
}
function WorldCupTab({ intlMatches = [], onOpenMatch }) {
  const [view, setView] = useState("groups");
  const [groups, setGroups] = useState(defaultGroups);
  const [results, setResults] = useState({});
  const [ko, setKo] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [rawApiMatches, setRawApiMatches] = useState([]);
  // Compositions saisies (PAR ÉQUIPE, reportées d'un match à l'autre), persistées :
  // { "France": { xi:[11 noms], remanie }, ... }.
  const [comp, setComp] = useState({});
  useEffect(() => { (async () => {
    const g = await store.get("wc:groups:v2"), r = await store.get("wc:results:v3"), k = await store.get("wc:ko:v3"), c = await store.get("wc:comp:v1");
    if (g && g.length === 12) setGroups(g); if (r) setResults(r); if (k) setKo(k); if (c) setComp(c); setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) store.set("wc:groups:v2", groups); }, [groups, loaded]);
  useEffect(() => { if (loaded) store.set("wc:results:v3", results); }, [results, loaded]);
  useEffect(() => { if (loaded) store.set("wc:ko:v3", ko); }, [ko, loaded]);
  useEffect(() => { if (loaded) store.set("wc:comp:v1", comp); }, [comp, loaded]);
  const onCompChange = (teamName, patch) => setComp((p) => ({ ...p, [teamName]: { ...(p[teamName] || {}), ...patch } }));
  useEffect(() => {
    const fetchWcMatches = async () => {
      try {
        const r = await fetch("/api/stats?source=matches&league=WC&all=1");
        if (!r.ok) return;
        const d = await r.json();
        setRawApiMatches([...(d.finished || []), ...(d.upcoming || [])]);
      } catch {}
    };
    fetchWcMatches();
    const iv = setInterval(fetchWcMatches, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);
  // Blessures + suspensions (cartons rouges) via le proxy : impactent les forces.
  const [absTeams, setAbsTeams] = useState([]);
  useEffect(() => {
    const fetchAbs = async () => {
      try {
        const r = await fetch("/api/stats?source=absences&league=WC");
        if (!r.ok) return;
        const d = await r.json();
        if (d.supported) setAbsTeams(d.teams || []);
      } catch {}
    };
    fetchAbs();
    const iv = setInterval(fetchAbs, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);
  // Noms d'équipes API (anglais) -> index POOL via la table de correspondance.
  const absences = useMemo(() => {
    const m = {};
    for (const t of absTeams) {
      const fr = EN_TO_FR_NORM[normName(t.team)];
      if (!fr) continue;
      const ti = POOL.findIndex((p) => p.n === fr);
      if (ti >= 0) m[ti] = t.players;
    }
    return m;
  }, [absTeams]);

  // Effectif RÉEL par équipe (football-data, gratuit pour le Mondial) + buts/passes
  // (buteurs WC) : sert à pré-remplir l'onze probable, autocompléter et pondérer le
  // XI. Correspondance robuste (nom complet, court, alias) pour ne manquer aucune
  // équipe ; repli sur les buteurs seuls si un effectif n'est pas (encore) publié.
  const [roster, setRoster] = useState({}); // frName -> [{name,pos,goals,assists}]
  const [rosterState, setRosterState] = useState("loading"); // loading | ok | err
  const loadRoster = async () => {
    setRosterState("loading");
    try {
      const [tr, sr] = await Promise.all([
        fetch("/api/stats?source=teams&league=WC"),
        fetch("/api/stats?source=scorers&league=WC"),
      ]);
      const td = tr.ok ? await tr.json() : { teams: [] };
      const sd = sr.ok ? await sr.json() : { players: [] };
      const mapFr = (...names) => { for (const n of names) { const fr = EN_TO_FR_NORM[normName(n || "")]; if (fr) return fr; } return null; };
      const scByTeam = {};
      (sd.players || []).forEach((p) => { const t = normName(p.team || ""); (scByTeam[t] = scByTeam[t] || []).push({ name: p.name, goals: p.goals || 0, assists: p.assists || 0 }); });
      const out = {};
      (td.teams || []).forEach((t) => {
        const fr = mapFr(t.fullName, t.name, t.shortName); if (!fr) return;
        const sc = scByTeam[normName(t.fullName)] || scByTeam[normName(t.name)] || [];
        const byLast = {}; sc.forEach((p) => { byLast[lastNm(p.name)] = p; });
        const players = (t.squad || []).map((p) => { const s = byLast[lastNm(p.name)]; return { name: p.name, pos: posGroup(p.position), goals: s ? s.goals : 0, assists: s ? s.assists : 0 }; });
        if (players.length) out[fr] = players;
      });
      // Équipes sans effectif mappé : repli sur les buteurs seuls (sans poste).
      (sd.players || []).forEach((p) => {
        const fr = mapFr(p.team); if (!fr || (out[fr] && out[fr].length)) return;
        (out[fr] = out[fr] || []).push({ name: p.name, pos: "", goals: p.goals || 0, assists: p.assists || 0 });
      });
      setRoster(out); setRosterState("ok");
    } catch { setRosterState("err"); }
  };
  useEffect(() => { loadRoster(); }, []);
  const rosterFor = (frName) => roster[frName] || [];

  // Compo OFFICIELLE LIVE (route lineup, API-Football) chargée à la demande via le
  // bouton 🔄. En gratuit la saison 2026 est bloquée -> renvoie supported:false ;
  // avec une clé payante, fournit la vraie formation + XI (badge LIVE).
  const [lineups, setLineups] = useState({}); // lineupKey -> { state, ready, home, away, note }
  const loadLineup = async (aN, bN) => {
    const k = lineupKey(aN, bN);
    setLineups((p) => ({ ...p, [k]: { state: "loading" } }));
    try {
      const qh = NAT_EN[aN] || aN, qa = NAT_EN[bN] || bN;
      const r = await fetch("/api/stats?source=lineup&home=" + encodeURIComponent(qh) + "&away=" + encodeURIComponent(qa));
      const d = await r.json();
      setLineups((p) => ({ ...p, [k]: { state: "ok", ...d } }));
    } catch { setLineups((p) => ({ ...p, [k]: { state: "err" } })); }
  };
  const onRefresh = (aN, bN) => { loadRoster(); loadLineup(aN, bN); };

  const apiParsed = useMemo(() => {
    const mapped = {}, meta = {};
    for (const m of rawApiMatches) {
      const hFr = EN_TO_FR_NORM[normName(m.home)];
      const aFr = EN_TO_FR_NORM[normName(m.away)];
      if (!hFr || !aFr) continue;
      const hIdx = POOL.findIndex((t) => t.n === hFr);
      const aIdx = POOL.findIndex((t) => t.n === aFr);
      if (hIdx < 0 || aIdx < 0) continue;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        for (const [x, y] of groupPairs(gi)) {
          let id = null, hg = null, ag = null;
          if (g[x] === hIdx && g[y] === aIdx) { id = "G" + LETTERS[gi] + "-" + x + "-" + y; hg = m.homeGoals; ag = m.awayGoals; }
          else if (g[x] === aIdx && g[y] === hIdx) { id = "G" + LETTERS[gi] + "-" + x + "-" + y; hg = m.awayGoals; ag = m.homeGoals; }
          if (id) {
            if (hg != null && ag != null) mapped[id] = { hg, ag };
            meta[id] = { dateIso: m.date };
          }
        }
      }
    }
    return { mapped, meta };
  }, [rawApiMatches, groups]);
  const apiMapped = apiParsed.mapped;
  const matchMeta = apiParsed.meta;

  const effectiveResults = useMemo(() => ({ ...apiMapped, ...results }), [apiMapped, results]);
  const liveIds = useMemo(() => new Set(Object.keys(apiMapped).filter((id) => !results[id])), [apiMapped, results]);

  // Vrai tableau final tel que tiré/joué : on classe chaque affiche knockout de
  // l'API par tour (R32/R16/QF/SF/F) -> buildKnockout l'utilise pour fixer les
  // affiches exactes (dont l'attribution officielle des 3es) et les vainqueurs.
  const koFixtures = useMemo(() => {
    const out = { R32: [], R16: [], QF: [], SF: [], F: [] };
    for (const m of rawApiMatches) {
      const round = stageToRound(m.stage);
      if (!round || round === "group") continue;
      const hFr = EN_TO_FR_NORM[normName(m.home)], aFr = EN_TO_FR_NORM[normName(m.away)];
      if (!hFr || !aFr) continue;
      const a = POOL.findIndex((t) => t.n === hFr), b = POOL.findIndex((t) => t.n === aFr);
      if (a < 0 || b < 0) continue;
      out[round].push({ a, b, hg: m.homeGoals, ag: m.awayGoals, winner: m.winner, date: m.date });
    }
    return out;
  }, [rawApiMatches]);

  // NB : pas d'auto-chargement des compos. Le XI confirmé du Mondial 2026 n'est
  // sur AUCUNE API gratuite (football-data = pack payant ; API-Football gratuit
  // = saison 2026 bloquée). On s'appuie donc sur la saisie manuelle (par défaut le
  // pronostic est calculé "sans compo"). Le bouton ouvre quand même un essai de XI
  // réel (utile si une clé API payante est ajoutée), mais sans boucle automatique.

  // Les matchs du Mondial en cours sont déjà intégrés via les scores de groupes
  // (effectivePool + eloAfterGroups) : on les exclut ici pour ne pas compter
  // deux fois les mêmes buts dans les ratings.
  const adjPool = useMemo(() => adjustPoolWithIntl(intlMatches.filter((m) => m.comp !== "WC26")), [intlMatches]);
  const wc = useMemo(() => {
    const stats = tournamentStats(groups, effectiveResults);
    const eloArr = eloAfterGroups(groups, effectiveResults);
    const eff = applyAbsences(effectivePool(stats, eloArr, adjPool), absences);
    const tables = groups.map((g, gi) => groupTable(g, gi, effectiveResults, eff));
    const thirds = tables.map((t, gi) => ({ ...t[2], gi })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || eff[b.ti].elo - eff[a.ti].elo);
    const bestThirds = new Set(thirds.slice(0, 8).map((t) => t.ti));
    const rounds = buildKnockout(eff, tables, bestThirds, ko, effectiveResults, koFixtures, WC_AVG, LEAGUE_RHO.WC);
    const champion = rounds[4].ties[0].winner;
    return { eff, bestThirds, rounds, champion };
  }, [groups, effectiveResults, ko, adjPool, absences, koFixtures]);

  const onTeam = (gi, s, val) => setGroups((p) => { const n = p.map((g) => [...g]); n[gi][s] = val; return n; });
  // Validation explicite : le score n'est sauvegardé et pris en compte dans les
  // calculs (classements, Elo, probabilités) qu'au clic sur le bouton ✓.
  const onValidate = (id, hg, ag) => setResults((p) => ({ ...p, [id]: { hg, ag, ok: 1 } }));
  const onClear = (id) => setResults((p) => { const n = { ...p }; delete n[id]; return n; });
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
        <div className="wc-hint">Saisis les scores réels au fil du tournoi puis <b>valide avec ✓</b> : le score est sauvegardé et les classements, qualifications et probabilités se recalculent. Touche le crayon pour corriger un score validé. <b>Groupes pré-remplis et éditables</b> — ajuste-les au tirage officiel.</div>
        {groups.map((g, gi) => <GroupCard key={gi} gi={gi} group={g} results={effectiveResults} eff={wc.eff} bestThirds={wc.bestThirds} onTeam={onTeam} onValidate={onValidate} onClear={onClear} liveIds={liveIds} matchMeta={matchMeta} absences={absences} onOpenMatch={onOpenMatch} comp={comp} onCompChange={onCompChange} rosterFor={rosterFor} lineups={lineups} onRefresh={onRefresh} />)}
      </>) : (<>
        <div className="wc-hint"><b>Tableau final officiel FIFA 2026</b> (positions de groupe fixes + attribution des 8 meilleurs 3es). Les vraies affiches et résultats sont repris dès qu'ils sont disponibles via l'API (étiquette « réel ») ; sinon le favori du modèle est affiché en « projeté ». <b>Touche une équipe</b> pour forcer une qualification (gère prolongation/tirs au but).</div>
        {wc.rounds.map((r, i) => <RoundBlock key={r.name} round={r} eff={wc.eff} onPick={onPick} defaultOpen={i === 0} onOpenMatch={onOpenMatch} comp={comp} onCompChange={onCompChange} rosterFor={rosterFor} lineups={lineups} onRefresh={onRefresh} />)}
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
          // Normaliser par la moyenne xG RÉELLE de la ligue (et non BASE_GOALS) :
          // sinon les xG sont gonflés dans les ligues prolifiques et déflatés ailleurs.
          const withXg = xd.teams.filter((t) => t.matches);
          const xgAvg = withXg.length ? withXg.reduce((s, t) => s + t.xgFor, 0) / withXg.length : BASE_GOALS;
          const byN = {}; xd.teams.forEach((t) => (byN[norm(t.name)] = t));
          tm = tm.map((t) => {
            const x = byN[norm(t.name)];
            if (x && x.matches) { xgActive = true; return { ...t, att: clampR(x.xgFor / xgAvg), def: clampR(x.xgAgainst / xgAvg), xgFor: x.xgFor, xgAgainst: x.xgAgainst }; }
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
    ? predictWithHistory({ ...ta, form: parseForm(ta.form) }, { ...tb, form: parseForm(tb.form) }, h2h, leagueAvg, LEAGUE_RHO[league] || RHO)
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
    return predict({ ...hh, form: parseForm(hh.form) }, { ...aw, form: parseForm(aw.form) }, false, leagueAvg, LEAGUE_RHO[league] || RHO);
  };
  // Value = proba modèle × meilleure cote. > 1,05 -> le modèle voit de la valeur.
  const oddsValue = (ev) => {
    const hh = byName(ev.home), aw = byName(ev.away);
    if (!hh || !aw) return null;
    const p = predict({ ...hh, form: parseForm(hh.form) }, { ...aw, form: parseForm(aw.form) }, false, leagueAvg, LEAGUE_RHO[league] || RHO);
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
  /* Sélections non qualifiées (onglet Match, mode International). */
  "Italie": "Italy", "Danemark": "Denmark", "Ukraine": "Ukraine", "Pologne": "Poland",
  "Serbie": "Serbia", "Grèce": "Greece", "Hongrie": "Hungary", "Pays de Galles": "Wales",
  "Roumanie": "Romania", "Slovaquie": "Slovakia", "Slovénie": "Slovenia",
  "Irlande": "Republic of Ireland", "Géorgie": "Georgia", "Albanie": "Albania",
  "Macédoine du Nord": "North Macedonia", "Finlande": "Finland", "Nigeria": "Nigeria",
  "Cameroun": "Cameroon", "Mali": "Mali", "Burkina Faso": "Burkina Faso", "Gabon": "Gabon",
  "Guinée": "Guinea", "Zambie": "Zambia", "Chili": "Chile", "Pérou": "Peru",
  "Venezuela": "Venezuela", "Costa Rica": "Costa Rica", "Jamaïque": "Jamaica",
  "Honduras": "Honduras", "Bolivie": "Bolivia", "Émirats arabes unis": "United Arab Emirates",
  "Oman": "Oman", "Bahreïn": "Bahrain", "Chine": "China PR",
};
/* Variantes de noms réellement renvoyées par football-data.org pour les
 * sélections : sans ces alias, le match correspondant n'est pas reconnu et son
 * score n'apparaît jamais dans l'onglet Mondial (cause des "scores manquants"). */
const NAT_EN_ALIASES = {
  "Czechia": "Tchéquie", "Czech Republic": "Tchéquie",
  "Korea Republic": "Corée du Sud", "Republic of Korea": "Corée du Sud",
  "United States": "États-Unis",
  "DR Congo": "RD Congo", "Congo DR": "RD Congo",
  "Cabo Verde": "Cap-Vert",
  "Bosnia and Herzegovina": "Bosnie-Herzégovine", "Bosnia & Herzegovina": "Bosnie-Herzégovine",
  "Côte d'Ivoire": "Côte d'Ivoire", "Ivory Coast": "Côte d'Ivoire",
  "IR Iran": "Iran",
  "Türkiye": "Turquie", "Turkey": "Turquie",
  "Saudi Arabia": "Arabie saoudite",
  "New Zealand": "Nouvelle-Zélande",
};
const EN_TO_FR_NORM = (() => {
  const m = {};
  Object.entries(NAT_EN).forEach(([fr, en]) => { m[normName(en)] = fr; });
  Object.entries(NAT_EN_ALIASES).forEach(([en, fr]) => { m[normName(en)] = fr; });
  return m;
})();

// Ajuste att/def/elo du pool avec classement FIFA + résultats internationaux récents.
function adjustPoolWithIntl(intlMatches, basePool = POOL) {
  const clamp = (x) => Math.max(0.6, Math.min(1.8, x));
  const formMap = {};
  for (const m of intlMatches) {
    if (m.hg == null || m.ag == null) continue;
    const hFr = EN_TO_FR_NORM[normName(m.home)], aFr = EN_TO_FR_NORM[normName(m.away)];
    if (hFr) { if (!formMap[hFr]) formMap[hFr] = { gf: 0, ga: 0, gp: 0 }; formMap[hFr].gf += m.hg; formMap[hFr].ga += m.ag; formMap[hFr].gp++; }
    if (aFr) { if (!formMap[aFr]) formMap[aFr] = { gf: 0, ga: 0, gp: 0 }; formMap[aFr].gf += m.ag; formMap[aFr].ga += m.hg; formMap[aFr].gp++; }
  }
  return basePool.map((t) => {
    const rank = FIFA_RANK[t.n] || 70;
    // Elo ajusté : 60% elo actuel + 40% elo dérivé du rang FIFA (rang 1→2100, rang 100→1400)
    const rankElo = Math.round(2100 - 7 * (rank - 1));
    const elo = Math.round(0.6 * t.elo + 0.4 * rankElo);
    const form = formMap[t.n];
    if (!form || form.gp < 3) return { ...t, elo };
    const w = Math.min(0.28, 0.055 * form.gp);
    const attObs = clamp((form.gf / form.gp) / WC_AVG);
    const defObs = clamp((form.ga / form.gp) / WC_AVG);
    return { ...t, elo, att: clamp(Math.pow(t.att, 1 - w) * Math.pow(attObs, w)), def: clamp(Math.pow(t.def, 1 - w) * Math.pow(defObs, w)) };
  });
}

// Pool de l'onglet Match en mode International : les 48 qualifiés + sélections non
// qualifiées, recalibrés (FIFA + résultats récents) puis triés alphabétiquement.
// Source unique d'ordre pour que le bouton "Détails" retrouve les bons index.
function intlPool(intlMatches) {
  return adjustPoolWithIntl(intlMatches, [...POOL, ...EXTRA_NATIONS]).sort((x, y) => x.n.localeCompare(y.n, "fr"));
}

// Extrait les confrontations directes depuis les matchs internationaux (vue depuis homeN).
function getH2HFromIntl(intlMatches, homeN, awayN) {
  return intlMatches
    .filter((m) => {
      const h = EN_TO_FR_NORM[normName(m.home)], a = EN_TO_FR_NORM[normName(m.away)];
      return (h === homeN && a === awayN) || (h === awayN && a === homeN);
    })
    .slice(0, 8)
    .map((m) => {
      const h = EN_TO_FR_NORM[normName(m.home)];
      return h === homeN ? { hg: m.hg, ag: m.ag } : { hg: m.ag, ag: m.hg };
    });
}

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
  const [scorers, setScorers] = useState([]);
  const [scorersMap, setScorersMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [updated, setUpdated] = useState(null);
  const load = async () => {
    setLoading(true); setErr(null); setTeams([]); setScorers([]); setScorersMap({});
    try {
      const [tr, sr] = await Promise.all([
        fetch("/api/stats?source=teams&league=" + league),
        fetch("/api/stats?source=scorers&league=" + league),
      ]);
      if (!tr.ok) { const j = await tr.json().catch(() => ({})); throw new Error(j.error || ("HTTP " + tr.status)); }
      const d = await tr.json();
      if (!d.teams || !d.teams.length) throw new Error("Aucune équipe (compétition pas encore active ?)");
      // Nom français quand connu (sélections nationales), puis tri alphabétique.
      const named = d.teams.map((t) => ({ ...t, frName: EN_TO_FR_NORM[normName(t.name)] || t.name }));
      setTeams(named.sort((a, b) => a.frName.localeCompare(b.frName, "fr"))); setSel(0); setUpdated(new Date());
      if (sr.ok) {
        const sd = await sr.json();
        const raw = sd.players || [];
        setScorers(raw);
        const m = {};
        raw.forEach((p) => { m[p.name] = { goals: p.goals, assists: p.assists || 0, matches: p.matches }; });
        setScorersMap(m);
      }
    } catch (e) { setErr(String(e.message || e)); setTeams([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [league]);
  const age = (dob) => { if (!dob) return "—"; const d = new Date(dob); if (isNaN(d)) return "—"; const t = new Date(); let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a; };

  const teamScorers = (() => {
    if (!scorers.length) return [];
    const groups = {};
    scorers.forEach((p) => { if (!groups[p.team]) groups[p.team] = []; groups[p.team].push(p); });
    return Object.entries(groups).map(([teamName, players]) => {
      const frName = EN_TO_FR_NORM[normName(teamName)];
      const poolEntry = frName ? POOL.find((t) => t.n === frName) : null;
      return {
        teamName, display: frName || teamName, flag: poolEntry ? poolEntry.f : "🏳️",
        players: [...players].sort((a, b) => b.goals - a.goals || (b.assists || 0) - (a.assists || 0)).slice(0, 5),
        totalGoals: players.reduce((s, p) => s + p.goals, 0),
      };
    }).sort((a, b) => b.totalGoals - a.totalGoals);
  })();

  const team = teams[sel];
  return (
    <>
      <section className="pf-card">
        <div className="pf-result-head"><Users size={15} /> Effectifs — football-data.org</div>
        <div className="lv-ctrl">
          <select value={league} onChange={(e) => setLeague(e.target.value)}>{SCORER_LEAGUES.map((l) => <option key={l.code} value={l.code}>{l.n}</option>)}</select>
          <button className="lv-refresh" onClick={load} disabled={loading}>{loading ? "…" : "↻"}</button>
        </div>
        <div className="lv-meta">{updated ? "MAJ " + updated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "Chargement…"}</div>
        {err && <div className="lv-err">⚠️ {err}<br /><span>Nécessite <code>FOOTBALLDATA_TOKEN</code> (gratuit). Les effectifs du Mondial se renseignent à l'approche du tournoi.</span></div>}
      </section>

      {teamScorers.length > 0 && (
        <section className="pf-card">
          <div className="pf-result-head">Meilleurs marqueurs par équipe · top 5</div>
          {teamScorers.map(({ teamName, display, flag, players }) => (
            <div key={teamName} className="sq-team-block">
              <div className="sq-team-hd">{flag} {display}</div>
              <table className="wc-st sc-tbl">
                <thead><tr><th>Joueur</th><th>B</th><th>PD</th><th>J</th></tr></thead>
                <tbody>{players.map((p, i) => (
                  <tr key={i}><td className="wc-tn">{p.name}</td><td className="wc-pts">{p.goals}</td><td>{p.assists || 0}</td><td>{p.matches}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          <div className="lv-meta">Top 5 par équipe · trié par nombre de buts · B = buts · PD = passes déc. · J = matchs.</div>
        </section>
      )}

      {teams.length > 0 && (
        <section className="pf-card">
          <div className="pf-result-head">Effectif complet</div>
          <select className="sc-team" value={sel} onChange={(e) => setSel(Number(e.target.value))}>{teams.map((t, i) => <option key={i} value={i}>{t.frName || t.name} ({t.squad.length})</option>)}</select>
          {team && team.squad.length > 0 && (<>
            <table className="wc-st sc-tbl">
              <thead><tr><th>Joueur</th><th>Poste</th><th>Nat.</th><th>Âge</th>{Object.keys(scorersMap).length > 0 && <><th>B</th><th>PD</th><th>J</th></>}</tr></thead>
              <tbody>{[...team.squad].sort((a, b) => {
                const sa = scorersMap[a.name], sb = scorersMap[b.name];
                return (sb ? sb.goals : 0) - (sa ? sa.goals : 0) || (sb ? sb.assists : 0) - (sa ? sa.assists : 0);
              }).map((p, i) => {
                const st = scorersMap[p.name];
                return (<tr key={i}>
                  <td className="wc-tn">{p.name}</td><td className="sc-team-c">{posFr(p.position)}</td>
                  <td className="sc-team-c">{p.nationality || "—"}</td><td>{age(p.dob)}</td>
                  {Object.keys(scorersMap).length > 0 && (<>
                    <td className="wc-pts">{st ? st.goals : 0}</td>
                    <td>{st ? st.assists : "—"}</td>
                    <td>{st ? st.matches : "—"}</td>
                  </>)}
                </tr>);
              })}</tbody>
            </table>
            <div className="lv-meta">{Object.keys(scorersMap).length > 0 ? "B = buts · PD = passes déc. · J = matchs. Trié par buts." : "Nom, poste, nationalité, âge."}</div>
          </>)}
        </section>
      )}
    </>
  );
}

/* ========================= App ========================= */
export default function App() {
  const [tab, setTab] = useState("match");
  const [intlMatches, setIntlMatches] = useState([]);
  const [matchRequest, setMatchRequest] = useState(null);
  useEffect(() => {
    fetch("/api/stats?source=intl").then((r) => r.json()).then((d) => setIntlMatches(d.matches || [])).catch(() => {});
  }, []);
  // Bouton "Détails" d'un match du Mondial : pré-remplit l'onglet Match et l'ouvre.
  // Nouvel objet à chaque clic → l'effet de MatchTab se redéclenche même équipes identiques.
  // riskA/riskB = prise de risque de chaque équipe (contexte de groupe), 0 en phase finale.
  const openMatch = (home, away, riskA = 0, riskB = 0) => { setMatchRequest({ home, away, riskA, riskB }); setTab("match"); };
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
        {tab === "match" ? <MatchTab intlMatches={intlMatches} matchRequest={matchRequest} /> : tab === "cdm" ? <WorldCupTab intlMatches={intlMatches} onOpenMatch={openMatch} /> : tab === "live" ? <LiveTab /> : tab === "scorers" ? <ScorersTab /> : <SquadsTab />}
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
.wc-abs{background:#0e1116;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px;display:flex;flex-direction:column;gap:5px;}
.wc-abs-h{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.4px;}
.wc-abs-row{display:flex;align-items:flex-start;gap:7px;}
.wc-abs-list{display:flex;flex-wrap:wrap;gap:4px 10px;}
.wc-abs-p{font-size:11.5px;color:var(--txt);white-space:nowrap;}
.wc-abs-sus{color:#ff7a7a;}
.wc-abs-doubt{color:var(--dim);}
.wc-matches{display:flex;flex-direction:column;gap:7px;}
.wc-m{background:#0e1116;border:1px solid var(--line);border-radius:10px;padding:8px 10px;}
.wc-mline{display:flex;align-items:center;gap:8px;}
.wc-mt{flex:1;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wc-r{text-align:right;}
.wc-mscore{display:flex;align-items:center;gap:5px;}
.wc-mscore i{color:var(--dim);font-style:normal;}
.wc-score{width:34px;height:32px;background:#15181d;border:1px solid var(--line);border-radius:8px;color:var(--txt);font-family:'JetBrains Mono';font-weight:700;font-size:16px;text-align:center;outline:none;}
.wc-score:focus{border-color:var(--cyan);}
.wc-score-live{border-color:var(--lime);color:var(--lime);}
.wc-mbtn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;flex:none;background:#15181d;border:1px solid var(--line);border-radius:8px;color:var(--dim);cursor:pointer;padding:0;}
.wc-mbtn-ok{color:var(--lime);border-color:rgba(163,230,53,.45);}
.wc-mbtn-ok:disabled{opacity:.3;cursor:default;}
.wc-mbtn-edit{color:var(--cyan);}
.wc-final{display:flex;align-items:center;gap:5px;height:32px;padding:0 8px;font-family:'JetBrains Mono';font-weight:700;font-size:16px;color:var(--lime);background:rgba(163,230,53,.08);border:1px solid rgba(163,230,53,.3);border-radius:8px;}
.wc-live-tag{font-size:9px;font-weight:700;background:var(--lime);color:#0b0d10;border-radius:4px;padding:1px 4px;letter-spacing:.5px;text-transform:uppercase;line-height:1.4;}
.wc-mmeta{display:flex;align-items:center;gap:8px;margin-bottom:5px;}
.wc-mdate{font-family:'JetBrains Mono';font-size:10px;color:var(--dim);}
.wc-mchan{font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:#1b1f25;color:var(--dim);}
.wc-mchan-tf1{background:rgba(70,211,255,.15);color:var(--cyan);}
.wc-pred{display:flex;gap:5px;margin-top:6px;}
.wc-risk{font-size:10.5px;color:var(--amber);margin-top:6px;line-height:1.4;}
.wc-lineup-badge{font-size:10.5px;color:var(--cyan);background:rgba(70,211,255,.1);border:1px solid rgba(70,211,255,.25);border-radius:7px;padding:5px 9px;margin-top:6px;line-height:1.4;}
.wc-lu-head{display:flex;align-items:center;gap:8px;}
.wc-lu-head .wc-scbtn{flex:1;}
.wc-lu-refresh{flex:none;background:#0e1116;border:1px solid var(--line);border-radius:7px;color:var(--cyan);font-size:13px;padding:3px 8px;cursor:pointer;}
.wc-lu-refresh:disabled{opacity:.5;cursor:default;}
.wc-lu-src{display:inline-block;align-self:flex-start;font-size:9.5px;font-weight:700;letter-spacing:.02em;padding:2px 6px;border-radius:5px;margin:2px 0;}
.src-live{background:rgba(255,90,90,.16);color:#ff7a7a;}
.src-real{background:rgba(200,255,66,.14);color:var(--lime);}
.src-edit{background:rgba(70,211,255,.14);color:var(--cyan);}
.src-none{background:rgba(255,186,58,.14);color:var(--amber);}
.wc-lu{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;}
.wc-lu-col{background:#13161b;border:1px solid var(--line);border-radius:8px;padding:7px 8px;display:flex;flex-direction:column;gap:4px;min-width:0;}
.wc-lu-team{font-size:11.5px;font-weight:700;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wc-lu-team em{font-style:normal;color:var(--cyan);font-family:'JetBrains Mono';font-size:10.5px;}
.wc-lu-row{display:flex;align-items:center;gap:5px;min-width:0;}
.wc-lu-pos{flex:none;width:30px;text-align:center;font-family:'Saira Condensed';font-weight:700;font-size:9px;letter-spacing:.02em;text-transform:uppercase;padding:2px 0;border-radius:4px;background:#1b1f25;color:var(--dim);}
.wc-lu-pos-G{background:rgba(255,186,58,.16);color:var(--amber);}
.wc-lu-pos-D{background:rgba(70,211,255,.14);color:var(--cyan);}
.wc-lu-pos-M{background:rgba(255,255,255,.08);color:#c4cbd4;}
.wc-lu-pos-A{background:rgba(200,255,66,.16);color:var(--lime);}
.wc-lu-fsel{background:#0e1116;border:1px solid rgba(70,211,255,.3);border-radius:6px;color:var(--cyan);font-size:11.5px;font-weight:600;padding:5px 6px;outline:none;}
.wc-lu-fsel option{background:#15181d;color:var(--txt);}
.wc-lu-rsel{flex:1;min-width:0;background:#0e1116;border:1px solid var(--line);border-radius:6px;color:var(--txt);font-size:11.5px;padding:5px 4px;outline:none;}
.wc-lu-rsel:focus{border-color:var(--cyan);}
.wc-lu-rsel option{background:#15181d;}
.wc-lu-pos2{flex:none;width:42px;border:0;border-radius:4px;font-family:'Saira Condensed';font-weight:700;font-size:10px;text-transform:uppercase;padding:4px 2px;outline:none;cursor:pointer;}
.wc-lu-pos2 option{background:#15181d;color:var(--txt);}
.wc-lu-name{flex:1;min-width:0;background:#0e1116;border:1px solid var(--line);border-radius:6px;color:var(--txt);font-size:11.5px;padding:5px 7px;outline:none;font-family:'Saira',sans-serif;}
.wc-lu-name:focus{border-color:var(--cyan);}
.wc-lu-sum{font-family:'JetBrains Mono';font-size:10.5px;color:var(--dim);margin-top:3px;}
.wc-lu-sum b{color:var(--lime);}
.wc-lu-chk{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dim);cursor:pointer;margin-top:2px;}
.wc-lu-chk input{width:15px;height:15px;accent-color:var(--cyan);}
.wc-lu-reset{background:none;border:0;color:var(--cyan);font-size:10.5px;cursor:pointer;text-align:left;padding:0;}
.wc-detailsbtn{margin-top:8px;width:100%;background:rgba(200,255,66,.08);border:1px solid rgba(200,255,66,.32);color:var(--lime);font-family:'Saira Condensed';font-weight:700;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;padding:7px;border-radius:8px;cursor:pointer;transition:.15s;}
.wc-detailsbtn:hover{background:rgba(200,255,66,.16);}
.wc-detailsbtn:active{transform:scale(.98);}
.wc-sc-wrap{margin-top:6px;}
.wc-scbtn{display:flex;align-items:center;gap:4px;background:none;border:none;color:var(--cyan);font-size:11px;font-weight:700;cursor:pointer;padding:2px 0;}
.wc-sc{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:5px;}
.wc-sc-col{background:#13161b;border:1px solid var(--line);border-radius:8px;padding:7px 9px;display:flex;flex-direction:column;gap:4px;min-width:0;}
.wc-sc-team{font-size:11px;font-weight:700;color:var(--dim);margin-bottom:2px;}
.wc-sc-p{display:flex;align-items:baseline;justify-content:space-between;gap:6px;}
.wc-sc-n{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.wc-sc-n em{font-style:normal;color:var(--lime);font-size:10px;}
.wc-sc-p b{font-family:'JetBrains Mono';font-size:11.5px;color:var(--cyan);flex:none;}
.wc-sc-meta{color:var(--dim);font-size:10.5px;line-height:1.45;margin-top:5px;}
.pf-h2h-badge{font-size:11px;color:var(--cyan);background:rgba(70,211,255,.1);border:1px solid rgba(70,211,255,.25);border-radius:8px;padding:6px 12px;text-align:center;margin-bottom:6px;}
.pf-risk-badge{font-size:11.5px;color:var(--amber);background:rgba(255,186,58,.1);border:1px solid rgba(255,186,58,.28);border-radius:8px;padding:7px 12px;text-align:center;margin-bottom:6px;line-height:1.4;}
.wc-pc{display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 4px;border-radius:7px;background:#1b1f25;flex:1;min-width:0;}
.wc-pc b{font-size:10px;color:var(--dim);font-weight:700;white-space:nowrap;}
.wc-pc em{font-style:normal;font-family:'JetBrains Mono';font-size:12px;color:#c4cbd4;font-weight:700;}
.wc-pc-top{background:rgba(70,211,255,.12);}
.wc-pc-top b{color:var(--cyan);}
.wc-pc-top em{color:var(--lime);}
.wc-kinfo{font-family:'JetBrains Mono';font-size:10.5px;color:var(--dim);padding:0 15px 6px;}
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
.sq-team-block{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--line);}
.sq-team-block:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0;}
.sq-team-hd{font-weight:700;font-size:13px;margin-bottom:6px;letter-spacing:.01em;}
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
