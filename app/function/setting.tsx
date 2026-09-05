import type { TableSettings } from "~/model/table";
import { api } from "../hooks/api";
import { pushError } from "~/components/error_popout";

export async function fetchSettings() {
    try {
        const res = await api.get("/api/system/settings").json<TableSettings>();
        return res;
    }
    catch (e) {
        pushError(e, "Fetch Settings");
        throw e;
    }
}


export async function updateSettings(config: Record<string, any>) {
    if (!config) throw new Error("No config provided");

    try {
        const res = await api.post("/api/init/settings", { json: config }).json<TableSettings>();
        return res;
    }
    catch (e) {
        pushError(e, "Update settings");
        throw e;
    }
}