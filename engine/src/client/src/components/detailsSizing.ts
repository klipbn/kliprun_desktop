export function resizedDetailsWidth(startWidth: number, startX: number, currentX: number, viewportWidth: number): number {
  const maximum = Math.max(320, Math.min(850, viewportWidth - 340));
  return Math.min(maximum, Math.max(320, startWidth + startX - currentX));
}
