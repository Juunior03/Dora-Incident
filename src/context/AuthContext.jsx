// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { getCSRFToken } from '../utils/csrf';
import PropTypes from 'prop-types';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  // Rôle sur le registre d'information, indépendant de celui des déclarations d'incident :
  // 'gestionnaire' (modifie), 'lecteur' (consulte) ou null (aucun accès)
  const [roleRegistre, setRoleRegistre] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  // Utilisateur dont les rôles ont été chargés : tant qu'il diffère de l'utilisateur connecté, la session
  // n'est pas prête (évite un bref instant où l'utilisateur est connu mais ses droits pas encore lus)
  const [rolesDe, setRolesDe] = useState(null);

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
      setRoleRegistre(null);
      return;
    }
    let cancelled = false;
    const loadRole = async () => {
      setRoleLoading(true);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('role, role_registre')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        // Compte sans ligne de rôle : aucun droit (jamais de rôle par défaut)
        if (!cancelled) {
          setRole(data?.role ?? null);
          setRoleRegistre(data?.role_registre ?? null);
        }
      } catch (err) {
        console.error("Erreur lors de la récupération du rôle:", err);
        if (!cancelled) { // Aucun droit en cas d'erreur
          setRole(null);
          setRoleRegistre(null);
        }
      } finally {
        if (!cancelled) {
          setRoleLoading(false);
          setRolesDe(userId);
        }
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
      setRoleRegistre(null);
    } catch (err) {
      throw new Error('Erreur lors de la déconnexion: ' + err.message);
    }
  }, []);

  const contextValue = useMemo(() => ({
    user,
    role,
    roleRegistre,
    loading: loading || roleLoading || Boolean(user?.id && rolesDe !== user.id),
    signIn,
    signOut,
  }), [user, role, roleRegistre, loading, roleLoading, rolesDe, signIn, signOut]);

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
