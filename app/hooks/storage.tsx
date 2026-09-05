import { useState, useEffect } from "react";

type StorageType = "local" | "session";

export function useLocalStorage<T>(key: string, defaultValue: T, type: StorageType = "local") {
    const isBrowser = typeof window !== "undefined";
    const storage = isBrowser
        ? type === "local"
            ? localStorage
            : sessionStorage
        : null;

    const [state, setState] = useState<T>(() => {
        if (!isBrowser || !storage) return defaultValue;

        try {
            const stored = storage.getItem(key);
            return stored ? (JSON.parse(stored) as T) : defaultValue;
        }
        catch {
            return defaultValue;
        }
    });

    useEffect(() => {
        if (!isBrowser || !storage) return;

        try {
            storage.setItem(key, JSON.stringify(state));
        } catch {
            // Handle storage errors (e.g., quota exceeded)
        }
    }, [key, state, storage]);

    const remove = () => {
        if (!isBrowser || !storage) return null;

        storage.removeItem(key);
        setState(defaultValue);
    };

    return [state, setState, remove] as const;
}

export function getLocalStorage(key: string, type: StorageType) {
    if (typeof window === "undefined") return;
    const storage = type === "local" ? localStorage : sessionStorage;
    try {
        const stored = (storage.getItem(key) as string | null)?.replaceAll('\"', '') ?? '';
        return stored ? stored : new Error("Key not found in storage: " + key);
    }
    catch {
        new Error("Failed to get localStorage item: " + key);
    }
}
