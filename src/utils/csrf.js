// src/utils/csrf.js
// Générer un token CSRF aléatoire
export const generateCSRFToken = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array); // 🔒 Cryptographically secure
  return Array.from(array, (byte) => byte.toString(36)).join('');
};

// Stocker et récupérer le token CSRF
export const getCSRFToken = () => {
  let token = sessionStorage.getItem('csrf_token');
  if (!token) {
    token = generateCSRFToken();
    sessionStorage.setItem('csrf_token', token);
  }
  return token;
};

// Valider le token CSRF
export const validateCSRFToken = (receivedToken) => {
  const storedToken = sessionStorage.getItem('csrf_token');
  return storedToken === receivedToken;
};
