// src/utils/csrf.js
// Générer un token CSRF aléatoire
export const generateCSRFToken = () => {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join('');
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
