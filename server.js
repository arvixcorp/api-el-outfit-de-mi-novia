import dotenv from "dotenv";
import app from "./src/app.js";
// import { testConnection, syncModels } from "./src/config/database.js";
import { logger } from "./src/config/logger.js";
import { initMySQL } from "./src/database/connection.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // await testConnection();
        // await syncModels();

        initMySQL();

        app.listen(PORT, () => {
            logger.info(`➤ Servidor escuchando en el puerto ${PORT}`);
        });
    } catch (error) {
        logger.error("✖ Error al iniciar el servidor:", error);
        process.exit(1);
    }
}

startServer();
