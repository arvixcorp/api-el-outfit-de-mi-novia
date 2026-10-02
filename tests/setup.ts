// Valores por defecto para que los tests no dependan del .env ni toquen la base real.
process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] ??= "mysql://test:test@127.0.0.1:3306/test";
process.env["JWT_ACCESS_SECRET"] ??= "test-secret-test-secret-test-secret-123";
process.env["S3_ACCESS_KEY"] ??= "test";
process.env["S3_SECRET_KEY"] ??= "test";
process.env["S3_ENDPOINT"] = "";
process.env["S3_BUCKET"] = "test-bucket";
process.env["S3_REGION"] = "us-east-1";
process.env["S3_FORCE_PATH_STYLE"] = "false";
// Los tests nunca deben llamar a una IA real ni depender de las claves del .env.
process.env["DEEPSEEK_API_KEY"] = "";
process.env["ANTHROPIC_API_KEY"] = "";
