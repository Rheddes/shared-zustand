import { StoreApi, StoreMutators } from "zustand";

export function isSupported() {
    return "BroadcastChannel" in globalThis;
}

type SubscribeWithSelector<S> = StoreMutators<S, unknown>["zustand/subscribeWithSelector"];

interface EventData {
    timestamp: number;
    state: unknown;
}
interface Options {
    ref: string;
    initialize: boolean;
}
export function share<TState, K extends keyof TState>(
    key: K,
    api: SubscribeWithSelector<StoreApi<TState>>,
    { ref = "shared-", initialize = false }: Partial<Options> = {}
): [() => void, () => void] {
    const channelName = ref + "-" + key.toString();

    let channel = new BroadcastChannel(channelName);
    let externalUpdate = false;
    let timestamp = 0;

    let cleanup = api.subscribe(
        (state) => state[key],
        (state) => {
            if (!externalUpdate) {
                timestamp = Date.now();
                channel.postMessage({ timestamp, state });
            }
            externalUpdate = false;
        }
    );
    channel.onmessage = (evt: MessageEvent<EventData>) => {
        if (evt.data === undefined) {
            channel.postMessage({ timestamp: timestamp, state: api.getState()[key] });
            return;
        }
        if (evt.data.timestamp <= timestamp) {
            return;
        }
        externalUpdate = true;
        timestamp = evt.data.timestamp;
        api.setState({ [key as K]: evt.data.state as TState[K] } as unknown as Partial<TState>);
    };

    const sync = () => channel.postMessage(undefined);
    const unshare = () => {
        channel.close();
        cleanup();
    };

    // fetches any available state
    if (initialize) {
        sync();
    }
    return [sync, unshare];
}
