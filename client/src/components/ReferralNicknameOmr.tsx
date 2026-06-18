import { useEffect, useState } from "react";
import { ROOM_GUARDRAILS } from "../../../shared/game";
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
}: {
    ariaLabel?: string;
    caption?: string;
    className?: string;
    nickname: string;
    setNickname: (nickname: string) => void;
}) {
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const [nameParts, setNameParts] = useState<[NicknameJamo, NicknameJamo]>(() =>
        createRandomNicknameParts(),
    );
    const displayedName = Array.from(nickname).slice(0, 2);

    useEffect(() => {
        if (!nickname) setNickname(composeNickname(nameParts[0], nameParts[1]));
    }, []);

    const setNicknamePart = (kind: keyof NicknameJamo, value: string) => {
        setNameParts((previous) => {
            const next: [NicknameJamo, NicknameJamo] = [{ ...previous[0] }, { ...previous[1] }];
            next[activeSlot] = { ...next[activeSlot], [kind]: value };
            setNickname(composeNickname(next[0], next[1]));
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
                    {[0, 1].map((index) => {
                        const cellText = displayedName[index] ?? "";
                        return (
                            <button
                                key={index}
                                type="button"
                                className={`omr-name-cell ${activeSlot === index ? "active" : ""} ${
                                    cellText ? "" : "empty"
                                }`}
                                onClick={() => setActiveSlot(index as 0 | 1)}
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
                    selected={nameParts[activeSlot].initial}
                    onSelect={(jamo) => setNicknamePart("initial", jamo)}
                />
                <JamoRow
                    label={`${activeSlot + 1}글자 중성 선택`}
                    values={NICKNAME_VOWELS}
                    selected={nameParts[activeSlot].vowel}
                    onSelect={(jamo) => setNicknamePart("vowel", jamo)}
                />
                <JamoRow
                    label={`${activeSlot + 1}글자 종성 선택`}
                    values={NICKNAME_FINALS}
                    selected={nameParts[activeSlot].final ?? ""}
                    onSelect={(jamo) => setNicknamePart("final", jamo)}
                    emptyLabel="없음"
                />
            </div>
            <label className="nickname-direct-field referral-nickname-direct">
                <span>직접 수정</span>
                <input
                    value={nickname}
                    maxLength={ROOM_GUARDRAILS.maxNicknameLength}
                    onChange={(event) => setNickname(sanitizeNickname(event.target.value))}
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
