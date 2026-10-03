-- AlterTable
ALTER TABLE `garments`
    ADD COLUMN `descripcion_ia` TEXT NULL,
    ADD COLUMN `intentos` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `error_procesamiento` TEXT NULL,
    ADD COLUMN `procesando_desde` DATETIME(3) NULL,
    ADD COLUMN `proximo_intento` DATETIME(3) NULL;
