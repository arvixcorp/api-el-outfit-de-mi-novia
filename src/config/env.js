import dotenv from "dotenv";
dotenv.config();

export const env = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
    db: {
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        port: process.env.MYSQL_PORT,
        password: process.env.MYSQL_PASSWORD,
        server_database: process.env.RAILWAY_DATABASE,
        database: process.env.MYSQL_DATABASE,
    },
    jwt_secret: process.env.JWT_SECRET,
    apiKey: process.env.API_KEY,
};
