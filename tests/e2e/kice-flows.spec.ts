import { expect, test, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";

const JAMO_PRESETS: Record<string, Array<{ initial: string; vowel: string; final: string }>> = {
    민재: [
        { initial: "ㅁ", vowel: "ㅣ", final: "ㄴ" },
        { initial: "ㅈ", vowel: "ㅐ", final: "없음" },
    ],
    서진: [
        { initial: "ㅅ", vowel: "ㅓ", final: "없음" },
        { initial: "ㅈ", vowel: "ㅣ", final: "ㄴ" },
    ],
    도진: [
        { initial: "ㄷ", vowel: "ㅗ", final: "없음" },
        { initial: "ㅈ", vowel: "ㅣ", final: "ㄴ" },
    ],
};
const PLAYWRIGHT_BASE_URL = "http://127.0.0.1:5180";
const PRELIMINARY_ANSWERS = new Map([
    ["pre-004", "18"],
    ["pre-005", "12"],
    ["pre-006", "40"],
]);

async function composeNickname(page: Page, nickname = "민재") {
    const parts = JAMO_PRESETS[nickname] ?? JAMO_PRESETS.민재;
    for (const [index, part] of parts.entries()) {
        await page.getByRole("tab", { name: `${index + 1}번째 글자` }).click();
        await page.getByLabel(`${index + 1}글자 초성 ${part.initial}`).click();
        await page.getByLabel(`${index + 1}글자 중성 ${part.vowel}`).click();
        await page.getByLabel(`${index + 1}글자 종성 ${part.final}`).click();
    }
}

async function selectPreliminaryExam(page: Page) {
    await page.getByRole("radio", { name: /예비소집일/ }).click();
}

async function createRoom(page: Page, nickname = "민재") {
    await page.goto("/practice");
    await composeNickname(page, nickname);
    await selectPreliminaryExam(page);
    await expect(page.getByLabel("직접 수정")).toHaveValue(nickname);
    await page.getByRole("button", { name: "시험실 만들기" }).click();
    await expect(page.getByRole("heading", { name: "응시자 확인" })).toBeVisible();
    return (await page.locator(".room-code button").first().innerText()).replace(/[^A-Z0-9]/g, "");
}

async function joinRoom(page: Page, roomCode: string, nickname: string) {
    await page.goto("/practice");
    await page.getByLabel("직접 수정").fill(nickname);
    await page.getByRole("tab", { name: "시험실 입장" }).click();
    await page.getByPlaceholder("ABCDE").fill(roomCode);
    await page.locator(".join-panel").getByRole("button", { name: "입장" }).click();
    await expect(page.getByRole("heading", { name: "응시자 확인" })).toBeVisible();
}

const emitSocketAck = <T>(socket: Socket, event: string, payload: unknown) =>
    new Promise<{ ok: boolean; data?: T; error?: string }>((resolve) => {
        socket.emit(event, payload, resolve);
    });

async function connectReadyGuest(roomCode: string, nickname: string) {
    const socket = io(PLAYWRIGHT_BASE_URL, { transports: ["websocket"], forceNew: true });
    await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
    });
    const join = await emitSocketAck(socket, "room:join", { code: roomCode, nickname });
    expect(join.ok, join.error).toBe(true);
    socket.emit("player:ready", { ready: true });
    return socket;
}

async function submitSocketAnswer(socket: Socket, problemId: string, answer: string) {
    const response = await emitSocketAck(socket, "answer:submit", { problemId, answer });
    expect(response.ok, response.error).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 560));
}

test("host can kick from lobby and nicknames support composer plus manual fallback", async ({
    browser,
    page,
}) => {
    const roomCode = await createRoom(page, "민재");

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await joinRoom(guest, roomCode, "손님");

    await expect(page.getByText("손님")).toBeVisible();
    await page.getByLabel("손님 추방").click();

    await expect(page.getByText("손님")).toHaveCount(0);
    await expect(guest.getByRole("tab", { name: "시험실 만들기" })).toBeVisible();

    await guestContext.close();
});

