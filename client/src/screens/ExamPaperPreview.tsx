export function ExamPaperPreview() {
    return (
        <section className="exam-paper-preview" aria-label="시험지 미리보기">
            <header>
                <span>시험지 preview</span>
                <strong>1쪽 / 8쪽</strong>
            </header>
            <div className="exam-preview-sheet">
                <div className="exam-preview-sheet-head">
                    <span>2026학년도 KICE ARENA 모의고사</span>
                    <strong>수학 영역</strong>
                </div>
                <article className="exam-preview-problem">
                    <span>1.</span>
                    <p>함수 f(x)=x²-4x+7에 대하여 f(2)의 값을 고르시오.</p>
                    <ol>
                        <li>① 1</li>
                        <li>② 2</li>
                        <li>③ 3</li>
                        <li>④ 4</li>
                        <li>⑤ 5</li>
                    </ol>
                </article>
                <article className="exam-preview-problem">
                    <span>2.</span>
                    <p>수열 a_n=n²+n에 대하여 a_5-a_3의 값을 구하시오.</p>
                    <div className="exam-preview-answer">
                        <i />
                        <i />
                        <i />
                    </div>
                </article>
            </div>
        </section>
    );
}
