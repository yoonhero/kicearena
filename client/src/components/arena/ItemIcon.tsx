import { EyeOff, FileText, Flag, Music2, RotateCw, ShieldAlert, Sparkles, Zap } from "lucide-react";
import type { ItemId } from "../../../../shared/game";

export function ItemIcon({ itemId, size = 16 }: { itemId: ItemId; size?: number }) {
    if (itemId === "cover") return <EyeOff size={size} />;
    if (itemId === "rotateProblem") return <RotateCw size={size} />;
    if (itemId === "hardFirst") return <Flag size={size} />;
    if (itemId === "meme") return <FileText size={size} />;
    if (itemId === "penLock") return <ShieldAlert size={size} />;
    if (itemId === "bannedSong") return <Music2 size={size} />;
    if (itemId === "auraMinus") return <Sparkles size={size} />;
    if (itemId === "adviceNote") return <FileText size={size} />;
    return <Zap size={size} />;
}
