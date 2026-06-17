export function AdmissionSkeletonTicket() {
    return (
        <section
            className="gym-admission-slip admission-skeleton-ticket"
            aria-label="응시표 발급 안내"
        >
            <div className="admission-skeleton-title">
                <span>2026학년도 KICE ARENA</span>
                <strong>수 험 표</strong>
            </div>
            <div className="admission-skeleton-body">
                <div className="admission-photo-placeholder" aria-hidden="true">
                    사진
                </div>
                <div className="admission-skeleton-rows">
                    <div className="admission-skeleton-row">
                        <span>수험번호</span>
                        <i />
                    </div>
                    <div className="admission-skeleton-row">
                        <span>성명</span>
                        <i />
                    </div>
                    <div className="admission-skeleton-row">
                        <span>학교</span>
                        <i />
                    </div>
                    <div className="admission-skeleton-row">
                        <span>상태</span>
                        <strong>미발급</strong>
                    </div>
                </div>
            </div>
            <div className="admission-skeleton-note">
                <span>발급 안내</span>
                <strong>추천 링크로 입장하면 성명과 위치 확인 후 자동 발급됩니다.</strong>
            </div>
        </section>
    );
}
