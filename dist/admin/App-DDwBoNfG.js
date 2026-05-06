"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const jsxRuntime = require("react/jsx-runtime");
const admin = require("@strapi/strapi/admin");
const reactRouterDom = require("react-router-dom");
const designSystem = require("@strapi/design-system");
const react = require("react");
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
function applyRelationAliases(row, relations) {
  if (!row || typeof row !== "object") return row;
  if (!Array.isArray(relations) || relations.length === 0) return row;
  for (const rel of relations) {
    const csvKey = String(rel?.csvKey ?? "");
    const relationField = String(rel?.relationField ?? "");
    if (!relationField) continue;
    const effectiveCsvKey = csvKey || relationField;
    const existing = row[relationField];
    if (existing !== void 0 && existing !== null && existing !== "") continue;
    row[relationField] = row[effectiveCsvKey];
  }
  return row;
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
  csvDelimiter,
  relations
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
  records = records.map((row) => applyRelationAliases(row, relations)).map((row) => stripAndNormalizeBySchema(row, tableSchema));
  debug += `Prepared for upload: ${records.length} objects
`;
  try {
    const res = await fetch("/tablify/import-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tableName,
        data: records,
        format,
        relations: relations ?? []
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
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginBottom: 6, children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginBottom: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", tag: "h4", children: "Export" }) }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginBottom: 4, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { name: "tables", children: [
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Tables" }),
      /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.SingleSelect,
        {
          "aria-label": "Tables",
          placeholder: "Select a table",
          value: props.selected ?? null,
          onChange: (value) => props.setSelected(String(value)),
          children: props?.tables?.map((table) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: table.uid, children: `${table.displayName} (${table.tableName})` }, table.uid))
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { display: "flex", children: [
      /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.Button,
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
      /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.Button,
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
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginBottom: 4, children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "alpha", tag: "h1", children: "Import & Export Data" }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "epsilon", tag: "p", children: "Select a collection to import data from CSV or JSON, or export your data in one click." })
  ] });
};
const Import = (props) => {
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginBottom: 6, children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginBottom: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", tag: "h4", children: "Import" }) }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginBottom: 4, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { alignItems: "center", children: [
      /* @__PURE__ */ jsxRuntime.jsxs(
        designSystem.Field.Root,
        {
          name: "csv-delimiter",
          hint: "For example: , ; | \\t",
          style: { width: 260, marginRight: 10 },
          children: [
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "CSV delimiter (default is comma)" }),
            /* @__PURE__ */ jsxRuntime.jsx(
              designSystem.TextInput,
              {
                size: "S",
                placeholder: "Enter delimiter",
                value: props.csvDelimiter,
                onChange: (e) => props.setCsvDelimiter(e.target.value)
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Hint, {})
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", style: { marginLeft: 10 }, children: "Character that separates values in your CSV file. Examples: comma (,), semicolon (;), tab (\\t)" })
    ] }) }),
    /* @__PURE__ */ jsxRuntime.jsx(
      "input",
      {
        type: "file",
        accept: ".json,.csv",
        ref: props.fileInputRef,
        style: { display: "none" },
        onChange: props.handleFileChange
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { alignItems: "center", children: [
      /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.Button,
        {
          variant: "default",
          style: { marginRight: 10 },
          onClick: () => props.fileInputRef?.current?.click(),
          children: props.fileName ? "Change file" : "Select file"
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.Button,
        {
          disabled: !props.selected || props.importing || !props.fileName,
          loading: props.importing,
          variant: "default",
          onClick: props.onImport,
          children: "Import"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, {})
  ] });
};
const Output = (props) => {
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginTop: 8, children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginBottom: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", tag: "h4", children: "Output:" }) }),
    props.importLog && /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { background: "neutral100", hasRadius: true, padding: 4, children: [
      props.importLog && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginTop: 4, children: /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.Typography,
        {
          variant: "omega",
          textColor: "danger600",
          tag: "pre",
          style: { whiteSpace: "pre-line" },
          children: props.importLog
        }
      ) }),
      props.debugLog && /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginTop: 4, children: /* @__PURE__ */ jsxRuntime.jsx(
        designSystem.Typography,
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
function getRelationFieldOptions(tableSchema) {
  if (!tableSchema) return [];
  return Object.entries(tableSchema).filter(([, attr]) => attr?.type === "relation").map(([key, attr]) => ({
    value: key,
    label: key,
    targetUid: attr?.target
  })).sort((a, b) => a.label.localeCompare(b.label));
}
function getForeignFieldOptions(targetSchema) {
  if (!targetSchema) return [];
  return Object.entries(targetSchema).filter(([key, attr]) => {
    if (!key || key === "id" || key === "documentId") return false;
    if (!attr || typeof attr !== "object") return false;
    const t = attr.type;
    return t === "string" || t === "text" || t === "email" || t === "uid" || t === "enumeration" || t === "integer" || t === "biginteger" || t === "float" || t === "decimal";
  }).map(([key]) => ({ value: key, label: key })).sort((a, b) => a.label.localeCompare(b.label));
}
const Relations = (props) => {
  const relationFields = getRelationFieldOptions(props.tableSchema);
  const add = () => {
    props.setRelations([
      ...props.relations,
      {
        csvKey: "",
        relationField: "",
        targetUid: "",
        foreignField: ""
      }
    ]);
  };
  const remove = (idx) => {
    props.setRelations(props.relations.filter((_, i) => i !== idx));
  };
  const update = (idx, patch) => {
    props.setRelations(
      props.relations.map((r, i) => i === idx ? { ...r, ...patch } : r)
    );
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginTop: 6, children: [
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginBottom: 2, children: /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "delta", tag: "h4", children: "Relations (optional)" }) }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Typography, { variant: "omega", textColor: "neutral600", children: "Map a CSV column to a relation: the CSV value will be used to look up a target entry and connect it during import." }),
    /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginTop: 4, children: /* @__PURE__ */ jsxRuntime.jsx(
      designSystem.Button,
      {
        size: "S",
        variant: "default",
        onClick: add,
        disabled: props.disabled || !relationFields.length,
        children: "Add relation"
      }
    ) }),
    props.relations.map((rel, idx) => {
      const relFieldMeta = relationFields.find((f) => f.value === rel.relationField);
      const targetUid = rel.targetUid || relFieldMeta?.targetUid || "";
      const targetSchema = targetUid ? props.targetSchemasByUid[targetUid] : null;
      const foreignFields = getForeignFieldOptions(targetSchema);
      return /* @__PURE__ */ jsxRuntime.jsxs(
        designSystem.Box,
        {
          marginTop: 4,
          padding: 4,
          background: "neutral0",
          hasRadius: true,
          shadow: "tableShadow",
          children: [
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Flex, { alignItems: "flex-end", gap: 4, wrap: "wrap", children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { minWidth: 260 }, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { name: `relation-csvKey-${idx}`, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "CSV column name" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  designSystem.TextInput,
                  {
                    size: "S",
                    placeholder: "e.g. client_name",
                    value: rel.csvKey,
                    disabled: props.disabled,
                    onChange: (e) => update(idx, { csvKey: e.target.value })
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { minWidth: 260 }, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { name: `relation-relationField-${idx}`, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Relation field" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  designSystem.SingleSelect,
                  {
                    "aria-label": "Relation field",
                    placeholder: relationFields.length ? "Select a relation field" : "No relations in this table",
                    value: rel.relationField || null,
                    disabled: props.disabled || !relationFields.length,
                    onChange: (value) => {
                      const relationField = String(value);
                      const meta = relationFields.find((f) => f.value === relationField);
                      update(idx, {
                        relationField,
                        csvKey: rel.csvKey || relationField,
                        targetUid: meta?.targetUid ?? "",
                        foreignField: ""
                      });
                    },
                    children: relationFields.map((f) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: f.value, children: f.label }, f.value))
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { minWidth: 320 }, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { name: `relation-target-${idx}`, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Connected table" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  designSystem.SingleSelect,
                  {
                    "aria-label": "Target table",
                    placeholder: "Select a table",
                    value: targetUid || null,
                    disabled: props.disabled || !rel.relationField,
                    onChange: (value) => {
                      update(idx, { targetUid: String(value), foreignField: "" });
                    },
                    children: props.tables.map((t) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: t.uid, children: `${t.displayName} (${t.tableName})` }, t.uid))
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { style: { minWidth: 260 }, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Field.Root, { name: `relation-foreign-field-${idx}`, children: [
                /* @__PURE__ */ jsxRuntime.jsx(designSystem.Field.Label, { children: "Foreign key for match" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  designSystem.SingleSelect,
                  {
                    "aria-label": "Foreign key for match",
                    placeholder: targetUid ? "Select a field" : "Select table first",
                    value: rel.foreignField || null,
                    disabled: props.disabled || !targetUid,
                    onChange: (value) => update(idx, { foreignField: String(value) }),
                    children: foreignFields.map((f) => /* @__PURE__ */ jsxRuntime.jsx(designSystem.SingleSelectOption, { value: f.value, children: f.label }, f.value))
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { children: /* @__PURE__ */ jsxRuntime.jsx(
                designSystem.Button,
                {
                  size: "S",
                  variant: "danger-light",
                  onClick: () => remove(idx),
                  disabled: props.disabled,
                  children: "Remove"
                }
              ) })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { marginTop: 3, children: [
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Divider, {}),
              /* @__PURE__ */ jsxRuntime.jsx(designSystem.Box, { marginTop: 2, children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Typography, { variant: "pi", textColor: "neutral600", children: [
                "Import behavior: take value from CSV column ",
                /* @__PURE__ */ jsxRuntime.jsx("strong", { children: rel.csvKey || "(not set)" }),
                ", find 1 entry in",
                " ",
                /* @__PURE__ */ jsxRuntime.jsx("strong", { children: targetUid || "(not set)" }),
                " where ",
                /* @__PURE__ */ jsxRuntime.jsx("strong", { children: rel.foreignField || "(not set)" }),
                " ",
                "equals it; then connect into relation field ",
                /* @__PURE__ */ jsxRuntime.jsx("strong", { children: rel.relationField || "(not set)" }),
                " by",
                " ",
                /* @__PURE__ */ jsxRuntime.jsx("strong", { children: "documentId" }),
                "."
              ] }) })
            ] })
          ]
        },
        `${idx}-${rel.relationField}-${rel.csvKey}`
      );
    })
  ] });
};
const HomePage = () => {
  const [tables, setTables] = react.useState([]);
  const [selected, setSelected] = react.useState(void 0);
  const [downloading, setDownloading] = react.useState(false);
  const [importing, setImporting] = react.useState(false);
  const [importLog, setImportLog] = react.useState("");
  const [csvDelimiter, setCsvDelimiter] = react.useState(",");
  const [debugLog, setDebugLog] = react.useState("");
  const fileInputRef = react.useRef(null);
  const [tableSchema, setTableSchema] = react.useState(null);
  const [fileName, setFileName] = react.useState("");
  const [relations, setRelations] = react.useState([]);
  const [targetSchemasByUid, setTargetSchemasByUid] = react.useState({});
  const relationsStorageKey = selected ? `tablify.relations.${selected}` : `tablify.relations.`;
  react.useEffect(() => {
    fetch("/tablify/tables").then((res) => res.json()).then((data) => setTables(data)).catch(() => setTables([]));
  }, []);
  react.useEffect(() => {
    if (selected) {
      fetch(`/tablify/schema?uid=${encodeURIComponent(selected)}`).then((res) => res.json()).then(setTableSchema).catch(() => setTableSchema(null));
    } else {
      setTableSchema(null);
    }
  }, [selected]);
  react.useEffect(() => {
    if (!selected) {
      setRelations([]);
      return;
    }
    try {
      const raw = localStorage.getItem(relationsStorageKey);
      if (!raw) {
        setRelations([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setRelations(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRelations([]);
    }
  }, [selected]);
  react.useEffect(() => {
    if (!selected) return;
    try {
      localStorage.setItem(relationsStorageKey, JSON.stringify(relations));
    } catch {
    }
  }, [relations, selected]);
  react.useEffect(() => {
    const uids = Array.from(
      new Set(
        relations.map((r) => r?.targetUid).filter((x) => Boolean(x))
      )
    );
    const missing = uids.filter((uid) => !(uid in targetSchemasByUid));
    if (!missing.length) return;
    missing.forEach((uid) => {
      fetch(`/tablify/schema?uid=${encodeURIComponent(uid)}`).then((res) => res.json()).then((schema) => setTargetSchemasByUid((prev) => ({ ...prev, [uid]: schema }))).catch(() => setTargetSchemasByUid((prev) => ({ ...prev, [uid]: null })));
    });
  }, [relations, targetSchemasByUid]);
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
        csvDelimiter,
        relations: relations.filter((r) => r.relationField && (r.csvKey || r.relationField) && r.targetUid && r.foreignField)
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
  return /* @__PURE__ */ jsxRuntime.jsx(designSystem.Main, { children: /* @__PURE__ */ jsxRuntime.jsxs(designSystem.Box, { padding: 8, background: "neutral0", shadow: "tableShadow", hasRadius: true, children: [
    /* @__PURE__ */ jsxRuntime.jsx(Header, {}),
    /* @__PURE__ */ jsxRuntime.jsx(
      Export,
      {
        tables,
        selected,
        setSelected,
        onDownload,
        downloading
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
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
    /* @__PURE__ */ jsxRuntime.jsx(
      Relations,
      {
        disabled: !selected || importing,
        tableSchema,
        tables,
        targetSchemasByUid,
        relations,
        setRelations
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(Output, { debugLog, importLog })
  ] }) });
};
const App = () => {
  return /* @__PURE__ */ jsxRuntime.jsxs(reactRouterDom.Routes, { children: [
    /* @__PURE__ */ jsxRuntime.jsx(reactRouterDom.Route, { index: true, element: /* @__PURE__ */ jsxRuntime.jsx(HomePage, {}) }),
    /* @__PURE__ */ jsxRuntime.jsx(reactRouterDom.Route, { path: "*", element: /* @__PURE__ */ jsxRuntime.jsx(admin.Page.Error, {}) })
  ] });
};
exports.App = App;
