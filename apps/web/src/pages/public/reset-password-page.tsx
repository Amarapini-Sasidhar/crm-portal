import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiRequest, ApiError } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { ApiMessageResponse } from '../../types/api';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { LoadingSpinner } from '../../components/ui/loading-spinner';

const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,72}$/;

function getToken(search: string): string {
  return new URLSearchParams(search).get('token')?.trim() ?? '';
}

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => getToken(location.search), [location.search]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!success) {
      return;
    }

    const timeout = window.setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [navigate, success]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError('Reset token is missing from the link.');
      return;
    }
    if (!passwordPolicyRegex.test(password)) {
      setError(
        'Password must be 12-72 chars with uppercase, lowercase, number, and special character.'
      );
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirm password must match.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<ApiMessageResponse>(endpoints.auth.resetPassword, {
        method: 'POST',
        body: {
          token,
          password
        },
        authToken: null
      });
      setSuccess(response.message);
      setPassword('');
      setConfirmPassword('');
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'Unable to reset password right now.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="centered-page">
      <div className="auth-card">
        <p className="auth-kicker">Account Recovery</p>
        <h1>Reset password</h1>
        <p className="muted">Set a new password for your CRM Portal account.</p>

        <form className="stack-form" onSubmit={onSubmit}>
          <label className="field">
            <span>New password</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <label className="field">
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>

          <HintMessage message="This reset link can be reused for this account." />
          {error && <ErrorMessage message={error} />}
          {success && <SuccessMessage message={success} />}

          <button className="btn" disabled={loading} type="submit">
            {loading ? <LoadingSpinner label="Resetting password..." size="sm" /> : 'Reset Password'}
          </button>
        </form>

        <p className="muted tiny">
          Return to <Link to="/login">sign in</Link>
        </p>
      </div>
    </div>
  );
}
