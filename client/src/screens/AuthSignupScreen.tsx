import { useState } from "react";
import type { ReactNode } from "react";
import {
    STUDENT_STATUS_LABELS,
    STUDENT_STATUSES,
    type CampaignUserPublic,
    type ReferralLocationVerification,
    type StudentStatus,
} from "../../../shared/campaign";
import { AuthEmailVerificationStep } from "./AuthEmailVerificationStep";
import { ReferralNicknameOmr } from "../components/ReferralNicknameOmr";
import { saveCampaignUser } from "../lib/campaignSession";

type RegisterResponse = {
    user: CampaignUserPublic;
    emailVerification: {
        required: boolean;
        email: string;
        expiresInSec: number;
        delivery: "sent" | "not-configured" | "failed";
        devCode?: string;
    };
};

type SignupContentProps = {
    canSubmit: boolean;
    deliveryStatus: RegisterResponse["emailVerification"]["delivery"] | "";
    devCode: string;
    email: string;
    hasSchool: boolean;
    marketingEmailConsent: boolean;
    nickname: string;
    password: string;
    pending: boolean;
    privacyAccepted: boolean;
    registeredUser: CampaignUserPublic | null;
    register: () => Promise<void>;
    setEmail: (value: string) => void;
    setMarketingEmailConsent: (value: boolean) => void;
    setNickname: (value: string) => void;
    setPassword: (value: string) => void;
    setPrivacyAccepted: (value: boolean) => void;
    setStudentStatus: (value: StudentStatus) => void;
    setTermsAccepted: (value: boolean) => void;
    setUsername: (value: string) => void;
    setVerificationCode: (value: string) => void;
    studentStatus: StudentStatus;
    termsAccepted: boolean;
    username: string;
    verificationCode: string;
    verifyEmail: () => Promise<void>;
};

const trimNickname = (value: string) => Array.from(value.trim()).slice(0, 3).join("");
const isValidAccountId = (value: string) => /^[a-z0-9._-]{3,32}$/.test(value);

export function AuthSignupScreen({
    referralVerification,
    onRegistered,
    onVerified,
    siteNav,
}: {
    referralVerification: ReferralLocationVerification | null;
    onRegistered: (user: CampaignUserPublic) => void;
    onVerified: (user: CampaignUserPublic) => void;
    siteNav: ReactNode;
}) {
    const [nickname, setNickname] = useState(trimNickname(referralVerification?.nickname ?? ""));
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [studentStatus, setStudentStatus] = useState<StudentStatus>("g3");
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [marketingEmailConsent, setMarketingEmailConsent] = useState(false);
    const [verificationCode, setVerificationCode] = useState("");
    const [deliveryStatus, setDeliveryStatus] = useState<
        RegisterResponse["emailVerification"]["delivery"] | ""
    >("");
    const [devCode, setDevCode] = useState("");
    const [registeredUser, setRegisteredUser] = useState<CampaignUserPublic | null>(null);
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);

    const school = referralVerification?.school;
    const canSubmit = [
        Boolean(school?.id),
        isValidAccountId(username),
        Array.from(nickname.trim()).length === 3,
        Boolean(email.trim()),
        password.length >= 8,
        termsAccepted,
        privacyAccepted,
    ].every(Boolean);

    const register = async () => {
        if (!(canSubmit && !pending && school)) return;
        setPending(true);
        setError("");
        try {
            const response = await fetch("/api/campaign/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    studentStatus,
                    schoolId: school.id,
                    referredByCode: referralVerification?.referralCode,
                    termsAccepted,
                    privacyAccepted,
                    marketingEmailConsent,
                    paymentMeta: { nickname: trimNickname(nickname) },
                }),
            });
            if (!response.ok) throw new Error((await response.json()).error ?? "회원가입 실패");
            const data = (await response.json()) as RegisterResponse;
            saveCampaignUser(data.user);
            setRegisteredUser(data.user);
            setDeliveryStatus(data.emailVerification.delivery);
            setDevCode(data.emailVerification.devCode ?? "");
            setVerificationCode(data.emailVerification.devCode ?? "");
            onRegistered(data.user);
        } catch (error) {
            setError(error instanceof Error ? error.message : "회원가입 실패");
        } finally {
            setPending(false);
        }
    };

    const verifyEmail = async () => {
        const user = registeredUser;
        if (!user || pending) return;
        setPending(true);
        setError("");
        try {
            const response = await fetch("/api/campaign/verify-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, code: verificationCode }),
            });
            if (!response.ok) throw new Error((await response.json()).error ?? "이메일 인증 실패");
            const verifiedUser = (await response.json()) as CampaignUserPublic;
            saveCampaignUser(verifiedUser);
            onVerified(verifiedUser);
        } catch (error) {
            setError(error instanceof Error ? error.message : "이메일 인증 실패");
        } finally {
            setPending(false);
        }
    };

    return (
        <main className="exam-site-layout">
            <section className="exam-signup-paper" aria-labelledby="signup-title">
                <header className="exam-reference-head">
                    <strong>원서 접수</strong>
                    <span>위치 인증 완료 후 회원가입</span>
                    <em>{school ? school.name : "초대 필요"}</em>
                </header>
                <h1 id="signup-title">응시자 정보</h1>
                {siteNav}
                <div className="exam-signup-step" aria-label="수험표 발급 단계">
                    <span>수험표 발급</span>
                    <i />
                    <strong>원서 접수</strong>
                </div>
                <SignupContent
                    canSubmit={canSubmit}
                    deliveryStatus={deliveryStatus}
                    devCode={devCode}
                    email={email}
                    hasSchool={Boolean(school)}
                    marketingEmailConsent={marketingEmailConsent}
                    nickname={nickname}
                    password={password}
                    pending={pending}
                    privacyAccepted={privacyAccepted}
                    registeredUser={registeredUser}
                    register={register}
                    setEmail={setEmail}
                    setMarketingEmailConsent={setMarketingEmailConsent}
                    setNickname={setNickname}
                    setPassword={setPassword}
                    setPrivacyAccepted={setPrivacyAccepted}
                    setStudentStatus={setStudentStatus}
                    setTermsAccepted={setTermsAccepted}
                    setUsername={setUsername}
                    setVerificationCode={setVerificationCode}
                    studentStatus={studentStatus}
                    termsAccepted={termsAccepted}
                    username={username}
                    verificationCode={verificationCode}
                    verifyEmail={verifyEmail}
                />
                {error && <p className="gym-error error-text">{error}</p>}
            </section>
        </main>
    );
}

