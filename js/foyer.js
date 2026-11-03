// =========================================================
// Ecrans du foyer :
//  - choix : creer un foyer OU en rejoindre un avec un code
//  - accueil : le foyer une fois cree (code d'invitation, membres)
// =========================================================
import { supabase } from "./supabase.js";
import { echapper, afficherMessage, messageErreur } from "./outils.js";

// ---------- Choisir : creer ou rejoindre ----------
export function ecranFoyerChoix(racine, apres) {
  racine.innerHTML = `
    <header class="apparition">
      <h1>Votre foyer</h1>
      <p class="sous-titre">Une seule personne crée le foyer, l'autre le rejoint avec un code.</p>
    </header>

    <section class="carte apparition d2">
      <h2>Créer notre foyer</h2>
      <form id="creer" novalidate>
        <label for="nom-foyer">Comment l'appelle-t-on ?</label>
        <input id="nom-foyer" type="text" maxlength="40" placeholder="Chez nous, Le nid…" required />
        <label for="prenom-1">Ton prénom</label>
        <input id="prenom-1" type="text" maxlength="30" autocomplete="given-name" placeholder="Comment tu t'appelles ?" required />
        <div id="message-creer" class="message" hidden></div>
        <button class="bouton plein" type="submit">Créer le foyer</button>
      </form>
    </section>

    <section class="carte apparition d3">
      <h2>J'ai un code</h2>
      <form id="rejoindre" novalidate>
        <label for="code">Le code d'invitation</label>
        <input id="code" type="text" maxlength="12" autocapitalize="characters"
               autocomplete="off" placeholder="Ex. 4F7K2A" required />
        <label for="prenom-2">Ton prénom</label>
        <input id="prenom-2" type="text" maxlength="30" autocomplete="given-name" placeholder="Comment tu t'appelles ?" required />
        <div id="message-rejoindre" class="message" hidden></div>
        <button class="bouton plein sauge" type="submit">Rejoindre</button>
      </form>
    </section>

    <button class="lien" id="deconnexion" type="button">Se déconnecter</button>
  `;

  // Creer : appelle la fonction SQL create_household (voir etape 1)
  racine.querySelector("#creer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nom = racine.querySelector("#nom-foyer").value.trim();
    const prenom = racine.querySelector("#prenom-1").value.trim();
    const zone = racine.querySelector("#message-creer");
    if (!nom || !prenom) return afficherMessage(zone, "Il manque le nom du foyer ou ton prénom.");
    const bouton = e.submitter; bouton.disabled = true;
    const { error } = await supabase.rpc("create_household", { p_name: nom, p_display_name: prenom });
    if (error) { console.error(error); afficherMessage(zone, messageErreur(error)); bouton.disabled = false; return; }
    apres();
  });

  // Rejoindre : appelle join_household (verifie le code et la limite de 2 personnes)
  racine.querySelector("#rejoindre").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = racine.querySelector("#code").value.trim();
    const prenom = racine.querySelector("#prenom-2").value.trim();
    const zone = racine.querySelector("#message-rejoindre");
    if (!code || !prenom) return afficherMessage(zone, "Il manque le code ou ton prénom.");
    const bouton = e.submitter; bouton.disabled = true;
    const { error } = await supabase.rpc("join_household", { p_code: code, p_display_name: prenom });
    if (error) { console.error(error); afficherMessage(zone, messageErreur(error)); bouton.disabled = false; return; }
    apres();
  });

  racine.querySelector("#deconnexion").addEventListener("click", async () => {
    await supabase.auth.signOut();
    apres();
  });
}

// ---------- Accueil du foyer ----------
// "membre" = la ligne members de l'utilisateur, avec son foyer inclus
export async function ecranAccueilFoyer(racine, membre, apres) {
  const foyer = membre.households;

  // Liste des membres du foyer (RLS : on ne voit que ceux de son propre foyer)
  const { data: membres } = await supabase
    .from("members")
    .select("display_name, role")
    .eq("household_id", foyer.id)
    .order("joined_at");

  const liste = (membres || [])
    .map((m) => `<li><span class="pastille">${echapper(m.display_name.charAt(0).toUpperCase())}</span>${echapper(m.display_name)}</li>`)
    .join("");

  const attendEncore = (membres || []).length < 2;

  racine.innerHTML = `
    <header class="apparition">
      <h1>${echapper(foyer.name)} <span class="coeur">♡</span></h1>
      <p class="sous-titre">Bonjour ${echapper(membre.display_name)} !</p>
    </header>

    <section class="carte apparition d2">
      <h2>Qui vit ici</h2>
      <ul class="membres">${liste}</ul>
      ${attendEncore ? `
        <p class="petit">Il manque encore quelqu'un. Donne-lui ce code :</p>
        <div class="code-invitation" id="code-invitation">${echapper(foyer.invite_code)}</div>
        <button class="bouton plein sauge" id="copier" type="button">Copier le code</button>
      ` : `<p class="petit">Le foyer est au complet. 🏡</p>`}
    </section>

    <section class="carte apparition d3">
      <h2>Notre journal</h2>
      <p>Bientôt, c'est ici que vous écrirez vos plus beaux moments.</p>
    </section>

    <button class="lien" id="deconnexion" type="button">Se déconnecter</button>
  `;

  const copier = racine.querySelector("#copier");
  if (copier) {
    copier.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(foyer.invite_code);
        copier.textContent = "Copié ✓";
      } catch {
        copier.textContent = "Recopie-le à la main";
      }
    });
  }

  racine.querySelector("#deconnexion").addEventListener("click", async () => {
    await supabase.auth.signOut();
    apres();
  });
}
