import { ROOM_GUARDRAILS } from "./game";

export const NICKNAME_INITIALS = ["ㄱ", "ㄴ", "ㄷ", "ㅁ", "ㅅ", "ㅇ", "ㅈ", "ㅎ"] as const;
export const NICKNAME_VOWELS = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ", "ㅐ", "ㅔ"] as const;
export const NICKNAME_FINALS = ["", "ㄴ", "ㄹ", "ㅁ", "ㅇ"] as const;

const INITIAL_INDEX = new Map([
    ["ㄱ", 0],
    ["ㄲ", 1],
    ["ㄴ", 2],
    ["ㄷ", 3],
    ["ㄸ", 4],
    ["ㄹ", 5],
    ["ㅁ", 6],
    ["ㅂ", 7],
    ["ㅃ", 8],
    ["ㅅ", 9],
    ["ㅆ", 10],
    ["ㅇ", 11],
    ["ㅈ", 12],
    ["ㅉ", 13],
    ["ㅊ", 14],
    ["ㅋ", 15],
    ["ㅌ", 16],
    ["ㅍ", 17],
    ["ㅎ", 18],
]);

const VOWEL_INDEX = new Map([
    ["ㅏ", 0],
    ["ㅐ", 1],
    ["ㅑ", 2],
    ["ㅒ", 3],
    ["ㅓ", 4],
    ["ㅔ", 5],
    ["ㅕ", 6],
    ["ㅖ", 7],
    ["ㅗ", 8],
    ["ㅘ", 9],
    ["ㅙ", 10],
    ["ㅚ", 11],
    ["ㅛ", 12],
    ["ㅜ", 13],
    ["ㅝ", 14],
    ["ㅞ", 15],
    ["ㅟ", 16],
    ["ㅠ", 17],
    ["ㅡ", 18],
    ["ㅢ", 19],
    ["ㅣ", 20],
]);

const FINAL_INDEX = new Map([
    ["", 0],
    ["ㄱ", 1],
    ["ㄲ", 2],
    ["ㄳ", 3],
    ["ㄴ", 4],
    ["ㄵ", 5],
    ["ㄶ", 6],
    ["ㄷ", 7],
    ["ㄹ", 8],
    ["ㄺ", 9],
    ["ㄻ", 10],
    ["ㄼ", 11],
    ["ㄽ", 12],
    ["ㄾ", 13],
    ["ㄿ", 14],
    ["ㅀ", 15],
    ["ㅁ", 16],
    ["ㅂ", 17],
    ["ㅄ", 18],
    ["ㅅ", 19],
    ["ㅆ", 20],
    ["ㅇ", 21],
    ["ㅈ", 22],
    ["ㅊ", 23],
    ["ㅋ", 24],
    ["ㅌ", 25],
    ["ㅍ", 26],
    ["ㅎ", 27],
]);

export type NicknameJamo = {
    initial: string;
    vowel: string;
    final?: string;
};

export type NicknameParts = [NicknameJamo, ...NicknameJamo[]];

const pickRandom = <T>(values: readonly T[], random: () => number) =>
    values[Math.floor(random() * values.length)] ?? values[0];

const createRandomNicknamePart = (random: () => number): NicknameJamo => ({
    initial: pickRandom(NICKNAME_INITIALS, random),
    vowel: pickRandom(NICKNAME_VOWELS, random),
    final: pickRandom(NICKNAME_FINALS, random),
});

export const createRandomNicknameParts = (
    random: () => number = Math.random,
    syllableCount = 2,
): NicknameParts =>
    Array.from({ length: Math.max(1, syllableCount) }, () =>
        createRandomNicknamePart(random),
    ) as NicknameParts;

export const sanitizeNickname = (
    value: string,
    maxLength: number = ROOM_GUARDRAILS.maxNicknameLength,
) => Array.from(value.trim()).slice(0, maxLength).join("");

export const composeHangulSyllable = ({ initial, vowel, final = "" }: NicknameJamo) => {
    const initialIndex = INITIAL_INDEX.get(initial);
    const vowelIndex = VOWEL_INDEX.get(vowel);
    const finalIndex = FINAL_INDEX.get(final);
    if (initialIndex === undefined || vowelIndex === undefined || finalIndex === undefined)
        return "";
    return String.fromCharCode(0xac00 + (initialIndex * 21 + vowelIndex) * 28 + finalIndex);
};

export const composeNickname = (...parts: Array<string | NicknameJamo>) =>
    sanitizeNickname(
        parts
            .map((part) => (typeof part === "string" ? part : composeHangulSyllable(part)))
            .join(""),
        parts.length,
    );

export const createRandomNickname = (random: () => number = Math.random) => {
    const [first, second] = createRandomNicknameParts(random);
    return composeNickname(first, second);
};
