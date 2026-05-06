import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import PrivateRoute from './components/PrivateRoute.jsx'
import DoraIncidentApp from './components/DoraIncidentApp'
import LoginPage from './pages/LoginPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import IdleTimeout from './components/IdleTimeout';

function App() {
  return (
    <ThemeProvider>
        <AuthProvider>
          <Router>
              <IdleTimeout timeoutInMinutes={15} />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/*" element={<PrivateRoute><DoraIncidentApp /></PrivateRoute>} />
            </Routes>
          </Router>
        </AuthProvider>
    </ThemeProvider>
  );
}

export default App;