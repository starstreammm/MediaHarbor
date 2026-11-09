export const NORMAL_SPEEDS = [0.5, 1, 1.5, 2, 3, 5] as const;
export const SHUTTLE_SPEEDS = [-5, -3, -2, -1, 1, 2, 3, 5] as const;
export const PLAYER_CONFIG = {
    tapTolerance: 10,
    mouseRevealThreshold: 16,
    doubleTapDelay: 280,
    doubleTapDistance: 30,
    holdDelay: 350,
    directionThreshold: 15,
    navigationThreshold: 60,
    speedLockThreshold: 60,
    speedLockHysteresis: 10,
    directionDominance: 1.3,
    seekSensitivity: 0.5,
    controlsTimeout: 3000,
    feedbackDuration: 800,
    rulerDuration: 1200,
    loadingDelay: 200,
    scrubReleaseDelay: 300,
    reverseInterval: 100,
    reverseSeekTimeout: 2000,
    fallbackFps: 30,
};

export function timestamp(time: number, precise = false): string {
    if (!Number.isFinite(time)) return "Live";
    const seconds = Math.max(0, time);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const rest = Math.floor(seconds % 60);
    return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}${precise ? `.${String(Math.floor(seconds % 1 * 1000)).padStart(3, "0")}` : ""}`;
}

export type MediaNavigation = {
    fileIndex: number;
    fileCount: number;
    onFile: (index: number) => void;
    onPost: (direction: number) => boolean;
    onClose: () => void;
};
