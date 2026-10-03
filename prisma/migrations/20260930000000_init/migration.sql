
-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `estilo_preferido` TEXT NULL,
    `ciudad` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `garments` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `estado_procesamiento` ENUM('pending', 'processing', 'ready', 'failed') NOT NULL DEFAULT 'pending',
    `url_original` VARCHAR(1024) NULL,
    `url_sin_fondo` VARCHAR(1024) NULL,
    `url_thumbnail` VARCHAR(1024) NULL,
    `blurhash` VARCHAR(191) NULL,
    `ancho` INTEGER NULL,
    `alto` INTEGER NULL,
    `color_dominante_hex` VARCHAR(9) NULL,
    `colores_secundarios` JSON NULL,
    `categoria` ENUM('top', 'bottom', 'vestido', 'outerwear', 'calzado', 'bolso', 'accesorio') NULL,
    `subcategoria` VARCHAR(191) NULL,
    `patron` ENUM('liso', 'rayas', 'cuadros', 'floral', 'estampado', 'otro') NULL,
    `material` VARCHAR(191) NULL,
    `formalidad` TINYINT NULL,
    `temporadas` JSON NULL,
    `ocasiones` JSON NULL,
    `marca` VARCHAR(191) NULL,
    `notas` TEXT NULL,
    `favorito` BOOLEAN NOT NULL DEFAULT false,
    `veces_usada` INTEGER NOT NULL DEFAULT 0,
    `ultima_vez_usada` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `garments_user_id_idx`(`user_id`),
    INDEX `garments_user_id_categoria_deleted_at_idx`(`user_id`, `categoria`, `deleted_at`),
    INDEX `garments_estado_procesamiento_idx`(`estado_procesamiento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outfits` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `nombre` VARCHAR(191) NULL,
    `origen` ENUM('ia', 'manual') NOT NULL,
    `ocasion` VARCHAR(191) NULL,
    `clima_contexto` JSON NULL,
    `explicacion_ia` TEXT NULL,
    `favorito` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `outfits_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outfit_items` (
    `outfit_id` CHAR(36) NOT NULL,
    `garment_id` CHAR(36) NOT NULL,
    `posicion` INTEGER NOT NULL DEFAULT 0,

    INDEX `outfit_items_garment_id_idx`(`garment_id`),
    PRIMARY KEY (`outfit_id`, `garment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outfit_feedback` (
    `id` CHAR(36) NOT NULL,
    `outfit_id` CHAR(36) NOT NULL,
    `rating` ENUM('me_gusta', 'no_me_gusta') NOT NULL,
    `comentario` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `outfit_feedback_outfit_id_idx`(`outfit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wear_log` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `outfit_id` CHAR(36) NULL,
    `fecha` DATE NOT NULL,

    INDEX `wear_log_user_id_fecha_idx`(`user_id`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garments` ADD CONSTRAINT `garments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfits` ADD CONSTRAINT `outfits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_items` ADD CONSTRAINT `outfit_items_outfit_id_fkey` FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_items` ADD CONSTRAINT `outfit_items_garment_id_fkey` FOREIGN KEY (`garment_id`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_feedback` ADD CONSTRAINT `outfit_feedback_outfit_id_fkey` FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wear_log` ADD CONSTRAINT `wear_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wear_log` ADD CONSTRAINT `wear_log_outfit_id_fkey` FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

