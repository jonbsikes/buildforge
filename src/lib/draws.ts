/** "Draw Request – Week 13 2026" derived from draw_date (YYYY-MM-DD). */
export function drawDisplayName(drawDate: string): string {
  const [y, m, d] = drawDate.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay() || 7;
  const thursday = new Date(y, m - 1, d + (4 - dayOfWeek));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `Draw Request \u2013 Week ${weekNum} ${thursday.getFullYear()}`;
}
