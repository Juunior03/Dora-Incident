// src/utils/supabaseSettings.js
import { supabase } from '../supabaseClient'; // Assurez-vous d'avoir configuré votre client Supabase

/**
 * Sauvegarde les paramètres dans Supabase
 */
export async function saveSettingsToSupabase(userId, settings) {
  const { data, error } = await supabase
    .from('submitting_entity_settings')
    .upsert({
      user_id: userId,
      name: settings.name,
      code: settings.code,
      affected_entity_type: settings.affectedEntityType,
      is_parameters_set: settings.isParametersSet,
      updated_at: new Date().toISOString()
    })
    .select();

  if (error) {
    console.error('Erreur Supabase:', error);
    throw new Error(`Erreur lors de la sauvegarde: ${error.message}`);
  }
  return data[0]; // Retourne les données sauvegardées
}

/**
 * Récupère les paramètres depuis Supabase
 */
export async function getSettingsFromSupabase(userId) {
  const { data, error } = await supabase
    .from('submitting_entity_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error('Erreur lors de la récupération des paramètres:', error);
    throw error;
  }
  return data;
}
