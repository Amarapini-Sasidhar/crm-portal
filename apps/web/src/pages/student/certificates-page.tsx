import { useEffect, useState } from 'react';
import { apiDownload, apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import type { StudentCertificate } from '../../types/api';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage, SuccessMessage } from '../../components/ui/feedback';
import { EmptyState } from '../../components/ui/empty-state';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { useApiTask } from '../../hooks/use-api-task';
import { formatDate, formatPercent } from '../../lib/format';

export function CertificatesPage() {
  const [certificates, setCertificates] = useState<StudentCertificate[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedCertificate, setSelectedCertificate] = useState<StudentCertificate | null>(null);
  const listTask = useApiTask();
  const downloadTask = useApiTask();
  const viewTask = useApiTask();

  useEffect(() => {
    void loadCertificates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCertificates() {
    const response = await listTask.run(() =>
      apiRequest<StudentCertificate[]>(endpoints.student.certificates)
    );
    if (response) {
      setCertificates(response);
    }
  }

  async function download(certificateNo: string) {
    setActionMessage(null);
    const blob = await downloadTask.run(
      () => apiDownload(endpoints.student.certificateDownload(certificateNo)),
      'Certificate downloaded.'
    );

    if (!blob) {
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${certificateNo}.pdf`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    setActionMessage(`Downloaded ${certificateNo}.pdf`);
  }

  async function viewCertificate(certificate: StudentCertificate) {
    setActionMessage(null);
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      setActionMessage('Could not open preview tab. Please allow pop-ups and try again.');
      return;
    }

    previewWindow.document.title = `Certificate ${certificate.certificateNo}`;
    previewWindow.document.body.innerHTML = '<p style="font-family: sans-serif;">Loading certificate...</p>';

    const blob = await viewTask.run(
      () => apiDownload(endpoints.student.certificateDownload(certificate.certificateNo)),
      'Certificate opened in new tab.'
    );

    if (!blob) {
      previewWindow.close();
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    previewWindow.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    setSelectedCertificate(certificate);
    setActionMessage(`Viewing certificate ${certificate.certificateNo}.`);
  }

  return (
    <Panel
      actions={
        <button className="btn btn-outline" onClick={() => void loadCertificates()} type="button">
          {listTask.loading ? <LoadingSpinner label="Loading..." size="sm" /> : 'Refresh'}
        </button>
      }
      subtitle="Issued certificates eligible for download and verification."
      title="Certificates"
    >
      {listTask.error && <ErrorMessage message={listTask.error} />}
      {downloadTask.error && <ErrorMessage message={downloadTask.error} />}
      {viewTask.error && <ErrorMessage message={viewTask.error} />}
      {actionMessage && <SuccessMessage message={actionMessage} />}
      {listTask.loading && <LoadingSpinner label="Loading certificates..." />}

      {selectedCertificate && (
        <div className="message-block">
          <p>
            Selected Certificate: <strong>{selectedCertificate.certificateNo}</strong>
          </p>
          <p className="tiny muted">
            Issue Date: {formatDate(selectedCertificate.issuedAt)} | Passing Date:{' '}
            {formatDate(selectedCertificate.passedAt)}
          </p>
        </div>
      )}

      {!listTask.loading && certificates.length === 0 ? (
        <EmptyState
          description="Certificates will appear here after you pass eligible exams."
          title="No Certificates Yet"
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Certificate No</th>
                <th>Course</th>
                <th>Score</th>
                <th>Passing Date</th>
                <th>Issue Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.certificateId}>
                  <td>{certificate.certificateNo}</td>
                  <td>{certificate.courseName ?? '-'}</td>
                  <td>{formatPercent(certificate.scorePercentage)}</td>
                  <td>{formatDate(certificate.passedAt)}</td>
                  <td>{formatDate(certificate.issuedAt)}</td>
                  <td className="actions-cell">
                    <button
                      className="btn btn-outline"
                      disabled={viewTask.loading}
                      onClick={() => void viewCertificate(certificate)}
                      type="button"
                    >
                      {viewTask.loading ? <LoadingSpinner label="..." size="sm" /> : 'View'}
                    </button>
                    <button
                      className="btn btn-outline"
                      disabled={downloadTask.loading}
                      onClick={() => void download(certificate.certificateNo)}
                      type="button"
                    >
                      {downloadTask.loading ? <LoadingSpinner label="..." size="sm" /> : 'Download'}
                    </button>
                    <a
                      className="btn btn-outline"
                      href={certificate.verificationUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Verify
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
