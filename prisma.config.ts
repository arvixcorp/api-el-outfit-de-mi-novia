import "dotenv/config";
import { defineConfig } from "prisma/config";

type EnvSource = Record<string, string | undefined>;

function resolveDatabaseUrl(source: EnvSource): string | undefined {
  if (source.DATABASE_URL) return source.DATABASE_URL;

  const { MYSQL_HOST: host, MYSQL_USER: user, MYSQL_PASSWORD: password } = source;
  const database = source.MYSQL_DATABASENAME ?? source.MYSQL_DATABASE;
  if (!host || !user || !database) return undefined;

  const port = source.MYSQL_PORT || "3306";
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password ?? "")}`;
  return `mysql://${auth}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: resolveDatabaseUrl(process.env) ?? "" },
});
