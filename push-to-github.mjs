import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = "Kr1sto7-svg";
const REPO = "Pronosticfoot";
const BASE = process.cwd();
const IGNORE = new Set(["node_modules", "dist", ".git", ".vercel", ".claude", "push-to-github.mjs"]);

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

function collectFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    const rel = relative(BASE, full).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else out.push({ path: rel, full });
  }
  return out;
}

async function api(method, endpoint, body) {
  const r = await fetch(`https://api.github.com${endpoint}`, {
    method, headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${j.message || JSON.stringify(j)}`);
  return j;
}

async function getHead() {
  for (const branch of ["main", "master"]) {
    try {
      const j = await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`);
      return { sha: j.object.sha, branch };
    } catch {}
  }
  return null; // repo vide
}

async function createBlob(content) {
  const j = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  });
  return j.sha;
}

async function main() {
  console.log("📂  Lecture des fichiers du projet...");
  const files = collectFiles(BASE);
  console.log(`    ${files.length} fichiers trouvés.\n`);

  console.log("🔗  Connexion au dépôt GitHub...");
  const head = await getHead();

  let baseTreeSha = null;
  let parentSha = null;
  let branch = "main";

  if (head) {
    branch = head.branch;
    parentSha = head.sha;
    const commit = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
    baseTreeSha = commit.tree.sha;
    console.log(`    Branche : ${branch} — commit parent : ${parentSha.slice(0, 7)}\n`);
  } else {
    console.log("    Dépôt vide — premier commit.\n");
  }

  console.log("📤  Envoi des fichiers (blobs)...");
  const tree = [];
  for (const { path, full } of files) {
    process.stdout.write(`    ${path} … `);
    const sha = await createBlob(readFileSync(full));
    tree.push({ path, mode: "100644", type: "blob", sha });
    console.log("✓");
  }

  console.log("\n🌳  Création du tree...");
  const treeBody = { tree };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  const newTree = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, treeBody);

  console.log("💬  Création du commit...");
  const commitBody = {
    message: "feat: calibrage des effets de formation à DEUX FACES (offensive = +buts/+encaissés, défensive = inverse) via FORM_PROFILE att/def ; interaction des formations des 2 équipes dans le match (2 blocs offensifs = match ouvert, 2 défensifs = fermé) ; éditeur compo clic-bouton + sélecteur de formation ; bracket officiel FIFA 2026",
    tree: newTree.sha,
  };
  if (parentSha) commitBody.parents = [parentSha];
  const newCommit = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, commitBody);

  console.log("🚀  Mise à jour de la branche...");
  if (head) {
    await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, { sha: newCommit.sha });
  } else {
    await api("POST", `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: newCommit.sha });
  }

  console.log(`\n✅  Poussé vers https://github.com/${OWNER}/${REPO}/tree/${branch}\n`);
}

main().catch((e) => { console.error("\n❌  Erreur :", e.message, "\n"); process.exit(1); });
