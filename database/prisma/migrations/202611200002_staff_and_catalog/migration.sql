-- AlterTable
ALTER TABLE `Account` ADD COLUMN `authVersion` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `enrollmentExpiry` DATETIME(3) NULL,
    ADD COLUMN `enrollmentHash` CHAR(64) NULL,
    ADD COLUMN `lastStep` INTEGER NOT NULL DEFAULT -1,
    ADD COLUMN `mfaSecret` TEXT NULL,
    ADD COLUMN `staffRole` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `Session` ADD COLUMN `authVersion` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `verified` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `care` TEXT NULL,
    ADD COLUMN `composition` TEXT NULL,
    ADD COLUMN `fitNotes` TEXT NULL,
    ADD COLUMN `measurements` TEXT NULL;

-- CreateTable
CREATE TABLE `MfaChallenge` (
    `token` CHAR(64) NOT NULL,
    `accountId` INTEGER NOT NULL,
    `expires` DATETIME(3) NOT NULL,
    `secret` TEXT NULL,
    `authVersion` INTEGER NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecoveryCode` (
    `digest` CHAR(64) NOT NULL,
    `accountId` INTEGER NOT NULL,

    PRIMARY KEY (`digest`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `occurred` DATETIME(3) NULL,

    INDEX `OrderEvent_orderId_id_idx`(`orderId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Audit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorId` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `recordId` INTEGER NOT NULL,
    `created` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `before` JSON NOT NULL,
    `after` JSON NOT NULL,

    INDEX `Audit_actorId_created_idx`(`actorId`, `created`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MfaChallenge` ADD CONSTRAINT `MfaChallenge_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecoveryCode` ADD CONSTRAINT `RecoveryCode_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderEvent` ADD CONSTRAINT `OrderEvent_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the authority of pre-existing administrators. New staff receive an explicit role.
UPDATE Account SET staffRole='Owner' WHERE role='admin';
INSERT INTO OrderEvent(orderId,status,occurred) SELECT id,'Placed',created FROM `Order`;
-- Import the known current state without assigning a fabricated transition time.
INSERT INTO OrderEvent(orderId,status,occurred) SELECT id,status,NULL FROM `Order` WHERE status <> 'Placed';