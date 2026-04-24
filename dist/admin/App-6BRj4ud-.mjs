import { jsxs, jsx } from "react/jsx-runtime";
import { Page } from "@strapi/strapi/admin";
import { Routes, Route } from "react-router-dom";
import { Box, Typography, Field, SingleSelect, SingleSelectOption, Button, Flex, TextInput, Main } from "@strapi/design-system";
import { useState, useRef, useEffect } from "react";
function csvToJson(csvString, delimiter = ",") {
  let csv = csvString.replace(/^\uFEFF/, "").trim();
  let lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const splitCsvRow = (row) => {
    const re = new RegExp(
      `\\s*(?:(?:"([^"]*(?:""[^"]*)*)")|([^"${delimiter}]+))\\s*(?:${delimiter}|$)`,
      "g"
    );
    const result = [];
    let match;
    let lastIndex = 0;
    while ((match = re.exec(row)) !== null && lastIndex < row.length) {
      lastIndex = re.lastIndex;
      result.push(match[1] !== void 0 ? match[1].replace(/""/g, '"') : match[2]);
    }
    return result;
  };
  const header = splitCsvRow(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvRow(line);
    const obj = {};
    header.forEach((key, i) => {
      obj[key] = values[i] ?? "";
    });
    return obj;
  });
}
function jsonToCsv(items) {
  if (!items.length) return "";
  const replacer = (_, value) => value === null || value === void 0 ? "" : value;
  const header = Object.keys(items[0]);
  const csv = [
    header.join(","),
    ...items.map(
      (row) => header.map((fieldName) => JSON.stringify(row[fieldName], replacer)).join(",")
    )
  ].join("\r\n");
  return csv;
}
function downloadAsFile({
  data,
  fileName,
  mime
}) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
const SYSTEM_FIELDS = [
  "id",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "publishedAt",
  "published_at"
];
function normalizeValueByType(value, type) {
  if (value === "" || value === null || value === void 0 || value === "undefined") {
    return null;
  }
  switch (type) {
    case "integer":
    case "biginteger":
    case "float":
    case "decimal": {
      const n = Number(value);
      return isNaN(n) ? null : n;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === true || value === 1 || value === "1") return true;
      if (value === "false" || value === false || value === 0 || value === "0") return false;
      return null;
    case "date":
    case "datetime":
    case "timestamp":
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value;
      return null;
    default:
      return value;
  }
}
function stripAndNormalizeBySchema(obj, schema) {
  const result = {};
  for (const key in schema) {
    if (!SYSTEM_FIELDS.includes(key)) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = normalizeValueByType(obj[key], schema[key].type);
      }
    }
  }
  return result;
}
async function handleDownload({
  type,
  selected,
  getSelectedTable
}) {
  if (!selected) return;
  const table = getSelectedTable();
  if (!table) return;
  const res = await fetch("/tablify/dump-collection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: table.tableName })
  });
  if (!res.ok) throw new Error("Failed to fetch data from the server.");
  const { data } = await res.json();
  if (type === "json") {
    downloadAsFile({
      data: JSON.stringify(data, null, 2),
      fileName: `${table.tableName}.json`,
      mime: "application/json"
    });
  } else if (type === "csv") {
    const csv = jsonToCsv(data);
    downloadAsFile({
      data: csv,
      fileName: `${table.tableName}.csv`,
      mime: "text/csv;charset=utf-8;"
    });
  }
}
async function importFile({
  file,
  tableName,
  tableSchema,
  csvDelimiter
}) {
  let debug = "";
  let log = "";
  let records = [];
  debug += `File name: ${file.name}
File size: ${file.size} bytes
`;
  const text = await file.text();
  debug += `First 1kB of file:
${text.slice(0, 1e3)}
`;
  const fileName = file.name.toLowerCase();
  let format = "json";
  if (fileName.endsWith(".csv")) format = "csv";
  else if (fileName.endsWith(".json")) format = "json";
  else {
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) format = "json";
    else format = "csv";
  }
  debug += `Detected format: ${format}
`;
  try {
    if (format === "json") {
      records = JSON.parse(text);
      debug += `JSON parsed successfully. Type: ${Array.isArray(records) ? "array" : typeof records}
`;
      if (!Array.isArray(records)) throw new Error("JSON file must be an array of objects.");
    } else if (format === "csv") {
      debug += `CSV delimiter: "${csvDelimiter || ","}"
`;
      const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
      debug += `CSV row count: ${lines.length}
`;
      debug += `Header: ${lines[0]}
`;
      if (lines.length > 1) debug += `First data row: ${lines[1]}
`;
      records = csvToJson(text, csvDelimiter || ",");
      debug += `CSV parsed successfully. Number of objects: ${records.length}
`;
      if (records.length > 0) {
        debug += `First object: ${JSON.stringify(records[0], null, 2)}
`;
      }
    }
    if (!records.length) {
      log = "No data found in the file to import.";
      debug += log + "\n";
      return { log, debug };
    }
  } catch (e) {
    log = "Parsing error: " + (e.message || e);
    debug += log + "\n";
    return { log, debug };
  }
  records = records.map((row) => stripAndNormalizeBySchema(row, tableSchema));
  debug += `Prepared for upload: ${records.length} objects
`;
  try {
    const res = await fetch("/tablify/import-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tableName,
        data: records,
        format
      })
    });
    const result = await res.json();
    debug += `Server response: ${JSON.stringify(result, null, 2)}
`;
    if (result.success) {
      log = `Import complete: ${result.created} records added, ${result.failed} errors.`;
      if (result.failedDetails && result.failedDetails.length) {
        log += "\nErrors:\n" + result.failedDetails.join("\n");
      }
    } else {
      log = "Import failed: " + (result.message || "Unknown server error.");
    }
  } catch (e) {
    log = "Import error: " + (e.message || e);
    debug += log + "\n";
  }
  return { log, debug };
}
const Export = (props) => {
  return /* @__PURE__ */ jsxs(Box, { marginBottom: 6, children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 2, children: /* @__PURE__ */ jsx(Typography, { variant: "delta", tag: "h4", children: "Export" }) }),
    /* @__PURE__ */ jsx(Box, { marginBottom: 4, children: /* @__PURE__ */ jsxs(Field.Root, { name: "tables", children: [
      /* @__PURE__ */ jsx(Field.Label, { children: "Tables" }),
      /* @__PURE__ */ jsx(
        SingleSelect,
        {
          "aria-label": "Tables",
          placeholder: "Select a table",
          value: props.selected ?? null,
          onChange: (value) => props.setSelected(String(value)),
          children: props?.tables?.map((table) => /* @__PURE__ */ jsx(SingleSelectOption, { value: table.uid, children: `${table.displayName} (${table.tableName})` }, table.uid))
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs(Box, { display: "flex", children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          style: { marginRight: 10 },
          size: "S",
          onClick: () => props.onDownload("json"),
          disabled: !props.selected || props.downloading === "json",
          loading: props.downloading === "json",
          variant: "default",
          children: "Download JSON"
        }
      ),
      /* @__PURE__ */ jsx(
        Button,
        {
          style: { marginRight: 10 },
          size: "S",
          onClick: () => props.onDownload("csv"),
          disabled: !props.selected || props.downloading === "csv",
          loading: props.downloading === "csv",
          variant: "default",
          children: "Download CSV"
        }
      )
    ] })
  ] });
};
const Header = () => {
  return /* @__PURE__ */ jsxs(Box, { marginBottom: 4, children: [
    /* @__PURE__ */ jsx(Typography, { variant: "alpha", tag: "h1", children: "Import & Export Data" }),
    /* @__PURE__ */ jsx(Typography, { variant: "epsilon", tag: "p", children: "Select a collection to import data from CSV or JSON, or export your data in one click." })
  ] });
};
const Import = (props) => {
  return /* @__PURE__ */ jsxs(Box, { marginBottom: 6, children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 2, children: /* @__PURE__ */ jsx(Typography, { variant: "delta", tag: "h4", children: "Import" }) }),
    /* @__PURE__ */ jsx(Box, { marginBottom: 4, children: /* @__PURE__ */ jsxs(Flex, { alignItems: "center", children: [
      /* @__PURE__ */ jsxs(
        Field.Root,
        {
          name: "csv-delimiter",
          hint: "For example: , ; | \\t",
          style: { width: 260, marginRight: 10 },
          children: [
            /* @__PURE__ */ jsx(Field.Label, { children: "CSV delimiter (default is comma)" }),
            /* @__PURE__ */ jsx(
              TextInput,
              {
                size: "S",
                placeholder: "Enter delimiter",
                value: props.csvDelimiter,
                onChange: (e) => props.setCsvDelimiter(e.target.value)
              }
            ),
            /* @__PURE__ */ jsx(Field.Hint, {})
          ]
        }
      ),
      /* @__PURE__ */ jsx(Typography, { variant: "omega", style: { marginLeft: 10 }, children: "Character that separates values in your CSV file. Examples: comma (,), semicolon (;), tab (\\t)" })
    ] }) }),
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "file",
        accept: ".json,.csv",
        ref: props.fileInputRef,
        style: { display: "none" },
        onChange: props.handleFileChange
      }
    ),
    /* @__PURE__ */ jsxs(Flex, { alignItems: "center", children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: "default",
          style: { marginRight: 10 },
          onClick: () => props.fileInputRef?.current?.click(),
          children: props.fileName ? "Change file" : "Select file"
        }
      ),
      /* @__PURE__ */ jsx(
        Button,
        {
          disabled: !props.selected || props.importing || !props.fileName,
          loading: props.importing,
          variant: "default",
          onClick: props.onImport,
          children: "Import"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(Box, {})
  ] });
};
const Output = (props) => {
  return /* @__PURE__ */ jsxs(Box, { marginTop: 8, children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 2, children: /* @__PURE__ */ jsx(Typography, { variant: "delta", tag: "h4", children: "Output:" }) }),
    props.importLog && /* @__PURE__ */ jsxs(Box, { background: "neutral100", hasRadius: true, padding: 4, children: [
      props.importLog && /* @__PURE__ */ jsx(Box, { marginTop: 4, children: /* @__PURE__ */ jsx(
        Typography,
        {
          variant: "omega",
          textColor: "danger600",
          tag: "pre",
          style: { whiteSpace: "pre-line" },
          children: props.importLog
        }
      ) }),
      props.debugLog && /* @__PURE__ */ jsx(Box, { marginTop: 4, children: /* @__PURE__ */ jsx(
        Typography,
        {
          variant: "omega",
          textColor: "primary600",
          tag: "pre",
          style: { whiteSpace: "pre-line", fontSize: 11 },
          children: props.debugLog
        }
      ) })
    ] })
  ] });
};
const HomePage = () => {
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(void 0);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState("");
  const [csvDelimiter, setCsvDelimiter] = useState(",");
  const [debugLog, setDebugLog] = useState("");
  const fileInputRef = useRef(null);
  const [tableSchema, setTableSchema] = useState(null);
  const [fileName, setFileName] = useState("");
  useEffect(() => {
    fetch("/tablify/tables").then((res) => res.json()).then((data) => setTables(data)).catch(() => setTables([]));
  }, []);
  useEffect(() => {
    if (selected) {
      fetch(`/tablify/schema?uid=${encodeURIComponent(selected)}`).then((res) => res.json()).then(setTableSchema).catch(() => setTableSchema(null));
    } else {
      setTableSchema(null);
    }
  }, [selected]);
  const getSelectedTable = () => tables.find((t) => t.uid === selected);
  const onDownload = async (type) => {
    setDownloading(type);
    try {
      await handleDownload({
        type,
        selected,
        getSelectedTable
      });
    } catch (e) {
      alert("Download failed: " + (e.message || e));
    }
    setDownloading(false);
  };
  const onImport = async () => {
    setImportLog("");
    setDebugLog("");
    if (!selected || !fileInputRef.current?.files?.length) {
      setDebugLog("Нет выбранной таблицы или файла.");
      return;
    }
    setImporting(true);
    try {
      const file = fileInputRef.current.files[0];
      const table = getSelectedTable();
      if (!table) throw new Error("Table not found");
      const { log, debug } = await importFile({
        file,
        tableName: table.tableName,
        tableSchema,
        csvDelimiter
      });
      setImportLog(log);
      setDebugLog(debug);
    } catch (e) {
      setImportLog("Import error: " + (e.message || e));
      setDebugLog(String(e));
    }
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      setFileName("");
    }
  };
  const handleFileChange = (e) => {
    if (e.target.files?.length) {
      setFileName(e.target.files[0].name);
    } else {
      setFileName("");
    }
  };
  return /* @__PURE__ */ jsx(Main, { children: /* @__PURE__ */ jsxs(Box, { padding: 8, background: "neutral0", shadow: "tableShadow", hasRadius: true, children: [
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsx(
      Export,
      {
        tables,
        selected,
        setSelected,
        onDownload,
        downloading
      }
    ),
    /* @__PURE__ */ jsx(
      Import,
      {
        selected,
        csvDelimiter,
        setCsvDelimiter,
        fileInputRef,
        handleFileChange,
        onImport,
        fileName,
        importing
      }
    ),
    /* @__PURE__ */ jsx(Output, { debugLog, importLog })
  ] }) });
};
const App = () => {
  return /* @__PURE__ */ jsxs(Routes, { children: [
    /* @__PURE__ */ jsx(Route, { index: true, element: /* @__PURE__ */ jsx(HomePage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "*", element: /* @__PURE__ */ jsx(Page.Error, {}) })
  ] });
};
export {
  App
};
