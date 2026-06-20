import type { ReactNode } from "react";

export function HomeLandingScreen({
    goContest,
    siteNav,
}: {
    goContest: () => void;
    siteNav: ReactNode;
}) {
    return (
        <main className="exam-site-layout">
            <section className="exam-landing-cover" aria-labelledby="home-title">
                <header className="exam-reference-head">
                    <strong>제 2 교시</strong>
                    <span>2027학년도 KICE ARENA 모의평가 문제지</span>
                    <em>1</em>
                </header>
                <h1 id="home-title">수학 영역</h1>
                {siteNav}
                <div className="exam-paper-preview" aria-label="응시 안내">
                    <div className="exam-choice-stamp">응시자 유의사항</div>
                    <div className="exam-guide-sheet">
                        <section className="exam-notice-block">
                            <h2>대회 안내</h2>
                            <ol>
                                <li>
                                    초대 또는 공개 대회에 입장하여 제한 시간 안에 문제를 풉니다.
                                </li>
                                <li>제출 시각과 정답 기록은 시험 종료 후 순위표에 반영됩니다.</li>
                                <li>인증을 마친 계정만 정식 응시 기록과 수험표를 보관합니다.</li>
                            </ol>
                        </section>
                        <section
                            className="exam-handwriting-box"
                            aria-labelledby="handwriting-title"
                        >
                            <h2 id="handwriting-title">필적 확인란</h2>
                            <p>정해진 시간 안에 끝까지 풀이하겠습니다.</p>
                        </section>
                        <dl className="exam-entry-fields">
                            <div>
                                <dt>교시</dt>
                                <dd>제 2 교시</dd>
                            </div>
                            <div>
                                <dt>과목</dt>
                                <dd>수학 영역</dd>
                            </div>
                            <div>
                                <dt>입장</dt>
                                <dd>대회 목록</dd>
                            </div>
                        </dl>
                    </div>
                </div>
                <div className="exam-cover-footer">
                    <span>
                        <b>1</b>
                        <b>1</b>
                    </span>
                    <em>KICE ARENA 모의고사 안내문</em>
                </div>
                <div className="exam-cover-actions">
                    <button type="button" className="gym-primary-action" onClick={goContest}>
                        대회 입장하기
                    </button>
                </div>
            </section>
        </main>
    );
}
