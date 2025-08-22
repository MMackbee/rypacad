import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ 
  children, 
  requiredRole = null, 
  allowedRoles = [], 
  redirectTo = '/login' 
}) => {
  const { user, userRole, loading, isAuthenticated } = useUser();

  if (loading) {
    return <LoadingSpinner message="Loading..." fullScreen={true} />;
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check role requirements
  if (requiredRole && userRole !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
