// =========================================================
// Export : livre-souvenir en PDF + sauvegarde brute en JSON.
// Tout se fabrique dans le telephone : rien ne transite par un serveur
// (a part le telechargement des photos depuis Supabase).
// =========================================================
import { supabase } from "./supabase.js";
import { echapper, afficherMessage } from "./outils.js";
import { Livre, PAGE, preparerPolices } from "./livre.js";
import { construirePdf } from "./pdf.js";

// ---------- Dates (heure locale, format "2026-11-03") ----------
function enISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}
function premierEtDernierJour(decalageMois) {
  const maintenant = new Date();
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() + decalageMois, 1);
  const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + decalageMois + 1, 0);
  return [enISO(debut), enISO(fin)];
}
function dateLongue(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Texte affiche sur la couverture : "Novembre 2026", "Du 3 au 20 novembre 2026"...
function libellePeriode(du, au) {
  if (!du && !au) return "Tous nos souvenirs";
  if (du && au) {
    const [a, m] = du.split("-").map(Number);
    const [premier, dernier] = [enISO(new Date(a, m - 1, 1)), enISO(new Date(a, m, 0))];
    if (du === premier && au === dernier) {
      const nom = new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      return nom.charAt(0).toUpperCase() + nom.slice(1);
    }
    return `Du ${dateLongue(du)} au ${dateLongue(au)}`;
  }
  return du ? `Depuis le ${dateLongue(du)}` : `Jusqu'au ${dateLongue(au)}`;
}

// Decoupe une liste en paquets (les requetes Supabase ont une taille maximale)
function parLots(liste, taille) {
  const lots = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  return lots;
}

// Telecharge une photo (lien temporaire) et la rend sous forme d'image prete a dessiner
async function chargerPhoto(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error("photo introuvable");
  const blob = await reponse.blob();
  const lien = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("photo illisible"));
      i.src = lien;
    });
    return { img, lien };
  } catch (e) {
    URL.revokeObjectURL(lien);
    throw e;
  }
}

