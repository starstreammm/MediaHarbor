import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ModelHealthStatus, ApiHealthStatus } from "../model/status";

export function useStatus() {
    const query = useQuery({
        queryKey: ['status'],
        queryFn: async () => {
            try {
                const model_res = await api.get("/api/health/module").json<ModelHealthStatus>();
                const api_res = await api.get("/api/health/api").json<ApiHealthStatus>();

                if (model_res?.statistic && model_res?.delete && model_res?.queue)
                    model_res.base = true;

                for (const key in api_res) {
                    if (api_res[key as keyof ApiHealthStatus] !== null) {
                        model_res.apis = true;
                        break;
                    }
                }

                return {
                    model_status: model_res ?? {},
                    api_status: api_res ?? {},
                };
            }
            catch (e) { return {}; }
        },
        retry: 0,
        refetchInterval: 8000,
        refetchIntervalInBackground: true,

        enabled: typeof window !== "undefined",
    });

    return query;
}
