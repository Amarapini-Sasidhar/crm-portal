import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';

function getDefaultRolePath(role: string) {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/app/super-admin/admins';
    case 'ADMIN':
      return '/app/admin/courses';
    case 'FACULTY':
      return '/app/faculty/exams';
    case 'STUDENT':
      return '/app/student/my-courses';
    default:
      return '/login';
  }
}

export function HomeRedirect() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getDefaultRolePath(user.role)} replace />;
}
