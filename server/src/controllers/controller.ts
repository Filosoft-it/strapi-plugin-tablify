export const controller = {
  async hello(ctx) {
    ctx.body = "Hello from backend!";
  },
  _findContentTypeByName(name: string) {
    const allContentTypes = Object.values(strapi.contentTypes);
    return allContentTypes.find(
      (type: any) =>
        type.info?.displayName?.toLowerCase() === name.toLowerCase() ||
        type.collectionName?.toLowerCase() === name.toLowerCase()
    );
  },
  async tables(ctx) {
    const allContentTypes = Object.values(strapi.contentTypes);

    const result = allContentTypes
      .filter(type => type.kind === 'collectionType' && !type.plugin || type.uid === 'plugin::users-permissions.user' && !type.plugin)
      .map(type => ({
        uid: type.uid,
        tableName: type.collectionName,
        displayName: type.info?.displayName ?? type.uid,
      }));

    ctx.body = result;
  },
  async dumpCollection(ctx) {
    const {name} = ctx.request.body;

    if (!name) {
      ctx.throw(400, 'Name is required');
    }

    const found = controller._findContentTypeByName(name);

    if (!found) {
      ctx.throw(404, 'Collection not found');
    }

    const uid = found.uid;

    const pageSize = 1000;
    let start = 0;
    let hasMore = true;
    let data = [];

    while (hasMore) {
      const results = await strapi.documents(uid).findMany({
        limit: pageSize,
        start,
      });

      data = [...data, ...results];

      hasMore = results.length === pageSize;
      start += pageSize;
    }

    ctx.body = {data};
  },
  async importCollection(ctx) {
    const {name, data, relations = []} = ctx.request.body;
    if (!name || !data) {
      ctx.throw(400, 'Name and data are required');
    }

    // Найти коллекцию
    const found = controller._findContentTypeByName(name);
    if (!found) {
      ctx.throw(404, 'Collection not found');
    }
    const uid = found.uid;

    // Универсально: всегда принимаем массив объектов!
    let records = [];
    if (!Array.isArray(data)) ctx.throw(400, 'Data must be array of objects');
    records = data;

    let created = 0, failed = 0, failedDetails = [];
    for (const [i, item] of records.entries()) {
      try {
        const contentType = strapi.contentTypes[uid];
        const attrs = contentType?.attributes ?? {};

        const dataToCreate: any = {...item};

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
            if (raw === null || raw === undefined || raw === "") {
              dataToCreate[field] = null;
              continue;
            }

            const foreignAttrType =
              (strapi.contentTypes as any)?.[targetUid]?.attributes?.[foreignField]?.type;
            let matchValue: any = raw;
            if (
              foreignAttrType === "integer" ||
              foreignAttrType === "biginteger" ||
              foreignAttrType === "float" ||
              foreignAttrType === "decimal"
            ) {
              const n = typeof raw === "number" ? raw : Number(raw);
              if (Number.isNaN(n)) {
                throw new Error(
                  `Relation "${field}": value ${JSON.stringify(raw)} is not a number for ${targetUid}.${foreignField}`
                );
              }
              matchValue = n;
            }

            const results = await (strapi as any).documents(targetUid).findMany({
              filters: {
                [foreignField]: { $eq: matchValue },
              },
              fields: ["documentId"],
              limit: 2,
              start: 0,
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
            const isMulti =
              relKind === "oneToMany" || relKind === "manyToMany" || relKind === "manyWay";

            dataToCreate[field] = isMulti ? [foreignDocumentId] : foreignDocumentId;
          }
        }

        await (strapi as any).documents(uid).create({data: dataToCreate});
        created++;
      } catch (e) {
        failed++;
        failedDetails.push(`Row ${i + 1}: ${(e?.message || "Unknown error")}`);
      }
    }
    ctx.body = {success: true, created, failed, failedDetails};
  },
  async getSchema(ctx) {
    const {uid} = ctx.request.query;
    if (!uid) ctx.throw(400, "uid is required");
    const contentType = strapi.contentTypes[uid];
    if (!contentType) ctx.throw(404, "Content type not found");
    ctx.body = contentType.attributes;
  },
};
