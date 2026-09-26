export function isDefinitiveRejection(response: unknown, id: string | number): boolean {
  if (!response || typeof response !== "object" || !("id" in response) || response.id !== id)
    return false;
  if ("result" in response || !("error" in response)) return false;
  const error = response.error;
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  // ERC-7769 validation failures mean this request did not enter the bundler pool.
  return [-32602, -32500, -32501, -32502, -32503, -32504, -32505, -32507, -32508].includes(
    error.code as number,
  );
}
