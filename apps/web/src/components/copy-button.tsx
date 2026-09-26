import { useCallback, useEffect, useState } from "react";

import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  HugeiconsIcon,
  Share08Icon,
} from "@thenamespace/uikit/icons";
import { Tooltip } from "@thenamespace/uikit/tooltip";
import { Focusable } from "react-aria-components";

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
        <Focusable>
          <button
            type="button"
            aria-label={message}
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted shadow-none transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={copy}
          >
            <HugeiconsIcon
              icon={status === "copied" ? CheckmarkCircle02Icon : share ? Share08Icon : Copy01Icon}
              size={20}
            />
          </button>
        </Focusable>
        <Tooltip.Content>{message}</Tooltip.Content>
      </Tooltip>
      <output className="sr-only">{status !== "idle" ? message : ""}</output>
    </span>
  );
}
