// src/pages/ResetPasswordPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // Ajuste le chemin si besoin
import { FaLock } from 'react-icons/fa';

const ResetPasswordPage = () => {
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Vérifier si l'utilisateur arrive bien avec un "recovery token"
    // (Supabase gère l'extraction du token depuis l'URL automatiquement)
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
         setError("Lien invalide ou expiré. Veuillez demander une nouvelle réinitialisation.");
      }
    };
    checkUser();
  }, []);

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    // 1. Validation basique (tu peux remettre ta regex ici si tu veux)
    if (newPassword.length < 8) {
        setError("Le mot de passe doit contenir au moins 8 caractères.");
        setLoading(false);
        return;
    }

    // 2. Appel à Supabase pour mettre à jour le mot de passe
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      setError("Erreur lors de la mise à jour : " + error.message);
    } else {
      setMessage("Votre mot de passe a été mis à jour avec succès ! Redirection...");
      // Redirection vers la page de login après 3 secondes
      setTimeout(() => navigate('/login'), 3000);
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Nouveau mot de passe</h1>

        {error && <div className="error-message" style={{color: 'red'}}>{error}</div>}
        {message && <div className="success-message" style={{color: 'green'}}>{message}</div>}

        <form className="login-form" onSubmit={handlePasswordReset}>
          <div className="form-group">
            <FaLock className="input-icon" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 p-2 w-full rounded-full bg-gray-800 text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nouveau mot de passe"
              required
            />
          </div>
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Mise à jour...' : 'Confirmer'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;