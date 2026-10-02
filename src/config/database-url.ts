type Source = Record<string, string | undefined>;

/**
 * Devuelve la URL de conexion a MySQL. Usa DATABASE_URL si existe; si no,
 * la arma con MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASENAME, MYSQL_USER y MYSQL_PASSWORD
 * (el usuario y la clave se codifican, asi que pueden llevar caracteres especiales).
 */
export function resolveDatabaseUrl(source: Source): string | undefined {
  if (source.DATABASE_URL) return source.DATABASE_URL;

  const { MYSQL_HOST: host, MYSQL_USER: user, MYSQL_PASSWORD: password } = source;
  const database = source.MYSQL_DATABASENAME ?? source.MYSQL_DATABASE;
  if (!host || !user || !database) return undefined;

  const port = source.MYSQL_PORT || "3306";
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password ?? "")}`;
  return `mysql://${auth}@${host}:${port}/${database}`;
}
