// src/pages/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // 👈 On ajoute l'import de 'Link'
import { useAuth } from '../context/AuthContext.jsx';
import { FaUser, FaLock } from 'react-icons/fa';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Rediriger vers la page d'accueil si l'utilisateur est déjà connecté
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // On efface les erreurs précédentes à chaque nouvelle tentative

    // --- VÉRIFICATION DU DOMAINE ---
    const domaineAutorise = "@actionlogement.fr"; // 👈 Domaine autorisé

    if (!email.toLowerCase().endsWith(domaineAutorise)) {
      setError(`Erreur de connexion`);
      return; // On arrête la fonction ici, on n'appelle pas Supabase
    }
    // -------------------------------

    try {
      await signIn(email, password);
      globalThis.location.reload();
      // La navigation vers '/' est gérée par useEffect ci-dessus
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">User Login</h1>

        {error && <div className="error-message">{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <FaUser className="input-icon" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 p-2 w-full rounded-full bg-gray-800 text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="User Name"
              required
            />
          </div>
          <div className="form-group">
            <FaLock className="input-icon" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 p-2 w-full rounded-full bg-gray-800 text-gray-200 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Password"
              required
            />
          </div>

          {/* --- NOUVEAU : Le lien de mot de passe oublié --- */}
          <div className="flex justify-end w-full mb-4">
            <Link
              to="/forgot-password"
              className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          {/* ------------------------------------------------ */}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Connexion en cours...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;