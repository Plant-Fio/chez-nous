// =========================================================
// Petits outils partages par tous les ecrans
// =========================================================

// Protege le HTML : si quelqu'un ecrit "<b>" dans son prenom, ca s'affiche
// comme du texte et ne casse pas la page (important pour la securite).
export function echapper(texte) {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Traduit les erreurs techniques de Supabase en phrases douces.
export function messageErreur(erreur) {
  const m = (erreur?.message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("already registered")) return "Un compte existe déjà avec cet email.";
  if (m.includes("email not confirmed")) return "Clique d'abord sur le lien reçu par email, puis reconnecte-toi.";
  if (m.includes("password should be")) return "Le mot de passe est trop court (8 caractères minimum).";
  if (m.includes("code invalide")) return "Ce code ne correspond à aucun foyer. Vérifie-le avec ta moitié.";
  if (m.includes("foyer est complet")) return "Ce foyer est déjà complet (2 personnes).";
  if (m.includes("rate limit")) return "Trop d'essais d'un coup, réessaie dans quelques minutes.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Pas de connexion internet. Réessaie dans un instant.";
  return "Oups, quelque chose n'a pas marché. Réessaie dans un instant.";
}

// Affiche un message sous un formulaire (type = "erreur" ou "info")
export function afficherMessage(zone, texte, type = "erreur") {
  zone.textContent = texte;
  zone.className = "message " + type;
  zone.hidden = !texte;
}
