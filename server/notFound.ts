import type { RequestHandler } from "express";

export const apiNotFoundBody = { error: "API route not found." } as const;

export const apiNotFound: RequestHandler = (_req, res) => {
    res.status(404).json(apiNotFoundBody);
};
