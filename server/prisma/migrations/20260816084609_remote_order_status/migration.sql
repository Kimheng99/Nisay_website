/*
  Warnings:

  - The values [COMPLECTED] on the enum `ShopOrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ShopOrderStatus_new" AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED');
ALTER TABLE "public"."ShopOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ShopOrder" ALTER COLUMN "status" TYPE "ShopOrderStatus_new" USING ("status"::text::"ShopOrderStatus_new");
ALTER TYPE "ShopOrderStatus" RENAME TO "ShopOrderStatus_old";
ALTER TYPE "ShopOrderStatus_new" RENAME TO "ShopOrderStatus";
DROP TYPE "public"."ShopOrderStatus_old";
ALTER TABLE "ShopOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
