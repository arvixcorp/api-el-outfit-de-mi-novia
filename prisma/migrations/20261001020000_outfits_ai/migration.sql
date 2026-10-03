-- AlterTable
ALTER TABLE `outfits` ADD COLUMN `guardado` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ai_usage` (
    `user_id` CHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `llamadas` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`user_id`, `fecha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recommendation_cache` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `clave` VARCHAR(64) NOT NULL,
    `resultado` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `recommendation_cache_user_id_clave_key`(`user_id`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_cache` ADD CONSTRAINT `recommendation_cache_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
