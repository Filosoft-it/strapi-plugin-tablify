declare const _default: {
    register: ({ strapi }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => void;
    bootstrap: ({ strapi }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => void;
    destroy: ({ strapi }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => void;
    config: {
        default: {};
        validator(): void;
    };
    controllers: {
        controller: {
            hello(ctx: any): Promise<void>;
            tables(ctx: any): Promise<void>;
            dumpCollection(ctx: any): Promise<void>;
            importCollection(ctx: any): Promise<void>;
            getSchema(ctx: any): Promise<void>;
        };
    };
    routes: {
        method: string;
        path: string;
        handler: string;
        config: {
            auth: boolean;
        };
    }[];
    services: {
        service: ({ strapi }: {
            strapi: import('@strapi/types/dist/core').Strapi;
        }) => {
            getWelcomeMessage(): string;
        };
    };
    contentTypes: {};
    policies: {};
    middlewares: {};
};
export default _default;
