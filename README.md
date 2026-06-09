# PronosticFoot — app web mobile (PWA) installable sur Android

Prédictions football (modèle Elo + Poisson / Dixon-Coles) avec 3 onglets :
- **Match** : prédiction d'un match isolé + détection de value face aux cotes.
- **Coupe du Monde 2026** : 12 groupes éditables, saisie des vrais scores, classements,
  qualifications (top 2 + 8 meilleurs 3es) et tableau final auto-alimenté.
- **Live** : récupère les stats réelles d'un championnat via le proxy et recalcule les forces.

## Prérequis
- Node.js 18+ et un compte gratuit GitHub + Vercel.
- (Pour l'onglet Live) un **jeton football-data.org** gratuit : football-data.org/client/register (saison en cours, toujours à jour).

## Lancer en local
```bash
npm install
npm run dev        # http://localhost:5173
```

## Déployer sur Vercel (recommandé)
1. Pousser ce dossier sur un dépôt GitHub.
2. Sur vercel.com : "Add New… > Project" > importer le dépôt (preset **Vite** détecté).
3. Settings > Environment Variables : ajouter `FOOTBALLDATA_TOKEN` (et éventuellement `APIFOOTBALL_KEY`).
4. Deploy. Vercel sert l'app + la fonction `/api/stats` automatiquement.

### Sans GitHub (CLI)
```bash
npm i -g vercel
vercel            # suivre les invites
vercel env add FOOTBALLDATA_TOKEN
vercel --prod
```

## Installer sur Android
1. Ouvrir l'URL Vercel dans **Chrome** sur le téléphone.
2. Menu ⋮ > **Installer l'application** (ou "Ajouter à l'écran d'accueil").
3. L'icône apparaît ; l'app s'ouvre en plein écran, comme une app native, et fonctionne hors-ligne (sauf l'onglet Live qui a besoin du réseau).

## Le proxy `/api/stats`
- `GET /api/stats?source=footballdata&league=FL1`  (saison en cours)
- Garde la clé secrète côté serveur, règle le CORS, met en cache 10 min (quota-safe).
- Lit le classement (1 requête) → buts pour/contre par équipe → forces att/def.

## Avertissement
Outil d'analyse pédagogique. Les paris comportent un risque de perte ; aucun modèle ne garantit de gain.
