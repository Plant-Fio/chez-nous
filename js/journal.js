// =========================================================
// Le journal : ecrire une page (avec photos), voir le fil, recevoir
// en direct ce que l'autre ecrit (temps reel Supabase).
// =========================================================
import { supabase } from "./supabase.js";
import { echapper, afficherMessage, messageErreur } from "./outils.js";
import { MAX_PHOTOS, compresserImage, ouvrirVisionneuse } from "./photos.js";

// Etiquettes proposees d'un clic (on peut aussi en inventer une)
const ETIQUETTES = ["moment drôle", "tendresse", "souvenir", "gratitude", "projet"];

let canal = null;          // la "ligne directe" temps reel
let auRetour = null;       // ecouteur "l'appli redevient visible"

// A appeler quand on quitte le journal (deconnexion) pour couper la ligne
export function arreterJournal() {
  if (canal) { supabase.removeChannel(canal); canal = null; }
  if (auRetour) { document.removeEventListener("visibilitychange", auRetour); auRetour = null; }
}

// Date du jour au format "2026-11-03" (heure locale, pas UTC : sinon
// tard le soir on obtiendrait la date de demain ou d'hier)
function dateDuJour() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}

// "2026-11-03" -> "mardi 3 novembre 2026"
// On construit la date a la main pour eviter tout decalage de fuseau horaire.
function dateJolie(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// Les photos sont dans un bucket PRIVE : pour les afficher, Supabase fournit
// des liens temporaires (1 h). On les garde en memoire pour ne pas les
// redemander a chaque rafraichissement du fil.
const cacheLiens = new Map(); // chemin -> { url, expire }

async function liensPhotos(chemins) {
  const maintenant = Date.now();
  const manquants = chemins.filter((c) => !(cacheLiens.get(c)?.expire > maintenant + 60_000));
  if (manquants.length) {
    const { data } = await supabase.storage.from("photos").createSignedUrls(manquants, 3600);
    (data || []).forEach((s) => {
      if (s.signedUrl) cacheLiens.set(s.path, { url: s.signedUrl, expire: maintenant + 3600_000 });
    });
  }
  return (chemin) => cacheLiens.get(chemin)?.url;
}

// zone    = la boite HTML ou afficher le journal
// foyer   = { id, name, ... }
// membres = [{ user_id, display_name }, ...]
export async function afficherJournal(zone, foyer, membres) {
  arreterJournal();

  const { data: { session } } = await supabase.auth.getSession();
  const moi = session.user.id;
  const noms = Object.fromEntries(membres.map((m) => [m.user_id, m.display_name]));

  let photos = [];              // photos choisies pour la page en cours : { blob, apercu }
  let photosParPage = {};       // pour la suppression : id de page -> [chemins]
  let entrees = [];             // toutes les pages chargees (avant filtre)
  let lienPhoto = () => undefined; // donne le lien temporaire d'une photo
  const filtre = { texte: "", tag: "", du: "", au: "" }; // la recherche en cours

  zone.innerHTML = `
    <button class="bouton plein apparition d2" id="ouvrir" type="button">Écrire une page ✍️</button>

    <form id="formulaire-entree" class="carte" hidden novalidate>
      <h2>Qu'est-ce qui t'a fait sourire aujourd'hui ?</h2>

      <label for="texte">Ta page</label>
      <textarea id="texte" rows="5" maxlength="5000"
                placeholder="Raconte, même en trois lignes…"></textarea>

      <label>Des photos (facultatif)</label>
      <div class="apercus" id="apercus"></div>
      <button class="bouton secondaire" id="ajouter-photos" type="button">Ajouter des photos 📷</button>
      <input id="fichiers" type="file" accept="image/*" multiple hidden />

      <label for="jour">Le jour</label>
      <input id="jour" type="date" value="${dateDuJour()}" />

      <label for="tag">Une étiquette (facultatif)</label>
      <div class="chips">
        ${ETIQUETTES.map((e) => `<button type="button" class="chip" data-tag="${echapper(e)}">${echapper(e)}</button>`).join("")}
      </div>
      <input id="tag" type="text" maxlength="30" placeholder="ou invente la tienne" />

      <div id="message-entree" class="message" hidden></div>
      <button class="bouton plein" id="enregistrer" type="submit">Garder ce souvenir</button>
      <button class="lien" type="button" id="annuler">Annuler</button>
    </form>

    <button class="bouton secondaire marge-haut" id="bascule-recherche" type="button">Rechercher dans le journal 🔍</button>

    <section class="carte" id="filtres" hidden>
      <label for="f-texte">Un mot ou un prénom</label>
      <input id="f-texte" type="search" autocomplete="off" placeholder="plage, anniversaire, Léa…" />

      <label>Une étiquette</label>
      <div class="chips" id="f-tags"></div>

      <label>Une période</label>
      <div class="deux-colonnes">
        <div><span class="petit">Du</span><input id="f-du" type="date" /></div>
        <div><span class="petit">Au</span><input id="f-au" type="date" /></div>
      </div>

      <p class="petit" id="f-compteur" hidden></p>
      <button class="lien" id="f-reset" type="button">Tout afficher</button>
    </section>

    <div id="fil"></div>
  `;

  const formulaire = zone.querySelector("#formulaire-entree");
  const fil = zone.querySelector("#fil");
  const message = zone.querySelector("#message-entree");

  // ---------- Ouvrir / fermer le formulaire ----------
  zone.querySelector("#ouvrir").addEventListener("click", () => {
    formulaire.hidden = false;
    formulaire.classList.add("apparition");
    zone.querySelector("#texte").focus();
  });
  zone.querySelector("#annuler").addEventListener("click", () => {
    viderPhotos();
    formulaire.hidden = true;
  });

  // ---------- Etiquettes : un clic remplit (ou vide) le champ ----------
  const champTag = zone.querySelector("#tag");
  zone.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      champTag.value = champTag.value === chip.dataset.tag ? "" : chip.dataset.tag;
    });
  });

  // ---------- Photos : choix, compression, apercus ----------
  const champFichiers = zone.querySelector("#fichiers");
  const zoneApercus = zone.querySelector("#apercus");

  function dessinerApercus() {
    zoneApercus.innerHTML = photos
      .map((p, i) => `
        <div class="apercu">
          <img src="${p.apercu}" alt="Photo choisie ${i + 1}" />
          <button type="button" class="retirer" data-i="${i}" aria-label="Retirer cette photo">×</button>
        </div>`)
      .join("");
  }

  function viderPhotos() {
    photos.forEach((p) => URL.revokeObjectURL(p.apercu));
    photos = [];
    dessinerApercus();
  }

  zone.querySelector("#ajouter-photos").addEventListener("click", () => champFichiers.click());

  champFichiers.addEventListener("change", async () => {
    const choisis = [...champFichiers.files];
    champFichiers.value = ""; // permet de rechoisir la meme photo plus tard
    if (!choisis.length) return;

    const place = MAX_PHOTOS - photos.length;
    if (choisis.length > place) {
      afficherMessage(message, `Maximum ${MAX_PHOTOS} photos par page. J'ai gardé les premières.`, "info");
    } else {
      afficherMessage(message, "");
    }

    const bouton = zone.querySelector("#ajouter-photos");
    bouton.disabled = true;
    bouton.textContent = "Je prépare tes photos…";
    for (const fichier of choisis.slice(0, Math.max(place, 0))) {
      try {
        const blob = await compresserImage(fichier);
        photos.push({ blob, apercu: URL.createObjectURL(blob) });
      } catch (e) {
        console.error(e);
        afficherMessage(message, "Une photo n'a pas pu être lue, je l'ai laissée de côté.");
      }
    }
    dessinerApercus();
    bouton.disabled = false;
    bouton.textContent = "Ajouter des photos 📷";
  });

  // Petit "×" pour retirer une photo choisie
  zoneApercus.addEventListener("click", (e) => {
    const b = e.target.closest(".retirer");
    if (!b) return;
    const [retiree] = photos.splice(Number(b.dataset.i), 1);
    URL.revokeObjectURL(retiree.apercu);
    dessinerApercus();
  });

  // ---------- Envoi des photos d'une page ----------
  // Chemin : <id du foyer>/<id de la page>/<nom unique>.jpg
  // Le 1er dossier = id du foyer : c'est ce que verifie la regle de securite du stockage.
  async function envoyerPhotos(idPage) {
    for (let i = 0; i < photos.length; i++) {
      const chemin = `${foyer.id}/${idPage}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(chemin, photos[i].blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      const { error: e2 } = await supabase.from("entry_photos").insert({
        entry_id: idPage, household_id: foyer.id, storage_path: chemin, position: i,
      });
      if (e2) throw e2;
    }
  }

  // ---------- Enregistrer une page ----------
  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texte = zone.querySelector("#texte").value.trim();
    const jour = zone.querySelector("#jour").value || dateDuJour();
    const tag = champTag.value.trim().toLowerCase() || null;
    const bouton = zone.querySelector("#enregistrer");

    // Une page peut etre faite de photos seules, mais pas etre totalement vide
    if (!texte && photos.length === 0) {
      return afficherMessage(message, "Écris quelques mots ou ajoute une photo avant de la garder 💛");
    }

    bouton.disabled = true;
    bouton.textContent = photos.length ? "J'envoie tes photos…" : "J'enregistre…";

    // 1) la page (author_id = moi : la regle RLS le verifie aussi cote Supabase)
    const { data: page, error } = await supabase
      .from("entries")
      .insert({ household_id: foyer.id, author_id: moi, entry_date: jour, body: texte, tag })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      bouton.disabled = false;
      bouton.textContent = "Garder ce souvenir";
      return afficherMessage(message, messageErreur(error));
    }

    // 2) ses photos (si une echoue, la page reste : on previent)
    let souci = false;
    try {
      await envoyerPhotos(page.id);
    } catch (err) {
      console.error(err);
      souci = true;
    }

    bouton.disabled = false;
    bouton.textContent = "Garder ce souvenir";
    formulaire.reset();
    zone.querySelector("#jour").value = dateDuJour();
    viderPhotos();
    formulaire.hidden = true;
    afficherMessage(message, "");
    await chargerFil();
    if (souci) alert("Ta page est gardée, mais une photo n'a pas pu être envoyée. Tu peux réessayer plus tard.");
  });

  // ---------- Le fil chronologique ----------
  async function chargerFil() {
    const { data, error } = await supabase
      .from("entries")
      .select("id, author_id, entry_date, body, tag")
      .eq("household_id", foyer.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error(error);
      fil.innerHTML = `<p class="petit centre">Impossible de charger le journal pour l'instant.</p>`;
      return;
    }

    if (data.length === 0) {
      entrees = [];
      dessinerTags();
      fil.innerHTML = `
        <section class="carte vide apparition d3">
          <p>Votre carnet est encore vierge.</p>
          <p class="petit">Écrivez la première page, même une toute petite.</p>
        </section>`;
      return;
    }

    // Les photos de toutes ces pages, en une seule requete
    const { data: lignes } = await supabase
      .from("entry_photos")
      .select("entry_id, storage_path, position")
      .in("entry_id", data.map((e) => e.id))
      .order("position");

    const lien = await liensPhotos((lignes || []).map((l) => l.storage_path));
    photosParPage = {};
    (lignes || []).forEach((l) => {
      (photosParPage[l.entry_id] ||= []).push(l.storage_path);
    });

    entrees = data;
    lienPhoto = lien;
    dessinerTags();
    dessinerFil();
  }

  // ---------- Recherche / filtres (tout se passe dans le navigateur) ----------

  // Pour chercher sans se soucier des majuscules ni des accents ("lea" trouve "Léa")
  const normaliser = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Une page correspond-elle aux filtres choisis ? (les dates "AAAA-MM-JJ" se comparent comme du texte)
  function correspond(e) {
    if (filtre.tag && e.tag !== filtre.tag) return false;
    if (filtre.du && e.entry_date < filtre.du) return false;
    if (filtre.au && e.entry_date > filtre.au) return false;
    if (filtre.texte) {
      const botte = normaliser(`${e.body} ${e.tag || ""} ${noms[e.author_id] || ""}`);
      if (!botte.includes(normaliser(filtre.texte))) return false;
    }
    return true;
  }

  const filtreActif = () => Boolean(filtre.texte || filtre.tag || filtre.du || filtre.au);

  // Les pastilles d'etiquettes = celles qui existent vraiment dans le journal
  function dessinerTags() {
    const tags = [...new Set(entrees.map((e) => e.tag).filter(Boolean))].sort();
    if (filtre.tag && !tags.includes(filtre.tag)) filtre.tag = ""; // l'etiquette n'existe plus
    zone.querySelector("#f-tags").innerHTML = tags.length
      ? tags.map((t) => `<button type="button" class="chip ${t === filtre.tag ? "actif" : ""}" data-filtre-tag="${echapper(t)}">${echapper(t)}</button>`).join("")
      : `<span class="petit">Pas encore d'étiquette.</span>`;
  }

  // Affiche le fil en appliquant les filtres
  function dessinerFil() {
    const lien = lienPhoto;
    const visibles = entrees.filter(correspond);

    const compteur = zone.querySelector("#f-compteur");
    compteur.hidden = !filtreActif();
    compteur.textContent = `${visibles.length} page${visibles.length > 1 ? "s" : ""} sur ${entrees.length}`;

    if (visibles.length === 0) {
      fil.innerHTML = `
        <section class="carte vide">
          <p>Rien ne correspond à ta recherche.</p>
          <p class="petit">Essaie un autre mot, ou touche « Tout afficher ».</p>
        </section>`;
      return;
    }

    fil.innerHTML = visibles.map((e) => {
      const mienne = e.author_id === moi;
      const nom = noms[e.author_id] || "Quelqu'un";
      // echapper() d'abord (securite), puis on remet les retours a la ligne
      const texte = echapper(e.body).replace(/\n/g, "<br>");

      const chemins = photosParPage[e.id] || [];
      const galerie = chemins.length ? `
        <div class="photos n${Math.min(chemins.length, 4)}">
          ${chemins.map((c) => lien(c) ? `
            <button class="photo" type="button" data-url="${echapper(lien(c))}">
              <img src="${echapper(lien(c))}" loading="lazy" alt="Photo du souvenir" />
            </button>` : "").join("")}
        </div>` : "";

      return `
        <article class="souvenir ${mienne ? "moi" : "autre"}">
          <div class="souvenir-date">${echapper(dateJolie(e.entry_date))}</div>
          ${galerie}
          ${texte ? `<p class="souvenir-texte">${texte}</p>` : ""}
          <footer class="souvenir-pied">
            <span class="pastille petite">${echapper(nom.charAt(0).toUpperCase())}</span>
            <span class="auteur">${echapper(nom)}</span>
            ${e.tag ? `<span class="tag">${echapper(e.tag)}</span>` : ""}
            ${mienne ? `<button class="supprimer" type="button" data-id="${e.id}">Supprimer</button>` : ""}
          </footer>
        </article>`;
    }).join("");
  }

  // Clics dans le fil : voir une photo en grand, ou supprimer une page
  fil.addEventListener("click", async (e) => {
    const photo = e.target.closest(".photo");
    if (photo) return ouvrirVisionneuse(photo.dataset.url);

    const bouton = e.target.closest(".supprimer");
    if (!bouton) return;
    if (!confirm("Supprimer cette page et ses photos ? Cette action est définitive.")) return;

    const id = bouton.dataset.id;
    const chemins = photosParPage[id] || [];
    // On supprime la page d'abord (ses lignes de photos partent avec),
    // puis les fichiers de photos pour ne rien laisser traîner.
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) { console.error(error); alert(messageErreur(error)); return; }
    if (chemins.length) await supabase.storage.from("photos").remove(chemins);
    chargerFil();
  });

  // ---------- Branchement de la recherche ----------
  const cadreFiltres = zone.querySelector("#filtres");
  zone.querySelector("#bascule-recherche").addEventListener("click", () => {
    cadreFiltres.hidden = !cadreFiltres.hidden;
    if (!cadreFiltres.hidden) zone.querySelector("#f-texte").focus();
  });

  // Chaque frappe / changement met le fil a jour tout de suite
  zone.querySelector("#f-texte").addEventListener("input", (e) => { filtre.texte = e.target.value.trim(); dessinerFil(); });
  zone.querySelector("#f-du").addEventListener("change", (e) => { filtre.du = e.target.value; dessinerFil(); });
  zone.querySelector("#f-au").addEventListener("change", (e) => { filtre.au = e.target.value; dessinerFil(); });

  // Clic sur une etiquette : on l'active, un 2e clic la desactive
  zone.querySelector("#f-tags").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filtre-tag]");
    if (!chip) return;
    filtre.tag = filtre.tag === chip.dataset.filtreTag ? "" : chip.dataset.filtreTag;
    dessinerTags();
    dessinerFil();
  });

  zone.querySelector("#f-reset").addEventListener("click", () => {
    Object.assign(filtre, { texte: "", tag: "", du: "", au: "" });
    zone.querySelector("#f-texte").value = "";
    zone.querySelector("#f-du").value = "";
    zone.querySelector("#f-au").value = "";
    dessinerTags();
    dessinerFil();
  });

  await chargerFil();

  // ---------- Temps reel ----------
  // Des que quelqu'un ajoute / modifie / supprime une page ou une photo,
  // on recharge le fil. (chargerFil() ne lit que NOTRE foyer, donc un
  // evenement venu d'ailleurs ne montre jamais rien de plus.)
  canal = supabase
    .channel("journal-" + foyer.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, chargerFil)
    .on("postgres_changes", { event: "*", schema: "public", table: "entry_photos" }, chargerFil)
    .subscribe();

  // Sur iPhone, la connexion temps reel s'endort quand l'appli est en arriere-plan.
  // Au retour, on recharge pour ne rien rater.
  auRetour = () => { if (document.visibilityState === "visible") chargerFil(); };
  document.addEventListener("visibilitychange", auRetour);
}
