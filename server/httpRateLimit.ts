export type HttpRateLimitBucket = {
    count: number;
    resetAt: number;
};

export type HttpRateLimitStore = Map<string, HttpRateLimitBucket>;

export const shouldRateLimitHttp = (
    store: HttpRateLimitStore,
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
) => {
    const current = store.get(key);
    if (!current || current.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }

    current.count += 1;
    return current.count > limit;
};

export const pruneHttpRateLimitStore = (store: HttpRateLimitStore, now = Date.now()) => {
    for (const [key, bucket] of store.entries()) {
        if (bucket.resetAt <= now) store.delete(key);
    }
};
