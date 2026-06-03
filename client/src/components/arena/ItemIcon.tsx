import { EyeOff, FileText, Flag, ShieldAlert, Zap } from "lucide-react";
import type { ItemId } from "../../../../shared/game";

export function ItemIcon({ itemId, size = 16 }: { itemId: ItemId; size?: number }) {
  if (itemId === "cover") return <EyeOff size={size} />;
  if (itemId === "hardFirst") return <Flag size={size} />;
  if (itemId === "meme") return <FileText size={size} />;
  if (itemId === "penLock") return <ShieldAlert size={size} />;
  return <Zap size={size} />;
}
