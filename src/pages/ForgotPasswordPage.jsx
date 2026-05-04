// src/pages/ForgotPasswordPage.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // Ajuste le chemin si besoin
import { FaEnvelope } from 'react-icons/fa';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResetRequest = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // --- VÉRIFICATION DU DOMAINE ---
    const domaineAutorise = "@gmail.com"; //

    if (!email.toLowerCase().endsWith(domaineAutorise)) {
      setError(`Seules les adresses ${domaineAutorise} sont autorisées.`);
      return;
    }
    // -------------------------------

    setLoading(true);

    // Appel à Supabase pour envoyer l'email de réinitialisation
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // On force Supabase à rediriger vers la page qu'on a créée tout à l'heure
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError("Erreur : " + error.message);
    } else {
      // Message de succès générique (bonne pratique de sécurité pour ne pas révéler si un email existe ou non)
      setMessage("Si ce compte existe, un email contenant les instructions a été envoyé.");
      setEmail(''); // On vide le champ
    }

    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Mot de passe oublié</h1>
        <p className="text-gray-400 text-sm mb-6 text-center">
          Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.
        </p>

        {error && <div className="error-message" style={{color: '#ef4444', marginBottom: '1rem'}}>{error}</div>}
        {message && <div className="success-message" style={{color: '#22c55e', marginBottom: '1rem'}}>{message}</div>}

        <form className="login-form" onSubmit={handleResetRequest}>
          <div className="form-group">
            <FaEnvelope className="input-icon" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 p-2 w-full rounded-full bg-gray-800 text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Votre e-mail"
              required
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
          </button>

          <div className="flex justify-center w-full mt-6">
            <Link
              to="/login"
              className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;