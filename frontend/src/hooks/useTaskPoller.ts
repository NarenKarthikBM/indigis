import { useEffect, useRef, useState } from "react";
import { pollTaskStatus } from "../api/upload";
import type { UploadTask } from "../types/layer.types";

export function useTaskPoller(
  taskId: string | null,
  intervalMs = 2000
): { task: UploadTask | null; isPolling: boolean } {
  const [task, setTask] = useState<UploadTask | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    async function fetchStatus() {
      if (!taskId) return;
      try {
        const data = await pollTaskStatus(taskId);
        setTask(data);
        if (data.status === "done" || data.status === "failed") {
          setIsPolling(false);
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch {
        // Network error - keep polling
      }
    }

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, intervalMs);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPolling(false);
    };
  }, [taskId, intervalMs]);

  return { task, isPolling };
}
