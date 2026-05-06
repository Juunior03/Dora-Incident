// src/components/IdleTimeout.jsx
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const IdleTimeout = ({ timeoutInMinutes = 15 }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Si l'utilisateur n'est pas connecté, on ne fait rien
    if (!user) return;

    // Fonction qui déconnecte l'utilisateur
    const handleLogout = async () => {
      await signOut();
      alert("Vous avez été déconnecté suite à une période d'inactivité.");
      navigate('/login');
    };

    // Fonction qui réinitialise le chronomètre
    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // On relance le chrono (timeoutInMinutes * 60 secondes * 1000 millisecondes)
      timeoutRef.current = setTimeout(handleLogout, timeoutInMinutes * 60 * 1000);
    };

    // Liste des événements qui prouvent que l'utilisateur est actif
    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];

    // On initialise le chronomètre une première fois
    resetTimer();

    // On écoute chaque mouvement/frappe sur la page
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Nettoyage (Cleanup) quand le composant est détruit
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, signOut, navigate, timeoutInMinutes]); // On relance si l'utilisateur change

  return null; // Ce composant est invisible
};

export default IdleTimeout;