import { useCallback, useState } from "react";

import { Avatar } from "@thenamespace/uikit/avatar";

export function NameAvatar({
  name,
  src,
  className = "size-10",
}: {
  name: string;
  src?: string | undefined;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  const fallback = `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(name)}`;
  const source = src && src !== failedSource ? src : fallback;
  const handleError = useCallback(() => setFailedSource(src), [src]);
  return (
    <Avatar className={`${className} shrink-0 rounded-lg`}>
      <Avatar.Image alt={`${name} avatar`} src={source} onError={handleError} />
      <Avatar.Fallback className="bg-[#e8f6fb] font-semibold text-accent">
        {name.slice(0, 2).toUpperCase()}
      </Avatar.Fallback>
    </Avatar>
  );
}
