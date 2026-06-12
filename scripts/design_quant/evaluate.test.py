from __future__ import annotations

from pathlib import Path
import unittest

from evaluate import evaluate


class DesignQuantTest(unittest.TestCase):
    def test_ambiguous_primary_action_needs_revision(self) -> None:
        manifest = {
            "route": "home",
            "elements": [
                {
                    "id": "cta",
                    "role": "primary_action",
                    "text": "몰입형 실시간 경험",
                    "bbox": [0, 0, 120, 32],
                    "signals": ["copy", "ornament"],
                }
            ],
        }

        report = evaluate(manifest, root=Path.cwd())

        self.assertIn(report["decision"], {"revise", "fail"})
        self.assertLess(report["scores"]["role_entropy_score"], 0.5)
        self.assertLess(report["scores"]["copy_score"], 0.9)

    def test_clear_elements_can_pass_without_screenshots(self) -> None:
        manifest = {
            "route": "home",
            "viewport": {"width": 360, "height": 640},
            "backgroundColor": "#f7f5ef",
            "palette": ["#f7f5ef", "#1f2933", "#2f6473", "#b91c1c"],
            "typographyScale": [14, 16, 20],
            "elements": [
                {
                    "id": "title",
                    "role": "content",
                    "text": "수학 영역",
                    "bbox": [40, 40, 280, 72],
                    "signals": ["problem"],
                    "color": "#1f2933",
                    "backgroundColor": "#f7f5ef",
                    "fontSize": 20,
                },
                {
                    "id": "create-room",
                    "role": "primary_action",
                    "text": "시험실 만들기",
                    "bbox": [40, 220, 280, 48],
                    "signals": ["action", "primary", "verb", "exam_room"],
                    "color": "#ffffff",
                    "backgroundColor": "#2f6473",
                    "accentColor": "#2f6473",
                    "fontSize": 16,
                },
                {
                    "id": "room-code",
                    "role": "input",
                    "text": "입장 코드",
                    "bbox": [40, 140, 280, 48],
                    "signals": ["field", "identity", "omr"],
                    "color": "#1f2933",
                    "backgroundColor": "#f7f5ef",
                    "borderColor": "#2f6473",
                    "fontSize": 14,
                },
                {
                    "id": "notice",
                    "role": "status",
                    "text": "공개 순위는 종료 10분 전 고정됩니다",
                    "bbox": [40, 292, 280, 40],
                    "signals": ["state", "timer"],
                    "color": "#1f2933",
                    "backgroundColor": "#f7f5ef",
                    "fontSize": 14,
                },
            ],
        }

        report = evaluate(manifest, root=Path.cwd())

        self.assertGreater(report["scores"]["geometry_score"], 0.9)
        self.assertGreater(report["scores"]["copy_score"], 0.9)
        self.assertEqual(report["aestheticDecision"], "aesthetically_good")

    def test_aesthetic_gate_catches_visual_noise(self) -> None:
        elements = []
        for index in range(10):
            elements.append(
                {
                    "id": f"badge-{index}",
                    "role": "decoration",
                    "text": "AI 기반 몰입형 플랫폼",
                    "bbox": [15 + index * 23, 18 + index * 17, 110, 24],
                    "signals": ["ornament", "badge", "card", "unrelated_accent"],
                    "color": "#8a7cf6",
                    "backgroundColor": "#7c2d12",
                    "fontSize": 11,
                }
            )
        elements.append(
            {
                "id": "cta",
                "role": "primary_action",
                "text": "실시간 경험",
                "bbox": [12, 18, 110, 30],
                "signals": ["copy", "ornament"],
                "color": "#8a7cf6",
                "backgroundColor": "#7c2d12",
                "fontSize": 11,
            }
        )
        manifest = {
            "route": "home",
            "viewport": {"width": 360, "height": 640},
            "palette": ["#8a7cf6", "#7c2d12", "#06b6d4", "#f97316", "#84cc16", "#ef4444", "#a855f7"],
            "emphasisStyles": ["shadow", "glow", "gradient", "badge", "card", "outline"],
            "elements": elements,
        }

        report = evaluate(manifest, root=Path.cwd())

        self.assertIn(report["decision"], {"revise", "fail"})
        self.assertNotEqual(report["aestheticDecision"], "aesthetically_good")
        self.assertLess(report["scores"]["contrast_score"], 0.8)


if __name__ == "__main__":
    unittest.main()
