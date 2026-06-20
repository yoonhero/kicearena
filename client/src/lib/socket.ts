import { io, type Socket } from "socket.io-client";
import type { ServerResponse } from "../../../shared/game";

export const socket: Socket = io({
    transports: ["websocket"],
});

const callback =
    <T>(resolve: (value: ServerResponse<T>) => void) =>
    (response: ServerResponse<T>) =>
        resolve(response);

export const emitWithAck = <T>(event: string, payload?: unknown) =>
    new Promise<ServerResponse<T>>((resolve) => {
        if (payload === undefined) socket.emit(event, callback(resolve));
        else socket.emit(event, payload, callback(resolve));
    });

export const emitWithEmptyPayloadAck = <T>(event: string) =>
    new Promise<ServerResponse<T>>((resolve) => {
        socket.emit(event, {}, callback(resolve));
    });
