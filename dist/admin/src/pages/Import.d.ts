import { default as React } from 'react';
interface Props {
    csvDelimiter: string;
    setCsvDelimiter: (newCsvDelimiter: string) => void;
    fileInputRef: any;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onImport: () => void;
    fileName: string;
    selected: string | undefined;
    importing: boolean;
}
export declare const Import: (props: Props) => import("react/jsx-runtime").JSX.Element;
export {};
