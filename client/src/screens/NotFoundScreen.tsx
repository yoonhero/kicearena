import { ArrowLeft, Home } from "lucide-react";

export function NotFoundScreen() {
    return (
        <main className="not-found-shell" aria-labelledby="not-found-title">
            <section className="not-found-paper">
                <span>404</span>
                <h1 id="not-found-title">페이지를 찾을 수 없습니다</h1>
                <p>주소가 바뀌었거나 공개되지 않은 페이지입니다.</p>
                <div>
                    <a className="gym-primary-action" href="/">
                        <Home size={18} />
                        홈으로
                    </a>
                    <button
                        type="button"
                        className="gym-secondary-action"
                        onClick={() => window.history.back()}
                    >
                        <ArrowLeft size={18} />
                        이전 화면
                    </button>
                </div>
            </section>
        </main>
    );
}
