import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="centered-page">
      <div className="auth-card">
        <p className="auth-kicker">404</p>
        <h1>Page not found</h1>
        <p className="muted">
          The page you requested does not exist. Use the portal navigation to continue.
        </p>
        <Link className="btn" to="/app">
          Go to Portal
        </Link>
      </div>
    </div>
  );
}
