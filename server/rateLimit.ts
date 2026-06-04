export type SocketEventTimestamps = Map<string, Map<string, number>>;

export const shouldRateLimit = (socketEventTimestamps: SocketEventTimestamps, socketId: string, eventName: string, minIntervalMs: number, now = Date.now()) => {
  let events = socketEventTimestamps.get(socketId);
  if (!events) {
    events = new Map();
    socketEventTimestamps.set(socketId, events);
  }
  const previous = events.get(eventName) ?? 0;
  events.set(eventName, now);
  return now - previous < minIntervalMs;
};
