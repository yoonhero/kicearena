import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
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

export function HomeNameEntry(props: {
    nickname: string;
    setNickname: (value: string) => void;
    inviteMode: boolean;
    inviteRoomCode: string;
    joiningInvite: boolean;
    joinInviteRoom: () => void;
    exitInviteMode: () => void;
}) {
    const [nameEditorOpen, setNameEditorOpen] = useState(false);
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const [nameParts, setNameParts] = useState<[NicknameJamo, NicknameJamo]>(() =>
        createRandomNicknameParts(),
    );
    const nameSlots = 2;
    const displayedName = Array.from(props.nickname).slice(0, nameSlots);
    const trimmedNickname = props.nickname.trim();
    const nicknameLength = Array.from(trimmedNickname).length;

    useEffect(() => {
        if (!props.nickname) props.setNickname(composeNickname(nameParts[0], nameParts[1]));
    }, []);

    const setNicknamePart = (kind: keyof NicknameJamo, value: string) => {
        setNameParts((previous) => {
            const next: [NicknameJamo, NicknameJamo] = [{ ...previous[0] }, { ...previous[1] }];
            next[activeSlot] = { ...next[activeSlot], [kind]: value };
            props.setNickname(composeNickname(next[0], next[1]));
            return next;
        });
    };

    return (
        <div
            className={`identity-card entry-zone entry-zone-identity ${
                nameEditorOpen || props.inviteMode ? "name-editor-open" : ""
            }`}
        >
            <div className="mobile-name-strip">
                <span>성명</span>
                <strong>{trimmedNickname || "이름 선택"}</strong>
                <button
                    type="button"
                    onClick={() => setNameEditorOpen((value) => !value)}
                    aria-expanded={nameEditorOpen}
                >
                    {nameEditorOpen ? "닫기" : "이름 수정"}
                </button>
            </div>
            <div className="omr-name-maker" aria-label="성명 OMR 입력">
                <div className="omr-maker-head">
                    <strong>성명</strong>
                    {props.inviteMode && <span>{`초대 방 ${props.inviteRoomCode}`}</span>}
                </div>
                <div className="omr-maker-cells" role="tablist" aria-label="수정할 이름 글자 선택">
                    {Array.from({ length: nameSlots }, (_, index) => {
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
                <div className="omr-syllable-row" aria-label={`${activeSlot + 1}글자 초성 선택`}>
                    {NICKNAME_INITIALS.map((jamo) => (
                        <button
                            key={`initial-${jamo}`}
                            type="button"
                            className={nameParts[activeSlot].initial === jamo ? "marked" : ""}
                            onClick={() => setNicknamePart("initial", jamo)}
                            aria-label={`${activeSlot + 1}글자 초성 ${jamo}`}
                        >
                            <span>{jamo}</span>
                        </button>
                    ))}
                </div>
                <div className="omr-syllable-row" aria-label={`${activeSlot + 1}글자 중성 선택`}>
                    {NICKNAME_VOWELS.map((jamo) => (
                        <button
                            key={`vowel-${jamo}`}
                            type="button"
                            className={nameParts[activeSlot].vowel === jamo ? "marked" : ""}
                            onClick={() => setNicknamePart("vowel", jamo)}
                            aria-label={`${activeSlot + 1}글자 중성 ${jamo}`}
                        >
                            <span>{jamo}</span>
                        </button>
                    ))}
                </div>
                <div className="omr-syllable-row" aria-label={`${activeSlot + 1}글자 종성 선택`}>
                    {NICKNAME_FINALS.map((jamo) => (
                        <button
                            key={`final-${jamo || "none"}`}
                            type="button"
                            className={(nameParts[activeSlot].final ?? "") === jamo ? "marked" : ""}
                            onClick={() => setNicknamePart("final", jamo)}
                            aria-label={`${activeSlot + 1}글자 종성 ${jamo || "없음"}`}
                        >
                            <span>{jamo || "없음"}</span>
                        </button>
                    ))}
                </div>
            </div>
            <label className="nickname-direct-field">
                <span>직접 수정</span>
                <input
                    value={props.nickname}
                    maxLength={ROOM_GUARDRAILS.maxNicknameLength}
                    onChange={(event) => props.setNickname(sanitizeNickname(event.target.value))}
                    placeholder="닉네임"
                />
            </label>
            {props.inviteMode && (
                <>
                    <div className="invite-entry-status" aria-live="polite">
                        <span>
                            {props.joiningInvite
                                ? "입실 처리 중"
                                : nicknameLength > 0
                                  ? `${nicknameLength}글자`
                                  : "1글자 이상 선택"}
                        </span>
                    </div>
                    <button
                        className="omr-action invite-enter-action"
                        type="button"
                        disabled={!trimmedNickname || props.joiningInvite}
                        onClick={props.joinInviteRoom}
                    >
                        <LogIn size={18} />
                        입장
                    </button>
                    <button
                        className="invite-exit-action"
                        type="button"
                        onClick={props.exitInviteMode}
                    >
                        <LogOut size={16} />
                        나가기
                    </button>
                </>
            )}
        </div>
    );
}
