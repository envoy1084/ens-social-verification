import { useMemo } from "react";

import { hexToBytes, isAddress, keccak256, stringToHex } from "viem";
import { namehash, normalize } from "viem/ens";

function createAvatarBars(seed: string) {
  let hash;
  if (isAddress(seed, { strict: false })) {
    hash = keccak256(stringToHex(seed.toLowerCase()));
  } else {
    try {
      hash = namehash(normalize(seed));
    } catch {
      // Non-name labels still need a stable fallback while a lookup is incomplete.
      hash = keccak256(stringToHex(seed.normalize("NFC")));
    }
  }

  const bars: { x: number; y: number; height: number; fill: string }[] = [];
  for (let column = 0; column < 10; column++) {
    const bytes = hexToBytes(keccak256(stringToHex(`${hash}:${column}`)));
    const cells = Array.from(bytes.slice(0, 10), (byte) => (byte % 5) % 3);
    let row = 0;
    while (row < 10) {
      const color = cells[row];
      const start = row;
      row++;
      while (row < 10 && cells[row] === color) row++;
      if (color === 2) continue;
      bars.push({
        x: 10.8 + column * 10,
        y: 10.3 + start * 10,
        height: (row - start) * 10 - 0.6,
        fill: color === 0 ? "#80c1dd" : "#0082bb",
      });
    }
  }
  return bars;
}

export function DeterministicAvatar({ seed, label }: { seed: string; label: string }) {
  const bars = useMemo(() => createAvatarBars(seed), [seed]);

  return (
    <svg
      viewBox="0 0 120 120"
      width="120"
      height="120"
      className="block size-full"
      aria-label={label}
    >
      <title>{label}</title>
      <rect width="120" height="120" fill="#e6f3f8" />
      {bars.map((bar) => (
        <rect key={`${bar.x}:${bar.y}`} {...bar} width="8.5" rx="2.4" />
      ))}
    </svg>
  );
}
