import { memo, type ReactNode } from "react";
import type { ProblemBodyBlock, ProblemPublic } from "../../../../shared/game";
import { MathHtml } from "../common/MathHtml";

export const ProblemContent = memo(function ProblemContent({ problem }: { problem: ProblemPublic }) {
  if (!problem.body?.length && problem.imageUrl) {
    return <img src={problem.imageUrl} alt={`${problem.sourceNumber ?? problem.number}번 문제`} />;
  }

  return (
    <article className="kice-problem-content" aria-label={`${problem.number}번 문제`}>
      <div className="kice-problem-body">
        {(problem.body ?? []).map((block, index) => (
          <ProblemBlock key={`${block.kind}-${index}`} block={block} />
        ))}
      </div>
    </article>
  );
});

const ProblemBlock = memo(function ProblemBlock({ block }: { block: ProblemBodyBlock }) {
  if (block.kind === "paragraph") {
    return (
      <p className="kice-problem-paragraph">
        {renderInlineMath(block.text, block.inlineMath)}
      </p>
    );
  }

  if (block.kind === "displayMath") {
    return <MathHtml className="kice-display-math" latex={block.latex} displayMode />;
  }

  if (block.kind === "choices") {
    return null;
  }

  if (block.kind === "diagram") {
    return (
      <figure className="kice-diagram">
        <img src={block.src} alt={block.alt} />
        {block.caption && <figcaption>{block.caption}</figcaption>}
      </figure>
    );
  }

  return <p className="kice-problem-note">{block.text}</p>;
});

function renderInlineMath(text: string, inlineMath: string[] = []) {
  const parts = text.split("{}");
  return parts.flatMap((part, index) => {
    const nodes: ReactNode[] = [part];
    const latex = inlineMath[index];
    if (latex) nodes.push(<MathHtml key={`${latex}-${index}`} latex={latex} />);
    return nodes;
  });
}
