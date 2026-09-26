import { useCallback, useEffect, useState } from "react";

import { Button } from "@thenamespace/uikit/button";
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  HugeiconsIcon,
  Share08Icon,
} from "@thenamespace/uikit/icons";
import { Tooltip } from "@thenamespace/uikit/tooltip";

export function CopyButton({
  value,
  label,
  share = false,
}: {
  value: string;
  label: string;
  share?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }, [value]);
  const message =
    status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy. Try again." : label;
  return (
    <span className="relative inline-flex shrink-0">
      <Tooltip delay={200}>
        <Button
          isIconOnly
          aria-label={message}
          variant="tertiary"
          className="size-10"
          onPress={copy}
        >
          <HugeiconsIcon
            icon={status === "copied" ? CheckmarkCircle02Icon : share ? Share08Icon : Copy01Icon}
            size={20}
          />
        </Button>
        <Tooltip.Content>{message}</Tooltip.Content>
      </Tooltip>
      <output className="sr-only">{status !== "idle" ? message : ""}</output>
    </span>
  );
}
