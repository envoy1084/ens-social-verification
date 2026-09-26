import { normalize } from "viem/ens";

export function normalizeEnsInput(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("Enter an ENS name");
  return normalize(value.includes(".") ? value : `${value}.eth`);
}

export function formatEnsDate(value: bigint | string | null | undefined): string {
  if (value === undefined || value === null || value === "0" || value === 0n) return "Unavailable";
  const milliseconds = Number(value) * 1000;
  if (!Number.isFinite(milliseconds) || Math.abs(milliseconds) > 8.64e15) return "Unavailable";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
    milliseconds,
  );
}
