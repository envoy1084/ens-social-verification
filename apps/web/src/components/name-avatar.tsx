import { useCallback, useState } from "react";

import { Avatar } from "@thenamespace/uikit/avatar";

export function NameAvatar({
  name,
  src,
  seed = name,
  className = "size-10",
}: {
  name: string;
  src?: string | undefined;
  seed?: string;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  const fallback = `https://api.dicebear.com/10.x/disco/svg?seed=${encodeURIComponent(seed)}`;
  const source = src && src !== failedSource ? src : fallback;
  const handleError = useCallback(() => setFailedSource(src), [src]);
  return (
    <Avatar className={`${className} shrink-0 overflow-hidden !rounded-2xl [&>img]:!rounded-2xl`}>
      <Avatar.Image alt={`${name} avatar`} src={source} onError={handleError} />
      <Avatar.Fallback className="bg-[#e8f6fb] font-semibold text-accent">
        {name.slice(0, 2).toUpperCase()}
      </Avatar.Fallback>
    </Avatar>
  );
}
