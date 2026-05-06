import { RelationConfig } from '../pages/Relations';
export declare const SYSTEM_FIELDS: string[];
export declare function normalizeValueByType(value: any, type: string): any;
export declare function stripAndNormalizeBySchema(obj: any, schema: any): any;
export declare function handleDownload({ type, selected, getSelectedTable, }: {
    type: "json" | "csv";
    selected: string | undefined;
    getSelectedTable: () => any;
}): Promise<void>;
export declare function importFile({ file, tableName, tableSchema, csvDelimiter, relations, }: {
    file: File;
    tableName: string;
    tableSchema: any;
    csvDelimiter: string;
    relations?: RelationConfig[];
}): Promise<{
    log: string;
    debug: string;
}>;
