import { useQuery } from "@tanstack/react-query";
import { api } from "~/hooks/api";

export function useFileInfo(uid: number | null | undefined) {
    return useQuery({
        queryKey: ["file-info", uid],
        enabled: typeof uid === "number" && uid > 0,
        queryFn: () => api.get(`/api/file/info/${uid}`).json<{ uid: number; exist: boolean; path: string }>(),
        staleTime: 15000,
    });
}
