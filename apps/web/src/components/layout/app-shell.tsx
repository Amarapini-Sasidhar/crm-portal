import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import type { Role } from '../../types/api';

type NavItem = {
  to: string;
  label: string;
};

const roleMenus: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/app/super-admin/admins', label: 'Admin Management' },
    { to: '/app/admin/courses', label: 'Courses' },
    { to: '/app/admin/batches', label: 'Batches' },
    { to: '/app/admin/students', label: 'Students' },
    { to: '/app/admin/reports', label: 'Reports' },
    { to: '/app/admin/certificates', label: 'Certificates' }
  ],
  ADMIN: [
    { to: '/app/admin/courses', label: 'Courses' },
    { to: '/app/admin/batches', label: 'Batches' },
    { to: '/app/admin/students', label: 'Students' },
    { to: '/app/admin/reports', label: 'Reports' },
    { to: '/app/admin/certificates', label: 'Certificates' }
  ],
  FACULTY: [
    { to: '/app/faculty/exams', label: 'Exams' },
    { to: '/app/faculty/questions', label: 'Questions' },
    { to: '/app/faculty/results', label: 'Results' }
  ],
  STUDENT: [
    { to: '/app/student/my-courses', label: 'My Courses' },
    { to: '/app/student/exams', label: 'Exams' },
    { to: '/app/student/results', label: 'Results' },
    { to: '/app/student/certificates', label: 'Certificates' }
  ]
};

export function AppShell() {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand-block">
          <p className="brand-kicker">CRM EXAM PORTAL</p>
          <h1 className="brand-title">Control Center</h1>
        </div>

        <nav className="nav-list">
          {roleMenus[user.role].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="btn btn-outline danger-on-hover" onClick={logout} type="button">
          Log Out
        </button>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <p className="top-role">{user.role.replace('_', ' ')}</p>
            <h2 className="top-name">
              {user.firstName} {user.lastName}
            </h2>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
