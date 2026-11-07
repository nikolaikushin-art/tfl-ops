import type {
  Deal, Contact, Customer, Supplier, Product, PricingRecord, Quotation, Order, Invoice,
  CustomerRequirement, Opportunity, Communication, Document, KycRecord, AiExtractionJob,
  Campaign, Expense, Payment, Delivery, User, Organisation, CrmSettings, SalesSettings,
  ProductSettings, TradeSettings, Warehouse, InventoryItem, StockMovement, Shipment, Brand, Market,
} from "./domain";
import type { FxTable } from "./fx";
import type { StockLot } from "./ownStock";

const now = new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

/**
 * Starting data for a new workspace: settings only, NO sample records.
 * The Film Location trades in the UK: sterling, UK VAT, UK regions.
 * Company identifiers (VAT number, company number, phone, email, website) start blank
 * and are filled in under Settings, so nothing invented ever prints on a document.
 */
export const seedData = {

  organisation: {
    legalName: "The Film Location Ltd",
    tradingName: "The Film Location",
    addressLine1: "843 Finchley Rd",
    city: "London",
    postcode: "NW11 8NA",
    country: "United Kingdom",
    vatNumber: "",
    registrationNumber: "",
    defaultCurrency: "GBP",
    phone: "",
    email: "",
    website: "",
  } as Organisation,

  users: [
    {
      id: "u1",
      name: "Roni Ornadel",
      email: "roni@thefilmlocation.com",
      role: "administrator",
      isActive: true,
      createdAt: daysAgo(400),
      lastLoginAt: now,
    },
    {
      id: "u2",
      name: "Commercial Lead",
      email: "commercial@thefilmlocation.com",
      role: "commercial",
      isActive: true,
      createdAt: daysAgo(300),
      lastLoginAt: daysAgo(1),
    },
    {
      id: "u3",
      name: "Finance",
      email: "finance@thefilmlocation.com",
      role: "finance",
      isActive: true,
      createdAt: daysAgo(250),
      lastLoginAt: daysAgo(3),
    },
  ] as User[],

  crmSettings: {
    leadSources: ["Referral", "Website", "Repeat client", "Phone", "Email", "Social media"],
    customerSegments: ["Feature film", "TV", "Commercial", "Music video", "Photography", "Other"],
    salesTerritories: ["London", "South East", "Rest of England", "Scotland, Wales & N. Ireland", "Ireland", "Europe", "Rest of world"],
    requireKycForOnboarding: false,
    followUpReminderDays: 5,
    documentExpiryWarningDays: 45,
  } as CrmSettings,

  salesSettings: {
    quotationPrefix: "QT-2026-",
    quotationValidityDays: 30,
    orderPrefix: "SO-2026-",
    invoicePrefix: "INV-2026-",
    defaultPaymentTerms: "30 days",
    defaultTaxRatePct: 20, // UK standard rate of VAT
    requireApprovalAboveAmount: 25000,
  } as SalesSettings,

  productSettings: {
    categories: [] as string[],
    units: ["day", "half day", "hour"],
    defaultCurrency: "GBP",
    lowMarginThresholdPct: 15,
  } as ProductSettings,

  /**
   * Rate table. Entered by hand and dated, because that is the only honest
   * provenance a client-side build can claim (see `lib/fx.ts`). GBP is the
   * base: the company reports in sterling, files VAT in sterling, and banks
   * in sterling.
   */
  fx: {
    base: "GBP",
    rates: [
      { currency: "USD", perBase: 1.2640, asOf: daysAgo(2) },
      { currency: "EUR", perBase: 1.1720, asOf: daysAgo(2) },
      { currency: "SGD", perBase: 1.7020, asOf: daysAgo(9) },
      { currency: "JPY", perBase: 188.40, asOf: daysAgo(4) },
      { currency: "AED", perBase: 4.6420, asOf: daysAgo(74) },
    ],
  } as FxTable,

  tradeSettings: {
    targetMarginPct: 22,
    priceAlertThresholdPct: 5,
  } as TradeSettings,

  ownStock: [] as StockLot[],
  deals: [] as Deal[],
  snoozedSignals: {} as Record<string, string>,
  dismissedSignals: [] as string[],
  contacts: [] as Contact[],
  customers: [] as Customer[],
  suppliers: [] as Supplier[],
  products: [] as Product[],
  brands: [] as Brand[],
  markets: [] as Market[],
  warehouses: [] as Warehouse[],
  inventoryItems: [] as InventoryItem[],
  stockMovements: [] as StockMovement[],
  shipments: [] as Shipment[],
  pricingRecords: [] as PricingRecord[],
  quotations: [] as Quotation[],
  orders: [] as Order[],
  deliveries: [] as Delivery[],
  invoices: [] as Invoice[],
  requirements: [] as CustomerRequirement[],
  opportunities: [] as Opportunity[],
  communications: [] as Communication[],
  expenses: [] as Expense[],
  payments: [] as Payment[],
  campaigns: [] as Campaign[],
  documents: [] as Document[],
  kycRecords: [] as KycRecord[],
  extractionJobs: [] as AiExtractionJob[],
};
