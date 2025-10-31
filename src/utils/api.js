// src/utils/api.js
import { supabase } from '../supabaseClient';
import { getCSRFToken } from './csrf';

export const secureFetch = async (rpcName, params = {}) => {
  const csrfToken = getCSRFToken();

  const { data, error } = await supabase.rpc(rpcName, {
    ...params,
    p_csrf_token: csrfToken
  });

  if (error) throw error;
  return data;
};
