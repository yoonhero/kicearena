import { useEffect, useState } from "react";
import type { RoomPublic } from "../../../shared/game";

export function useCountdown(room: RoomPublic | null) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(id);
    }, []);
    if (!room?.endsAt) return room?.timeLimitSec ?? 0;
    return Math.max(0, Math.ceil((room.endsAt - now) / 1000));
}