test("guest can leave a lobby without staying in the roster", async ({ browser, page }) => {
    const roomCode = await createRoom(page, "서진");

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await joinRoom(guest, roomCode, "나감");

    await expect(page.getByText("나감")).toBeVisible();
    await guest.getByRole("button", { name: "나가기" }).click();

    await expect(guest.getByRole("tab", { name: "시험실 만들기" })).toBeVisible();
    await expect(page.getByText("나감")).toHaveCount(0);

    await guestContext.close();
});

test("solver exposes problem movement, rankings, and one-cell freeze reveal", async ({ page }) => {
    await page.goto("/practice");
    await composeNickname(page, "도진");
    await selectPreliminaryExam(page);
    await page.getByRole("button", { name: "시간 직접 조정" }).click();
    await page.getByLabel("시험 시간", { exact: true }).fill("5");
    await expect(page.getByLabel("프리즈 시작")).toHaveValue("0");
    await page.getByRole("button", { name: "시험실 만들기" }).click();
    await expect(page.getByRole("heading", { name: "응시자 확인" })).toBeVisible();

    await page.getByRole("button", { name: "시험 시작" }).click();
    await expect(page.getByRole("button", { name: "순위표" })).toBeVisible();

    await page.getByRole("button", { name: "다음 문제" }).click();
    await expect(page.getByText("2번")).toBeVisible();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "이전 문제" }).click();
    await expect(page.getByText("1번")).toBeVisible();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "문제 선택" }).click();
    await page.locator(".problem-nav button").nth(2).click();
    await expect(page.locator(".problem-focus-head strong")).toContainText("3번");
    await page.keyboard.press("3");
    await expect(page.getByRole("button", { name: "3번 선택" })).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await expect(page.locator(".feedback")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page.locator(".feedback")).toContainText(/정답|오답/);

    await page.keyboard.press("r");
    await expect(page.getByRole("heading", { name: "순위표" })).toBeVisible();
    await page.keyboard.press("r");
    await expect(page.getByRole("button", { name: "순위표" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 760 });
    await page.getByRole("button", { name: "시험 종료" }).click();

    await expect(page.getByText("프리즈 해제")).toBeVisible();
    await expect(page.getByText("0/1")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("1/1")).toBeVisible();
    await expect(page.locator(".reveal-problem-cell.active-cell")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "P3 열 보기" })).toHaveAttribute(
        "aria-pressed",
        "true",
    );
    await expect
        .poll(async () =>
            page
                .locator(".reveal-domjudge-board")
                .evaluate((board) => Math.round((board as HTMLElement).scrollLeft)),
        )
        .toBeGreaterThan(0);

    await expect
        .poll(async () =>
            page.locator(".reveal-domjudge-board").evaluate((board) => {
                const element = board as HTMLElement;
                const activeCell = element.querySelector<HTMLElement>(
                    ".reveal-problem-cell.active-cell",
                );
                const stickyCell = element.querySelector<HTMLElement>(
                    ".domjudge-header > :nth-child(6)",
                );
                const boardRect = element.getBoundingClientRect();
                const activeRect = activeCell?.getBoundingClientRect();
                const stickyRect = stickyCell?.getBoundingClientRect();
                if (!activeRect || !stickyRect) return false;
                const activeCenter = activeRect.left + activeRect.width / 2;
                return activeCenter >= stickyRect.right && activeCenter <= boardRect.right;
            }),
        )
        .toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator(".final-report-head strong")).toHaveText("성적통지표");
});

