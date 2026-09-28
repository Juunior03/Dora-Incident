// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { getCSRFToken } from '../utils/csrf';
import PropTypes from 'prop-types';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    getCSRFToken();
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch (err) {
        console.error("Erreur lors de la récupération de la session:", err);
      } finally {
        setLoading(false); // S'assurer que loading passe à false
      }
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false); // S'assurer que loading passe à false
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Charge le rôle à chaque changement d'utilisateur (connexion, restauration de session)
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }
    let cancelled = false;
    const loadRole = async () => {
      setRoleLoading(true);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setRole(data ? data.role : 'saisisseur');
      } catch (err) {
        console.error("Erreur lors de la récupération du rôle:", err);
        if (!cancelled) setRole(null); // Aucun droit en cas d'erreur
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    };
    loadRole();
    return () => { cancelled = true; };
  }, [userId]);

  const signIn = useCallback(async (email, password) => {
    try {
      setLoading(true); // Mettre loading à true pendant la connexion
      const csrfToken = getCSRFToken();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      }, {
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });
      if (error) throw error;
      setLoading(false); // Mettre loading à false après une connexion réussie
    } catch (err) {
      setLoading(false); // S'assurer que loading passe à false en cas d'erreur
      throw new Error('Erreur de connexion: ' + err.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const csrfToken = getCSRFToken();
      const { error } = await supabase.auth.signOut({
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });
      if (error) throw error;
      setUser(null);
      setRole(null);
    } catch (err) {
      throw new Error('Erreur lors de la déconnexion: ' + err.message);
    }
  }, []);

  const contextValue = useMemo(() => ({
    user,
    role,
    loading: loading || roleLoading,
    signIn,
    signOut,
  }), [user, role, loading, roleLoading, signIn, signOut]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};
