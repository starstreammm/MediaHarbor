import type { DetailsCreator, DetailsAccount, DetailsPost } from "./table";
import type { AccountFilter } from "./cursor";



export interface ApiInitStatus {
    douyin?: string | null;
    bilibili?: string | null;
    xhs?: string | null;
    x?: string | null;
    ins?: string | null;
    youtube?: string | null;
}


export interface ApiPostInsert extends DetailsPost {
    rate: number;
    account_uid?: number;
}
export interface ApiPostCreate {
    url: string;
    rate?: number;
}

export interface ApiPostParse extends DetailsPost {
    rate?: number;
    account_uid?: number;
}

export interface ApiAccountInsert extends DetailsAccount {
    creator_uid: number;
    sync: boolean;
    filter?: AccountFilter;
}

export interface ApiAccountSync {
    uid: number;
    complete?: boolean;
}

export interface ApiAccountParse extends DetailsAccount {
    creator_uid: number;
    sync: boolean;
    filter?: AccountFilter;
    posts: DetailsPost[];
}

export interface ApiAccountCreate {
    url: string;
    creator_uid: number;
    sync: boolean;
    filter?: AccountFilter;
}

export interface ApiCreatorCreate extends DetailsCreator {
    avatar?: number;
    cover?: number;
    accounts: (ApiAccountInsert | ApiAccountCreate | ApiAccountParse)[];
}


export interface ApiCollectionCreate {
    alias: string;
    notes?: string;
    posts?: (number | ApiPostCreate | ApiPostParse)[];
}

export interface ApiCollectionUpdate {
    uid: number;
    alias?: string;
    notes?: string;
    delete?: number[];
    exclude?: number[];
    add?: (number | ApiPostCreate | ApiPostParse)[];
}

export interface InsertRef<TR, TS> {
    resData: () => TR;
    submit: () => Promise<TS>;
}
