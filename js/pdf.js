// =========================================================
// Mini-ecrivain de PDF : assemble des pages-images (JPEG) en un fichier PDF.
// Pas de bibliotheque a charger : un PDF "image par page" est tres simple.
//
// pages  = [{ jpeg: Uint8Array, largeur: px, hauteur: px }, ...]
// lPt/hPt = taille d'une page en "points" (1 pt = 1/72 pouce). A5 = 420 x 595.
// =========================================================

export function construirePdf(pages, lPt, hPt, titre = "Chez Nous") {
  const enc = new TextEncoder();
  const morceaux = [];
  let longueur = 0;
  const decalages = {}; // numero d'objet -> position dans le fichier (pour l'index final)

  const ecrire = (x) => {
    const octets = typeof x === "string" ? enc.encode(x) : x;
    morceaux.push(octets);
    longueur += octets.length;
  };

  // Numerotation des objets du PDF :
  //  1 = catalogue, 2 = liste des pages, 3 = infos (titre)
  //  puis pour la page i : page = 4+3i, contenu = 5+3i, image = 6+3i
  const numPage = (i) => 4 + 3 * i;
  const nbObjets = 3 + 3 * pages.length;

  const debutObjet = (n) => { decalages[n] = longueur; ecrire(`${n} 0 obj\n`); };
  const finObjet = () => ecrire("endobj\n");

  // Le titre est ecrit en UTF-16 (hexadecimal) pour garder les accents
  const titreHex = "FEFF" + [...titre].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("");

  ecrire("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  debutObjet(1); ecrire("<< /Type /Catalog /Pages 2 0 R >>\n"); finObjet();

  debutObjet(2);
  ecrire(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${numPage(i)} 0 R`).join(" ")}] >>\n`);
  finObjet();

  debutObjet(3); ecrire(`<< /Title <${titreHex}> /Producer (Chez Nous) >>\n`); finObjet();

  pages.forEach((p, i) => {
    const n = numPage(i);

    debutObjet(n);
    ecrire(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${lPt} ${hPt}] ` +
           `/Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>\n`);
    finObjet();

    // Le contenu de la page : "affiche l'image sur toute la page"
    const flux = `q ${lPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`;
    debutObjet(n + 1);
    ecrire(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream\n`);
    finObjet();

    debutObjet(n + 2);
    ecrire(`<< /Type /XObject /Subtype /Image /Width ${p.largeur} /Height ${p.hauteur} ` +
           `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    ecrire(p.jpeg);
    ecrire("\nendstream\n");
    finObjet();
  });

  // Index (xref) : chaque ligne fait exactement 20 octets, c'est la regle du format
  const debutIndex = longueur;
  ecrire(`xref\n0 ${nbObjets + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= nbObjets; n++) {
    ecrire(`${String(decalages[n]).padStart(10, "0")} 00000 n \n`);
  }
  ecrire(`trailer\n<< /Size ${nbObjets + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${debutIndex}\n%%EOF\n`);

  return new Blob(morceaux, { type: "application/pdf" });
}
