import type React from "react";
import { formatTime } from "../../lib/format";

export function KiceClock({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
    const progress = totalTime <= 0 ? 0 : 1 - Math.max(0, Math.min(1, timeLeft / totalTime));
    const minuteRotation = progress * 360;
    const secondRotation = ((totalTime - timeLeft) % 60) * 6;
    return (
        <div
            className="kice-clock"
            aria-label={`남은 시간 ${formatTime(timeLeft)}`}
            style={
                { "--clock-progress": `${progress * 100}%` } as React.CSSProperties &
                    Record<string, string>
            }
        >
            <div className="clock-face">
                {Array.from({ length: 12 }, (_, index) => (
                    <span
                        key={index}
                        style={
                            { "--tick": String(index) } as React.CSSProperties &
                                Record<string, string>
                        }
                    />
                ))}
                <i className="clock-hand minute" style={{ rotate: `${minuteRotation}deg` }} />
                <i className="clock-hand second" style={{ rotate: `${secondRotation}deg` }} />
                <b />
            </div>
            <div className="clock-label">
                <small>한국교육과정평가원</small>
                <strong>{formatTime(timeLeft)}</strong>
            </div>
        </div>
    );
}
