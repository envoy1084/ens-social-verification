import { Avatar } from "@thenamespace/uikit/avatar";

import { DeterministicAvatar } from "./deterministic-avatar";

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
  return (
    <Avatar className={`${className} shrink-0 overflow-hidden !rounded-2xl [&>img]:!rounded-2xl`}>
      {src ? <Avatar.Image key={src} alt={`${name} avatar`} src={src} /> : null}
      <Avatar.Fallback className="size-full !p-0">
        <DeterministicAvatar seed={seed} label={`${name} avatar`} />
      </Avatar.Fallback>
    </Avatar>
  );
}
