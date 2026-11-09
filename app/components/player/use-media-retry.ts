import { useEffect, useRef, useState } from "react";
import type { MediaErrorDetail } from "@vidstack/react";

const RETRY_LIMIT = 6;

// A new attempt requests the original file URL again, including its HLS redirect.
export function useMediaRetry(uid: number, active = true) {
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState<MediaErrorDetail | null>(null);
    const failures = useRef(0);
    const ready = useRef(false);
    const retrying = Boolean(error && !ready.current && error.code !== 3 && failures.current < RETRY_LIMIT);

    useEffect(() => {
        failures.current = 0;
        ready.current = false;
        setError(null);
    }, [uid]);

    useEffect(() => {
        if (active) {
            failures.current = 0;
            ready.current = false;
        }
    }, [active]);

    useEffect(() => {
        if (!active || !retrying) return;
        const timer = setTimeout(() => {
            failures.current += 1;
            setError(null);
            setAttempt((value) => value + 1);
        }, Math.min(1000 * 2 ** failures.current, 8000));
        return () => clearTimeout(timer);
    }, [active, error, retrying]);

    return {
        attempt,
        error,
        retrying,
        onError: setError,
        onPlaying: () => {
            ready.current = true;
            setError(null);
        },
        retry: () => {
            failures.current = 0;
            ready.current = false;
            setError(null);
            setAttempt((value) => value + 1);
        },
    };
}
