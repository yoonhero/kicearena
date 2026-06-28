type ProblemAnswerState = "correct" | "wrong" | "unanswered";

export function GradeMark({ state }: { state: Exclude<ProblemAnswerState, "unanswered"> }) {
    const label = state === "correct" ? "정답" : "오답";
    const filterId = state === "correct" ? "grade-rough-correct" : "grade-rough-wrong";

    return (
        <i className={`grade-mark-ink ${state}`} aria-label={label}>
            <svg
                viewBox="0 0 180 118"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
            >
                <defs>
                    <filter id={filterId} x="-18%" y="-18%" width="136%" height="136%">
                        <feTurbulence
                            type="fractalNoise"
                            baseFrequency="0.22 0.86"
                            numOctaves="3"
                            seed={state === "correct" ? 8 : 13}
                            result="noise"
                        />
                        <feDisplacementMap
                            in="SourceGraphic"
                            in2="noise"
                            scale="2.15"
                            xChannelSelector="R"
                            yChannelSelector="G"
                        />
                    </filter>
                </defs>
                {state === "correct" ? (
                    <g>
                        <path
                            className="grade-stroke grade-stroke-base"
                            pathLength={1}
                            d="M27 60 C18 34 44 15 83 13 C126 11 160 30 160 58 C160 88 126 105 82 104 C39 103 16 84 27 60"
                        />
                        <path
                            className="grade-stroke grade-stroke-edge"
                            filter={`url(#${filterId})`}
                            pathLength={1}
                            d="M27 60 C18 34 44 15 83 13 C126 11 160 30 160 58 C160 88 126 105 82 104 C39 103 16 84 27 60"
                        />
                        <path
                            className="grade-stroke grade-stroke-pressure"
                            pathLength={1}
                            d="M31 62 C24 39 48 20 84 18 C123 16 153 31 155 58 C157 85 126 99 84 99 C45 99 25 83 31 62"
                        />
                    </g>
                ) : (
                    <g>
                        <path
                            className="grade-stroke grade-stroke-base"
                            pathLength={1}
                            d="M18 101 C47 73 88 42 153 14"
                        />
                        <path
                            className="grade-stroke grade-stroke-edge"
                            filter={`url(#${filterId})`}
                            pathLength={1}
                            d="M18 101 C47 73 88 42 153 14"
                        />
                        <path
                            className="grade-stroke grade-stroke-pressure"
                            pathLength={1}
                            d="M27 96 C59 68 94 42 145 20"
                        />
                    </g>
                )}
            </svg>
        </i>
    );
}
