import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import PrivateRoute from './components/PrivateRoute.jsx'
import DoraIncidentApp from './components/DoraIncidentApp'
import LoginPage from './pages/LoginPage.jsx'

function App() {
  return (
    <ThemeProvider>
        <AuthProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/*" element={<PrivateRoute><DoraIncidentApp /></PrivateRoute>} />
            </Routes>
          </Router>
        </AuthProvider>
    </ThemeProvider>
  );
}

export default App;