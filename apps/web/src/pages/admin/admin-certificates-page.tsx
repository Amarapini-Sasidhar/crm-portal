import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { endpoints } from '../../lib/endpoints';
import { Panel } from '../../components/ui/panel';
import { ErrorMessage } from '../../components/ui/feedback';
import { useApiTask } from '../../hooks/use-api-task';

type SimpleResponse = {
  message: string;
  requestedBy: string;
};

export function AdminCertificatesPage() {
  const [data, setData] = useState<SimpleResponse | null>(null);
  const task = useApiTask();

  useEffect(() => {
    void loadCertificatesInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCertificatesInfo() {
    const response = await task.run(() =>
      apiRequest<SimpleResponse>(endpoints.admin.certificates)
    );
    if (response) {
      setData(response);
    }
  }

  return (
    <Panel
      actions={
        <button className="btn btn-outline" onClick={() => void loadCertificatesInfo()} type="button">
          Refresh
        </button>
      }
      subtitle="Backend certificate-management endpoint integration."
      title="Certificates"
    >
      {task.error && <ErrorMessage message={task.error} />}
      {data ? (
        <div className="message-block">
          <p>{data.message}</p>
          <p className="tiny muted">Requested by user ID: {data.requestedBy}</p>
        </div>
      ) : (
        <p className="muted">No certificate-management payload loaded yet.</p>
      )}
    </Panel>
  );
}
