# KICE Arena Task Board

## 완료됨

-   [x] Problem
    -   [x] 문제 본문/선지 구조화: `shared/problemBody.ts`, `client/src/screens/adminProblemMarkup.ts`
    -   [x] LaTeX 렌더링: `client/src/components/common/MathHtml.tsx`
    -   [x] SVG/이미지 diagram asset 지원: `server/examDatabase.ts`, `client/src/components/arena/ProblemContent.tsx`
    -   [x] 시험/문제 Storage Database 저장: `server/examDatabase.ts`, `server/seedExamCatalog.ts`
    -   [x] 관리자 문제 편집/미리보기: `client/src/screens/admin/*`, `server/index.ts` admin exam APIs
-   [x] Contest 기본 흐름
    -   [x] Anonymous nickname 참가: `client/src/screens/HomeNameEntry.tsx`, `server/index.ts` socket join flow
    -   [x] Casual/Contest room mode: `shared/roomConfig.ts`, `shared/roomLifecycle.ts`
    -   [x] Contest room 최대 인원 200명: `shared/game.ts`, `shared/roomConfig.ts`
    -   [x] 제출 기록, 재시도 횟수, 페널티, 점수 저장: `server/roomDatabase.ts`, `server/scoring.ts`
    -   [x] Live scoreboard: `client/src/screens/RankingsScreen.tsx`, `server/scoring.ts`
    -   [x] Scoreboard freeze: `server/index.ts`, `client/src/screens/RankingsScreen.tsx`
    -   [x] Unfreeze reveal / 성적표 배분: `shared/reveal.ts`, `client/src/screens/ResultsScreen.tsx`, `client/src/screens/FinalReportView.tsx`
-   [x] User Auth / Campaign gate
    -   [x] 고등학교 위치 기반 인증: `client/src/components/ReferralSchoolGate.tsx`, `server/highSchoolGeo.ts`
    -   [x] 지인 전파용 referral URL whitelist: `server/campaignWhitelistDatabase.ts`, `server/campaignDatabase.ts`
    -   [x] username/password 로그인: `server/index.ts`, `server/campaignDatabase.ts`
    -   [x] 신분: 고3 / 재수 / 기타: `shared/campaign.ts`, `server/campaignDatabase.ts`
    -   [x] phone 저장: `server/campaignDatabase.ts`, `server/index.ts`
    -   [x] PG용 payment metadata 저장 슬롯: `server/campaignDatabase.ts`
    -   [x] 캠페인 로그인 토큰: `server/campaignAuth.ts`
-   [x] Ranking / Report 기본 기능
    -   [x] DOMjudge식 순위표: `client/src/screens/RankingsScreen.tsx`, `client/src/styles/shared/domjudge-board.css`
    -   [x] 내 실제 점수와 frozen 공개 순위 분리: `client/src/screens/RankingsScreen.tsx`
    -   [x] 성적통지표: `client/src/screens/FinalReportView.tsx`
    -   [x] 표준점수, 백분위, 등급 계산: `client/src/lib/report.ts`
-   [x] Community / 운영 기능
    -   [x] Spectator flow: `client/src/screens/SpectatorProblemScreen.tsx`, `server/index.ts`
    -   [x] Admin campaign stats: `client/src/components/AdminCampaignStats.tsx`, `server/campaignStatsDatabase.ts`

## 부분 완료 / 정리 필요

-   [ ] Contest rule: edited ICPC 확정
    -   [x] 정답 점수와 누적 페널티 기반 순위
    -   [x] 오답 재시도 페널티
    -   [ ] 객관식=1점/+40분, 주관식=2점/+20분 규칙으로 확정할지 결정
    -   [ ] 현재 `pointValue` 기반 점수와 edited ICPC 규칙의 충돌 정리
-   [ ] User Auth 운영 정보
    -   [x] password hash 저장과 로그인 검증
    -   [x] phone 필드 저장
    -   [x] PG사 metadata 저장 슬롯
    -   [ ] phone: 대회 공지 수신 목적과 보관 기간 결정
    -   [ ] 실제 PG 연동에 필요한 정보 범위 확정
    -   [ ] 개인정보/위치정보 동의 문구
-   [ ] Ranking system
    -   [ ] Tier / ELO
    -   [ ] Half / Full / Half-Killer 모드별 rating 분리
    -   [ ] 비정상 매칭, 소규모 방, 이벤트 방 rating 제외 규칙
-   [ ] Profile decoration
    -   [ ] solved.ac 연동
    -   [ ] Discord 연동
    -   [ ] 시험/이벤트 badge

## 우선순위 Backlog

### P0: 분석 데이터 기반

-   [ ] 제출/문항 분석 테이블
    -   [ ] 문항별 정답률, 오답률, 평균 제출 시간, 평균 풀이 순서 집계
    -   [ ] 유저별 단원/유형/난이도 성과 집계
    -   [ ] 시험별 cohort snapshot 저장
    -   [ ] raw event log와 분석용 aggregate를 분리
-   [ ] 문제 metadata
    -   [ ] 단원 tag
    -   [ ] 유형 tag
    -   [ ] 난이도 tag
    -   [ ] 출처/연도/번호
