import type { RoomPublic } from "../../../shared/game";
import type { RevealEvent } from "../../../shared/reveal";

export function makeNextRevealLabel(event: RevealEvent | undefined, room: RoomPublic) {
  if (!event) return "다음 비공개 시도 공개 대기";
  const problemNumber = room.exam.problems.find((problem) => problem.id === event.submission.problemId)?.number ?? "?";
  return `${event.nickname}의 ${problemNumber}번 시도 공개 대기`;
}

export function makeRevealCellKey(playerId: string, problemId: string) {
  return `${playerId}:${problemId}`;
}

export function getRevealProblemScrollLeft(board: HTMLElement, target: HTMLElement) {
  const stickyWidth = readRevealStickyWidth(board);
  const availableWidth = Math.max(target.offsetWidth, board.clientWidth - stickyWidth);
  const centeredLeft = target.offsetLeft - stickyWidth - (availableWidth - target.offsetWidth) / 2;
  const fullyVisibleRightLeft = target.offsetLeft + target.offsetWidth - board.clientWidth + 8;
  const fullyVisibleLeftLimit = target.offsetLeft - stickyWidth - 4;
  const maxLeft = Math.max(0, board.scrollWidth - board.clientWidth);
  const visibleLeft = Math.min(fullyVisibleLeftLimit, Math.max(fullyVisibleRightLeft, centeredLeft));
  return Math.min(maxLeft, Math.max(0, visibleLeft));
}

export function getRevealVisibleScrollLeft(board: HTMLElement, target: HTMLElement) {
  const stickyWidth = readRevealStickyWidth(board);
  const padding = 8;
  const targetLeft = target.offsetLeft;
  const targetRight = target.offsetLeft + target.offsetWidth;
  const maxLeft = Math.max(0, board.scrollWidth - board.clientWidth);
  let nextLeft = board.scrollLeft;

  if (targetRight - nextLeft > board.clientWidth - padding) {
    nextLeft = targetRight - board.clientWidth + padding;
  }
  if (targetLeft - nextLeft < stickyWidth + padding) {
    nextLeft = targetLeft - stickyWidth - padding;
  }

  return Math.min(maxLeft, Math.max(0, nextLeft));
}

export function getRevealRectAdjustedScrollLeft(board: HTMLElement, target: HTMLElement) {
  const header = board.querySelector<HTMLElement>(".domjudge-header");
  const stickyAnchor = header?.children[5] as HTMLElement | undefined;
  const boardRect = board.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const stickyRight = stickyAnchor?.getBoundingClientRect().right ?? boardRect.left;
  const maxLeft = Math.max(0, board.scrollWidth - board.clientWidth);
  const padding = 8;
  let nextLeft = board.scrollLeft;

  if (targetRect.right > boardRect.right - padding) {
    nextLeft += targetRect.right - boardRect.right + padding;
  }
  if (targetRect.left < stickyRight + padding) {
    nextLeft -= stickyRight + padding - targetRect.left;
  }

  return Math.min(maxLeft, Math.max(0, nextLeft));
}

export function findNearestRevealProblemHeader(board: HTMLElement) {
  const stickyWidth = readRevealStickyWidth(board);
  const headers = Array.from(board.querySelectorAll<HTMLElement>(".domjudge-header [data-score-problem-id]"));
  if (headers.length === 0) return null;
  const visibleCenter = board.scrollLeft + stickyWidth + Math.max(0, board.clientWidth - stickyWidth) / 2;
  return headers.reduce((nearest, header) => {
    const nearestCenter = nearest.offsetLeft + nearest.offsetWidth / 2;
    const headerCenter = header.offsetLeft + header.offsetWidth / 2;
    return Math.abs(headerCenter - visibleCenter) < Math.abs(nearestCenter - visibleCenter) ? header : nearest;
  }, headers[0]);
}

export function scrollElementVerticallyIntoView(element: HTMLElement | undefined) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  if (rect.top < 0) {
    window.scrollBy({ top: rect.top - 12, behavior: "smooth" });
    return;
  }
  if (rect.bottom > viewportHeight) {
    window.scrollBy({ top: rect.bottom - viewportHeight + 12, behavior: "smooth" });
  }
}

function readRevealStickyWidth(board: HTMLElement) {
  const header = board.querySelector<HTMLElement>(".domjudge-header");
  if (!header) return 0;
  return Array.from(header.children)
    .slice(0, 6)
    .reduce((sum, child) => sum + (child as HTMLElement).offsetWidth, 0);
}
