// src/components/ChangePassword.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FaLock, FaCheckCircle, FaRegCircle } from 'react-icons/fa';

export default function ChangePassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const { signOut } = useAuth();
  const navigate = useNavigate();

  // --- NOUVEAU : État pour suivre la validation des règles ---
  const [validations, setValidations] = useState({
    length: false,
    cases: false,
    number: false,
    special: false,
  });

  // --- NOUVEAU : Vérification en temps réel ---
  useEffect(() => {
    setValidations({
      length: newPassword.length >= 8,
      cases: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword),
      number: /\d/.test(newPassword),
      special: /[@$!%*?&_#\-]/.test(newPassword), // Tu peux ajouter d'autres caractères ici
    });
  }, [newPassword]);

  // On vérifie si TOUTES les règles sont à "true"
  const isPasswordValid = Object.values(validations).every(Boolean);
  // ---------------------------------------------

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    // Sécurité supplémentaire au cas où l'utilisateur forcerait le bouton
    if (!isPasswordValid) {
      setError("Le mot de passe ne respecte pas tous les critères.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      setError("Erreur : " + updateError.message);
      setLoading(false);
    } else {
      setMessage("Mot de passe mis à jour ! Déconnexion en cours...");
      setTimeout(async () => {
        await signOut();
        navigate('/login');
      }, 2500);
    }
  };

  // --- NOUVEAU : Petit sous-composant pour l'affichage d'une règle ---
  const ValidationItem = ({ isValid, text }) => (
    <li className={`flex items-center text-sm mt-1 transition-colors duration-200 ${isValid ? 'text-green-600' : 'text-gray-400'}`}>
      {isValid ? <FaCheckCircle className="mr-2" /> : <FaRegCircle className="mr-2" />}
      {text}
    </li>
  );

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Modifier mon mot de passe</h2>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm border border-red-200">{error}</div>}
      {message && <div className="bg-green-50 text-green-600 p-3 rounded mb-4 text-sm border border-green-200">{message}</div>}

      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <div>
          <label className="block text-gray-600 text-sm mb-1">Nouveau mot de passe</label>
          <div className="relative">
            <FaLock className="absolute left-3 top-3 text-gray-400" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 p-2 w-full rounded bg-white text-gray-800 border border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          {/* --- NOUVEAU : Affichage de la checklist dynamique --- */}
          <ul className="mt-3 mb-2 px-1">
            <ValidationItem isValid={validations.length} text="Au moins 8 caractères" />
            <ValidationItem isValid={validations.cases} text="Une majuscule et une minuscule" />
            <ValidationItem isValid={validations.number} text="Au moins un chiffre" />
            <ValidationItem isValid={validations.special} text="Un caractère spécial (@, !, #, etc.)" />
          </ul>
          {/* ----------------------------------------------------- */}
        </div>

        <div>
          <label className="block text-gray-600 text-sm mb-1">Confirmer le mot de passe</label>
          <div className="relative">
            <FaLock className="absolute left-3 top-3 text-gray-400" />
            <input
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
          {/* Petit indicateur rouge si les mots de passe ne correspondent pas pendant la frappe */}
          {confirmPassword && newPassword !== confirmPassword && (
             <p className="text-red-500 text-xs mt-1">Les mots de passe ne correspondent pas.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !isPasswordValid || !confirmPassword || newPassword !== confirmPassword}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
        >
          {loading ? 'Mise à jour...' : 'Confirmer la modification'}
        </button>
      </form>
    </div>
  );
}