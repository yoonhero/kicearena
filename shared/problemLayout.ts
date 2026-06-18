export const isTallProblemImage = (width: number, height: number, threshold = 1.35) =>
    height / Math.max(1, width) > threshold;