-   [ ] 성적분포 보정 기반
    -   [ ] 소규모 표본 보정: 평균/분산이 왜곡되지 않도록 최소 표본 수와 confidence 표시
    -   [ ] 이벤트별 raw distribution과 보정 distribution 분리
    -   [ ] 학교/학년/재수 여부 cohort filter를 분석 API에서 공통 지원

### P0: 내 위치 알아보기

-   [ ] 경쟁자와 나 비교하기
    -   [ ] 같은 시험을 본 집단 안에서 내 위치 표시
    -   [ ] 학교/학년/재수 여부 기준 cohort 비교
    -   [ ] 내 강점/약점, 정답 속도, 페널티, 고난도 해결률 비교
    -   [ ] 순위표와 성적통지표에서 "내 위치" 섹션 제공
-   [ ] 성적 분석 화면
    -   [ ] 전체 분포에서 내 위치 표시
    -   [ ] cohort 분포에서 내 위치 표시
    -   [ ] 문항별/단원별/난이도별 성과표
    -   [ ] 보정 전/후 값을 분리 표기

### P0: 성적 분석 + 대학 모의지원

-   [ ] 대학 모의지원 데이터 검증
    -   [ ] 사용할 수 있는 공개 자료만 분리
    -   [ ] 출처, 연도, 업데이트일, 사용 조건 저장
    -   [ ] 비공개/유료 배치표를 그대로 복제하지 않는 정책 작성
    -   [ ] 자료별 신뢰도와 누락 범위 표시
-   [ ] 실제 배치표 자료 수집 파이프라인
    -   [ ] 공개 가능한 배치표/입시 결과 자료 출처 목록화
    -   [ ] 자료별 연도, 과목 조합, 표준점수/백분위/등급 산식 metadata 저장
    -   [ ] 저작권/사용 가능 범위 확인
    -   [ ] 관리자 업로드/검수 화면
-   [ ] 집단 성적 분포 보정
    -   [ ] KICE Arena 참가자 표본과 실제 수험생 분포의 차이 추정
    -   [ ] 상위권 과대표집, 학교별 편향, 이벤트 난이도 차이 보정
    -   [ ] 보정 전/후 결과를 사용자에게 분리 표기
-   [ ] 대학 모의지원
    -   [ ] 대학/학과/전형/반영비/가산점 데이터 모델
    -   [ ] 내 환산점수 계산
    -   [ ] 안정/적정/소신/위험 구간 표시
    -   [ ] 지원 가능성은 확률처럼 과장하지 않고 근거 자료와 한계 함께 표시

### P1: 취약점 맞춤 문제

-   [ ] 취약점 추천 MVP
    -   [ ] 최근 3회 시험에서 오답률 높은 tag 추출
    -   [ ] 맞혔지만 제출 시간이 긴 tag 추출
    -   [ ] 해당 tag의 미풀이 기출 10문항 추천
    -   [ ] 추천 사유를 문항 카드에 표시
-   [ ] 지금까지 기록을 바탕으로 기출문제 추천
    -   [ ] 문항별 단원/유형/난이도/출처 tag 정규화
    -   [ ] 오답, 지연 정답, 건너뜀, 반복 실수 패턴 집계
    -   [ ] 약점별 추천 queue 생성
    -   [ ] 추천 사유 표시: "왜 이 문제를 풀어야 하는지"
    -   [ ] 이미 푼 문제, 너무 쉬운 문제, 같은 유형 과다 추천 방지
-   [ ] 복습 세션
    -   [ ] 10문항 약점 세트
    -   [ ] 최근 대회 오답 세트
    -   [ ] 고난도 killer 세트

### P1: Virtual Gym 확장

-   [ ] Megapass virtual gym 홈
    -   [ ] 오늘의 추천 시험
    -   [ ] 내 최근 기록
    -   [ ] 경쟁자/학교별 leaderboard
    -   [ ] 예정 contest와 지난 contest archive
-   [ ] AI 약점분석
    -   [ ] 먼저 rule-based 분석으로 시작
    -   [ ] 충분한 로그와 태그가 쌓인 뒤 LLM 요약 추가
    -   [ ] 분석 문구가 과장되지 않도록 근거 문항 링크 포함

### P2: 운영 / 수익화 준비

-   [ ] 대회 공지/알림 채널
    -   [ ] phone 또는 Discord 중 최소 수집 방식 결정
    -   [ ] 수신 동의/철회 흐름
-   [ ] 결제/PG 연동
    -   [ ] 유료 contest, premium analysis, 대학 모의지원 중 어떤 상품부터 할지 결정
    -   [ ] 환불/취소/영수증 정책
-   [ ] 데이터 품질 운영
    -   [ ] 배치표 자료 versioning
    -   [ ] 문제 tag review queue
    -   [ ] 성적분포 보정식 변경 로그

## 검증 규칙

-   [ ] 로직 변경 시 대상 파일과 같은 디렉토리의 단위 테스트를 추가/수정한다.
-   [ ] 브라우저 흐름 회귀만 `tests/e2e/*.spec.ts`에 둔다.
-   [ ] UI 변경은 모바일/데스크톱을 모두 확인한다.
-   [ ] "speedup" 변경은 benchmark 없이 완료로 표시하지 않는다.
-   [ ] 완료 체크는 코드, 테스트, 또는 명확한 운영 문서가 있을 때만 한다.
