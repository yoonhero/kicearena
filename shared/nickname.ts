import { ROOM_GUARDRAILS } from "./game";

export const NICKNAME_FIRST_SYLLABLES = ["민", "서", "지", "현", "준", "수", "윤", "도"] as const;
export const NICKNAME_SECOND_SYLLABLES = ["재", "빈", "우", "아", "호", "영", "민", "진"] as const;

export const sanitizeNickname = (value: string, maxLength: number = ROOM_GUARDRAILS.maxNicknameLength) => Array.from(value.trim()).slice(0, maxLength).join("");

export const composeNickname = (first: string, second: string) => sanitizeNickname(`${first}${second}`, 2);
