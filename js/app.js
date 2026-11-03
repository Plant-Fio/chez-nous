// =========================================================
// Point d'entree de l'appli.
// Pour l'instant : un ecran d'accueil + un test de connexion Supabase.
// Les prochaines etapes (connexion, foyer, entrees...) s'ajouteront ici.
// =========================================================
import { supabase } from "./supabase.js";

const app = document.getElementById("app");

// Ecran d'accueil provisoire
function afficherAccueil() {
  app.innerHTML = `
    <header class="apparition">
      <h1>Chez Nous <span class="coeur">♡</span></h1>
      <p class="sous-titre">Notre petit coin à deux</p>
    </header>

    <section class="carte apparition d2">
      <h2>Bienvenue à la maison</h2>
      <p>Ici, on garde nos plus beaux moments, nos fous rires et nos petites victoires.</p>
      <span id="etat" class="etat">Je vérifie la connexion…</span>
    </section>
  `;
}

// Petit test : l'appli arrive-t-elle a joindre Supabase ?
async function testerConnexion() {
  const etat = document.getElementById("etat");
  try {
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    etat.textContent = "Tout est branché ✓";
  } catch (e) {
    console.error(e);
    etat.textContent = "Connexion impossible pour l'instant";
    etat.classList.add("erreur");
  }
}

afficherAccueil();
testerConnexion();
