export const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

export const formatElapsed = (startedAt: number | null, timestamp: number | null) => {
  if (!startedAt || !timestamp) return "--:--";
  return formatTime(Math.max(0, Math.floor((timestamp - startedAt) / 1000)));
};

export const formatPenalty = (penaltyMs: number) => {
  const minutes = Math.max(0, Math.round(penaltyMs / 60000));
  return minutes === 0 ? "0분" : `+${minutes}분`;
};

export const formatReportDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}. ${month}. ${day}.`;
};

export const formatEffectSeconds = (expiresAt: number) => `${Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))}s`;
