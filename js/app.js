// =========================================================
// Point d'entree de l'appli : decide quel ecran afficher.
//   pas connecte        -> ecran de connexion
//   connecte sans foyer -> creer / rejoindre un foyer
//   connecte avec foyer -> accueil du foyer
// Chaque ecran rappelle "demarrer" quand il a fini son travail.
// =========================================================
import { supabase } from "./supabase.js";
import { ecranConnexion } from "./auth.js";
import { ecranFoyerChoix, ecranAccueilFoyer } from "./foyer.js";

const app = document.getElementById("app");

async function demarrer() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return ecranConnexion(app, demarrer);

  // A-t-on deja un foyer ? (la requete inclut les infos du foyer)
  const { data, error } = await supabase
    .from("members")
    .select("display_name, role, households(id, name, invite_code)")
    .eq("user_id", session.user.id)
    .limit(1);

  if (error) {
    console.error(error);
    app.innerHTML = `
      <header><h1>Oups</h1></header>
      <section class="carte">
        <p>Je n'arrive pas à joindre la maison pour l'instant. Vérifie ta connexion puis réessaie.</p>
        <button class="bouton plein" id="reessayer" type="button">Réessayer</button>
      </section>`;
    document.getElementById("reessayer").addEventListener("click", demarrer);
    return;
  }

  if (!data || data.length === 0) return ecranFoyerChoix(app, demarrer);
  return ecranAccueilFoyer(app, data[0], demarrer);
}

demarrer();
