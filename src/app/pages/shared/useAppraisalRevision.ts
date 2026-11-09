import { useEffect, useState } from "react";

export function useAppraisalRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const events = ["appraisal-updated", "feedback-updated", "year-end-updated", "storage"];
    events.forEach((event) => window.addEventListener(event, refresh));
    return () => events.forEach((event) => window.removeEventListener(event, refresh));
  }, []);
  return revision;
}
