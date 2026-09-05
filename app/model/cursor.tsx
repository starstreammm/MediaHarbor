import type { Platform } from "./enum";


export const Perpage = [10, 20, 50, 100] as const;
export type Perpage = typeof Perpage[number];

export const SortType = [
    "alias",
    "alias DESC",
    "post_time",
    "post_time DESC",
    "create_time",
    "create_time DESC",
    "rate",
    "rate DESC",
    "platform",
] as const;
export type SortType = typeof SortType[number];

export const DefaultCursor: CursorGet = {
    page: 1,
    per_page: 20,
    sort: "create_time DESC",
};


export interface PageProps {
    page: number;
    per_page: Perpage;
    sort: SortType;
}

export interface AccountFilter {
    time?: string;
    include?: string[];
    exclude?: string[];
}


export interface CursorFilter extends AccountFilter {
    alias?: string;
    rate?: string;
    platform?: Platform[];
}

export interface CursorGet extends PageProps {
    last_cursor?: string | number;
    last_uid?: number;
}

export interface CursorRes<T> extends CursorGet {
    data: T[];
}
