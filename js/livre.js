// =========================================================
// Mise en page du "livre-souvenir" : on dessine chaque page A5 sur un
// <canvas> (avec les memes polices et couleurs que l'appli), puis on la
// transforme en image JPEG. js/pdf.js assemble ensuite les images en PDF.
// =========================================================

// ---------- Dimensions (A5 a 150 points par pouce) ----------
export const PAGE = { l: 874, h: 1240, lPt: 420, hPt: 595 };
const L = PAGE.l;
const H = PAGE.h;
const MARGE = 74;
const HAUT = 104;              // debut du contenu sur une page
const BAS = H - 124;           // limite basse (il reste la place du numero de page)
const LARGEUR_UTILE = L - 2 * MARGE;

// ---------- Couleurs : les memes que dans style.css ----------
const C = {
  creme: "#FAF3E7", cremeClair: "#FFF9EF", beige: "#E8D9C0",
  terracotta: "#C8745A", terracottaFonce: "#A85A42",
  sauge: "#9CAF88", saugeClair: "#DDE5D2", saugeFonce: "#6F845C",
  brun: "#4A3B32", brunDoux: "#8A7565",
};

const policeTitre = (px) => `600 ${px}px Caveat, "Bradley Hand", cursive`;
const policeTexte = (px, poids = 400) => `${poids} ${px}px Nunito, "Avenir Next Rounded", system-ui, sans-serif`;

// Proportions des cadres photo (hauteur / largeur)
const RATIO_LARGE = 0.58;     // photo large en tete (nombre de photos impair)
const RATIO_CELLULE = 0.82;   // photos en grille de 2 colonnes

const TAILLE_TEXTE = 28;
const LIGNE = 44;              // hauteur d'une ligne de texte

// Les polices web ne servent au canvas qu'une fois chargees : on les attend.
export async function preparerPolices() {
  try {
    await Promise.all([
      document.fonts.load(policeTitre(60), "Aàé"),
      document.fonts.load(policeTexte(28, 400), "Aàé"),
      document.fonts.load(policeTexte(24, 700), "Aàé"),
    ]);
  } catch (e) {
    console.warn("polices non chargees, police de secours utilisee", e);
  }
}

// ---------- Petits outils de dessin ----------

// Rectangle aux coins arrondis (on ne s'appuie pas sur ctx.roundRect, absent des vieux iPhone)
function rectArrondi(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Un petit coeur de largeur "t", centre en (cx, cy)
function coeur(ctx, cx, cy, t, couleur) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(t / 100, t / 100);
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(0, 35);
  ctx.bezierCurveTo(-60, -5, -35, -45, 0, -20);
  ctx.bezierCurveTo(35, -45, 60, -5, 0, 35);
  ctx.fill();
  ctx.restore();
}

// Fond creme + cadre fin autour de la page
function fond(ctx) {
  ctx.fillStyle = C.creme;
  ctx.fillRect(0, 0, L, H);
  ctx.strokeStyle = C.beige;
  ctx.lineWidth = 3;
  rectArrondi(ctx, 30, 30, L - 60, H - 60, 28);
  ctx.stroke();
}

