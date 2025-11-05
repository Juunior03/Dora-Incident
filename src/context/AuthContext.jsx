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

  useEffect(() => {
    getCSRFToken();
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          try {
            const { data } = await supabase
              .from('users')
              .select('role')
              .eq('id', currentUser.id)
              .maybeSingle();
            if (data) {
              setRole(data.role);
            } else {
              setRole('saisisseur');
            }
          } catch (err) {
            console.error("Erreur lors de la récupération du rôle:", err);
            setRole('saisisseur'); // Rôle par défaut en cas d'erreur
          }
        } else {
          setRole(null);
        }
      } catch (err) {
        console.error("Erreur lors de la récupération de la session:", err);
      } finally {
        setLoading(false); // S'assurer que loading passe à false
      }
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setLoading(false); // S'assurer que loading passe à false
      }
    );
    return () => subscription.unsubscribe();
  }, []);

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
    loading,
    signIn,
    signOut,
  }), [user, role, loading, signIn, signOut]);

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
