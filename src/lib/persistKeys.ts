/** Collections written to storage and synced to the server database. */
export const PERSIST_KEYS = [
  "customers","contacts","suppliers","products","pricingRecords","quotations","orders","invoices",
  "requirements","opportunities","communications","documents","kycRecords","extractionJobs",
  "campaigns","expenses","payments","deliveries","warehouses","inventoryItems","stockMovements","ownStock",
  "shipments","brands","markets","organisation","users",
  "crmSettings","salesSettings","productSettings","fx","tradeSettings","dismissedSignals",
  "snoozedSignals","deals",
] as const;
export const PERSIST_NAME = "data.v20";
