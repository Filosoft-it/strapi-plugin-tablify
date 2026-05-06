import {
  Box,
  Button,
  Divider,
  Field,
  Flex,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from "@strapi/design-system";
import React from "react";

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
  tables: { uid: string; tableName: string; displayName: string }[];
  targetSchemasByUid: Record<string, any | null>;
  relations: RelationConfig[];
  setRelations: (next: RelationConfig[]) => void;
};

function getRelationFieldOptions(tableSchema: any | null): { value: string; label: string; targetUid?: string }[] {
  if (!tableSchema) return [];
  return Object.entries<any>(tableSchema)
    .filter(([, attr]) => attr?.type === "relation")
    .map(([key, attr]) => ({
      value: key,
      label: key,
      targetUid: attr?.target,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getForeignFieldOptions(targetSchema: any | null): { value: string; label: string }[] {
  if (!targetSchema) return [];
  return Object.entries<any>(targetSchema)
    .filter(([key, attr]) => {
      if (!key || key === "id" || key === "documentId") return false;
      if (!attr || typeof attr !== "object") return false;
      // only scalar fields usable for matching
      const t = attr.type;
      return (
        t === "string" ||
        t === "text" ||
        t === "email" ||
        t === "uid" ||
        t === "enumeration" ||
        t === "integer" ||
        t === "biginteger" ||
        t === "float" ||
        t === "decimal"
      );
    })
    .map(([key]) => ({ value: key, label: key }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const Relations = (props: Props) => {
  const relationFields = getRelationFieldOptions(props.tableSchema);

  const add = () => {
    props.setRelations([
      ...props.relations,
      {
        csvKey: "",
        relationField: "",
        targetUid: "",
        foreignField: "",
      },
    ]);
  };

  const remove = (idx: number) => {
    props.setRelations(props.relations.filter((_, i) => i !== idx));
  };

  const update = (idx: number, patch: Partial<RelationConfig>) => {
    props.setRelations(
      props.relations.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  };

  return (
    <Box marginTop={6}>
      <Box marginBottom={2}>
        <Typography variant="delta" tag="h4">
          Relations (optional)
        </Typography>
      </Box>
      <Typography variant="omega" textColor="neutral600">
        Map a CSV column to a relation: the CSV value will be used to look up a target entry and connect it during import.
      </Typography>

      <Box marginTop={4}>
        <Button
          size="S"
          variant="default"
          onClick={add}
          disabled={props.disabled || !relationFields.length}
        >
          Add relation
        </Button>
      </Box>

      {props.relations.map((rel, idx) => {
        const relFieldMeta = relationFields.find((f) => f.value === rel.relationField);
        const targetUid = rel.targetUid || relFieldMeta?.targetUid || "";
        const targetSchema = targetUid ? props.targetSchemasByUid[targetUid] : null;
        const foreignFields = getForeignFieldOptions(targetSchema);

        return (
          <Box
            key={`${idx}-${rel.relationField}-${rel.csvKey}`}
            marginTop={4}
            padding={4}
            background="neutral0"
            hasRadius
            shadow="tableShadow"
          >
            <Flex alignItems="flex-end" gap={4} wrap="wrap">
              <Box style={{ minWidth: 260 }}>
                <Field.Root name={`relation-csvKey-${idx}`}>
                  <Field.Label>CSV column name</Field.Label>
                  <TextInput
                    size="S"
                    placeholder="e.g. client_name"
                    value={rel.csvKey}
                    disabled={props.disabled}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      update(idx, { csvKey: e.target.value })
                    }
                  />
                </Field.Root>
              </Box>

              <Box style={{ minWidth: 260 }}>
                <Field.Root name={`relation-relationField-${idx}`}>
                  <Field.Label>Relation field</Field.Label>
                  <SingleSelect
                    aria-label="Relation field"
                    placeholder={relationFields.length ? "Select a relation field" : "No relations in this table"}
                    value={rel.relationField || null}
                    disabled={props.disabled || !relationFields.length}
                    onChange={(value: string | number) => {
                      const relationField = String(value);
                      const meta = relationFields.find((f) => f.value === relationField);
                      update(idx, {
                        relationField,
                        csvKey: rel.csvKey || relationField,
                        targetUid: meta?.targetUid ?? "",
                        foreignField: "",
                      });
                    }}
                  >
                    {relationFields.map((f) => (
                      <SingleSelectOption key={f.value} value={f.value}>
                        {f.label}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>
              </Box>

              <Box style={{ minWidth: 320 }}>
                <Field.Root name={`relation-target-${idx}`}>
                  <Field.Label>Connected table</Field.Label>
                  <SingleSelect
                    aria-label="Target table"
                    placeholder="Select a table"
                    value={targetUid || null}
                    disabled={props.disabled || !rel.relationField}
                    onChange={(value: string | number) => {
                      update(idx, { targetUid: String(value), foreignField: "" });
                    }}
                  >
                    {props.tables.map((t) => (
                      <SingleSelectOption key={t.uid} value={t.uid}>
                        {`${t.displayName} (${t.tableName})`}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>
              </Box>

              <Box style={{ minWidth: 260 }}>
                <Field.Root name={`relation-foreign-field-${idx}`}>
                  <Field.Label>Foreign key for match</Field.Label>
                  <SingleSelect
                    aria-label="Foreign key for match"
                    placeholder={targetUid ? "Select a field" : "Select table first"}
                    value={rel.foreignField || null}
                    disabled={props.disabled || !targetUid}
                    onChange={(value: string | number) => update(idx, { foreignField: String(value) })}
                  >
                    {foreignFields.map((f) => (
                      <SingleSelectOption key={f.value} value={f.value}>
                        {f.label}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>
              </Box>

              <Box>
                <Button
                  size="S"
                  variant="danger-light"
                  onClick={() => remove(idx)}
                  disabled={props.disabled}
                >
                  Remove
                </Button>
              </Box>
            </Flex>

            <Box marginTop={3}>
              <Divider />
              <Box marginTop={2}>
                <Typography variant="pi" textColor="neutral600">
                  Import behavior: take value from CSV column <strong>{rel.csvKey || "(not set)"}</strong>, find 1 entry in{" "}
                  <strong>{targetUid || "(not set)"}</strong> where <strong>{rel.foreignField || "(not set)"}</strong>{" "}
                  equals it; then connect into relation field <strong>{rel.relationField || "(not set)"}</strong> by{" "}
                  <strong>documentId</strong>.
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

