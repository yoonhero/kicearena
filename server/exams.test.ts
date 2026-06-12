import { describe, expect, it } from "vitest";
import type { ExamManifest } from "../shared/game.js";
import { isExamReleased, toExamPublic, toExamSummary, toGymEventSummary } from "./exams.js";

const exam: ExamManifest = {
  id: "mock-exam",
  title: "Mock Exam",
  subtitle: "Server test",
  timeLimitSec: 1200,
  problems: [
    {
      id: "p1",
      number: 1,
      title: "Problem 1",
      answerKind: "choice",
      answer: "3",
      difficulty: 2,
      image: "p1.png",
      text: "[3점] choose"
    }
  ]
};

describe("exam serialization", () => {
  it("summarizes manifests without exposing answers", () => {
    expect(toExamSummary(exam)).toEqual({
      id: "mock-exam",
      title: "Mock Exam",
      subtitle: "Server test",
      timeLimitSec: 1200,
      problemCount: 1
    });
  });

  it("creates public problem image URLs and point values", () => {
    const publicExam = toExamPublic(exam);

    expect(publicExam.problems[0]).toMatchObject({
      id: "p1",
      pointValue: 3,
      imageUrl: "/api/exams/mock-exam/assets/problems/p1.png"
    });
    expect(publicExam.problems[0]).not.toHaveProperty("answer");
  });

  it("keeps LaTeX body blocks public without exposing answers", () => {
    const publicExam = toExamPublic({
      ...exam,
      problems: [
        {
          ...exam.problems[0],
          image: undefined,
          body: [
            { kind: "paragraph", text: "{}의 값은?", inlineMath: ["x^2"] },
            { kind: "diagram", src: "diagrams/graph.svg", alt: "그래프" }
          ]
        }
      ]
    });

    expect(publicExam.problems[0]).toMatchObject({
      imageUrl: undefined,
      body: [
        { kind: "paragraph", text: "{}의 값은?", inlineMath: ["x^2"] },
        { kind: "diagram", src: "/api/exams/mock-exam/assets/diagrams/graph.svg", alt: "그래프" }
      ]
    });
    expect(publicExam.problems[0]).not.toHaveProperty("answer");
  });

  it("hides exams until releaseAt has passed", () => {
    expect(isExamReleased({ ...exam, releaseAt: "2026-06-05T00:00:00.000Z" }, Date.parse("2026-06-04T00:00:00.000Z"))).toBe(false);
    expect(isExamReleased({ ...exam, releaseAt: "2026-06-03T00:00:00.000Z" }, Date.parse("2026-06-04T00:00:00.000Z"))).toBe(true);
  });

  it("serializes active exams as invite-only virtual gym events", () => {
    expect(toGymEventSummary({ ...exam, releaseAt: "2026-06-05T00:00:00.000Z" }, Date.parse("2026-06-04T00:00:00.000Z"))).toMatchObject({
      id: "mock-exam",
      startsAt: "2026-06-05T00:00:00.000Z",
      status: "upcoming",
      registration: "invite-only",
      spectatorAllowed: true
    });
    expect(toGymEventSummary(exam, Date.parse("2026-06-04T00:00:00.000Z"))).toMatchObject({
      startsAt: null,
      status: "open"
    });
  });
});
