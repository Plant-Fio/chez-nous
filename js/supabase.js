// =========================================================
// Connexion a Supabase (un seul "client" partage par toute l'appli)
// La bibliotheque est chargee directement depuis un CDN :
// pas besoin d'installer quoi que ce soit sur l'ordi.
// =========================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,       // reste connecte entre deux ouvertures
    autoRefreshToken: true,
    detectSessionInUrl: false,  // pas de lien magique en v1
  },
});
