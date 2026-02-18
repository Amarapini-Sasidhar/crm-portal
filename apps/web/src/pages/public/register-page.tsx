import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../auth/auth-context';
import { ErrorMessage, SuccessMessage } from '../../components/ui/feedback';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { useToast } from '../../components/ui/toast-provider';

const roleOptions = [
  { label: 'Student', value: 'STUDENT' },
  { label: 'Faculty', value: 'FACULTY' },
  { label: 'Admin', value: 'ADMIN' }
] as const;

type SelectableRole = (typeof roleOptions)[number]['value'];

const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,72}$/;

function validateRegisterForm(input: {
  role: SelectableRole;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
}): string | null {
  if (!input.firstName.trim()) {
    return 'First name is required.';
  }
  if (!input.lastName.trim()) {
    return 'Last name is required.';
  }

  const email = input.email.trim();
  if (!email) {
    return 'Email is required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please enter a valid email address.';
  }

  if (!passwordPolicyRegex.test(input.password)) {
    return 'Password must be 12-72 chars with uppercase, lowercase, number, and special character.';
  }

  if (input.phone.trim().length > 20) {
    return 'Phone must be 20 characters or less.';
  }

  if (input.role !== 'STUDENT') {
    return 'Only STUDENT self-registration is supported. Faculty/Admin accounts are created by authorized users.';
  }

  return null;
}

export function RegisterPage() {
  const { register, isAuthenticated, user } = useAuth();
  const { pushToast } = useToast();
  const [form, setForm] = useState({
    role: 'STUDENT' as SelectableRole,
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && user) {
    return <Navigate to="/app" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateRegisterForm(form);
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
      await register(form);
      setSuccess('Registration complete. You are now signed in.');
      pushToast({
        message: 'Registration complete. You are now signed in.',
        variant: 'success'
      });
    } catch (caught) {
      let message = 'Registration failed. Please try again.';
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

  function setField<K extends keyof typeof form>(name: K, value: (typeof form)[K]) {
    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  return (
    <div className="centered-page">
      <div className="auth-card">
        <p className="auth-kicker">Student Self Registration</p>
        <h1>Create account</h1>
        <p className="muted">
          Register as student. Admin, Faculty, and Super Admin users are created by authorized roles.
        </p>

        <form className="stack-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Role</span>
            <div className="role-select-grid">
              {roleOptions.map((option) => (
                <label className="role-choice" key={option.value}>
                  <input
                    checked={form.role === option.value}
                    name="role"
                    onChange={() => setField('role', option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </label>

          <div className="field-grid two">
            <label className="field">
              <span>First name</span>
              <input
                onChange={(event) => setField('firstName', event.target.value)}
                required
                value={form.firstName}
              />
            </label>
            <label className="field">
              <span>Last name</span>
              <input
                onChange={(event) => setField('lastName', event.target.value)}
                required
                value={form.lastName}
              />
            </label>
          </div>

          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setField('email', event.target.value)}
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setField('password', event.target.value)}
              required
              type="password"
              value={form.password}
            />
            <small className="tiny muted">
              Must be 12+ chars with uppercase, lowercase, number, and special character.
            </small>
          </label>

          <label className="field">
            <span>Phone (optional)</span>
            <input
              onChange={(event) => setField('phone', event.target.value)}
              value={form.phone}
            />
          </label>

          {error && <ErrorMessage message={error} />}
          {success && <SuccessMessage message={success} />}

          <button className="btn" disabled={loading} type="submit">
            {loading ? <LoadingSpinner label="Creating account..." size="sm" /> : 'Register'}
          </button>
        </form>

        <p className="muted tiny">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
