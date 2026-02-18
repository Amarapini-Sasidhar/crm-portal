import { useState } from 'react';
import { ApiError } from '../lib/api-client';
import { useToast } from '../components/ui/toast-provider';

type TaskRunOptions = {
  toastSuccess?: boolean;
  toastError?: boolean;
};

export function useApiTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { pushToast } = useToast();

  async function run<T>(
    task: () => Promise<T>,
    successMessage?: string,
    options: TaskRunOptions = {}
  ): Promise<T | null> {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await task();
      if (successMessage) {
        setSuccess(successMessage);
        if (options.toastSuccess ?? true) {
          pushToast({
            message: successMessage,
            variant: 'success'
          });
        }
      }
      return result;
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Request failed.';
      setError(message);
      if (options.toastError ?? true) {
        pushToast({
          message,
          variant: 'error'
        });
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  return {
    loading,
    error,
    success,
    run,
    clearMessages
  };
}
