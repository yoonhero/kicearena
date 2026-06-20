import { useEffect, useState } from "react";
import {
    composeNickname,
    createRandomNicknameParts,
    NICKNAME_FINALS,
    NICKNAME_INITIALS,
    NICKNAME_VOWELS,
    sanitizeNickname,
    type NicknameJamo,
} from "../../../shared/nickname";

export function ReferralNicknameOmr({
    ariaLabel = "응시자 성명 OMR 입력",
    caption = "수험표에 인쇄됩니다",
    className = "",
    nickname,
    setNickname,
    syllableCount = 3,
}: {
    ariaLabel?: string;
    caption?: string;
    className?: string;
    nickname: string;
    setNickname: (nickname: string) => void;
    syllableCount?: number;
}) {
    const [activeSlot, setActiveSlot] = useState(0);
    const [nameParts, setNameParts] = useState<NicknameJamo[]>(() =>
        createRandomNicknameParts(undefined, syllableCount),
    );
    const displayedName = Array.from(nickname).slice(0, syllableCount);
    const activePart = nameParts[activeSlot] ?? nameParts[0];

    useEffect(() => {
        if (!nickname) setNickname(composeNickname(...nameParts));
    }, []);

    const setNicknamePart = (kind: keyof NicknameJamo, value: string) => {
        setNameParts((previous) => {
            const next = previous.map((part) => ({ ...part }));
            next[activeSlot] = { ...(next[activeSlot] ?? next[0]), [kind]: value };
            setNickname(composeNickname(...next));
            return next;
        });
    };

    return (
        <div className={`referral-omr-name ${className}`.trim()} aria-label={ariaLabel}>
            <div className="omr-name-maker">
                <div className="omr-maker-head">
                    <strong>성명</strong>
                    <span>{caption}</span>
                </div>
                <div className="omr-maker-cells" role="tablist" aria-label="수정할 이름 글자 선택">
                    {Array.from({ length: syllableCount }, (_, index) => {
                        const cellText = displayedName[index] ?? "";
                        return (
                            <button
                                key={index}
                                type="button"
                                className={`omr-name-cell ${activeSlot === index ? "active" : ""} ${
                                    cellText ? "" : "empty"
                                }`}
                                onClick={() => setActiveSlot(index)}
                                role="tab"
                                aria-selected={activeSlot === index}
                                aria-label={`${index + 1}번째 글자 ${cellText || "비어 있음"} 수정`}
                            >
                                {cellText}
                            </button>
                        );
                    })}
                </div>
                <JamoRow
                    label={`${activeSlot + 1}글자 초성 선택`}
                    values={NICKNAME_INITIALS}
                    selected={activePart.initial}
                    onSelect={(jamo) => setNicknamePart("initial", jamo)}
                />
                <JamoRow
                    label={`${activeSlot + 1}글자 중성 선택`}
                    values={NICKNAME_VOWELS}
                    selected={activePart.vowel}
                    onSelect={(jamo) => setNicknamePart("vowel", jamo)}
                />
                <JamoRow
                    label={`${activeSlot + 1}글자 종성 선택`}
                    values={NICKNAME_FINALS}
                    selected={activePart.final ?? ""}
                    onSelect={(jamo) => setNicknamePart("final", jamo)}
                    emptyLabel="없음"
                />
            </div>
            <label className="nickname-direct-field referral-nickname-direct">
                <span>직접 수정</span>
                <input
                    value={nickname}
                    maxLength={syllableCount}
                    onChange={(event) =>
                        setNickname(sanitizeNickname(event.target.value, syllableCount))
                    }
                    placeholder="닉네임"
                />
            </label>
        </div>
    );
}

function JamoRow({
    emptyLabel,
    label,
    onSelect,
    selected,
    values,
}: {
    emptyLabel?: string;
    label: string;
    onSelect: (jamo: string) => void;
    selected: string;
    values: readonly string[];
}) {
    return (
        <div className="omr-syllable-row" aria-label={label}>
            {values.map((jamo) => (
                <button
                    key={jamo || "none"}
                    type="button"
                    className={selected === jamo ? "marked" : ""}
                    onClick={() => onSelect(jamo)}
                    aria-label={`${label} ${jamo || emptyLabel || "없음"}`}
                >
                    <span>{jamo || emptyLabel || "없음"}</span>
                </button>
            ))}
        </div>
    );
}
