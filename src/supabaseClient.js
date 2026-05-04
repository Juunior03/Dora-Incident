// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log("URL reçue :", supabaseUrl ? "OK" : "MANQUANTE"); // Petit debug pour la console
console.log("Clé reçue :", supabaseKey ? "OK" : "MANQUANTE"); // Petit debug pour la console

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})