# User Flow Verification

Last checked: 2026-06-19

This document splits the current KICE Arena service composition into user-facing
flows and records the evidence needed to verify each one. The page model is:

- `/`: short service-purpose landing page.
- `/competition`: public competition list. `/contest` and `/compeition` remain aliases.
- `/?c=snu226`: referral invite, location authentication, then internal signup.
- `/profile`: admission-ticket style profile.
- `/admin`: token-gated admin entry.
- `/login`: direct login.
- `/signup`: no direct public exposure.

## Flow Cases

| Case                                  | Entry                                    | Expected process                                                          | Verified evidence                                                                                                | Status   |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| New visitor understands service       | `/`                                      | Purpose copy -> competition CTA                                           | Browser: `h1=KICE Arena`, nav has home/competition/profile/login, CTA changes URL to `/competition`              | Verified |
| Competition browsing                  | `/competition`                           | List events -> register or spectate                                       | Browser: `h1=대회 목록`, visible event rows and action buttons, no horizontal overflow on 1280px and 390px       | Verified |
| Typo/back-compat competition link     | `/compeition`, `/contest`                | Resolve to the same competition list                                      | Browser: both routes render `h1=대회 목록`                                                                       | Verified |
| Referral invite before authentication | `/?c=snu226` with no stored ticket       | Show invite URL -> OMR nickname -> location authentication -> exit option | Browser: `h1=초대 링크 확인`, full invite URL visible, copy feedback becomes `복사됨`, no global signup exposure | Verified |
| Referral after authentication         | `/?c=snu226` with stored referral ticket | Skip location gate -> internal signup form                                | Browser localStorage ticket: route renders `h1=응시 원서` and signup form                                        | Verified |
| Signup and email verification         | Internal signup after referral           | OMR nickname -> username/email/password -> required consents -> profile   | Local server: unique account registered, dev verification code accepted, redirected to `/profile` with ticket    | Verified |
| Signup direct exposure                | `/signup`                                | Do not expose signup by direct URL                                        | Browser: renders 404 page; unit test asserts `getPageRoute('/signup') === 'not-found'`                           | Verified |
| Empty profile                         | `/profile` with no saved user            | Show admission-ticket shell and route back to competition                 | Browser: `h1=나의 수험표`, 미발급 ticket, `대회 목록 보기` action                                                | Verified |
| Saved profile                         | `/profile` with saved verified user      | Show admission-ticket style stored profile                                | Browser localStorage user: saved ticket shows school, status, referral code, username                            | Verified |
| Login                                 | `/login`                                 | Username/password form -> profile on success                              | Local server: same verified account logged in and redirected to `/profile`                                       | Verified |
| Public competition entry              | `/competition`                           | Open event -> register/spectate -> room/rank screen                       | Local server: `지금 응시하기` entered the live event ranking screen with no error                                | Verified |
| Invite room link                      | `/?room=ABCDE`                           | OMR nickname -> room join                                                 | Local server: socket-created room joined from `?room=CODE`; mobile route reached lobby with two players          | Verified |
| Admin                                 | `/admin`                                 | Token gate before admin data requests                                     | Browser: token gate appears before editor; server requires configured `ADMIN_TOKEN` and matching `x-admin-token` | Verified |

## Issues Found And Fixed

- Referral invite page did not expose the invite URL as a first-class object and
  had no `h1`. Fixed in `client/src/components/ReferralSchoolGate.tsx` and
  `client/src/styles/home/referral-gate.css`.
- The direct `/signup` invariant was implicit only. Added a router test in
  `client/src/pageRouter.test.ts`.
- Invite-room join succeeded, but the lobby page had no `h1` because the exam
  title was rendered as `strong`. Fixed in `client/src/screens/LobbyScreen.tsx`
  and shared exam-head CSS.
- Admin UI gating was not enough: without `ADMIN_TOKEN`, local admin APIs were
  reachable from private-network requests. Fixed `server/index.ts` so admin API
  access always requires a configured `ADMIN_TOKEN` and a matching
  `x-admin-token` header.

## Remaining Verification Gaps

- Production reverse-proxy Basic Auth remains a deployment-level check outside
  this local page-flow pass.
- Existing full E2E tests still cover the older room-creation home flow; they
  should be split or updated so page-composition tests do not depend on the old
  landing assumptions.
