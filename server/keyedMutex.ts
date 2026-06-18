export class KeyedMutex {
    private queues = new Map<string, Promise<void>>();

    async run<T>(key: string, task: () => Promise<T>): Promise<T> {
        const previous = this.queues.get(key) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const next = previous.catch(() => undefined).then(() => current);
        this.queues.set(key, next);

        await previous.catch(() => undefined);
        try {
            return await task();
        } finally {
            release();
            if (this.queues.get(key) === next) this.queues.delete(key);
        }
    }
}
