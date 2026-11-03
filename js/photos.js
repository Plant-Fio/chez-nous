// =========================================================
// Outils photos : compression avant envoi + visionneuse plein ecran
// =========================================================

export const MAX_PHOTOS = 6; // par page de journal

// Reduit une photo : cote le plus long = 1600 px max, JPEG qualite 80 %.
// Une photo d'iPhone de 4 Mo tombe a ~300 Ko : envoi rapide, stockage leger.
export async function compresserImage(fichier, tailleMax = 1600, qualite = 0.8) {
  const url = URL.createObjectURL(fichier);
  try {
    // Le navigateur decode la photo (HEIC de l'iPhone compris) et respecte
    // son orientation : pas de photo couchee par erreur.
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("photo illisible"));
      i.src = url;
    });

    // Ratio : on ne fait jamais grossir une petite photo (max 1)
    const ratio = Math.min(1, tailleMax / Math.max(img.naturalWidth, img.naturalHeight));
    const largeur = Math.round(img.naturalWidth * ratio);
    const hauteur = Math.round(img.naturalHeight * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FAF3E7"; // fond creme (utile pour les PNG transparents)
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.drawImage(img, 0, 0, largeur, hauteur);

    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", qualite));
    if (!blob) throw new Error("compression impossible");
    return blob;
  } finally {
    URL.revokeObjectURL(url); // libere la memoire
  }
}

// Affiche une photo en grand, un toucher ferme
export function ouvrirVisionneuse(url) {
  const fond = document.createElement("div");
  fond.className = "visionneuse";
  fond.innerHTML = `<img src="${url}" alt="Photo en grand" /><span class="fermer">Toucher pour fermer</span>`;
  fond.addEventListener("click", () => fond.remove());
  document.body.appendChild(fond);
}
