type EmailVerificationDelivery = "sent" | "not-configured" | "failed" | "";

export function AuthEmailVerificationStep({
    deliveryStatus,
    devCode,
    pending,
    setVerificationCode,
    verificationCode,
    verifyEmail,
}: {
    deliveryStatus: EmailVerificationDelivery;
    devCode: string;
    pending: boolean;
    setVerificationCode: (value: string) => void;
    verificationCode: string;
    verifyEmail: () => Promise<void>;
}) {
    return (
        <div className="exam-email-verify">
            <label>
                <span>이메일 인증 코드</span>
                <input
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                />
            </label>
            <EmailDeliveryNotice deliveryStatus={deliveryStatus} />
            {devCode && <p>개발 인증 코드: {devCode}</p>}
            <button
                type="button"
                className="gym-primary-action"
                onClick={() => void verifyEmail()}
                disabled={verificationCode.length < 6 || pending}
            >
                {pending ? "확인 중" : "이메일 인증"}
            </button>
        </div>
    );
}

function EmailDeliveryNotice({ deliveryStatus }: { deliveryStatus: EmailVerificationDelivery }) {
    if (deliveryStatus === "sent") return <p>인증 코드를 이메일로 보냈습니다.</p>;
    if (deliveryStatus === "failed") {
        return <p>메일 발송에 실패했습니다. 운영자에게 발송 설정을 확인해야 합니다.</p>;
    }
    if (deliveryStatus === "not-configured") {
        return <p>메일 발송 provider가 아직 연결되지 않았습니다.</p>;
    }
    return null;
}
