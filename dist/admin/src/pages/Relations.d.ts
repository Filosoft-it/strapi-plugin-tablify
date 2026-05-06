export type RelationConfig = {
    /** CSV column name to read the value from (can differ from relationField) */
    csvKey: string;
    /** Relation field on the imported content-type to connect */
    relationField: string;
    /** UID of the target content-type to look up (e.g. api::client.client) */
    targetUid: string;
    /** Field on the target content-type used to match CSV value (e.g. name) */
    foreignField: string;
};
type Props = {
    disabled: boolean;
    tableSchema: any | null;
    tables: {
        uid: string;
        tableName: string;
        displayName: string;
    }[];
    targetSchemasByUid: Record<string, any | null>;
    relations: RelationConfig[];
    setRelations: (next: RelationConfig[]) => void;
};
export declare const Relations: (props: Props) => import("react/jsx-runtime").JSX.Element;
export {};
