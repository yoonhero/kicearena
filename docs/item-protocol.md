# Item 추가 Protocol

이 문서는 새 아이템을 추가할 때 따라야 하는 고정 절차다. 목표는 아이템 정의, 서버 검증, 클라이언트 표시, 만료/쿨다운 상태가 서로 어긋나지 않게 하는 것이다.

## 1. 공유 정의를 먼저 추가한다

1. `shared/game.ts`의 `ITEM_IDS`에 새 `ItemId`를 추가한다.
2. 같은 파일의 `ITEM_DEFINITIONS` keyed object에 같은 key로 정의를 추가한다.
3. `defineItems`가 `ITEM_IDS`와 `ITEM_DEFINITIONS`의 누락을 컴파일 단계에서 잡아야 한다. `as Record<ItemId, ...>` 같은 강제 캐스팅으로 우회하지 않는다.
4. 정의에는 반드시 다음 정보를 채운다.
    - `id`: `ITEM_IDS`에 추가한 값과 동일해야 한다.
    - `name`, `shortName`, `description`: 인벤토리와 타겟 선택 UI에서 쓰인다.
    - `category`: 문제 방해, 입력 방해, 집중 방해, 소셜 등 분류.
    - `effectKind`: 실제 효과 렌더링/서버 payload 분기에 쓰는 semantic key.
    - `lifecycle`: `acquire`, `activate`, `durationMs`, `cooldownMs`, `target`, `duplicate`, `cancellation`.
    - `payload`: 쪽지처럼 추가 입력이 필요한 아이템에만 둔다.

## 2. Lifecycle 정책을 명시한다

현재 lifecycle은 다음 의미를 가진다.

- `acquire: "award"`: 정답 처리 후 서버가 인벤토리에 지급한다.
- `activate: "instant"`: `item:use` 이벤트가 성공하면 즉시 대상에게 효과를 적용한다.
- `durationMs`: 대상의 `effects`에 남아 있는 시간.
- `cooldownMs`: 사용자의 `itemCooldowns`에 기록되는 재사용 대기 시간. 0이어도 명시적으로 lifecycle에 포함된다.
- `target`: `"opponent"` 또는 `"eligibleUnsolved"`.
- `duplicate`: `"blockWhileActive"` 또는 `"refresh"`.
- `cancellation: "expire"`: 서버 cleanup이 만료된 효과를 제거하고 짧게 `expiredEffects`로 공개한다.

새 target policy, duplicate policy, cancellation 방식이 필요하면 enum만 늘리지 말고 서버 검증과 UI 상태 표시까지 함께 추가한다.

## 3. 서버 검증을 먼저 통과시킨다

서버는 `server/index.ts`의 `item:use` 흐름이 최종 권한이다. 클라이언트에서 버튼을 비활성화해도 서버 검증을 생략하지 않는다.

확인해야 할 지점:

- `validateItemTarget`: 새 `target` 정책이 있으면 여기서 대상 가능 여부를 검증한다.
- `activeEffectForItem`: 중복 효과 차단/갱신 정책이 의도대로 동작하는지 확인한다.
- `itemCooldowns`: `cooldownMs > 0`인 아이템은 사용 성공 후 서버 상태에 ready time을 기록한다.
- `expiredEffects`: 만료된 아이템 효과는 cleanup에서 짧게 공개되어 UI가 `만료` 상태를 표시할 수 있어야 한다.
- payload가 필요한 아이템은 서버에서 길이 제한과 조건을 다시 검증한다.
- 인벤토리 차감은 모든 검증이 끝난 뒤에만 수행한다.

## 4. 클라이언트 affordance를 연결한다

아이템은 최소 네 가지 상태를 UI에서 구분해야 한다.

- available: `inventory`에 있고 cooldown이 없어서 선택 가능한 상태.
- active: 대상의 `effects`에 같은 아이템이 살아 있는 상태.
- blocked: self target, 조건 미충족, 중복 차단, cooldown 등으로 사용할 수 없는 상태.
- expired: 대상의 `expiredEffects`에 방금 만료된 효과가 남아 있는 상태.

확인해야 할 지점:

- `client/src/components/arena/ItemIcon.tsx`: 새 `ItemId` 아이콘 추가.
- `client/src/components/arena/ItemDock.tsx`: cooldown, target policy, duplicate policy, expired tag 표시.
- `client/src/screens/ArenaScreen.tsx`: payload prompt가 필요하면 `ITEM_DEFINITIONS[itemId].payload`를 사용한다.
- `client/src/components/arena/ProblemSheet.tsx`: 문제 이미지, 입력창, 오버레이 등에 영향을 주는 효과 렌더링.
- `client/src/styles.css`: 아이콘 버튼, disabled/cooldown, overlay가 모바일/데스크톱에서 레이아웃을 깨지 않는지 확인.

## 5. 효과 렌더링은 `effectKind` 기준으로 설계한다

단순히 `itemId` 조건문을 늘릴 수는 있지만, 새 아이템이 많아질수록 `effectKind` 중심으로 묶는 편이 좋다.

권장 기준:

- 같은 시각 효과를 공유하는 아이템은 같은 `effectKind`를 재사용한다.
- 완전히 새 효과면 `ItemEffectKind`를 추가하고, 서버 payload와 클라이언트 렌더링을 함께 연결한다.
- 문제 이미지 transform은 답안 입력 영역을 밀거나 가리지 않아야 한다.
- 입력 잠금류는 클라이언트 표시와 별개로 `answer:submit` 서버 검증도 필요하다.

## 6. 검증 체크리스트

새 아이템을 추가한 뒤 최소한 다음을 확인한다.

1. `npm run build`
2. `npm test`
3. 로컬 앱에서 방 생성 후 아이템 지급/사용 흐름 수동 확인
4. 서버가 보유하지 않은 아이템, 자기 자신 대상, 조건 미충족, 중복 효과, cooldown을 거부하는지 확인
5. 효과가 `durationMs` 이후 사라지고 `expiredEffects` 상태가 짧게 표시되는지 확인
6. 모바일 폭에서 인벤토리 버튼, target bank, overlay text가 겹치지 않는지 확인

## 7. Todo 체크 기준

`todo.md`는 실제 구현과 검증이 끝난 항목만 체크한다.

- lifecycle 타입만 추가하고 cooldown 동작이 없으면 lifecycle 완료로 보지 않는다.
- 서버 검증 없이 클라이언트 버튼만 막은 경우 server-side validation 완료로 보지 않는다.
- `expiredEffects`나 이에 준하는 표시가 없으면 expired UI 완료로 보지 않는다.
- 시각 효과가 추가됐더라도 recovery/cleanup 확인 전에는 item 구현 완료로 보지 않는다.
