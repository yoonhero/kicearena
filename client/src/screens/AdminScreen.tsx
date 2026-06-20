import { KeyRound } from "lucide-react";
import { useState } from "react";
import { AdminEditorScreen } from "./admin/AdminEditorScreen";
import { ADMIN_TOKEN_KEY } from "./admin/adminFormUtils";

export function AdminScreen() {
    const [token, setToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
    const [unlocked, setUnlocked] = useState(() => Boolean(token.trim()));

    if (!unlocked) {
        return (
            <main className="admin-shell">
                <header className="admin-topbar admin-token-topbar">
                    <div>
                        <span>관리실</span>
                        <strong>문제지 운영</strong>
                    </div>
                    <label>
                        <span>관리자 토큰</span>
                        <input
                            type="password"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            placeholder="X-Admin-Token"
                        />
                    </label>
                    <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                            window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
                            setUnlocked(true);
                        }}
                        disabled={!token.trim()}
                    >
                        <KeyRound size={16} /> 관리실 열기
                    </button>
                </header>
                <section className="admin-token-gate" aria-labelledby="admin-token-title">
                    <span>관리자 확인</span>
                    <h1 id="admin-token-title">토큰 입력 후 문제지 운영 화면을 엽니다.</h1>
                    <p>관리 데이터는 토큰을 저장한 뒤에만 요청합니다.</p>
                </section>
            </main>
        );
    }

    return <AdminEditorScreen />;
}
