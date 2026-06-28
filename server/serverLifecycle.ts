import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import type { Server as SocketServer } from "socket.io";
import type { createExamCatalogPool } from "./examDatabase.js";

export type RedisSocketClients = {
    pubClient: RedisClientType;
    subClient: RedisClientType;
};

export const configureSocketAdapter = async (
    io: SocketServer,
    setRedisClients: (clients: RedisSocketClients) => void,
) => {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return;

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    pubClient.on("error", (error) => {
        console.error("Socket.IO Redis pub client error.", error);
    });
    subClient.on("error", (error) => {
        console.error("Socket.IO Redis sub client error.", error);
    });
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    setRedisClients({ pubClient, subClient });
    console.log("Socket.IO Redis adapter enabled.");
};

export const startServer = async ({
    refreshExamCatalog,
    restoreRoomsFromDatabase,
    configureAdapter,
    httpServer,
    port,
}: {
    refreshExamCatalog: () => Promise<void>;
    restoreRoomsFromDatabase: () => Promise<void>;
    configureAdapter: () => Promise<void>;
    httpServer: HttpServer;
    port: number;
}) => {
    await refreshExamCatalog();
    await restoreRoomsFromDatabase();
    await configureAdapter();
    httpServer.listen(port, () => {
        console.log(`KICE 아레나 server listening on http://localhost:${port}`);
    });
};

export const shutdownServer = async ({
    getRedisClients,
    getExamCatalogPool,
}: {
    getRedisClients: () => RedisSocketClients | null;
    getExamCatalogPool: () => ReturnType<typeof createExamCatalogPool> | null;
}) => {
    const redisClients = getRedisClients();
    await Promise.all(
        [redisClients?.pubClient.quit(), redisClients?.subClient.quit()].filter(Boolean),
    );
    await getExamCatalogPool()?.end();
    process.exit(0);
};
