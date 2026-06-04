import { expect, test, type Page } from "@playwright/test";

const JAMO_PRESETS: Record<string, Array<{ initial: string; vowel: string; final: string }>> = {
  민재: [
    { initial: "ㅁ", vowel: "ㅣ", final: "ㄴ" },
    { initial: "ㅈ", vowel: "ㅐ", final: "없음" }
  ],
  서진: [
    { initial: "ㅅ", vowel: "ㅓ", final: "없음" },
    { initial: "ㅈ", vowel: "ㅣ", final: "ㄴ" }
  ],
  도진: [
    { initial: "ㄷ", vowel: "ㅗ", final: "없음" },
    { initial: "ㅈ", vowel: "ㅣ", final: "ㄴ" }
  ]
};

async function composeNickname(page: Page, nickname = "민재") {
  const parts = JAMO_PRESETS[nickname] ?? JAMO_PRESETS.민재;
  for (const [index, part] of parts.entries()) {
    await page.getByRole("tab", { name: `${index + 1}글자` }).click();
    await page.getByLabel(`${index + 1}글자 초성 ${part.initial}`).click();
    await page.getByLabel(`${index + 1}글자 중성 ${part.vowel}`).click();
    await page.getByLabel(`${index + 1}글자 종성 ${part.final}`).click();
  }
}

async function createRoom(page: Page, nickname = "민재") {
  await page.goto("/");
  await composeNickname(page, nickname);
  await expect(page.getByLabel("직접 입력")).toHaveValue(nickname);
  await page.getByRole("button", { name: "방 열기" }).click();
  await expect(page.getByText("입실 현황")).toBeVisible();
  return (await page.locator(".room-code button").first().innerText()).replace(/[^A-Z0-9]/g, "");
}

async function joinRoom(page: Page, roomCode: string, nickname: string) {
  await page.goto("/");
  await page.getByLabel("직접 입력").fill(nickname);
  await page.getByRole("tab", { name: "기존 방 입장" }).click();
  await page.getByPlaceholder("ABCDE").fill(roomCode);
  await page.locator(".join-panel").getByRole("button", { name: "입장" }).click();
  await expect(page.getByText("입실 현황")).toBeVisible();
}

test("host can kick from lobby and nicknames support composer plus manual fallback", async ({ browser, page }) => {
  const roomCode = await createRoom(page, "민재");

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinRoom(guest, roomCode, "손님");

  await expect(page.getByText("손님")).toBeVisible();
  await page.getByLabel("손님 추방").click();

  await expect(page.getByText("손님")).toHaveCount(0);
  await expect(guest.getByRole("tab", { name: "방 생성" })).toBeVisible();

  await guestContext.close();
});

test("guest can leave a lobby without staying in the roster", async ({ browser, page }) => {
  const roomCode = await createRoom(page, "서진");

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinRoom(guest, roomCode, "나감");

  await expect(page.getByText("나감")).toBeVisible();
  await guest.getByRole("button", { name: "나가기" }).click();

  await expect(guest.getByRole("tab", { name: "방 생성" })).toBeVisible();
  await expect(page.getByText("나감")).toHaveCount(0);

  await guestContext.close();
});

test("solver exposes problem movement, rankings, and one-cell freeze reveal", async ({ page }) => {
  await page.goto("/");
  await composeNickname(page, "도진");
  await page.getByRole("button", { name: "세부 설정" }).click();
  await page.getByLabel("시험 시간(분)").fill("1");
  await page.getByLabel("순위 비공개 시작(종료 전 분)").fill("1");
  await page.getByRole("button", { name: "방 열기" }).click();
  await expect(page.getByText("입실 현황")).toBeVisible();

  await page.getByRole("button", { name: "타종" }).click();
  await expect(page.getByRole("button", { name: "순위표 보기" })).toBeVisible();
  await expect(page.getByText("순위 비공개")).toBeVisible();

  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.getByText("2번")).toBeVisible();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "이전 문제" }).click();
  await expect(page.getByText("1번")).toBeVisible();

  await page.getByRole("button", { name: "순위표 보기" }).click();
  await expect(page.getByRole("heading", { name: "순위표" })).toBeVisible();
  await page.getByRole("button", { name: "문제로" }).click();

  await page.getByRole("button", { name: "3번 제출" }).click();
  await expect(page.locator(".feedback")).toContainText(/정답|오답/);
  await page.getByRole("button", { name: "시험 종료" }).click();

  await expect(page.getByText("프리즈 해제")).toBeVisible();
  await expect(page.getByText("0/1")).toBeVisible();
  await page.getByRole("button", { name: "시도 공개" }).click();
  await expect(page.getByText("1/1")).toBeVisible();
  await expect(page.locator(".reveal-problem-cell.active-cell")).toHaveCount(1);
});