function SignupContent(props: SignupContentProps) {
    if (!props.hasSchool) {
        return (
            <p className="exam-auth-notice">
                초대 링크에서 학교 위치 인증을 먼저 완료해야 회원가입할 수 있습니다.
            </p>
        );
    }
    if (props.registeredUser) {
        return (
            <AuthEmailVerificationStep
                deliveryStatus={props.deliveryStatus}
                devCode={props.devCode}
                pending={props.pending}
                setVerificationCode={props.setVerificationCode}
                verificationCode={props.verificationCode}
                verifyEmail={props.verifyEmail}
            />
        );
    }
    return (
        <form
            className="exam-auth-form"
            onSubmit={(event) => {
                event.preventDefault();
                void props.register();
            }}
        >
            <SignupFields {...props} />
            <ConsentList {...props} />
            <button
                type="submit"
                className="gym-primary-action"
                disabled={!props.canSubmit || props.pending}
            >
                {props.pending ? "접수 중" : "회원가입"}
            </button>
        </form>
    );
}

function SignupFields({
    email,
    nickname,
    password,
    setEmail,
    setNickname,
    setPassword,
    setStudentStatus,
    setUsername,
    studentStatus,
    username,
}: Pick<
    SignupContentProps,
    | "email"
    | "nickname"
    | "password"
    | "setEmail"
    | "setNickname"
    | "setPassword"
    | "setStudentStatus"
    | "setUsername"
    | "studentStatus"
    | "username"
>) {
    return (
        <>
            <ReferralNicknameOmr
                ariaLabel="회원가입 수험표 닉네임 OMR 입력"
                caption="3글자 닉네임, 중복 가능"
                className="signup-omr-name"
                nickname={nickname}
                setNickname={setNickname}
                syllableCount={3}
            />
            <div className="exam-auth-grid">
                <label>
                    <span>아이디</span>
                    <input
                        autoComplete="username"
                        inputMode="email"
                        value={username}
                        onChange={(event) => setUsername(event.target.value.toLowerCase())}
                        placeholder="letters.number"
                    />
                </label>
                <label>
                    <span>이메일</span>
                    <input
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                </label>
                <label>
                    <span>비밀번호</span>
                    <input
                        autoComplete="new-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                </label>
                <label>
                    <span>신분</span>
                    <select
                        value={studentStatus}
                        onChange={(event) => setStudentStatus(event.target.value as StudentStatus)}
                    >
                        {STUDENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {STUDENT_STATUS_LABELS[status]}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </>
    );
}

function ConsentList({
    marketingEmailConsent,
    privacyAccepted,
    setMarketingEmailConsent,
    setPrivacyAccepted,
    setTermsAccepted,
    termsAccepted,
}: Pick<
    SignupContentProps,
    | "marketingEmailConsent"
    | "privacyAccepted"
    | "setMarketingEmailConsent"
    | "setPrivacyAccepted"
    | "setTermsAccepted"
    | "termsAccepted"
>) {
    return (
        <div className="exam-consent-list">
            <label>
                <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                />
                <span>필수: 서비스 이용약관에 동의합니다.</span>
            </label>
            <label>
                <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(event) => setPrivacyAccepted(event.target.checked)}
                />
                <span>
                    필수: 회원 식별, 수험표 발급, 대회 운영을 위한 개인정보 수집 및 이용에
                    동의합니다. 보관 기간은 회원 탈퇴 또는 법정 보관 기간까지입니다.
                </span>
            </label>
            <label>
                <input
                    type="checkbox"
                    checked={marketingEmailConsent}
                    onChange={(event) => setMarketingEmailConsent(event.target.checked)}
                />
                <span>
                    선택: 이메일로 대회 일정, 결과 안내, 운영 공지를 받는 데 동의합니다. 동의하지
                    않아도 회원가입과 대회 응시는 가능합니다.
                </span>
            </label>
        </div>
    );
}
