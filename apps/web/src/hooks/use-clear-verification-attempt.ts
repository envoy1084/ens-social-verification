import { useEffect } from "react";

import { useNavigate } from "@tanstack/react-router";

export function useClearVerificationAttempt(
  key: "githubAttempt" | "xAttempt" | "oauthAttempt",
  attemptId: string | undefined,
  completed: boolean,
) {
  const navigate = useNavigate({ from: "/$name" });
  useEffect(() => {
    if (!attemptId || !completed) return;
    void navigate({
      replace: true,
      search: (previous) =>
        previous[key] === attemptId
          ? {
              ...previous,
              [key]: undefined,
              ...(key === "oauthAttempt" ? { oauthProvider: undefined } : {}),
            }
          : previous,
    });
  }, [attemptId, completed, key, navigate]);
}
