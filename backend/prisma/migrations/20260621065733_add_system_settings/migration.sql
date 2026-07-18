-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "companyCommission" INTEGER NOT NULL DEFAULT 15,
    "minWithdrawalAmount" INTEGER NOT NULL DEFAULT 50,
    "maxWithdrawalAmount" INTEGER NOT NULL DEFAULT 5000,
    "withdrawalProcessingDays" INTEGER NOT NULL DEFAULT 1,
    "documentExpiryWarningDays" INTEGER NOT NULL DEFAULT 30,
    "uberIntegration" BOOLEAN NOT NULL DEFAULT true,
    "boltIntegration" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveDocuments" BOOLEAN NOT NULL DEFAULT false,
    "requireTwoFactorAuth" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);
