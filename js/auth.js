// =========================================================
// Ecran de connexion / creation de compte (email + mot de passe)
// =========================================================
import { supabase } from "./supabase.js";
import { afficherMessage, messageErreur } from "./outils.js";

// "racine" = la boite #app, "apresConnexion" = fonction a relancer une fois connecte
export function ecranConnexion(racine, apresConnexion) {
  let modeInscription = false; // false = "Se connecter", true = "Créer mon compte"

  function dessiner() {
    racine.innerHTML = `
      <header class="apparition">
        <h1>Chez Nous <span class="coeur">♡</span></h1>
        <p class="sous-titre">Notre petit coin à deux</p>
      </header>

      <section class="carte apparition d2">
        <div class="onglets" role="tablist">
          <button type="button" class="onglet ${modeInscription ? "" : "actif"}" data-mode="connexion">Se connecter</button>
          <button type="button" class="onglet ${modeInscription ? "actif" : ""}" data-mode="inscription">Créer un compte</button>
        </div>

        <form id="formulaire" novalidate>
          <label for="email">Ton email</label>
          <input id="email" type="email" inputmode="email" autocomplete="email"
                 autocapitalize="none" placeholder="toi@exemple.com" required />

          <label for="mdp">Ton mot de passe</label>
          <input id="mdp" type="password" minlength="8"
                 autocomplete="${modeInscription ? "new-password" : "current-password"}"
                 placeholder="8 caractères minimum" required />

          <div id="message" class="message" hidden></div>

          <button class="bouton plein" type="submit">
            ${modeInscription ? "Créer mon petit nid" : "Rentrer à la maison"}
          </button>
        </form>
      </section>
    `;

    // Bascule entre les deux onglets
    racine.querySelectorAll(".onglet").forEach((bouton) => {
      bouton.addEventListener("click", () => {
        modeInscription = bouton.dataset.mode === "inscription";
        dessiner();
      });
    });

    racine.querySelector("#formulaire").addEventListener("submit", envoyer);
  }

  async function envoyer(evenement) {
    evenement.preventDefault();
    const email = racine.querySelector("#email").value.trim();
    const mdp = racine.querySelector("#mdp").value;
    const zone = racine.querySelector("#message");
    const bouton = racine.querySelector('button[type="submit"]');

    if (!email || mdp.length < 8) {
      return afficherMessage(zone, "Il me faut un email et un mot de passe d'au moins 8 caractères.");
    }

    bouton.disabled = true; // evite le double clic
    afficherMessage(zone, "");

    try {
      if (modeInscription) {
        const { data, error } = await supabase.auth.signUp({ email, password: mdp });
        if (error) throw error;
        // Si la confirmation par email est active, il n'y a pas encore de session :
        // on explique quoi faire au lieu de laisser l'ecran muet.
        if (!data.session) {
          afficherMessage(zone, "Compte créé ! Clique sur le lien reçu par email, puis reviens te connecter ici.", "info");
          bouton.disabled = false;
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: mdp });
        if (error) throw error;
      }
      apresConnexion(); // connecte : on relance le demarrage de l'appli
    } catch (e) {
      console.error(e);
      afficherMessage(zone, messageErreur(e));
      bouton.disabled = false;
    }
  }

  dessiner();
}