test("host can queue rapid reveal presses without losing steps or showing rate-limit errors", async ({
    page,
}) => {
    await page.goto("/practice");
    await composeNickname(page, "도진");
    await selectPreliminaryExam(page);
    await page.getByRole("button", { name: "시간 직접 조정" }).click();
    await page.getByLabel("시험 시간", { exact: true }).fill("5");
    await expect(page.getByLabel("프리즈 시작")).toHaveValue("0");
    await page.getByRole("button", { name: "시험실 만들기" }).click();
    await expect(page.getByRole("heading", { name: "응시자 확인" })).toBeVisible();
    const roomCode = (await page.locator(".room-code button").first().innerText()).replace(
        /[^A-Z0-9]/g,
        "",
    );

    const guest = await connectReadyGuest(roomCode, "연타");
    try {
        await expect(page.getByText("2/60명")).toBeVisible();
        await page.getByRole("button", { name: "시험 시작" }).click();
        await expect(page.getByRole("button", { name: "순위표" })).toBeVisible();

        await submitSocketAnswer(guest, "pre-004", "1");
        await submitSocketAnswer(guest, "pre-004", PRELIMINARY_ANSWERS.get("pre-004")!);
        await submitSocketAnswer(guest, "pre-005", PRELIMINARY_ANSWERS.get("pre-005")!);

        await page.getByRole("button", { name: "시험 종료" }).click();
        await expect(page.getByText("프리즈 해제")).toBeVisible();
        await expect(page.getByText("0/3")).toBeVisible();

        const revealButton = page.getByRole("button", { name: "시도 공개" });
        await revealButton.click();
        await revealButton.click();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");

        await expect(page.locator(".final-report-head strong")).toHaveText("성적통지표", {
            timeout: 8_000,
        });
        await expect(page.getByText("너무 빠르게 공개")).toHaveCount(0);
        await expect(page.locator(".final-report-row").filter({ hasText: "연타" })).toContainText(
            "2/6",
        );
    } finally {
        guest.disconnect();
    }
});

test("mobile solver controls do not overlap the problem or answer choices", async ({ page }) => {
    await page.goto("/practice");
    await composeNickname(page, "도진");
    await selectPreliminaryExam(page);
    await page.getByRole("button", { name: "시험실 만들기" }).click();
    await expect(page.getByRole("heading", { name: "응시자 확인" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "시험 시작" }).click();
    await expect(page.getByRole("button", { name: "순위표" })).toBeVisible();
    await page.getByRole("button", { name: "다음 문제" }).click();
    await expect(page.locator(".problem-focus-head strong")).toContainText("2번");

    const overlaps = await page.evaluate(() => {
        const rectFor = (selector: string) => {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        const overlapsRect = (
            first: ReturnType<typeof rectFor>,
            second: ReturnType<typeof rectFor>,
        ) =>
            Boolean(
                first &&
                second &&
                first.left < second.right &&
                first.right > second.left &&
                first.top < second.bottom &&
                first.bottom > second.top,
            );
        const commandStrip = rectFor(".problem-command-strip");
        const answerBar = rectFor(".single-question-sheet > .answer-bar");
        const choices = rectFor(".choice-buttons");
        const problemImage = rectFor(".problem-image-wrap");
        const problemBody = rectFor(".kice-problem-body");

        return {
            commandOverAnswer: overlapsRect(commandStrip, answerBar),
            commandOverChoices: overlapsRect(commandStrip, choices),
            commandOverProblem: overlapsRect(commandStrip, problemImage),
            commandOverBody: overlapsRect(commandStrip, problemBody),
            answerOverBody: overlapsRect(answerBar, problemBody),
        };
    });

    expect(overlaps).toEqual({
        commandOverAnswer: false,
        commandOverChoices: false,
        commandOverProblem: false,
        commandOverBody: false,
        answerOverBody: false,
    });
});

test("mobile rankings keep the scoreboard visible above the fold", async ({ page }) => {
    await page.goto("/practice");
    await composeNickname(page, "도진");
    await selectPreliminaryExam(page);
    await page.getByRole("button", { name: "시험실 만들기" }).click();
    await expect(page.getByRole("heading", { name: "응시자 확인" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "시험 시작" }).click();
    await page.getByRole("button", { name: "순위표" }).click();
    await expect(page.getByRole("heading", { name: "순위표" })).toBeVisible();

    const boardMetrics = await page.locator(".domjudge-board").evaluate((board) => {
        const rect = board.getBoundingClientRect();
        return {
            top: rect.top,
            visibleHeight: Math.max(
                0,
                Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top),
            ),
        };
    });

    expect(boardMetrics.top).toBeLessThan(180);
    expect(boardMetrics.visibleHeight).toBeGreaterThan(100);
});
