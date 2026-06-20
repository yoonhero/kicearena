import { useState } from "react";
import type { ReactNode } from "react";
import type { CampaignUserPublic } from "../../../shared/campaign";
import { saveCampaignUser } from "../lib/campaignSession";

export function AuthLoginScreen({
    onLoggedIn,
    siteNav,
}: {
    onLoggedIn: (user: CampaignUserPublic) => void;
    siteNav: ReactNode;
}) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const canSubmit = /^[a-z0-9._-]{3,32}$/.test(username) && password.length >= 8;

    const login = async () => {
        if (!canSubmit || pending) return;
        setPending(true);
        setError("");
        try {
            const response = await fetch("/api/campaign/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (!response.ok) throw new Error((await response.json()).error ?? "로그인 실패");
            const user = (await response.json()) as CampaignUserPublic;
            saveCampaignUser(user);
            onLoggedIn(user);
        } catch (error) {
            setError(error instanceof Error ? error.message : "로그인 실패");
        } finally {
            setPending(false);
        }
    };

    return (
        <main className="exam-site-layout">
            <section className="exam-login-paper" aria-labelledby="login-title">
                <header className="exam-reference-head">
                    <strong>본인 확인</strong>
                    <span>KICE ARENA 수험표 로그인</span>
                    <em>로그인</em>
                </header>
                <h1 id="login-title">로그인</h1>
                {siteNav}
                <form
                    className="exam-auth-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void login();
                    }}
                >
                    <div className="exam-auth-grid">
                        <label>
                            <span>아이디</span>
                            <input
                                autoComplete="username"
                                inputMode="email"
                                value={username}
                                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                            />
                        </label>
                        <label>
                            <span>비밀번호</span>
                            <input
                                autoComplete="current-password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                            />
                        </label>
                    </div>
                    <button
                        type="submit"
                        className="gym-primary-action"
                        disabled={!canSubmit || pending}
                    >
                        {pending ? "확인 중" : "로그인"}
                    </button>
                </form>
                {error && <p className="gym-error error-text">{error}</p>}
            </section>
        </main>
    );
}
