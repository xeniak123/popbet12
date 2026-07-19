// Format duration remaining as "2h 15m" / "45m 12s" / "12s".
export function formatCountdown(iso: string, nowMs: number): { text: string; expired: boolean; hoursLeft: number } {
  const target = new Date(iso).getTime();
  const diff = target - nowMs;
  if (diff <= 0) return { text: "Zamknięty", expired: true, hoursLeft: 0 };
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  let text = "";
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h ${minutes}m`;
  else if (minutes > 0) text = `${minutes}m ${seconds}s`;
  else text = `${seconds}s`;
  return { text, expired: false, hoursLeft: totalSec / 3600 };
}
