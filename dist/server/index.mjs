const bootstrap = ({ strapi: strapi2 }) => {
};
const config = {
  default: {},
  validator() {
  }
};
const contentTypes = {};
const controller = {
  async hello(ctx) {
    ctx.body = "Hello from backend!";
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
    const allContentTypes = Object.values(strapi.contentTypes);
    const found = allContentTypes.find(
      (type) => type.info?.displayName?.toLowerCase() === name.toLowerCase() || type.collectionName?.toLowerCase() === name.toLowerCase()
    );
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
    const { name, data, format = "json" } = ctx.request.body;
    if (!name || !data) {
      ctx.throw(400, "Name and data are required");
    }
    const allContentTypes = Object.values(strapi.contentTypes);
    const found = allContentTypes.find(
      (type) => type.info?.displayName?.toLowerCase() === name.toLowerCase() || type.collectionName?.toLowerCase() === name.toLowerCase()
    );
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
        await strapi.db.query(uid).create({ data: item });
        created++;
      } catch (e) {
        failed++;
        failedDetails.push(`Row ${i + 1}: ${e?.message || "Unknown error"}`);
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
