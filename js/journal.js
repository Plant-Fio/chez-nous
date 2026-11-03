// =========================================================
// Le journal : ecrire une page, voir le fil, recevoir en direct
// ce que l'autre ecrit (temps reel Supabase).
// =========================================================
import { supabase } from "./supabase.js";
import { echapper, afficherMessage, messageErreur } from "./outils.js";

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

// zone    = la boite HTML ou afficher le journal
// foyer   = { id, name, ... }
// membres = [{ user_id, display_name }, ...]
export async function afficherJournal(zone, foyer, membres) {
  arreterJournal();

  const { data: { session } } = await supabase.auth.getSession();
  const moi = session.user.id;
  const noms = Object.fromEntries(membres.map((m) => [m.user_id, m.display_name]));

  zone.innerHTML = `
    <button class="bouton plein apparition d2" id="ouvrir" type="button">Écrire une page ✍️</button>

    <form id="formulaire-entree" class="carte" hidden novalidate>
      <h2>Qu'est-ce qui t'a fait sourire aujourd'hui ?</h2>

      <label for="texte">Ta page</label>
      <textarea id="texte" rows="5" maxlength="5000"
                placeholder="Raconte, même en trois lignes…"></textarea>

      <label for="jour">Le jour</label>
      <input id="jour" type="date" value="${dateDuJour()}" />

      <label for="tag">Une étiquette (facultatif)</label>
      <div class="chips">
        ${ETIQUETTES.map((e) => `<button type="button" class="chip" data-tag="${echapper(e)}">${echapper(e)}</button>`).join("")}
      </div>
      <input id="tag" type="text" maxlength="30" placeholder="ou invente la tienne" />

      <div id="message-entree" class="message" hidden></div>
      <button class="bouton plein" type="submit">Garder ce souvenir</button>
      <button class="lien" type="button" id="annuler">Annuler</button>
    </form>

    <div id="fil"></div>
  `;

  const formulaire = zone.querySelector("#formulaire-entree");
  const fil = zone.querySelector("#fil");

  // ---------- Ouvrir / fermer le formulaire ----------
  zone.querySelector("#ouvrir").addEventListener("click", () => {
    formulaire.hidden = false;
    formulaire.classList.add("apparition");
    zone.querySelector("#texte").focus();
  });
  zone.querySelector("#annuler").addEventListener("click", () => {
    formulaire.hidden = true;
  });

  // ---------- Etiquettes : un clic remplit (ou vide) le champ ----------
  const champTag = zone.querySelector("#tag");
  zone.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      champTag.value = champTag.value === chip.dataset.tag ? "" : chip.dataset.tag;
    });
  });

  // ---------- Enregistrer une page ----------
  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texte = zone.querySelector("#texte").value.trim();
    const jour = zone.querySelector("#jour").value || dateDuJour();
    const tag = champTag.value.trim().toLowerCase() || null;
    const message = zone.querySelector("#message-entree");
    const bouton = e.submitter;

    if (!texte) return afficherMessage(message, "Écris au moins quelques mots avant de la garder 💛");

    bouton.disabled = true;
    // author_id = moi : la regle RLS le verifie aussi cote Supabase
    const { error } = await supabase.from("entries").insert({
      household_id: foyer.id,
      author_id: moi,
      entry_date: jour,
      body: texte,
      tag,
    });
    bouton.disabled = false;

    if (error) {
      console.error(error);
      return afficherMessage(message, messageErreur(error));
    }

    // Succes : on vide et on ferme le formulaire, puis on rafraichit le fil
    formulaire.reset();
    zone.querySelector("#jour").value = dateDuJour();
    afficherMessage(message, "");
    formulaire.hidden = true;
    chargerFil();
  });

  // ---------- Le fil chronologique ----------
  async function chargerFil() {
    const { data, error } = await supabase
      .from("entries")
      .select("id, author_id, entry_date, body, tag")
      .eq("household_id", foyer.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      fil.innerHTML = `<p class="petit centre">Impossible de charger le journal pour l'instant.</p>`;
      return;
    }

    if (data.length === 0) {
      fil.innerHTML = `
        <section class="carte vide apparition d3">
          <p>Votre carnet est encore vierge.</p>
          <p class="petit">Écrivez la première page, même une toute petite.</p>
        </section>`;
      return;
    }

    fil.innerHTML = data.map((e) => {
      const mienne = e.author_id === moi;
      const nom = noms[e.author_id] || "Quelqu'un";
      // echapper() d'abord (securite), puis on remet les retours a la ligne
      const texte = echapper(e.body).replace(/\n/g, "<br>");
      return `
        <article class="souvenir ${mienne ? "moi" : "autre"}">
          <div class="souvenir-date">${echapper(dateJolie(e.entry_date))}</div>
          <p class="souvenir-texte">${texte}</p>
          <footer class="souvenir-pied">
            <span class="pastille petite">${echapper(nom.charAt(0).toUpperCase())}</span>
            <span class="auteur">${echapper(nom)}</span>
            ${e.tag ? `<span class="tag">${echapper(e.tag)}</span>` : ""}
            ${mienne ? `<button class="supprimer" type="button" data-id="${e.id}">Supprimer</button>` : ""}
          </footer>
        </article>`;
    }).join("");
  }

  // Suppression (uniquement de ses propres pages : la RLS le garantit aussi)
  fil.addEventListener("click", async (e) => {
    const bouton = e.target.closest(".supprimer");
    if (!bouton) return;
    if (!confirm("Supprimer cette page ? Cette action est définitive.")) return;
    const { error } = await supabase.from("entries").delete().eq("id", bouton.dataset.id);
    if (error) { console.error(error); alert(messageErreur(error)); return; }
    chargerFil();
  });

  await chargerFil();

  // ---------- Temps reel ----------
  // Des que quelqu'un ajoute / modifie / supprime une page, on recharge le fil.
  // (On ne filtre pas par foyer ici : les suppressions ne sont pas filtrables,
  //  et de toute facon chargerFil() ne lit que NOTRE foyer.)
  canal = supabase
    .channel("journal-" + foyer.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, chargerFil)
    .subscribe();

  // Sur iPhone, la connexion temps reel s'endort quand l'appli est en arriere-plan.
  // Au retour, on recharge pour ne rien rater.
  auRetour = () => { if (document.visibilityState === "visible") chargerFil(); };
  document.addEventListener("visibilitychange", auRetour);
}
