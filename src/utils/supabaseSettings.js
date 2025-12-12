// src/utils/supabaseSettings.js
import { supabase } from '../supabaseClient';

/**
 * Sauvegarde les paramètres utilisateur
 * - Utilise upsert avec onConflict: 'user_id'
 * - Évite de créer des doublons
 * - Stocke affected_entity_type en text[]
 */
export async function saveSettings(userId, settings) {
  const payload = {
    user_id: userId,
    name: settings.name ?? '',
    code: settings.code ?? '',
    affected_entity_type: settings.affectedEntityType ?? [],
    is_parameters_set: settings.isParametersSet ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('submitting_entity_settings')
    .upsert(payload, {
      onConflict: 'user_id', // SUPER IMPORTANT
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error saving settings:', error);
    throw error;
  }

  return data;
}

/**
 * Récupère les paramètres utilisateur
 * - Utilise maybeSingle pour éviter l'erreur PGRST116
 * - Retourne null si aucun paramètre n'existe
 */
export async function getSettings(userId) {
  const { data, error } = await supabase
    .from('submitting_entity_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }

  return data ?? null;
}
