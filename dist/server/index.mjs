const bootstrap = ({ strapi: strapi2 }) => {
};
const config = {
  default: {},
  validator() {
  }
};
const contentTypes = {};
function formatInnerLikeEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === "string") {
    const t = entry.trim();
    return t || null;
  }
  if (typeof entry !== "object") return null;
  const o = entry;
  const msg = o.message != null && String(o.message).trim() ? String(o.message).trim() : null;
  if (!msg) return null;
  const path = o.path;
  if (path === void 0 || path === null || path === "") return msg;
  const pathStr = Array.isArray(path) ? path.filter((p) => p !== void 0 && p !== null && p !== "").join(".") : String(path);
  return pathStr ? `${pathStr}: ${msg}` : msg;
}
function collectImportErrorMessages(err, out, seen) {
  if (err == null) return;
  if (typeof err === "object") {
    const e = err;
    const inner = e.inner;
    if (Array.isArray(inner) && inner.length) {
      for (const item of inner) {
        const line = formatInnerLikeEntry(item);
        if (line && !seen.has(line)) {
          seen.add(line);
          out.push(line);
        }
      }
    }
    const issues = e.issues;
    if (Array.isArray(issues) && issues.length) {
      for (const issue of issues) {
        const line = formatInnerLikeEntry(issue);
        if (line && !seen.has(line)) {
          seen.add(line);
          out.push(line);
        }
      }
    }
    const details = e.details;
    if (details && typeof details === "object") {
      const nestedErrors = details.errors;
      if (Array.isArray(nestedErrors) && nestedErrors.length) {
        for (const item of nestedErrors) {
          const line = formatInnerLikeEntry(item);
          if (line && !seen.has(line)) {
            seen.add(line);
            out.push(line);
          }
        }
      }
    }
    if (e.cause) {
      collectImportErrorMessages(e.cause, out, seen);
    }
  }
  if (!out.length && typeof err === "object" && err !== null) {
    const msg = err.message;
    if (msg && String(msg).trim()) {
      const line = String(msg).trim();
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
    }
  } else if (!out.length && typeof err === "string" && err.trim()) {
    const line = err.trim();
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
}
function formatImportCaughtError(err) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  collectImportErrorMessages(err, out, seen);
  if (!out.length) return "Unknown error";
  return out.join(", ");
}
const controller = {
  async hello(ctx) {
    ctx.body = "Hello from backend!";
  },
  _findContentTypeByName(name) {
    const allContentTypes = Object.values(strapi.contentTypes);
    return allContentTypes.find(
      (type) => type.info?.displayName?.toLowerCase() === name.toLowerCase() || type.collectionName?.toLowerCase() === name.toLowerCase()
    );
  },
  async tables(ctx) {
    const allContentTypes = Object.values(strapi.contentTypes);
    const result = allContentTypes.filter((type) => type.kind === "collectionType" && !type.plugin || type.uid === "plugin::users-permissions.user" && !type.plugin).map((type) => ({
      uid: type.uid,
      tableName: type.collectionName,
      displayName: type.info?.displayName ?? type.uid
    }));
    ctx.body = result;
  },
  async dumpCollection(ctx) {
    const { name } = ctx.request.body;
    if (!name) {
      ctx.throw(400, "Name is required");
    }
    const found = controller._findContentTypeByName(name);
    if (!found) {
      ctx.throw(404, "Collection not found");
    }
    const uid = found.uid;
    const pageSize = 1e3;
    let start = 0;
    let hasMore = true;
    let data = [];
    while (hasMore) {
      const results = await strapi.documents(uid).findMany({
        limit: pageSize,
        start
      });
      data = [...data, ...results];
      hasMore = results.length === pageSize;
      start += pageSize;
    }
    ctx.body = { data };
  },
  async importCollection(ctx) {
    const { name, data, relations = [] } = ctx.request.body;
    if (!name || !data) {
      ctx.throw(400, "Name and data are required");
    }
    const found = controller._findContentTypeByName(name);
    if (!found) {
      ctx.throw(404, "Collection not found");
    }
    const uid = found.uid;
    let records = [];
    if (!Array.isArray(data)) ctx.throw(400, "Data must be array of objects");
    records = data;
    let created = 0, failed = 0, failedDetails = [];
    for (const [i, item] of records.entries()) {
      try {
        const contentType = strapi.contentTypes[uid];
        const attrs = contentType?.attributes ?? {};
        const dataToCreate = { ...item };
        if (Array.isArray(relations) && relations.length) {
          for (const rel of relations) {
            const field = String(rel?.relationField ?? "");
            const targetUid = String(rel?.targetUid ?? "");
            const foreignField = String(rel?.foreignField ?? "");
            if (!field || !targetUid || !foreignField) continue;
            const attr = attrs[field];
            if (!attr || attr.type !== "relation") {
              throw new Error(`Relation field "${field}" is not a relation on ${uid}`);
            }
            const raw = dataToCreate[field];
            if (raw === null || raw === void 0 || raw === "") {
              dataToCreate[field] = null;
              continue;
            }
            const foreignAttrType = strapi.contentTypes?.[targetUid]?.attributes?.[foreignField]?.type;
            let matchValue = raw;
            if (foreignAttrType === "integer" || foreignAttrType === "biginteger" || foreignAttrType === "float" || foreignAttrType === "decimal") {
              const n = typeof raw === "number" ? raw : Number(raw);
              if (Number.isNaN(n)) {
                throw new Error(
                  `Relation "${field}": value ${JSON.stringify(raw)} is not a number for ${targetUid}.${foreignField}`
                );
              }
              matchValue = n;
            }
            const results = await strapi.documents(targetUid).findMany({
              filters: {
                [foreignField]: { $eq: matchValue }
              },
              fields: ["documentId"],
              limit: 2,
              start: 0
            });
            if (!Array.isArray(results) || results.length === 0) {
              throw new Error(
                `Relation "${field}": no match in ${targetUid} where ${foreignField} == ${JSON.stringify(raw)}`
              );
            }
            if (results.length > 1) {
              throw new Error(
                `Relation "${field}": multiple matches in ${targetUid} where ${foreignField} == ${JSON.stringify(raw)}`
              );
            }
            const foreignDocumentId = results[0]?.documentId;
            if (!foreignDocumentId) {
              throw new Error(`Relation "${field}": matched entry missing documentId`);
            }
            const relKind = String(attr.relation ?? "");
            const isMulti = relKind === "oneToMany" || relKind === "manyToMany" || relKind === "manyWay";
            dataToCreate[field] = isMulti ? [foreignDocumentId] : foreignDocumentId;
          }
        }
        await strapi.documents(uid).create({ data: dataToCreate });
        created++;
      } catch (e) {
        failed++;
        failedDetails.push(`Row ${i + 1}: ${formatImportCaughtError(e)}`);
      }
    }
    ctx.body = { success: true, created, failed, failedDetails };
  },
  async getSchema(ctx) {
    const { uid } = ctx.request.query;
    if (!uid) ctx.throw(400, "uid is required");
    const contentType = strapi.contentTypes[uid];
    if (!contentType) ctx.throw(404, "Content type not found");
    ctx.body = contentType.attributes;
  }
};
const controllers = {
  controller
};
const destroy = ({ strapi: strapi2 }) => {
};
const middlewares = {};
const policies = {};
const register = ({ strapi: strapi2 }) => {
};
const routes = [
  {
    method: "GET",
    path: "/hello",
    handler: "controller.hello",
    config: {
      auth: false
      // true, если нужна авторизация
    }
  },
  {
    method: "GET",
    path: "/tables",
    handler: "controller.tables",
    config: { auth: false }
  },
  {
    method: "POST",
    path: "/dump-collection",
    handler: "controller.dumpCollection",
    config: { auth: false }
  },
  {
    method: "POST",
    path: "/import-collection",
    handler: "controller.importCollection",
    config: { auth: false }
  },
  {
    method: "GET",
    path: "/schema",
    handler: "controller.getSchema",
    config: { auth: false }
  }
];
const service = ({ strapi: strapi2 }) => ({
  getWelcomeMessage() {
    return "Welcome to Strapi 🚀";
  }
});
const services = {
  service
};
const index = {
  register,
  bootstrap,
  destroy,
  config,
  controllers,
  routes,
  services,
  contentTypes,
  policies,
  middlewares
};
export {
  index as default
};