// "2026-11-03" -> "Mardi 3 novembre 2026"
function dateJolie(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  const t = new Date(a, m - 1, j).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Reduit la taille de police jusqu'a ce que le texte tienne dans la largeur
function ajusterPolice(ctx, texte, fabrique, pxMax, largeurMax, pxMin = 24) {
  let px = pxMax;
  ctx.font = fabrique(px);
  while (px > pxMin && ctx.measureText(texte).width > largeurMax) {
    px -= 2;
    ctx.font = fabrique(px);
  }
  return px;
}

const largeurImage = (img) => img.naturalWidth ?? img.width;
const hauteurImage = (img) => img.naturalHeight ?? img.height;

// =========================================================
// Le livre
// =========================================================
export class Livre {
  constructor() {
    this.pages = [];   // pages terminees : { jpeg, largeur, hauteur }
    this.canvas = null;
    this.ctx = null;
    this.y = HAUT;     // position verticale courante sur la page
    this.numero = 0;   // 0 = couverture, puis 1, 2, 3...
    this.creerPage();
  }

  creerPage() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = L;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d");
    fond(this.ctx);
    this.y = HAUT;
  }

  // Termine la page courante : numero de page, puis conversion en JPEG
  async finirPage() {
    const ctx = this.ctx;
    if (this.numero > 0) {
      ctx.fillStyle = C.brunDoux;
      ctx.font = policeTexte(24, 600);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`— ${this.numero} —`, L / 2, H - 62);
    }
    const blob = await new Promise((ok) => this.canvas.toBlob(ok, "image/jpeg", 0.86));
    if (!blob) throw new Error("Impossible de fabriquer une page");
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    this.pages.push({ jpeg, largeur: L, hauteur: H });
    this.canvas.width = 0; // libere la memoire (important sur iPhone)
  }

  async nouvellePage() {
    await this.finirPage();
    this.numero += 1;
    this.creerPage();
  }

  // S'assure qu'il reste "h" pixels sur la page, sinon passe a la suivante
  async reserver(h) {
    if (this.y + h > BAS) await this.nouvellePage();
  }

  // ---------- Couverture ----------
  // titre = nom du foyer, periode = "Novembre 2026", nbPages = nombre de souvenirs
  async couverture({ titre, periode, nbPages }) {
    const ctx = this.ctx;

    // Grand rond sauge doux derriere la maison
    ctx.fillStyle = C.saugeClair;
    ctx.beginPath();
    ctx.arc(L / 2, 450, 290, 0, Math.PI * 2);
    ctx.fill();

    // La petite maison (memes formes que l'icone de l'appli)
    ctx.save();
    const k = 1.15;
    ctx.translate(L / 2 - 256 * k, 450 - 256 * k);
    ctx.scale(k, k);
    ctx.fillStyle = C.terracotta;
    ctx.beginPath();
    ctx.moveTo(256, 120); ctx.lineTo(110, 252); ctx.lineTo(402, 252);
    ctx.closePath();
    ctx.fill();
    rectArrondi(ctx, 150, 246, 212, 146, 18);
    ctx.fill();
    ctx.fillStyle = C.cremeClair;
    rectArrondi(ctx, 226, 300, 60, 92, 26);
    ctx.fill();
    ctx.beginPath(); ctx.arc(244, 208, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(268, 208, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(232, 212); ctx.lineTo(280, 212); ctx.lineTo(256, 240);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Titre (nom du foyer), reduit si besoin pour tenir dans la page
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.terracottaFonce;
    ajusterPolice(ctx, titre, policeTitre, 132, LARGEUR_UTILE, 56);
    ctx.fillText(titre, L / 2, 880);

    // Periode
    ctx.fillStyle = C.brunDoux;
    ajusterPolice(ctx, periode, (px) => policeTexte(px, 700), 36, LARGEUR_UTILE, 22);
    ctx.fillText(periode, L / 2, 950);

    ctx.fillStyle = C.saugeFonce;
    ctx.font = policeTitre(48);
    ctx.fillText("Notre journal à deux", L / 2, 1030);

    coeur(ctx, L / 2, 1085, 34, "rgba(200,116,90,0.6)");

    ctx.fillStyle = C.brunDoux;
    ctx.font = policeTexte(24, 600);
    ctx.fillText(`${nbPages} ${nbPages > 1 ? "souvenirs" : "souvenir"}`, L / 2, 1150);

    await this.nouvellePage(); // la couverture est finie, on prepare la page 1
  }

  // ---------- Une page du journal ----------
  // e = { date: "2026-11-03", texte, auteur, tag, autre: true si ce n'est pas la personne qui exporte }
  // images = photos deja chargees (HTMLImageElement ou ImageBitmap)
  async ajouterEntree(e, images = []) {
    const ctx = this.ctx;
    const largeur = LARGEUR_UTILE;

    // 1) La date, en ecriture manuscrite. On garde de la place pour la suite
    //    (une photo ou deux lignes) afin de ne pas laisser un titre orphelin.
    const lignes = this.decouper(e.texte || "", largeur);
    const hauteurTexte = lignes.reduce((s, l) => s + (l === null ? 22 : LIGNE), 0);
    const total = 76 + this.mesurePhotos(images) + hauteurTexte + 12 + 64;
    if (total <= BAS - HAUT) {
      await this.reserver(total); // une page courte reste d'un seul tenant
    } else {
      await this.reserver(76 + (images.length ? 300 : LIGNE * 2));
    }
    {
      const c = this.ctx;
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.fillStyle = e.autre ? C.saugeFonce : C.terracottaFonce;
      const titre = dateJolie(e.date);
      ajusterPolice(c, titre, policeTitre, 58, largeur, 34);
      c.fillText(titre, MARGE, this.y + 50);
      this.y += 76;
    }

    // 2) Les photos
    await this.dessinerPhotos(images);

    // 3) Le texte, ligne par ligne (une ligne qui ne rentre plus passe a la page suivante)
    // Les 2 dernieres lignes restent toujours avec la signature (pas de ligne orpheline)
    const debutFin = Math.max(0, lignes.length - 2);
    let finGardee = false;
    for (let i = 0; i < lignes.length; i++) {
      const ligne = lignes[i];
      if (ligne === null) { this.y += 22; continue; } // espace entre deux paragraphes
      if (i >= debutFin && !finGardee) {
        finGardee = true;
        await this.reserver((lignes.length - i) * LIGNE + 12 + 64);
      } else {
        await this.reserver(LIGNE);
      }
      const c = this.ctx;
      c.fillStyle = C.brun;
      c.font = policeTexte(TAILLE_TEXTE);
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.fillText(ligne, MARGE, this.y + 31);
      this.y += LIGNE;
    }

    // 4) Le pied : prenom de l'auteur et etiquette
    this.y += 12;
    await this.pied(e);

    // 5) Un petit coeur pour separer des pages suivantes
    this.y += 14;
    if (this.y + 56 < BAS) {
      coeur(this.ctx, L / 2, this.y + 24, 30, "rgba(200,116,90,0.45)");
      this.y += 64;
    }
  }

  // Taille du cadre d'une photo seule : elle garde ses proportions
  tailleUnique(img) {
    const iw = largeurImage(img), ih = hauteurImage(img);
    const s = Math.min((LARGEUR_UTILE - 28 - 30) / iw, 560 / ih, 2);
    return { bw: Math.round(iw * s) + 28, bh: Math.round(ih * s) + 28 };
  }

  // Hauteur totale que prendront les photos (pour savoir si une page tient sur la feuille)
  mesurePhotos(images) {
    const n = images.length;
    if (n === 0) return 0;
    const ECART = 22;
    if (n === 1) return this.tailleUnique(images[0]).bh + ECART + 10;
    let h = 0, debut = 0;
    if (n % 2 === 1) { h += Math.round((LARGEUR_UTILE - 28) * RATIO_LARGE) + 28 + ECART; debut = 1; }
    const cw = Math.floor((LARGEUR_UTILE - ECART) / 2);
    return h + Math.ceil((n - debut) / 2) * (Math.round(cw * RATIO_CELLULE) + ECART);
  }

  // Coupe un texte en lignes qui tiennent dans la largeur. "null" = saut de paragraphe.
  decouper(texte, largeurMax) {
    const ctx = this.ctx;
    ctx.font = policeTexte(TAILLE_TEXTE);
    const lignes = [];
    for (const paragraphe of texte.split("\n")) {
      const mots = paragraphe.split(/\s+/).filter(Boolean);
      if (mots.length === 0) { lignes.push(null); continue; }
      let ligne = "";
      for (let mot of mots) {
        // un mot geant (lien, "aaaaaaa...") est coupe lettre par lettre
        while (ctx.measureText(mot).width > largeurMax) {
          let n = mot.length;
          while (n > 1 && ctx.measureText(mot.slice(0, n)).width > largeurMax) n--;
          if (ligne) { lignes.push(ligne); ligne = ""; }
          lignes.push(mot.slice(0, n));
          mot = mot.slice(n);
        }
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (ctx.measureText(essai).width <= largeurMax) {
          ligne = essai;
        } else {
          lignes.push(ligne);
          ligne = mot;
        }
      }
      if (ligne) lignes.push(ligne);
    }
    // pas de saut de paragraphe au debut ni a la fin
    while (lignes.length && lignes[0] === null) lignes.shift();
    while (lignes.length && lignes[lignes.length - 1] === null) lignes.pop();
    return lignes;
  }

  // Les photos : 1 seule = grande ; sinon 2 colonnes (la 1re en large si le nombre est impair)
  async dessinerPhotos(images) {
    const n = images.length;
    if (n === 0) return;
    const ECART = 22;
    const angle = (k) => (k % 2 === 0 ? -0.01 : 0.01); // legere inclinaison, comme posees sur la page

    if (n === 1) {
      const img = images[0];
      const { bw, bh } = this.tailleUnique(img);
      await this.reserver(bh + ECART + 10);
      this.cadre(img, MARGE + (LARGEUR_UTILE - bw) / 2, this.y + 6, bw, bh, angle(0));
      this.y += bh + ECART + 10;
      return;
    }

    let i = 0;
    if (n % 2 === 1) {
      const bw = LARGEUR_UTILE;
      const bh = Math.round((bw - 28) * RATIO_LARGE) + 28;
      await this.reserver(bh + ECART);
      this.cadre(images[0], MARGE, this.y, bw, bh, angle(0));
      this.y += bh + ECART;
      i = 1;
    }
    const cw = Math.floor((LARGEUR_UTILE - ECART) / 2);
    for (; i < n; i += 2) {
      const ch = Math.round(cw * RATIO_CELLULE);
      await this.reserver(ch + ECART);
      for (let k = 0; k < 2 && i + k < n; k++) {
        this.cadre(images[i + k], MARGE + k * (cw + ECART), this.y, cw, ch, angle(i + k));
      }
      this.y += ch + ECART;
    }
  }

  // Une photo dans un cadre creme avec ombre douce (recadree au centre, un peu vers le haut)
  cadre(img, x, y, bw, bh, angle) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x + bw / 2, y + bh / 2);
    ctx.rotate(angle);
    ctx.translate(-bw / 2, -bh / 2);

    ctx.shadowColor = "rgba(120,85,60,0.28)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = C.cremeClair;
    rectArrondi(ctx, 0, 0, bw, bh, 14);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = C.beige;
    ctx.lineWidth = 2;
    ctx.stroke();

    const P = 14;
    const dw = bw - 2 * P, dh = bh - 2 * P;
    ctx.save();
    rectArrondi(ctx, P, P, dw, dh, 8);
    ctx.clip();
    const w0 = largeurImage(img), h0 = hauteurImage(img);
    const echelle = Math.max(dw / w0, dh / h0);
    const sw = dw / echelle, sh = dh / echelle;
    ctx.drawImage(img, (w0 - sw) / 2, (h0 - sh) * 0.35, sw, sh, P, P, dw, dh);
    ctx.restore();

    ctx.restore();
  }

  // Pied d'une page : pastille avec l'initiale, prenom, etiquette
  async pied(e) {
    await this.reserver(64);
    const ctx = this.ctx;
    const R = 21;
    const cx = MARGE + R;
    const cy = this.y + 28;
    const nom = (e.auteur || "").slice(0, 24);

    ctx.fillStyle = e.autre ? C.sauge : C.terracotta;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = e.autre ? "#34402B" : C.cremeClair;
    ctx.font = policeTitre(30);
    ctx.fillText(nom.charAt(0).toUpperCase(), cx, cy + 1);

    ctx.textAlign = "left";
    ctx.fillStyle = C.brunDoux;
    ctx.font = policeTexte(24, 700);
    ctx.fillText(nom, cx + R + 14, cy);
    let x = cx + R + 14 + ctx.measureText(nom).width + 18;

    if (e.tag) {
      ctx.font = policeTexte(21, 700);
      const w = ctx.measureText(e.tag).width + 30;
      const h = 36;
      ctx.fillStyle = C.saugeClair;
      rectArrondi(ctx, x, cy - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = "#55684A";
      ctx.fillText(e.tag, x + 15, cy + 1);
    }
    ctx.textBaseline = "alphabetic";
    this.y += 64;
  }

  // Termine le livre et rend la liste des pages (images JPEG)
  async terminer() {
    // la derniere page est fermee s'il y a du contenu dessus
    if (this.y > HAUT + 1) {
      await this.finirPage();
    }
    return this.pages;
  }
}
