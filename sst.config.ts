/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "payment-gateway",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    new sst.aws.Function("PaymentGateway", {
      url: true,
      handler: "src/server.handler",
      nodejs: {
        install: ["mysql2"], // Only install the driver you're actually using
        esbuild: {
          external: [
            "mariadb",
            "mariadb/callback",
            "mysql",
            "tedious",
            "pg-native",
            "pg-query-stream",
            "oracledb",
            "better-sqlite3",
            "sqlite3",
            "@mikro-orm/mongodb",
            "@mikro-orm/better-sqlite",
            "libsql",
          ],
        },
      },
    });
  },
});