// Donne le fichier a la personne. Sur iPhone : la feuille de partage
// ("Enregistrer dans Fichiers", AirDrop, Messages...). Sinon : telechargement classique.
// Doit etre appelee directement depuis un clic (c'est une regle d'iOS).
async function enregistrerFichier(blob, nom, type) {
  const fichier = new File([blob], nom, { type });
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: nom });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // la personne a ferme la feuille : rien a faire
      console.warn("partage impossible, telechargement classique", e);
    }
  }
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const tailleLisible = (octets) =>
  octets > 1024 * 1024 ? `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;

// zone = la boite HTML ; foyer = { id, name } ; membres = [{ user_id, display_name }]
export async function afficherExport(zone, foyer, membres) {
  const { data: { session } } = await supabase.auth.getSession();
  const moi = session.user.id;
  const noms = Object.fromEntries(membres.map((m) => [m.user_id, m.display_name]));

  const [debutMois, finMois] = premierEtDernierJour(0);

  zone.innerHTML = `
    <section class="carte apparition d3">
      <h2>Souvenirs à emporter</h2>
      <p class="petit">Un joli petit livre de vos pages, ou une sauvegarde de sécurité.</p>
      <button class="bouton secondaire marge-haut" id="ouvrir-export" type="button">Préparer un livre-souvenir 📖</button>

      <div id="panneau-export" hidden>
        <label>Quelle période ?</label>
        <div class="chips">
          <button type="button" class="chip actif" data-periode="ce-mois">Ce mois-ci</button>
          <button type="button" class="chip" data-periode="mois-dernier">Le mois dernier</button>
          <button type="button" class="chip" data-periode="tout">Tout le journal</button>
        </div>
        <div class="deux-colonnes">
          <div><span class="petit">Du</span><input id="e-du" type="date" value="${debutMois}" /></div>
          <div><span class="petit">Au</span><input id="e-au" type="date" value="${finMois}" /></div>
        </div>

        <label class="case"><input type="checkbox" id="e-photos" checked /> Avec les photos</label>

        <div id="message-export" class="message" hidden></div>
        <button class="bouton plein" id="creer-pdf" type="button">Créer le livre (PDF)</button>
        <div id="resultat-pdf"></div>

        <hr class="separe" />
        <p class="petit">La sauvegarde brute contient tous les textes, dates et étiquettes (sans les photos). Utile pour garder une copie de sécurité.</p>
        <button class="bouton secondaire" id="creer-json" type="button">Sauvegarde brute (JSON)</button>
        <div id="resultat-json"></div>
      </div>
    </section>
  `;

  const panneau = zone.querySelector("#panneau-export");
  const champDu = zone.querySelector("#e-du");
  const champAu = zone.querySelector("#e-au");
  const message = zone.querySelector("#message-export");

  zone.querySelector("#ouvrir-export").addEventListener("click", () => {
    panneau.hidden = !panneau.hidden;
  });

  // ---------- Raccourcis de periode ----------
  zone.querySelectorAll("[data-periode]").forEach((chip) => {
    chip.addEventListener("click", () => {
      zone.querySelectorAll("[data-periode]").forEach((c) => c.classList.toggle("actif", c === chip));
      const p = chip.dataset.periode;
      if (p === "tout") { champDu.value = ""; champAu.value = ""; }
      else { [champDu.value, champAu.value] = premierEtDernierJour(p === "ce-mois" ? 0 : -1); }
    });
  });
  // Si on touche aux dates a la main, plus aucun raccourci n'est "actif"
  [champDu, champAu].forEach((c) => c.addEventListener("change", () => {
    zone.querySelectorAll("[data-periode]").forEach((x) => x.classList.remove("actif"));
  }));

  // ---------- Le livre en PDF ----------
  let dernierPdf = null;
  const boutonPdf = zone.querySelector("#creer-pdf");
  const resultatPdf = zone.querySelector("#resultat-pdf");

  boutonPdf.addEventListener("click", async () => {
    const du = champDu.value, au = champAu.value;
    const avecPhotos = zone.querySelector("#e-photos").checked;
    if (du && au && du > au) return afficherMessage(message, "La date de début doit venir avant la date de fin.");

    boutonPdf.disabled = true;
    resultatPdf.innerHTML = "";
    dernierPdf = null;
    afficherMessage(message, "Je rassemble vos pages…", "info");

    try {
      // 1) Les pages du journal, de la plus ancienne a la plus recente (comme un vrai livre)
      let requete = supabase
        .from("entries")
        .select("id, author_id, entry_date, body, tag")
        .eq("household_id", foyer.id)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(2000);
      if (du) requete = requete.gte("entry_date", du);
      if (au) requete = requete.lte("entry_date", au);
      const { data: pages, error } = await requete;
      if (error) throw error;
      if (!pages.length) {
        afficherMessage(message, "Il n'y a aucune page sur cette période.");
        boutonPdf.disabled = false;
        return;
      }

      // 2) Les chemins des photos de ces pages
      const photosParPage = {};
      if (avecPhotos) {
        for (const lot of parLots(pages.map((p) => p.id), 80)) {
          const { data: lignes, error: e2 } = await supabase
            .from("entry_photos")
            .select("entry_id, storage_path, position")
            .in("entry_id", lot)
            .order("position");
          if (e2) throw e2;
          (lignes || []).forEach((l) => (photosParPage[l.entry_id] ||= []).push(l.storage_path));
        }
      }

      // 3) On dessine le livre page apres page
      await preparerPolices();
      const livre = new Livre();
      await livre.couverture({ titre: foyer.name, periode: libellePeriode(du, au), nbPages: pages.length });

      let photosRatees = 0;
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        afficherMessage(message, `Je mets en page… ${i + 1} sur ${pages.length}`, "info");

        // Les photos de cette page, une par une (on libere la memoire juste apres)
        const chargees = [];
        const chemins = photosParPage[p.id] || [];
        if (chemins.length) {
          const { data: liens } = await supabase.storage.from("photos").createSignedUrls(chemins, 600);
          const parChemin = Object.fromEntries((liens || []).map((l) => [l.path, l.signedUrl]));
          for (const chemin of chemins) {
            try {
              if (!parChemin[chemin]) throw new Error("lien manquant");
              chargees.push(await chargerPhoto(parChemin[chemin]));
            } catch (e) {
              console.warn("photo ignoree", e);
              photosRatees++;
            }
          }
        }

        await livre.ajouterEntree(
          {
            date: p.entry_date,
            texte: p.body,
            auteur: noms[p.author_id] || "Quelqu'un",
            tag: p.tag,
            autre: p.author_id !== moi,
          },
          chargees.map((c) => c.img),
        );
        chargees.forEach((c) => { URL.revokeObjectURL(c.lien); c.img.src = ""; });
      }

      // 4) Assemblage du PDF
      afficherMessage(message, "J'assemble le livre…", "info");
      const jpegs = await livre.terminer();
      const titre = `${foyer.name} – ${libellePeriode(du, au)}`;
      const blob = construirePdf(jpegs, PAGE.lPt, PAGE.hPt, titre);
      dernierPdf = { blob, nom: `livre-chez-nous-${du || "debut"}_${au || "fin"}.pdf` };

      afficherMessage(
        message,
        photosRatees ? `${photosRatees} photo(s) n'ont pas pu être ajoutées, le reste est là.` : "",
        photosRatees ? "erreur" : "info",
      );
      resultatPdf.innerHTML = `
        <div class="resultat apparition">
          <p><strong>Ton livre est prêt ✨</strong><br>
          <span class="petit">${jpegs.length} pages · ${tailleLisible(blob.size)}</span></p>
          <button class="bouton plein sauge" id="enregistrer-pdf" type="button">Enregistrer ou partager le PDF</button>
        </div>`;
    } catch (e) {
      console.error(e);
      afficherMessage(message, "Oups, le livre n'a pas pu être fabriqué. Vérifie ta connexion et réessaie.");
    }
    boutonPdf.disabled = false;
  });

  // Le bouton "Enregistrer" apparait apres la fabrication : on ecoute sur la zone
  resultatPdf.addEventListener("click", (e) => {
    if (e.target.closest("#enregistrer-pdf") && dernierPdf) {
      enregistrerFichier(dernierPdf.blob, dernierPdf.nom, "application/pdf");
    }
  });

  // ---------- La sauvegarde JSON ----------
  let derniereSauvegarde = null;
  const boutonJson = zone.querySelector("#creer-json");
  const resultatJson = zone.querySelector("#resultat-json");

  boutonJson.addEventListener("click", async () => {
    boutonJson.disabled = true;
    resultatJson.innerHTML = "";
    derniereSauvegarde = null;
    afficherMessage(message, "Je prépare la sauvegarde…", "info");

    try {
      const { data: pages, error } = await supabase
        .from("entries")
        .select("id, author_id, entry_date, body, tag, created_at")
        .eq("household_id", foyer.id)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(10000);
      if (error) throw error;

      const photosParPage = {};
      for (const lot of parLots(pages.map((p) => p.id), 80)) {
        const { data: lignes, error: e2 } = await supabase
          .from("entry_photos")
          .select("entry_id, storage_path, position")
          .in("entry_id", lot)
          .order("position");
        if (e2) throw e2;
        (lignes || []).forEach((l) => (photosParPage[l.entry_id] ||= []).push(l.storage_path));
      }

      const sauvegarde = {
        application: "Chez Nous",
        exporte_le: new Date().toISOString(),
        foyer: foyer.name,
        membres: membres.map((m) => m.display_name),
        note: "Les photos ne sont pas incluses : seuls leurs chemins de stockage sont listes.",
        pages: pages.map((p) => ({
          id: p.id,
          date: p.entry_date,
          auteur: noms[p.author_id] || null,
          texte: p.body,
          etiquette: p.tag,
          creee_le: p.created_at,
          photos: photosParPage[p.id] || [],
        })),
      };

      const blob = new Blob([JSON.stringify(sauvegarde, null, 2)], { type: "application/json" });
      derniereSauvegarde = { blob, nom: `sauvegarde-chez-nous-${enISO(new Date())}.json` };
      afficherMessage(message, "");
      resultatJson.innerHTML = `
        <div class="resultat apparition">
          <p><strong>Sauvegarde prête ✨</strong><br>
          <span class="petit">${pages.length} page${pages.length > 1 ? "s" : ""} · ${tailleLisible(blob.size)}</span></p>
          <button class="bouton plein sauge" id="enregistrer-json" type="button">Enregistrer ou partager la sauvegarde</button>
        </div>`;
    } catch (e) {
      console.error(e);
      afficherMessage(message, "Oups, la sauvegarde n'a pas pu être préparée. Réessaie dans un instant.");
    }
    boutonJson.disabled = false;
  });

  resultatJson.addEventListener("click", (e) => {
    if (e.target.closest("#enregistrer-json") && derniereSauvegarde) {
      enregistrerFichier(derniereSauvegarde.blob, derniereSauvegarde.nom, "application/json");
    }
  });
}
