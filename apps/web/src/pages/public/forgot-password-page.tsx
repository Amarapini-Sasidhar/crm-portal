import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, ApiError } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { ApiMessageResponse } from '../../types/api';
import { ErrorMessage, HintMessage, SuccessMessage } from '../../components/ui/feedback';
import { LoadingSpinner } from '../../components/ui/loading-spinner';

function validateEmail(email: string): string | null {
  const normalized = email.trim();
  if (!normalized) {
    return 'Email is required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Please enter a valid email address.';
  }
  return null;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<ApiMessageResponse>(endpoints.auth.forgotPassword, {
        method: 'POST',
        body: {
          email: email.trim()
        },
        authToken: null
      });
      setSuccess(response.message);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'Unable to send reset link right now.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="centered-page">
      <div className="auth-card">
        <p className="auth-kicker">Account Recovery</p>
        <h1>Forgot password</h1>
        <p className="muted">Enter your registered email and we'll send your reset link there.</p>

        <form className="stack-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Registered email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          {error && <ErrorMessage message={error} />}
          {success && <SuccessMessage message={success} />}

          <button className="btn" disabled={loading} type="submit">
            {loading ? (
              <LoadingSpinner label="Sending reset link..." size="sm" />
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        <p className="muted tiny">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
