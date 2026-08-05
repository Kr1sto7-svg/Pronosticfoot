/* Crée (ou vérifie) une branche de sauvegarde pointant sur l'état ACTUEL de main,
 * SANS rien déployer. Utile pour archiver l'ancienne version avant de pousser la
 * nouvelle. Idempotent : si la branche existe déjà, on la conserve.
 *
 * Usage (PowerShell) :
 *   $env:GITHUB_TOKEN = "ghp_ton_token_ici"
 *   node backup-branch.mjs                 # crée la branche v4-mondial
 *   $env:BACKUP_BRANCH = "autre-nom"; node backup-branch.mjs   # nom personnalisé
 */
const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = "Kr1sto7-svg";
const REPO = "Pronosticfoot";
const BACKUP = process.env.BACKUP_BRANCH || "v4-mondial";

if (!TOKEN) {
  console.error('\n❌  GITHUB_TOKEN manquant.\n   Lance d\'abord :\n   $env:GITHUB_TOKEN = "ghp_ton_token_ici"\n   puis relance le script.\n');
  process.exit(1);
}

const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

async function api(method, endpoint, body) {
  const r = await fetch(`https://api.github.com${endpoint}`, {
    method, headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${j.message || JSON.stringify(j)}`);
  return j;
}

async function getMainHead() {
  let lastErr = null;
  for (const branch of ["main", "master"]) {
    try {
      const j = await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`);
      return { sha: j.object.sha, branch };
    } catch (e) {
      lastErr = e;
      // 404 sur 'main' = branche absente OU dépôt non accessible par ce token :
      // on tente 'master', sinon on remonte la VRAIE erreur (401/403/404).
    }
  }
  if (lastErr) throw new Error(`${lastErr.message}\n   → 401 = token invalide/expiré · 403 = droits insuffisants · 404 = le token n'a pas accès à ${OWNER}/${REPO} (mauvais propriétaire ou dépôt non coché).`);
  return null;
}

async function main() {
  console.log("🔗  Connexion au dépôt GitHub...");
  const head = await getMainHead();
  if (!head) throw new Error("Impossible de lire main/master (dépôt vide ?).");
  console.log(`    ${head.branch} = commit ${head.sha.slice(0, 7)}\n`);

  try {
    await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${BACKUP}`);
    console.log(`🗄️  La branche '${BACKUP}' existe déjà — rien à faire (on la conserve).\n`);
  } catch {
    await api("POST", `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${BACKUP}`, sha: head.sha });
    console.log(`✅  Sauvegarde créée : branche '${BACKUP}' → commit ${head.sha.slice(0, 7)}.`);
    console.log(`    https://github.com/${OWNER}/${REPO}/tree/${BACKUP}\n`);
  }
}

main().catch((e) => { console.error("\n❌  Erreur :", e.message, "\n"); process.exit(1); });
