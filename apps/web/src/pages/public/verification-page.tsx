import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { EmptyState } from '../../components/ui/empty-state';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { formatDate } from '../../lib/format';
import type { VerificationResponse } from '../../types/api';

type ParsedVerificationInput = {
  certificateNo: string;
  token?: string;
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseVerificationInput(raw: string): ParsedVerificationInput | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const parseUrl = (input: string) => {
    try {
      return new URL(input);
    } catch {
      return new URL(input, window.location.origin);
    }
  };

  try {
    const parsedUrl = parseUrl(value);
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    const verifyIndex = segments.findIndex((segment) => segment.toLowerCase() === 'verify');
    const certificateFromPath =
      verifyIndex >= 0 && segments.length > verifyIndex + 1 ? segments[verifyIndex + 1] : null;
    const certificateFromQuery =
      parsedUrl.searchParams.get('certificateNo') ??
      parsedUrl.searchParams.get('certificate') ??
      parsedUrl.searchParams.get('cert');

    const certificateNo = safeDecode((certificateFromPath ?? certificateFromQuery ?? '').trim());
    if (!certificateNo) {
      return {
        certificateNo: value
      };
    }

    const token = parsedUrl.searchParams.get('token') ?? undefined;
    return {
      certificateNo,
      token
    };
  } catch {
    return {
      certificateNo: value
    };
  }
}

export function VerificationPage() {
  const routeParams = useParams<{ certificateNo?: string }>();
  const location = useLocation();
  const routeCertificateNo = safeDecode(routeParams.certificateNo ?? '');
  const routeToken = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('token') ?? undefined;
  }, [location.search]);

  const [inputValue, setInputValue] = useState(routeCertificateNo);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeCertificateNo) {
      return;
    }
    setInputValue(routeCertificateNo);
    void verify(routeCertificateNo, routeToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCertificateNo, routeToken]);

  async function verify(targetCertificateNo: string, token?: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<VerificationResponse>(
        endpoints.certificates.verify(targetCertificateNo),
        {
          query: {
            token
          }
        }
      );
      setResult(response);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Unable to verify certificate at this moment.');
      }
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseVerificationInput(inputValue);
    if (!parsed) {
      setError('Enter a valid certificate number or verification URL.');
      return;
    }

    setInputValue(parsed.certificateNo);
    await verify(parsed.certificateNo, parsed.token ?? routeToken);
  }

  return (
    <div className="centered-page">
      <div className="verify-card">
        <p className="auth-kicker">Public Certificate Verification</p>
        <h1>Verify Certificate</h1>
        <p className="muted">
          No login required. Enter certificate number or paste scanned QR verification link.
        </p>

        <form className="inline-form" onSubmit={onSubmit}>
          <input
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Enter certificate number or paste QR URL"
            value={inputValue}
          />
          <button className="btn" disabled={loading} type="submit">
            {loading ? <LoadingSpinner label="Verifying..." size="sm" /> : 'Verify'}
          </button>
        </form>

        {error && <p className="feedback feedback-error">{error}</p>}
        {loading && <LoadingSpinner label="Checking certificate status..." />}

        {!loading && !error && !result && (
          <EmptyState
            description="Enter a certificate number or paste the full URL from QR code to validate."
            title="Ready To Verify"
          />
        )}

        {result && (
          <div
            className={`verification-result ${result.valid ? 'verification-valid' : 'verification-invalid'}`}
          >
            <p className="status-pill">{result.valid ? 'VALID' : 'INVALID'}</p>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{result.status}</dd>
              </div>
              <div>
                <dt>Student Name</dt>
                <dd>{result.valid ? result.studentName ?? '-' : 'Invalid Certificate'}</dd>
              </div>
              <div>
                <dt>Course</dt>
                <dd>{result.valid ? result.course ?? '-' : 'Invalid Certificate'}</dd>
              </div>
              <div>
                <dt>Certificate Number</dt>
                <dd>{result.certificateNumber}</dd>
              </div>
              <div>
                <dt>Issue Date</dt>
                <dd>{result.valid ? formatDate(result.issueDate) : '-'}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
