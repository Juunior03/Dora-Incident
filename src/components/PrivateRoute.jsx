import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PropTypes from 'prop-types';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Chargement...</div>;
  }

  return user ? children : <Navigate to="/login" replace />;
};

PrivateRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

export default PrivateRoute;
