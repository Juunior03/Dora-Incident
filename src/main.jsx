// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { getCSRFToken } from './utils/csrf';
import { AuthProvider } from './context/AuthContext.jsx';

// Génère le token CSRF et stocke-le dans sessionStorage
getCSRFToken();

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
