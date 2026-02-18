import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../auth/auth-context';
import { ErrorMessage } from '../../components/ui/feedback';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { useToast } from '../../components/ui/toast-provider';

const roleOptions = [
  { label: 'Student', value: 'STUDENT' },
  { label: 'Faculty', value: 'FACULTY' },
  { label: 'Admin', value: 'ADMIN' }
] as const;

type SelectableRole = (typeof roleOptions)[number]['value'];

function validateLoginForm(input: { role: string; email: string; password: string }): string | null {
  const allowedRoles = roleOptions.map((role) => role.value);
  if (!allowedRoles.includes(input.role as SelectableRole)) {
    return 'Please select a valid role.';
  }

  const email = input.email.trim();
  if (!email) {
    return 'Email is required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please enter a valid email address.';
  }

  if (!input.password.trim()) {
    return 'Password is required.';
  }

  return null;
}

export function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const { pushToast } = useToast();

  const [role, setRole] = useState<SelectableRole>('STUDENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && user) {
    return <Navigate to="/app" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateLoginForm({
      role,
      email,
      password
    });
    if (validationError) {
      setError(validationError);
      pushToast({
        message: validationError,
        variant: 'error'
      });
      return;
    }

    setLoading(true);

    try {
      await login({
        role,
        email,
        password
      });
    } catch (caught) {
      let message = 'Login failed. Please try again.';
      if (caught instanceof ApiError) {
        message = caught.message;
      } else if (caught instanceof Error) {
        message = caught.message;
      }
      setError(message);
      pushToast({
        message,
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="centered-page">
      <div className="auth-card">
        <p className="auth-kicker">CRM Exam & Certification Portal</p>
        <h1>Sign in</h1>
        <p className="muted">Use your role account credentials.</p>

        <form className="stack-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Role</span>
            <div className="role-select-grid">
              {roleOptions.map((option) => (
                <label className="role-choice" key={option.value}>
                  <input
                    checked={role === option.value}
                    name="role"
                    onChange={() => setRole(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </label>

          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error && <ErrorMessage message={error} />}

          <button className="btn" disabled={loading} type="submit">
            {loading ? <LoadingSpinner label="Signing in..." size="sm" /> : 'Sign In'}
          </button>
        </form>

        <p className="muted tiny">
          Need an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
