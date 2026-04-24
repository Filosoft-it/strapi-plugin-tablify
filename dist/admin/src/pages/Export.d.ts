interface Props {
    selected: string | undefined;
    setSelected: (s: string | undefined) => void;
    tables: {
        uid: string;
        tableName: string;
        displayName: string;
    }[];
    onDownload: (type: "json" | "csv") => void;
    downloading: "csv" | "json" | false;
}
export declare const Export: (props: Props) => import("react/jsx-runtime").JSX.Element;
export {};
