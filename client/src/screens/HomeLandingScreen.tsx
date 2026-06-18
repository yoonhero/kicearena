export function HomeLandingScreen({
    goContest,
    goSignup,
}: {
    goContest: () => void;
    goSignup: () => void;
}) {
    return (
        <main className="exam-site-layout">
            <section className="exam-landing-cover" aria-labelledby="home-title">
                <header className="exam-reference-head">
                    <strong>제 2 교시</strong>
                    <span>2026학년도 KICE ARENA 모의고사 안내문</span>
                    <em>홈</em>
                </header>
                <h1 id="home-title">수학 영역</h1>
                <div className="exam-cover-summary">
                    <p>
                        KICE Arena는 정해진 시간 안에 수학 모의고사를 풀고, 제출 기록과 순위표로
                        같은 시험실 응시자와 비교하는 대회형 풀이 서비스입니다.
                    </p>
                    <dl>
                        <div>
                            <dt>응시</dt>
                            <dd>초대 또는 공개 대회에 입장해 문제를 풉니다.</dd>
                        </div>
                        <div>
                            <dt>기록</dt>
                            <dd>정답, 제출 시각, 순위 변동을 시험 종료 후 확인합니다.</dd>
                        </div>
                        <div>
                            <dt>수험표</dt>
                            <dd>위치 인증과 이메일 인증을 마친 계정으로 참가 자격을 보관합니다.</dd>
                        </div>
                    </dl>
                </div>
                <div className="exam-cover-actions">
                    <button type="button" className="gym-primary-action" onClick={goContest}>
                        대회 보러가기
                    </button>
                    <button type="button" className="gym-secondary-action" onClick={goSignup}>
                        수험표 만들기
                    </button>
                </div>
            </section>
        </main>
    );
}
