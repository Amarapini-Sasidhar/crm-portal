import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth-context';
import type { Role } from '../types/api';

export function RoleRoute({ allowed }: { allowed: Role[] }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(user.role)) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
