// src/components/ChangePassword.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaLock, FaCheckCircle, FaRegCircle, FaUnlockAlt } from 'react-icons/fa';
import PropTypes from 'prop-types'; // NOUVEAU : Import pour la validation des props

// --- CORRECTION 1 & 2 : Composant extrait du parent et typage des props ---
const ValidationItem = ({ isValid, text }) => (
  <li className={`flex items-center text-sm mt-1 transition-colors duration-200 ${isValid ? 'text-green-600' : 'text-gray-400'}`}>
    {isValid ? <FaCheckCircle className="mr-2" /> : <FaRegCircle className="mr-2" />}
    {text}
  </li>
);

ValidationItem.propTypes = {
  isValid: PropTypes.bool.isRequired,
  text: PropTypes.string.isRequired,
};

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [validations, setValidations] = useState({
    length: false,
    cases: false,
    number: false,
    special: false,
  });

  useEffect(() => {
    setValidations({
      length: newPassword.length >= 15,
      cases: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
      number: /\d/.test(newPassword),
      special: /[@$!%*?&_-]/.test(newPassword), // L'antislash inutile a déjà été retiré
    });
  }, [newPassword]);

  const isPasswordValid = Object.values(validations).every(Boolean);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (!isPasswordValid) {
      setError("Le nouveau mot de passe ne respecte pas tous les critères.");
      return;
    }

    setLoading(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("Erreur : Impossible d'identifier l'utilisateur.");
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });

    if (verifyError) {
      setError("L'ancien mot de passe est incorrect.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      setError("Erreur lors de la mise à jour : " + updateError.message);
      setLoading(false);
    } else {
      setMessage("Mot de passe mis à jour ! Veuillez vous reconnecter avec le nouveau mot de passe...");
      setTimeout(async () => {
        await signOut();
        navigate('/login');
      }, 2500);
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Modifier mon mot de passe</h2>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm border border-red-200">{error}</div>}
      {message && <div className="bg-green-50 text-green-600 p-3 rounded mb-4 text-sm border border-green-200">{message}</div>}

      <form onSubmit={handleUpdatePassword} className="space-y-4">

        {/* --- CORRECTION 3 : htmlFor et id ajoutés --- */}
        <div>
          <label htmlFor="oldPassword" className="block text-gray-600 text-sm mb-1">Mot de passe actuel</label>
          <div className="relative">
            <FaUnlockAlt className="absolute left-3 top-3 text-gray-400" />
            <input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="pl-10 p-2 w-full rounded bg-gray-50 text-gray-800 border border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>
        </div>

        <hr className="border-gray-200 my-4" />

        {/* --- CORRECTION 3 : htmlFor et id ajoutés --- */}
        <div>
          <label htmlFor="newPassword" className="block text-gray-600 text-sm mb-1">Nouveau mot de passe</label>
          <div className="relative">
            <FaLock className="absolute left-3 top-3 text-gray-400" />
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 p-2 w-full rounded bg-white text-gray-800 border border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <ul className="mt-3 mb-2 px-1">
            <ValidationItem isValid={validations.length} text="Au moins 15 caractères" />
            <ValidationItem isValid={validations.cases} text="Une majuscule et une minuscule" />
            <ValidationItem isValid={validations.number} text="Au moins un chiffre" />
            <ValidationItem isValid={validations.special} text="Un caractère spécial (@, !, #, etc.)" />
          </ul>
        </div>

        {/* --- CORRECTION 3 : htmlFor et id ajoutés --- */}
        <div>
          <label htmlFor="confirmPassword" className="block text-gray-600 text-sm mb-1">Confirmer le nouveau mot de passe</label>
          <div className="relative">
            <FaLock className="absolute left-3 top-3 text-gray-400" />
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`pl-10 p-2 w-full rounded bg-white text-gray-800 border focus:outline-none focus:ring-1 ${
                confirmPassword && newPassword !== confirmPassword
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
              }`}
              required
            />
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
             <p className="text-red-500 text-xs mt-1">Les mots de passe ne correspondent pas.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !isPasswordValid || !confirmPassword || newPassword !== confirmPassword || !oldPassword}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
        >
          {loading ? 'Vérification en cours...' : 'Confirmer la modification'}
        </button>
      </form>
    </div>
  );
}