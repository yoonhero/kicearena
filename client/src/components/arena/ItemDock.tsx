import { useMemo } from "react";
import { Zap } from "lucide-react";
import { ITEM_DEFINITIONS, type ItemId, type PlayerPublic, type RoomPublic } from "../../../../shared/game";
import { formatEffectSeconds } from "../../lib/format";
import { compareStandings, makePlayerStandingRows } from "../../lib/report";
import { ItemIcon } from "./ItemIcon";

export function ItemDock({
  room,
  ownPlayer,
  selectedItem,
  setSelectedItem,
  useItem
}: {
  room: RoomPublic;
  ownPlayer: PlayerPublic;
  selectedItem: ItemId | null;
  setSelectedItem: (itemId: ItemId | null) => void;
  useItem: (itemId: ItemId, targetPlayerId: string) => Promise<void>;
}) {
  const groupedInventory = useMemo(
    () =>
      ownPlayer.inventory.reduce<Array<{ itemId: ItemId; count: number }>>((groups, itemId) => {
        const group = groups.find((entry) => entry.itemId === itemId);
        if (group) group.count += 1;
        else groups.push({ itemId, count: 1 });
        return groups;
      }, []),
    [ownPlayer.inventory]
  );
  const selectedItemDefinition = selectedItem ? ITEM_DEFINITIONS[selectedItem] : null;
  const standings = makePlayerStandingRows(room);
  const leaderId = standings[0]?.playerId ?? null;
  const suggestedTargetId =
    selectedItem && room.players.length > 1
      ? standings.filter((standing) => standing.playerId !== ownPlayer.id).sort(compareStandings)[0]?.playerId
      : null;
  const targets = [...room.players].sort((a, b) => (a.id === ownPlayer.id ? 1 : b.id === ownPlayer.id ? -1 : a.nickname.localeCompare(b.nickname)));

  return (
    <section className={`item-dock ${selectedItem ? "aiming" : ""}`}>
      <div className="item-bank" aria-label="보유 아이템">
        {ownPlayer.inventory.length === 0 ? (
          <span className="empty-inventory" title="고난도·첫 풀이·추격 상황에서 지급 확률 상승">
            <Zap size={16} />
          </span>
        ) : (
          groupedInventory.map(({ itemId, count }) => {
            const item = ITEM_DEFINITIONS[itemId];
            return (
              <button
                key={itemId}
                className={`item-token ${selectedItem === itemId ? "selected" : ""}`}
                onClick={() => setSelectedItem(selectedItem === itemId ? null : itemId)}
                title={`${item.name}: ${item.description} 클릭 후 대상을 선택합니다.`}
                aria-pressed={selectedItem === itemId}
              >
                <ItemIcon itemId={itemId} size={20} />
                {count > 1 && <em>x{count}</em>}
              </button>
            );
          })
        )}
      </div>
      {selectedItemDefinition && (
        <div className="target-bank" aria-label={`${selectedItemDefinition.name} 적용 대상`}>
          <strong>
            <ItemIcon itemId={selectedItemDefinition.id} size={16} />
            {selectedItemDefinition.shortName}
          </strong>
          {targets.map((player) => {
            const activeEffects = player.effects.filter((effect) => effect.expiresAt > Date.now());
            const sameEffect = activeEffects.find((effect) => effect.id === selectedItemDefinition.id);
            const targetTags = [
              player.id === ownPlayer.id ? "나" : "",
              player.id === leaderId && room.players.length > 1 ? "선두" : "",
              sameEffect ? `효과중 ${formatEffectSeconds(sameEffect.expiresAt)}` : ""
            ].filter(Boolean);
            return (
              <button
                key={player.id}
                className={`target-chip ${player.id === ownPlayer.id ? "self" : ""} ${player.id === suggestedTargetId ? "suggested" : ""}`}
                onClick={() => void useItem(selectedItemDefinition.id, player.id)}
                title={`${selectedItemDefinition.name} 사용`}
              >
                <span>{player.nickname}</span>
                <strong>{player.score}</strong>
                {targetTags.map((tag) => (
                  <small key={tag}>{tag}</small>
                ))}
                {activeEffects.length > 0 && <em>{activeEffects.length}</em>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
