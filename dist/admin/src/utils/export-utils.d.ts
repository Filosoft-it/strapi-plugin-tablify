export declare function stripUnsafeFields(obj: any): any;
export declare function csvToJson(csvString: string, delimiter?: string): any[];
export declare function jsonToCsv(items: any[]): string;
export declare function downloadAsFile({ data, fileName, mime, }: {
    data: string;
    fileName: string;
    mime: string;
}): void;
