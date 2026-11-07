import { PERSIST_KEYS, PERSIST_NAME } from "./persistKeys";
import { serverLogout } from "./serverSync";
import { deductFromLot, restoreToLot, isSaleReal, reserveLot, releaseReservation, type StockLot } from "./ownStock";
import { readCompliance } from "@/lib/useCampaignCompliance";
import { applySuppression, sendGate, withUnsubscribe, buildUnsubscribeUrl, fromAddress } from "@/lib/campaignCompliance";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Deal,
  Contact,
  Customer,
  Supplier,
  Product,
  PricingRecord,
  Quotation,
  Order,
  Invoice,
  CustomerRequirement,
  Opportunity,
  Communication,
  Document,
  KycRecord,
  User,
  AiExtractionJob,
  Organisation,
  CrmSettings,
  SalesSettings,
  ProductSettings,
  QuotationLine,
  MailFolder,
  Campaign,
  CampaignAudience,
  CampaignRecipient,
  Expense,
  Payment,
  Delivery,
  TradeSettings,
  Warehouse,
  InventoryItem,
  StockMovement,
  Shipment,
  ShipmentStatus,
  DeliveryException,
  ProofOfDelivery,
  Brand,
  Market,
  ContactRole,
  PartyProfile,
  TradeTerms,
} from "./domain";
import type { OfferDraft } from "./offerImport";
import { seedData } from "./seed";
import { loadValue, saveValue, removeValue } from "./storage";
import { intakeFields as fileIntake } from "./library";
import {
  computeTotals,
  nextDocumentNumber,
  toQuotationLines,
  type DraftLine,
} from "./lines";
import { checkDespatch, fulfilmentRatio } from "./fulfilment";
import { blankDeal, nextDealRef } from "./deals";
import { matchRequest } from "./requests";
import type { FxRate, FxTable } from "./fx";

/**
 * The deterministic text-extraction helpers moved to `lib/extraction.ts` so
 * they can be unit-tested without compiling JSX. They are re-exported here
 * unchanged: every existing `from "@/lib/store"` import keeps working.
 */
export {
  inferDocumentType,
  parseCommercialTerms,
  renderTemplate,
  type ParsedTerms,
} from "./extraction";
// `export ... from` re-exports without binding the names locally, and this
// module still calls all three internally — `inferDocumentType` when filing
// mail attachments, `renderTemplate` when sending a campaign, and
// `parseCommercialTerms` when extracting offer terms from a message. They are
// imported as well as forwarded.
import { inferDocumentType, parseCommercialTerms, renderTemplate } from "./extraction";

interface StoreState {
  user: User | null;
  customers: Customer[];
  contacts: Contact[];
  suppliers: Supplier[];
  products: Product[];
  pricingRecords: PricingRecord[];
  quotations: Quotation[];
  orders: Order[];
  invoices: Invoice[];
  requirements: CustomerRequirement[];
  opportunities: Opportunity[];
  communications: Communication[];
  documents: Document[];
  kycRecords: KycRecord[];
  extractionJobs: AiExtractionJob[];
  campaigns: Campaign[];
  expenses: Expense[];
  payments: Payment[];
  deliveries: Delivery[];
  warehouses: Warehouse[];
  inventoryItems: InventoryItem[];
  stockMovements: StockMovement[];
  /** Goods held under TFL's name (Stock). */
  ownStock: StockLot[];
  shipments: Shipment[];
  brands: Brand[];
  markets: Market[];
  isAuthenticated: boolean;
  organisation: Organisation;
  users: User[];
  crmSettings: CrmSettings;
  salesSettings: SalesSettings;
  productSettings: ProductSettings;
  /** Manually maintained rate table. See `lib/fx.ts` for why it is manual. */
  fx: FxTable;
  tradeSettings: TradeSettings;
  /** Signals the user has cleared this session, by signal id. */
  dismissedSignals: string[];
  /** v17: snoozed notifications — signal id -> ISO time it returns. */
  snoozedSignals: Record<string, string>;
  /** v17: back-to-back escrow deals. */
  deals: Deal[];
  /** Which optional modules show in the navigation. Keyed by AppSection id.
   *  A module missing from this map is treated as visible — this map only
   *  ever needs to record the exceptions, so adding a new module elsewhere
   *  in the app never silently hides it. */
  moduleSettings: Record<string, boolean>;
}

/**
 * Shared payload for the quotation and order forms. `lines` is the source of
 * truth; `total` is only honoured as a fallback for callers that still create a
 * single-value document without a line breakdown.
 */
export interface DocumentInput {
  customerId: string;
  title: string;
  currency?: string;
  lines?: DraftLine[];
  taxRatePct?: number;
  total?: number;
  notes?: string;
  opportunityId?: string;
  /** v19: quote created from a request stays attached to it. */
  requirementId?: string;
  validUntil?: string;
}

/** Payload for the mail composer — reply, forward and new message all share it. */
export interface ComposeInput {
  channel?: "email" | "whatsapp";
  to: string;
  cc?: string;
  subject: string;
  body: string;
  customerId?: string;
  supplierId?: string;
  contactId?: string;
  quotationId?: string;
  orderId?: string;
  invoiceId?: string;
  threadId?: string;
  /** v25: which of Roni's mailboxes to send from. */
  from?: string;
  /** Save to Drafts instead of Sent. */
  asDraft?: boolean;
  /** Local demo attachments (name + size only; no binary upload server). */
  attachments?: { name: string; size?: number; mimeType?: string }[];
}

export interface OpportunityInput {
  customerId: string;
  title: string;
  stage?: Opportunity["stage"];
  value?: number;
  currency?: string;
  requirementId?: string;
  productId?: string;
  supplierId?: string;
  ownerId?: string;
  nextAction?: string;
  nextActionDue?: string;
  notes?: string;
}

interface StoreActions {
  signIn: (email: string, password: string) => boolean;
  signOut: () => void;
  adoptServerSession: (u: { email: string; name: string; role: string }) => void;
  hydrateFromServer: (incoming: Partial<StoreState>) => void;
  approvePricing: (id: string) => void;
  rejectPricing: (id: string) => void;
  updatePricing: (id: string, patch: Partial<PricingRecord>) => void;
  addCustomer: (c: Partial<Customer>) => void;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  removeCustomer: (id: string) => void;
  addSupplier: (s: Partial<Supplier>) => void;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  removeSupplier: (id: string) => void;
  addContact: (c: Partial<Contact>) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  addProduct: (p: Partial<Product>) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  addDocument: (d: Partial<Document>) => void;
  updateDocument: (id: string, patch: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  updateKycStatus: (id: string, status: KycRecord["status"]) => void;
  /** v17: "Send Onboarding & KYC" — creates a case with a form link. */
  sendKycRequest: (partyType: "customer" | "supplier", partyId: string) => KycRecord;
  /** v17: contact submits the onboarding form; fills the contact record. */
  submitKycForm: (
    kycId: string,
    data: { name?: string; email?: string; phone?: string; website?: string; addressLine1?: string; city?: string; country?: string; vatNumber?: string; companyNumber?: string; bankDetails?: string },
    /** v22: kept on the case (contact name, directors, declaration) but not copied onto the record. */
    extra?: Record<string, unknown>,
  ) => void;
  /** Reviewer's working note on a KYC case, saved independently of the
   *  approve/reject decision so a part-finished review isn't lost. */
  updateKycNotes: (id: string, notes: string) => void;
  convertQuotationToOrder: (quotationId: string) => string | null;
  convertOrderToInvoice: (orderId: string) => string | null;
  runHistoricalEmailScan: () => { created: number; message: string };
  /* --- Mailbox ---------------------------------------------------------- */
  markCommunicationRead: (id: string, isRead?: boolean) => void;
  toggleCommunicationStar: (id: string) => void;
  toggleCommunicationFlag: (id: string) => void;
  moveCommunication: (id: string, folder: MailFolder) => void;
  /** Sends (or files as draft) a composed message and returns its id. */
  sendCommunication: (input: ComposeInput) => string;
  /** Files an email attachment into Documents against the linked
   *  customer/supplier, and stamps the attachment so it can't be filed twice. */
  fileAttachment: (communicationId: string, attachmentId: string) => string | null;
  /** Banks the commercial terms found in a received message as a pricing
   *  record in the review queue. Returns the new record id. */
  extractFromCommunication: (id: string) => string | null;
  /* --- Campaigns / mass mailing ---------------------------------------- */
  /** Resolves an audience definition to the live recipient list. Pure, so the
   *  builder can show the real count before anything is saved or sent. */
  resolveAudience: (audience: CampaignAudience) => CampaignRecipient[];
  addCampaign: (input: Partial<Campaign>) => string;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  removeCampaign: (id: string) => void;
  /** Sends a campaign: resolves the audience, writes one outbound message per
   *  recipient into their account timeline, and records engagement. */
  sendCampaign: (id: string) => { sent: number; message: string };
  /* --- Finance ---------------------------------------------------------- */
  addExpense: (input: Partial<Expense>) => string;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  removeExpense: (id: string) => void;
  /** Records money received against an invoice, updating the invoice's paid
   *  amount and status in the same transaction so the two can't drift. */
  recordReceipt: (input: {
    invoiceId: string;
    amount: number;
    method?: Payment["method"];
    reference?: string;
    paidAt?: string;
    notes?: string;
  }) => string | null;
  /** Records money paid out against an expense. */
  recordSupplierPayment: (input: {
    expenseId: string;
    amount: number;
    method?: Payment["method"];
    reference?: string;
    paidAt?: string;
  }) => string | null;
  /* --- Fulfilment ------------------------------------------------------- */
  /** Records a despatch against an order. Rejects over-despatch with a reason
   *  and advances the order's status to shipped/delivered in the same
   *  transaction, so the order list can never disagree with its own
   *  delivery notes. */
  addDelivery: (input: {
    orderId: string;
    quantities: Record<string, number>;
    carrier?: string;
    trackingRef?: string;
    despatchedAt?: string;
    incoterms?: string;
    destination?: string;
    notes?: string;
  }) => { id: string | null; message: string };
  markDeliveryArrived: (id: string, deliveredAt?: string) => void;
  removeDelivery: (id: string) => void;
  /* --- Warehousing & Inventory -------------------------------------------- */
  addWarehouse: (w: Partial<Warehouse>) => string;
  updateWarehouse: (id: string, patch: Partial<Warehouse>) => void;
  removeWarehouse: (id: string) => void;
  /** Books stock into a warehouse — creates the inventory line for that
   *  product/batch if it doesn't already exist, then logs the movement. */
  receiveStock: (input: {
    warehouseId: string;
    productId: string;
    quantity: number;
    batchOrLot?: string;
    reference?: string;
    notes?: string;
  }) => string;
  /** Direct correction to an inventory line (stock count, reorder point,
   *  write-off), logged as an "adjustment" movement so the reason for the
   *  change is never lost. */
  adjustInventory: (
    id: string,
    patch: Partial<InventoryItem>,
    reason?: string,
  ) => void;
  /* --- Global Freight & Last-Mile Delivery -------------------------------- */
  addShipment: (input: Partial<Shipment>) => string;
  updateShipment: (id: string, patch: Partial<Shipment>) => void;
  updateShipmentStatus: (id: string, status: ShipmentStatus) => void;
  removeShipment: (id: string) => void;
  /** Records proof of delivery against an existing despatch — the last-mile
   *  confirmation that closes the loop once goods are actually received. */
  recordProofOfDelivery: (deliveryId: string, pod: ProofOfDelivery) => void;
  /** Flags a last-mile problem (damage, shortage, refusal) against a despatch. */
  reportDeliveryException: (
    deliveryId: string,
    exception: Omit<DeliveryException, "resolved" | "resolvedAt">,
  ) => void;
  resolveDeliveryException: (deliveryId: string) => void;
  addBrand: (input: Partial<Brand>) => string;
  updateBrand: (id: string, patch: Partial<Brand>) => void;
  removeBrand: (id: string) => void;
  addMarket: (input: Partial<Market>) => string;
  updateMarket: (id: string, patch: Partial<Market>) => void;
  removeMarket: (id: string) => void;
  /* --- Requirements ----------------------------------------------------- */
  addRequirement: (input: Partial<CustomerRequirement>) => string;
  updateRequirement: (id: string, patch: Partial<CustomerRequirement>) => void;
  removeRequirement: (id: string) => void;
  /** Re-runs supplier matching for a requirement against approved pricing.
   *  Matching is recomputed rather than stored as a verdict, so a requirement
   *  can't keep claiming a supplier match after that offer has been rejected. */
  matchRequirement: (id: string) => { matched: number; message: string };
  addQuotation: (input: DocumentInput) => string;
  updateQuotation: (id: string, patch: Partial<Quotation>) => void;
  updateQuotationStatus: (id: string, status: Quotation["status"]) => void;
  addOrder: (input: DocumentInput & { deliveryDate?: string }) => string;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  updateOrderStatus: (id: string, status: Order["status"]) => void;
  addOpportunity: (input: OpportunityInput) => string;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => void;
  removeOpportunity: (id: string) => void;
  updateOpportunityStage: (id: string, stage: Opportunity["stage"]) => void;
  markInvoicePaid: (id: string) => void;
  addStockLot: (lot: Omit<StockLot, "id" | "createdAt" | "updatedAt" | "reservedQty" | "soldTo">) => void;
  updateStockLot: (id: string, patch: Partial<StockLot>) => void;
  removeStockLot: (id: string) => void;
  /** Set goods aside for a deal. The screen checks with `reserveLot` first; a refused reservation changes nothing. */
  reserveStock: (lotId: string, dealId: string, qty: number) => void;
  releaseStock: (lotId: string) => void;
  /** Move an invoice to another company's books (undefined = primary). */
  setInvoiceCompany: (id: string, companyId?: string) => void;
  updateOrganisation: (patch: Partial<Organisation>) => void;
  addUser: (u: Partial<User>) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  removeUser: (id: string) => void;
  /** Replaces the rate table. Each rate carries the date it was entered, so a
   *  save re-stamps only the rates that actually changed. */
  updateFxRates: (rates: FxRate[]) => void;
  setReportingCurrency: (currency: string) => void;
  updateTradeSettings: (patch: Partial<TradeSettings>) => void;
  /** Clears a signal for this session. Signals are derived, never stored, so a
   *  dismissal suppresses the row rather than editing the underlying record —
   *  if the invoice is still overdue tomorrow, the signal comes back. */
  dismissSignal: (id: string) => void;
  snoozeSignal: (id: string, days: number) => void;
  addDeal: (deal: Omit<Deal, "id" | "createdAt" | "updatedAt">) => string;
  /** v18 — one directory. Creates the buyer and/or supplier records a company
   *  needs for its roles and links them with a shared partyId. */
  addParty: (input: NewPartyInput) => string;
  /** Changes a company's roles, creating the missing buyer/supplier record. */
  setPartyRoles: (anchor: { kind: "customer" | "supplier"; id: string }, roles: ContactRole[]) => void;
  /** Writes shared profile fields to every record of a company. */
  updatePartyProfile: (recordIds: string[], patch: Partial<PartyProfile>) => void;
  /** Writes trade terms to every record of a company. */
  updatePartyTerms: (recordIds: string[], patch: Partial<TradeTerms>) => void;
  /** Adds offers read from a file / email to the review queue. Returns count added. */
  addPricingBatch: (drafts: OfferDraft[]) => number;
  /** Adds customer requests read from an email / Excel list. Returns count added. */
  addRequestsBatch: (items: Partial<CustomerRequirement>[]) => number;
  /** v26: files messages read from an exported chat. Skips any already held. Returns count added. */
  addCommunicationsBatch: (items: Communication[]) => number;
  /** An accepted quote becomes a potential deal on the Deal Desk. */
  startDealFromQuotation: (quotationId: string) => string | null;
  /** Empties demo records so real data can be loaded. Keeps settings and users. */
  clearDemoData: () => void;
  /** Restores the demo records. */
  resetDemoData: () => void;
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  removeDeal: (id: string) => void;
  restoreSignals: () => void;
  updateCrmSettings: (patch: Partial<CrmSettings>) => void;
  updateSalesSettings: (patch: Partial<SalesSettings>) => void;
  updateProductSettings: (patch: Partial<ProductSettings>) => void;
  /** Shows or hides an optional module in the navigation. Core modules
   *  (dashboard, signals, settings) ignore this — see `CORE_MODULES`. */
  setModuleEnabled: (section: string, enabled: boolean) => void;
}

export interface NewPartyInput {
  name: string;
  roles: ContactRole[];
  country?: string;
  city?: string;
  email?: string;
  phone?: string;
  soleTrader?: boolean;
  /** First person at the company (e.g. from an import's Contact person column). */
  person?: { firstName: string; lastName: string; email?: string; phone?: string };
  profile?: PartyProfile;
  tradeTerms?: TradeTerms;
}

type Store = StoreState & StoreActions;

/** Collections written to the browser so a reload keeps the work. The hosted
 *  product replaces this with the server database (see backend/). */
// PERSIST_KEYS / PERSIST_NAME live in persistKeys.ts so the server sync uses the same list.

function persisted(): Partial<StoreState> {
  return loadValue<Partial<StoreState>>(PERSIST_NAME) ?? {};
}

/** The signed-in session survives refresh, crashes and new tabs until the user
 *  explicitly signs out. (Demo auth only: the hosted product uses server sessions.) */
const SESSION_NAME = "session.v1";
function restoredSession(): { isAuthenticated: boolean; user: User | null } {
  const saved = loadValue<{ user?: User }>(SESSION_NAME);
  const u = saved?.user;
  if (u && typeof u.id === "string" && typeof u.email === "string") {
    return { isAuthenticated: true, user: u };
  }
  return { isAuthenticated: false, user: null };
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => ({
    ...seedData,
    ...persisted(),
    ...restoredSession(),
    moduleSettings: loadValue<Record<string, boolean>>("moduleSettings") ?? {},
  }));

  // Save on change (debounced). Only data collections are saved, never the session.
  // A second browser tab (for example the public onboarding form) writes to the
  // same storage; we pick its changes up, and skip re-saving what we just loaded
  // so two tabs can never ping-pong the same data back and forth.
  const lastSaved = useRef<string>("");
  useEffect(() => {
    const t = setTimeout(() => {
      const slice: Record<string, unknown> = {};
      for (const k of PERSIST_KEYS) slice[k] = (state as unknown as Record<string, unknown>)[k];
      const json = JSON.stringify(slice);
      if (json === lastSaved.current) return;
      lastSaved.current = json;
      saveValue(PERSIST_NAME, slice);
      window.dispatchEvent(new Event("tfl:saved"));
    }, 400);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "tfl." + PERSIST_NAME || !e.newValue) return;
      try {
        lastSaved.current = e.newValue;
        const incoming = JSON.parse(e.newValue) as Partial<StoreState>;
        setState((s) => ({ ...s, ...incoming }));
      } catch {
        /* ignore a malformed write */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback((email: string, password: string) => {
    // Demo administrator account (client demo only: replace with real auth before production).
    // Set VITE_DEMO_LOGIN=off on the hosted build: only server accounts can then sign in.
    const demoOff = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO_LOGIN === "off";
    if (!demoOff && email.trim().toLowerCase() === "admin@thefilmlocation.com" && password === "TFL888+++") {
      const admin: User = {
        id: "u-admin",
        email: "admin@thefilmlocation.com",
        name: "Admin",
        role: "administrator",
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      saveValue(SESSION_NAME, { user: admin });
      setState((s) => ({ ...s, isAuthenticated: true, user: admin }));
      return true;
    }
    return false;
  }, []);

  /** Called after the server accepted the sign-in (its cookie is the real session). */
  const adoptServerSession = useCallback((u: { email: string; name: string; role: string }) => {
    const user: User = {
      id: "u-" + u.email, email: u.email, name: u.name, role: u.role as User["role"],
      isActive: true, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(),
    };
    saveValue(SESSION_NAME, { user });
    setState((s) => ({ ...s, isAuthenticated: true, user }));
  }, []);

  /** Replaces the data collections with the copy loaded from the server database. */
  const hydrateFromServer = useCallback((incoming: Partial<StoreState>) => {
    setState((s) => ({ ...s, ...incoming }));
  }, []);

  const signOut = useCallback(() => {
    void serverLogout();
    removeValue(SESSION_NAME);
    setState((s) => ({ ...s, isAuthenticated: false, user: null }));
  }, []);

  const approvePricing = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      pricingRecords: s.pricingRecords.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "approved",
              approvedAt: new Date().toISOString(),
              approvedBy: s.user?.id,
            }
          : p,
      ),
    }));
  }, []);

  const rejectPricing = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      pricingRecords: s.pricingRecords.map((p) =>
        p.id === id ? { ...p, status: "rejected" } : p,
      ),
    }));
  }, []);

  const updatePricing = useCallback((id: string, patch: Partial<PricingRecord>) => {
    setState((s) => ({
      ...s,
      pricingRecords: s.pricingRecords.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
      ),
    }));
  }, []);

  const addCustomer = useCallback((c: Partial<Customer>) => {
    const id = `c_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      customers: [
        {
          id,
          name: c.name || "New Customer",
          status: "lead",
          segment: "wholesale",
          country: "",
          currency: "EUR",
          tags: [],
          kycStatus: "none",
          createdAt: now,
          updatedAt: now,
          ...c,
        } as Customer,
        ...s.customers,
      ],
    }));
  }, []);

  const addSupplier = useCallback((s: Partial<Supplier>) => {
    const id = `s_${Date.now()}`;
    const now = new Date().toISOString();
    setState((st) => ({
      ...st,
      suppliers: [
        {
          id,
          name: s.name || "New Supplier",
          status: "active",
          country: "",
          currency: "EUR",
          tags: [],
          createdAt: now,
          updatedAt: now,
          ...s,
        } as Supplier,
        ...st.suppliers,
      ],
    }));
  }, []);

  const updateContact = useCallback((id: string, patch: Partial<Contact>) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)),
    }));
  }, []);

  const addContact = useCallback((c: Partial<Contact>) => {
    const id = `ct_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      contacts: [
        {
          id,
          firstName: c.firstName || "New",
          lastName: c.lastName || "Contact",
          email: c.email,
          phone: c.phone,
          jobTitle: c.jobTitle,
          isPrimary: c.isPrimary ?? false,
          customerId: c.customerId,
          supplierId: c.supplierId,
          createdAt: now,
          updatedAt: now,
          ...c,
        } as Contact,
        ...s.contacts,
      ],
    }));
  }, []);


  const convertQuotationToOrder = useCallback((quotationId: string) => {
    let newId: string | null = null;
    setState((s) => {
      const q = s.quotations.find((x) => x.id === quotationId);
      if (!q || q.status === "converted") return s;
      const id = `o_${Date.now()}`;
      newId = id;
      const now = new Date().toISOString();
      const order = {
        id,
        number: nextDocumentNumber(s.salesSettings.orderPrefix || "SO-", s.orders),
        customerId: q.customerId,
        quotationId: q.id,
        status: "confirmed" as const,
        lines: q.lines,
        currency: q.currency,
        subtotal: q.subtotal,
        tax: q.tax,
        total: q.total,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...s,
        orders: [order, ...s.orders],
        quotations: s.quotations.map((x) =>
          x.id === quotationId
            ? { ...x, status: "converted" as const, convertedOrderId: id, updatedAt: now }
            : x,
        ),
        // Keep the linked opportunity's stage honest with what actually exists.
        opportunities: q.opportunityId
          ? s.opportunities.map((o) =>
              o.id === q.opportunityId &&
              ["enquiry", "quotation"].includes(o.stage)
                ? { ...o, stage: "order" as const, updatedAt: now }
                : o,
            )
          : s.opportunities,
      };
    });
    return newId;
  }, []);

  const convertOrderToInvoice = useCallback((orderId: string) => {
    let newId: string | null = null;
    setState((s) => {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o || s.invoices.some((invoice) => invoice.orderId === orderId)) return s;
      const id = `i_${Date.now()}`;
      newId = id;
      const now = new Date().toISOString();
      const invoice = {
        id,
        number: nextDocumentNumber("INV-2026-", s.invoices),
        customerId: o.customerId,
        orderId: o.id,
        status: "issued" as const,
        lines: o.lines,
        currency: o.currency,
        subtotal: o.subtotal,
        tax: o.tax,
        total: o.total,
        issuedAt: now,
        dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        createdAt: now,
        updatedAt: now,
      };
      const linkedQuotation = s.quotations.find((x) => x.convertedOrderId === o.id);
      return {
        ...s,
        invoices: [invoice, ...s.invoices],
        orders: s.orders.map((x) =>
          x.id === orderId && ["draft", "confirmed"].includes(x.status)
            ? { ...x, status: "in_progress" as const, updatedAt: now }
            : x,
        ),
        opportunities: linkedQuotation?.opportunityId
          ? s.opportunities.map((opp) =>
              opp.id === linkedQuotation.opportunityId &&
              !["closed_won", "closed_lost", "payment"].includes(opp.stage)
                ? { ...opp, stage: "invoice" as const, updatedAt: now }
                : opp,
            )
          : s.opportunities,
      };
    });
    return newId;
  }, []);

  const updateCustomer = useCallback((id: string, patch: Partial<Customer>) => {
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
      ),
    }));
  }, []);

  const removeCustomer = useCallback((id: string) => {
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
  }, []);

  const updateSupplier = useCallback((id: string, patch: Partial<Supplier>) => {
    setState((s) => ({
      ...s,
      suppliers: s.suppliers.map((x) =>
        x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x,
      ),
    }));
  }, []);

  const removeSupplier = useCallback((id: string) => {
    setState((s) => ({ ...s, suppliers: s.suppliers.filter((x) => x.id !== id) }));
  }, []);

  const addProduct = useCallback((p: Partial<Product>) => {
    const id = `pr_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      products: [
        {
          ...p,
          id,
          name: p.name || "New product",
          sku: p.sku || `SKU-${Date.now().toString().slice(-6)}`,
          category: p.category || "General",
          unit: p.unit || "case",
          sellingPrice: p.sellingPrice ?? 0,
          purchasePrice: p.purchasePrice ?? 0,
          currency: p.currency || "EUR",
          specifications: p.specifications || "",
          supplierIds: p.supplierIds || [],
          tags: p.tags || [],
          isActive: p.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        } as Product,
        ...s.products,
      ],
    }));
  }, []);

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    setState((s) => ({
      ...s,
      products: s.products.map((x) =>
        x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x,
      ),
    }));
  }, []);

  const removeProduct = useCallback((id: string) => {
    setState((s) => ({ ...s, products: s.products.filter((x) => x.id !== id) }));
  }, []);

  const addDocument = useCallback((d: Partial<Document>) => {
    const id = `doc_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      documents: [
        {
          // Spread the caller's fields first so everything the form collects —
          // reference, issuedAt, expiresAt, productId — is persisted rather than
          // silently dropped, then force the identity fields we own.
          ...d,
          id,
          name: d.name || "New document",
          type: (d.type as Document["type"]) || "other",
          createdAt: d.createdAt || now,
          uploadedBy: d.uploadedBy || s.user?.id,
        } as Document,
        ...s.documents,
      ],
    }));
  }, []);

  const updateDocument = useCallback((id: string, patch: Partial<Document>) => {
    setState((s) => ({
      ...s,
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }, []);

  const removeDocument = useCallback((id: string) => {
    setState((s) => ({ ...s, documents: s.documents.filter((x) => x.id !== id) }));
  }, []);

  const updateKycNotes = useCallback((id: string, notes: string) => {
    setState((s) => ({
      ...s,
      kycRecords: s.kycRecords.map((k) =>
        k.id === id ? { ...k, reviewNotes: notes, updatedAt: new Date().toISOString() } : k,
      ),
    }));
  }, []);

  const sendKycRequest = useCallback(
    (partyType: "customer" | "supplier", partyId: string) => {
      const now = new Date().toISOString();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const record: KycRecord = {
        id: `k_${Date.now()}`,
        customerId: partyId,
        partyType,
        status: "sent",
        secureToken: token,
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      };
      setState((s) => ({
        ...s,
        kycRecords: [
          record,
          ...s.kycRecords.filter((k) => !(k.customerId === partyId && k.status === "sent")),
        ],
      }));
      return record;
    },
    [],
  );

  const submitKycForm = useCallback(
    (
      kycId: string,
      data: { name?: string; email?: string; phone?: string; website?: string; addressLine1?: string; city?: string; country?: string; vatNumber?: string; companyNumber?: string; bankDetails?: string },
      extra?: Record<string, unknown>,
    ) => {
      const now = new Date().toISOString();
      setState((s) => {
        const k = s.kycRecords.find((r) => r.id === kycId);
        if (!k) return s;
        const clean = Object.fromEntries(
          Object.entries(data).filter(([key, v]) => key !== "bankDetails" && v),
        );
        return {
          ...s,
          customers:
            k.partyType === "supplier"
              ? s.customers
              : s.customers.map((c) => (c.id === k.customerId ? { ...c, ...clean, kycStatus: "pending" as const, updatedAt: now } : c)),
          suppliers:
            k.partyType === "supplier"
              ? s.suppliers.map((c) => (c.id === k.customerId ? { ...c, ...clean, updatedAt: now } : c))
              : s.suppliers,
          kycRecords: s.kycRecords.map((r) =>
            r.id === kycId
              ? { ...r, status: "submitted" as const, submittedData: { ...data, ...extra }, submittedAt: now, updatedAt: now }
              : r,
          ),
        };
      });
    },
    [],
  );

  const updateKycStatus = useCallback((id: string, status: KycRecord["status"]) => {
    setState((s) => ({
      ...s,
      kycRecords: s.kycRecords.map((k) =>
        k.id === id ? { ...k, status, updatedAt: new Date().toISOString() } : k,
      ),
    }));
  }, []);

  /**
   * Build a quotation from editor lines. Falls back to a single synthetic line
   * when a caller supplies only a headline total, so older call sites and the
   * quick-create path still produce a well-formed document.
   */
  const addQuotation = useCallback((input: DocumentInput) => {
    const id = `q_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => {
      const currency = input.currency || "GBP";
      // Bonded trade (T1/T2): never any VAT or duty on a quotation or order.
      const taxRatePct = 0;
      const draftLines: DraftLine[] =
        input.lines && input.lines.length
          ? input.lines
          : [
              {
                id: `ql_${Date.now()}`,
                description: input.title,
                quantity: 1,
                unitPrice: input.total ?? 0,
              },
            ];
      const lines: QuotationLine[] = toQuotationLines(draftLines, currency);
      const totals = computeTotals(lines, taxRatePct);
      const validUntil =
        input.validUntil ||
        new Date(
          Date.now() + (s.salesSettings.quotationValidityDays || 30) * 86400000,
        ).toISOString();
      const q: Quotation = {
        id,
        number: nextDocumentNumber(s.salesSettings.quotationPrefix || "QT-", s.quotations),
        customerId: input.customerId,
        opportunityId: input.opportunityId,
        requirementId: input.requirementId,
        status: "draft",
        notes: input.notes ?? input.title,
        lines,
        currency,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        validUntil,
        createdAt: now,
        updatedAt: now,
        createdBy: s.user?.id,
      };
      return {
        ...s,
        quotations: [q, ...s.quotations],
        requirements: input.requirementId
          ? s.requirements.map((r) =>
              r.id === input.requirementId && !["won", "lost", "cancelled"].includes(r.status)
                ? { ...r, status: "quoted" as const, updatedAt: now }
                : r,
            )
          : s.requirements,
        // A quotation existing for an opportunity is itself a stage change.
        opportunities: input.opportunityId
          ? s.opportunities.map((o) =>
              o.id === input.opportunityId && o.stage === "enquiry"
                ? { ...o, stage: "quotation" as const, updatedAt: now }
                : o,
            )
          : s.opportunities,
      };
    });
    return id;
  }, []);

  const updateQuotation = useCallback((id: string, patch: Partial<Quotation>) => {
    setState((s) => ({
      ...s,
      quotations: s.quotations.map((q) =>
        q.id === id ? { ...q, ...patch, updatedAt: new Date().toISOString() } : q,
      ),
    }));
  }, []);

  /** Standalone order (no originating quotation) — same line maths. */
  const addRequirement = useCallback((input: Partial<CustomerRequirement>) => {
    const id = `req_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => {
      const requirement: CustomerRequirement = {
        id,
        customerId: input.customerId || "",
        productName: (input.productName || "").trim() || "Requirement",
        productId: input.productId,
        quantity: input.quantity,
        specification: input.specification,
        destination: input.destination,
        deliveryRequirements: input.deliveryRequirements,
        timing: input.timing,
        commercialRequirements: input.commercialRequirements,
        status: input.status || "open",
        ownerId: input.ownerId || s.user?.id,
        matchedSupplierIds: input.matchedSupplierIds || [],
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      return { ...s, requirements: [requirement, ...s.requirements] };
    });
    return id;
  }, []);

  const updateRequirement = useCallback((id: string, patch: Partial<CustomerRequirement>) => {
    setState((s) => ({
      ...s,
      requirements: s.requirements.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      ),
    }));
  }, []);

  const removeRequirement = useCallback((id: string) => {
    setState((s) => ({ ...s, requirements: s.requirements.filter((r) => r.id !== id) }));
  }, []);

  /** Persisted immediately (unlike most of this store, which is seed-backed
   *  and resets on reload) because a preference the user just set silently
   *  reverting on refresh is worse than the rest of the demo data resetting. */
  const setModuleEnabled = useCallback((section: string, enabled: boolean) => {
    setState((s) => {
      const moduleSettings = { ...s.moduleSettings, [section]: enabled };
      saveValue("moduleSettings", moduleSettings);
      return { ...s, moduleSettings };
    });
  }, []);

  const matchRequirement = useCallback((id: string) => {
    let matched = 0;
    let message = "No approved supplier offer matches this requirement yet.";
    setState((s) => {
      const requirement = s.requirements.find((r) => r.id === id);
      if (!requirement) return s;
      // Match on the linked product where we have one, otherwise on the
      // product name the customer used. Only approved offers count — an
      // unreviewed extraction is not something to promise a customer against.
      const needle = requirement.productName.toLowerCase();
      const offers = s.pricingRecords.filter(
        (o) =>
          o.status === "approved" &&
          (requirement.productId
            ? o.productId === requirement.productId
            : o.productName.toLowerCase().includes(needle)),
      );
      const supplierIds = Array.from(
        new Set(offers.map((o) => o.supplierId).filter(Boolean) as string[]),
      );
      matched = supplierIds.length;
      message = matched
        ? `${matched} supplier${matched === 1 ? "" : "s"} can cover this requirement.`
        : message;
      return {
        ...s,
        requirements: s.requirements.map((r) =>
          r.id === id
            ? {
                ...r,
                matchedSupplierIds: supplierIds,
                status: matched ? ("matching" as const) : r.status,
                updatedAt: new Date().toISOString(),
              }
            : r,
        ),
      };
    });
    return { matched, message };
  }, []);

  const addDelivery = useCallback(
    (input: {
      orderId: string;
      quantities: Record<string, number>;
      carrier?: string;
      trackingRef?: string;
      despatchedAt?: string;
      incoterms?: string;
      destination?: string;
      notes?: string;
    }) => {
      const id = `dl_${Date.now()}`;
      let message = "Despatch recorded.";
      let created: string | null = null;
      setState((s) => {
        const order = s.orders.find((o) => o.id === input.orderId);
        if (!order) {
          message = "That order no longer exists.";
          return s;
        }
        const check = checkDespatch(order, s.deliveries, input.quantities);
        if (!check.ok) {
          message = check.reason || "Despatch refused.";
          return s;
        }
        const now = new Date().toISOString();
        const delivery: Delivery = {
          id,
          orderId: order.id,
          // Delivery notes are numbered per order — DN-SO-2026-0018-02 tells you
          // at a glance which order it belongs to and that it's the second drop.
          reference: `DN-${order.number}-${String(
            s.deliveries.filter((d) => d.orderId === order.id).length + 1,
          ).padStart(2, "0")}`,
          quantities: input.quantities,
          carrier: input.carrier,
          trackingRef: input.trackingRef,
          despatchedAt: input.despatchedAt || now,
          incoterms: input.incoterms || order.incoterms,
          destination: input.destination || order.deliveryAddress,
          notes: input.notes,
          createdAt: now,
        };
        const deliveries = [delivery, ...s.deliveries];
        // Status follows the despatches rather than being set by hand: a fully
        // shipped order is "shipped", a partial one stays in progress.
        const ratio = fulfilmentRatio(order, deliveries);
        const status =
          order.status === "cancelled"
            ? order.status
            : ratio >= 1
              ? ("shipped" as const)
              : ("in_progress" as const);
        created = id;
        message =
          ratio >= 1
            ? "Despatch recorded — order fully shipped."
            : `Despatch recorded — ${Math.round(ratio * 100)}% of the order shipped.`;
        return {
          ...s,
          deliveries,
          orders: s.orders.map((o) =>
            o.id === order.id ? { ...o, status, updatedAt: now } : o,
          ),
        };
      });
      return { id: created, message };
    },
    [],
  );

  const markDeliveryArrived = useCallback((id: string, deliveredAt?: string) => {
    setState((s) => {
      const delivery = s.deliveries.find((d) => d.id === id);
      if (!delivery) return s;
      const when = deliveredAt || new Date().toISOString();
      const deliveries = s.deliveries.map((d) =>
        d.id === id ? { ...d, deliveredAt: when } : d,
      );
      const order = s.orders.find((o) => o.id === delivery.orderId);
      // The order only becomes "delivered" once everything shipped has also
      // arrived — otherwise a part-arrived order would read as complete.
      const allArrived =
        order &&
        fulfilmentRatio(order, deliveries) >= 1 &&
        deliveries.filter((d) => d.orderId === order.id).every((d) => d.deliveredAt);
      return {
        ...s,
        deliveries,
        orders: allArrived
          ? s.orders.map((o) =>
              o.id === order!.id && o.status !== "cancelled"
                ? { ...o, status: "delivered" as const, updatedAt: when }
                : o,
            )
          : s.orders,
      };
    });
  }, []);

  const removeDelivery = useCallback((id: string) => {
    setState((s) => ({ ...s, deliveries: s.deliveries.filter((d) => d.id !== id) }));
  }, []);

  /* --- Warehousing & Inventory -------------------------------------------- */

  const addWarehouse = useCallback((w: Partial<Warehouse>) => {
    const id = `wh_${Date.now()}`;
    const now = new Date().toISOString();
    const warehouse: Warehouse = {
      id,
      name: w.name || "New warehouse",
      code: w.code || id.toUpperCase(),
      type: w.type || "bonded",
      isBonded: w.isBonded ?? w.type === "bonded",
      country: w.country || "United Kingdom",
      city: w.city,
      addressLine1: w.addressLine1,
      operator: w.operator,
      servesMarkets: w.servesMarkets || [],
      capacityPallets: w.capacityPallets,
      isActive: w.isActive ?? true,
      notes: w.notes,
      createdAt: now,
      updatedAt: now,
    };
    setState((s) => ({ ...s, warehouses: [warehouse, ...s.warehouses] }));
    return id;
  }, []);

  const updateWarehouse = useCallback((id: string, patch: Partial<Warehouse>) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      warehouses: s.warehouses.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: now } : w,
      ),
    }));
  }, []);

  const removeWarehouse = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      warehouses: s.warehouses.filter((w) => w.id !== id),
      inventoryItems: s.inventoryItems.filter((i) => i.warehouseId !== id),
    }));
  }, []);

  const receiveStock = useCallback(
    (input: {
      warehouseId: string;
      productId: string;
      quantity: number;
      batchOrLot?: string;
      reference?: string;
      notes?: string;
    }) => {
      const movementId = `sm_${Date.now()}`;
      const now = new Date().toISOString();
      setState((s) => {
        const existing = s.inventoryItems.find(
          (i) =>
            i.warehouseId === input.warehouseId &&
            i.productId === input.productId &&
            i.batchOrLot === input.batchOrLot,
        );
        const inventoryItems = existing
          ? s.inventoryItems.map((i) =>
              i.id === existing.id
                ? {
                    ...i,
                    quantityOnHand: i.quantityOnHand + input.quantity,
                    lastMovementAt: now,
                    updatedAt: now,
                  }
                : i,
            )
          : [
              {
                id: `iv_${Date.now()}`,
                warehouseId: input.warehouseId,
                productId: input.productId,
                batchOrLot: input.batchOrLot,
                quantityOnHand: input.quantity,
                quantityReserved: 0,
                quantityIncoming: 0,
                quantityDamaged: 0,
                unit:
                  s.products.find((p) => p.id === input.productId)?.unit ||
                  "case",
                lastMovementAt: now,
                createdAt: now,
                updatedAt: now,
              } as InventoryItem,
              ...s.inventoryItems,
            ];
        const movement: StockMovement = {
          id: movementId,
          inventoryItemId: existing?.id || inventoryItems[0].id,
          warehouseId: input.warehouseId,
          productId: input.productId,
          type: "goods_in",
          quantity: input.quantity,
          reference: input.reference,
          notes: input.notes,
          occurredAt: now,
        };
        return {
          ...s,
          inventoryItems,
          stockMovements: [movement, ...s.stockMovements],
        };
      });
      return movementId;
    },
    [],
  );

  const adjustInventory = useCallback(
    (id: string, patch: Partial<InventoryItem>, reason?: string) => {
      const now = new Date().toISOString();
      setState((s) => {
        const item = s.inventoryItems.find((i) => i.id === id);
        if (!item) return s;
        const delta =
          patch.quantityOnHand != null ? patch.quantityOnHand - item.quantityOnHand : 0;
        const movement: StockMovement | null =
          delta !== 0
            ? {
                id: `sm_${Date.now()}`,
                inventoryItemId: id,
                warehouseId: item.warehouseId,
                productId: item.productId,
                type: "adjustment",
                quantity: delta,
                notes: reason,
                occurredAt: now,
              }
            : null;
        return {
          ...s,
          inventoryItems: s.inventoryItems.map((i) =>
            i.id === id ? { ...i, ...patch, lastMovementAt: now, updatedAt: now } : i,
          ),
          stockMovements: movement ? [movement, ...s.stockMovements] : s.stockMovements,
        };
      });
    },
    [],
  );

  const addShipment = useCallback((input: Partial<Shipment>) => {
    const id = `sh_${Date.now()}`;
    const now = new Date().toISOString();
    const shipment: Shipment = {
      id,
      reference: input.reference || `SHP-${Date.now().toString().slice(-6)}`,
      orderId: input.orderId,
      customerId: input.customerId,
      deliveryId: input.deliveryId,
      originWarehouseId: input.originWarehouseId,
      originCountry: input.originCountry,
      destinationCountry: input.destinationCountry || "",
      destinationMarket: input.destinationMarket,
      mode: input.mode || "sea",
      carrier: input.carrier || "",
      trackingRef: input.trackingRef,
      incoterms: input.incoterms,
      status: input.status || "booked",
      etd: input.etd,
      eta: input.eta || now,
      actualDeparture: input.actualDeparture,
      actualArrival: input.actualArrival,
      documentsRequired: input.documentsRequired,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    setState((s) => ({ ...s, shipments: [shipment, ...s.shipments] }));
    return id;
  }, []);

  const updateShipment = useCallback((id: string, patch: Partial<Shipment>) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      shipments: s.shipments.map((sh) =>
        sh.id === id ? { ...sh, ...patch, updatedAt: now } : sh,
      ),
    }));
  }, []);

  /** Status transitions carry their own timestamp side-effects (departure on
   *  transit, arrival on arrived/delivered) so a shipment can never show
   *  "delivered" without an actual-arrival date behind it. */
  const updateShipmentStatus = useCallback((id: string, status: ShipmentStatus) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      shipments: s.shipments.map((sh) => {
        if (sh.id !== id) return sh;
        return {
          ...sh,
          status,
          updatedAt: now,
          actualDeparture:
            status === "in_transit" && !sh.actualDeparture ? now : sh.actualDeparture,
          actualArrival:
            (status === "arrived" || status === "delivered") && !sh.actualArrival
              ? now
              : sh.actualArrival,
        };
      }),
    }));
  }, []);

  const removeShipment = useCallback((id: string) => {
    setState((s) => ({ ...s, shipments: s.shipments.filter((sh) => sh.id !== id) }));
  }, []);

  const recordProofOfDelivery = useCallback((deliveryId: string, pod: ProofOfDelivery) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      deliveries: s.deliveries.map((d) =>
        d.id === deliveryId
          ? {
              ...d,
              proofOfDelivery: { signedAt: pod.signedAt || now, ...pod },
              deliveredAt: d.deliveredAt || now,
            }
          : d,
      ),
    }));
  }, []);

  const reportDeliveryException = useCallback(
    (deliveryId: string, exception: Omit<DeliveryException, "resolved" | "resolvedAt">) => {
      setState((s) => ({
        ...s,
        deliveries: s.deliveries.map((d) =>
          d.id === deliveryId ? { ...d, exception: { ...exception, resolved: false } } : d,
        ),
      }));
    },
    [],
  );

  const resolveDeliveryException = useCallback((deliveryId: string) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      deliveries: s.deliveries.map((d) =>
        d.id === deliveryId && d.exception
          ? { ...d, exception: { ...d.exception, resolved: true, resolvedAt: now } }
          : d,
      ),
    }));
  }, []);

  /** Marking a record "reviewed" without a reviewer would be a compliance
   *  sign-off nobody can be held to, so a reviewer is stamped on whenever the
   *  status moves to reviewed. */
  const addBrand = useCallback((input: Partial<Brand>) => {
    const id = `b_${Date.now()}`;
    const now = new Date().toISOString();
    const brand: Brand = {
      id,
      name: input.name || "",
      brandOwner: input.brandOwner,
      supplierId: input.supplierId,
      country: input.country || "",
      category: input.category,
      subcategory: input.subcategory,
      segments: input.segments || [],
      status: input.status || "onboarding",
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    setState((s) => ({ ...s, brands: [brand, ...s.brands] }));
    return id;
  }, []);

  const updateBrand = useCallback((id: string, patch: Partial<Brand>) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      brands: s.brands.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: now } : b)),
    }));
  }, []);

  const removeBrand = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      brands: s.brands.filter((b) => b.id !== id),
      // A brand can be removed independently of its products — this only
      // detaches the relationship, mirroring how removing a supplier does
      // not delete the products it once supplied.
      products: s.products.map((p) => (p.brandId === id ? { ...p, brandId: undefined } : p)),
    }));
  }, []);

  const addMarket = useCallback((input: Partial<Market>) => {
    const id = `mk_${Date.now()}`;
    const now = new Date().toISOString();
    const market: Market = {
      id,
      country: input.country || "",
      region: input.region || "",
      currency: input.currency || "GBP",
      status: input.status || "emerging",
      complianceNotes: input.complianceNotes,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    setState((s) => ({ ...s, markets: [market, ...s.markets] }));
    return id;
  }, []);

  const updateMarket = useCallback((id: string, patch: Partial<Market>) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      markets: s.markets.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: now } : m)),
    }));
  }, []);

  const removeMarket = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      markets: s.markets.filter((m) => m.id !== id),
    }));
  }, []);

  const addOrder = useCallback((input: DocumentInput & { deliveryDate?: string }) => {
    const id = `o_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => {
      const currency = input.currency || "GBP";
      // Bonded trade (T1/T2): never any VAT or duty on a quotation or order.
      const taxRatePct = 0;
      const draftLines: DraftLine[] =
        input.lines && input.lines.length
          ? input.lines
          : [
              {
                id: `ol_${Date.now()}`,
                description: input.title,
                quantity: 1,
                unitPrice: input.total ?? 0,
              },
            ];
      const lines: QuotationLine[] = toQuotationLines(draftLines, currency);
      const totals = computeTotals(lines, taxRatePct);
      const order: Order = {
        id,
        number: nextDocumentNumber(s.salesSettings.orderPrefix || "SO-", s.orders),
        customerId: input.customerId,
        status: "draft",
        lines,
        currency,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        deliveryDate: input.deliveryDate,
        notes: input.notes ?? input.title,
        createdAt: now,
        updatedAt: now,
      };
      return { ...s, orders: [order, ...s.orders] };
    });
    return id;
  }, []);

  const updateOrder = useCallback((id: string, patch: Partial<Order>) => {
    setState((s) => ({
      ...s,
      orders: s.orders.map((o) =>
        o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o,
      ),
    }));
  }, []);

  const updateOrderStatus = useCallback((id: string, status: Order["status"]) => {
    setState((s) => ({
      ...s,
      orders: s.orders.map((o) =>
        o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o,
      ),
    }));
  }, []);

  const addOpportunity = useCallback((input: OpportunityInput) => {
    const id = `opp_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => {
      const opportunity: Opportunity = {
        id,
        customerId: input.customerId,
        requirementId: input.requirementId || undefined,
        productId: input.productId || undefined,
        supplierId: input.supplierId || undefined,
        title: input.title.trim() || "Opportunity",
        stage: input.stage || "enquiry",
        value: input.value,
        currency: input.currency || "GBP",
        ownerId: input.ownerId || s.user?.id,
        nextAction: input.nextAction || undefined,
        nextActionDue: input.nextActionDue || undefined,
        notes: input.notes || undefined,
        createdAt: now,
        updatedAt: now,
      };
      return { ...s, opportunities: [opportunity, ...s.opportunities] };
    });
    return id;
  }, []);

  const updateOpportunity = useCallback((id: string, patch: Partial<Opportunity>) => {
    setState((s) => ({
      ...s,
      opportunities: s.opportunities.map((o) =>
        o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o,
      ),
    }));
  }, []);

  const removeOpportunity = useCallback((id: string) => {
    setState((s) => ({ ...s, opportunities: s.opportunities.filter((o) => o.id !== id) }));
  }, []);

  const updateQuotationStatus = useCallback((id: string, status: Quotation["status"]) => {
    setState((s) => ({
      ...s,
      quotations: s.quotations.map((q) =>
        q.id === id ? { ...q, status, updatedAt: new Date().toISOString() } : q,
      ),
    }));
  }, []);

  const updateOpportunityStage = useCallback((id: string, stage: Opportunity["stage"]) => {
    setState((s) => ({
      ...s,
      opportunities: s.opportunities.map((o) =>
        o.id === id ? { ...o, stage, updatedAt: new Date().toISOString() } : o,
      ),
    }));
  }, []);

  const setInvoiceCompany = useCallback((id: string, companyId?: string) => {
    setState((s) => ({
      ...s,
      invoices: s.invoices.map((inv) =>
        inv.id === id ? { ...inv, companyId: companyId && companyId !== "primary" ? companyId : undefined } : inv,
      ),
    }));
  }, []);

  const markInvoicePaid = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      invoices: s.invoices.map((inv) =>
        inv.id === id
          ? {
              ...inv,
              status: "paid" as const,
              amountPaid: inv.total,
              paidAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : inv,
      ),
    }));
  }, []);

  const updateOrganisation = useCallback((patch: Partial<Organisation>) => {
    setState((s) => ({ ...s, organisation: { ...s.organisation, ...patch } }));
  }, []);

  const addUser = useCallback((u: Partial<User>) => {
    const id = `u_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      users: [
        {
          id,
          name: u.name || "New user",
          email: u.email || "",
          role: u.role || "readonly",
          isActive: u.isActive ?? true,
          createdAt: now,
        } as User,
        ...s.users,
      ],
    }));
  }, []);

  const updateUser = useCallback((id: string, patch: Partial<User>) => {
    setState((s) => ({
      ...s,
      users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }));
  }, []);

  const removeUser = useCallback((id: string) => {
    setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
  }, []);

  const updateCrmSettings = useCallback((patch: Partial<CrmSettings>) => {
    setState((s) => ({ ...s, crmSettings: { ...s.crmSettings, ...patch } }));
  }, []);

  const updateSalesSettings = useCallback((patch: Partial<SalesSettings>) => {
    setState((s) => ({ ...s, salesSettings: { ...s.salesSettings, ...patch } }));
  }, []);

  const updateProductSettings = useCallback((patch: Partial<ProductSettings>) => {
    setState((s) => ({ ...s, productSettings: { ...s.productSettings, ...patch } }));
  }, []);

    const runHistoricalEmailScan = useCallback(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 18);
    const cutoffTime = cutoff.getTime();
    let created = 0;
    setState((s) => {
      const received = s.communications.filter(
        (c) =>
          c.channel === "email" &&
          c.isReceived &&
          new Date(c.occurredAt).getTime() >= cutoffTime,
      );
      const knownEmails = new Set(
        s.contacts
          .map((contact) => contact.email?.trim().toLowerCase())
          .filter(Boolean),
      );
      const now = new Date().toISOString();
      const importedContacts = received.flatMap((message, index) => {
        const email = message.from?.trim().toLowerCase();
        if (!email || knownEmails.has(email)) return [];
        knownEmails.add(email);
        const localPart = email.split("@")[0] || "Imported contact";
        const nameParts = localPart
          .replace(/[._-]+/g, " ")
          .split(" ")
          .filter(Boolean);
        created += 1;
        return [{
          id: `ct_scan_${Date.now()}_${index}`,
          firstName: nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : "Imported",
          lastName: nameParts.slice(1).join(" ") || "Contact",
          email,
          jobTitle: "Imported from email scan",
          customerId: message.customerId,
          supplierId: message.supplierId,
          isPrimary: false,
          createdAt: now,
          updatedAt: now,
        } as Contact];
      });
      return {
        ...s,
        contacts: [...importedContacts, ...s.contacts],
      };
    });
    return {
      created,
      message: `Scanned received emails from the last 18 months (since ${cutoff.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}). ${created} new contact(s) created; existing contacts were left unchanged. Pricing data remains in the human review queue.`,
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Finance — expenses, receipts, supplier payments                         */
  /* ---------------------------------------------------------------------- */

  const addExpense = useCallback((input: Partial<Expense>) => {
    const id = `ex_${Date.now()}`;
    setState((s) => {
      const expense: Expense = {
        id,
        date: input.date ?? new Date().toISOString(),
        description: input.description ?? "Expense",
        category: input.category ?? "other",
        supplierId: input.supplierId,
        companyId: input.companyId,
        supplierName:
          input.supplierName ?? s.suppliers.find((sp) => sp.id === input.supplierId)?.name,
        net: input.net ?? 0,
        vat: input.vat ?? 0,
        currency: input.currency ?? s.organisation.defaultCurrency,
        reference: input.reference,
        orderId: input.orderId,
        productId: input.productId,
        dealId: input.dealId,
        paidBy: input.paidBy,
        reimbursementStatus: input.reimbursementStatus ?? (input.paidBy === "personal" ? "owed" : input.paidBy ? "not_required" : undefined),
        isPaid: input.isPaid ?? false,
        paidAt: input.paidAt,
        createdAt: new Date().toISOString(),
      };
      return { ...s, expenses: [expense, ...s.expenses] };
    });
    return id;
  }, []);

  const updateExpense = useCallback((id: string, patch: Partial<Expense>) => {
    setState((s) => ({
      ...s,
      expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, []);

  const removeExpense = useCallback((id: string) => {
    setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
  }, []);

  const recordReceipt = useCallback(
    (input: {
      invoiceId: string;
      amount: number;
      method?: Payment["method"];
      reference?: string;
      paidAt?: string;
      notes?: string;
    }) => {
      const id = `pay_${Date.now()}`;
      let ok = false;
      setState((s) => {
        const invoice = s.invoices.find((i) => i.id === input.invoiceId);
        if (!invoice || input.amount <= 0) return s;
        ok = true;
        const paidAt = input.paidAt ?? new Date().toISOString();
        const payment: Payment = {
          id,
          direction: "in",
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          amount: input.amount,
          currency: invoice.currency,
          method: input.method ?? "bank_transfer",
          reference: input.reference,
          notes: input.notes,
          paidAt,
          createdBy: s.user?.id,
          createdAt: new Date().toISOString(),
        };
        // Allocation and invoice status move together — a receipt that didn't
        // update the invoice would leave the ledger and the sales view telling
        // different stories about the same money.
        const alreadyPaid = invoice.amountPaid ?? 0;
        const nowPaid = alreadyPaid + input.amount;
        const settled = nowPaid >= invoice.total - 0.01;
        return {
          ...s,
          payments: [payment, ...s.payments],
          invoices: s.invoices.map((i) =>
            i.id === invoice.id
              ? {
                  ...i,
                  amountPaid: nowPaid,
                  status: settled ? ("paid" as const) : ("partial" as const),
                  paidAt: settled ? paidAt : i.paidAt,
                  updatedAt: new Date().toISOString(),
                }
              : i,
          ),
        };
      });
      return ok ? id : null;
    },
    [],
  );

  const recordSupplierPayment = useCallback(
    (input: {
      expenseId: string;
      amount: number;
      method?: Payment["method"];
      reference?: string;
      paidAt?: string;
    }) => {
      const id = `pay_${Date.now()}`;
      let ok = false;
      setState((s) => {
        const expense = s.expenses.find((e) => e.id === input.expenseId);
        if (!expense || input.amount <= 0) return s;
        ok = true;
        const paidAt = input.paidAt ?? new Date().toISOString();
        const payment: Payment = {
          id,
          direction: "out",
          expenseId: expense.id,
          supplierId: expense.supplierId,
          amount: input.amount,
          currency: expense.currency,
          method: input.method ?? "bank_transfer",
          reference: input.reference,
          paidAt,
          createdBy: s.user?.id,
          createdAt: new Date().toISOString(),
        };
        return {
          ...s,
          payments: [payment, ...s.payments],
          expenses: s.expenses.map((e) =>
            e.id === expense.id ? { ...e, isPaid: true, paidAt } : e,
          ),
        };
      });
      return ok ? id : null;
    },
    [],
  );

  /* ---------------------------------------------------------------------- */
  /* Campaigns / mass mailing                                                */
  /* ---------------------------------------------------------------------- */

  const resolveAudience = useCallback(
    (audience: CampaignAudience): CampaignRecipient[] => {
      const out: CampaignRecipient[] = [];
      const seen = new Set<string>();
      const push = (r: CampaignRecipient) => {
        const key = r.email.toLowerCase();
        // One message per address, even where a contact and their company
        // share it — a duplicate send is the fastest way to look amateur.
        if (!r.email || seen.has(key)) return;
        seen.add(key);
        out.push(r);
      };

      const recentEnough = (lastOrderAt?: string) => {
        if (!audience.minRecencyDays) return true;
        if (!lastOrderAt) return true;
        const days = (Date.now() - new Date(lastOrderAt).getTime()) / 86400000;
        return days >= audience.minRecencyDays;
      };

      const matchesList = (value: string | undefined, list?: string[]) =>
        !list || list.length === 0 || (value != null && list.includes(value));

      if (audience.explicit?.length) {
        audience.explicit.forEach((x, i) =>
          push({ id: `rc_x${i}`, name: x.name, email: x.email, entityId: `x${i}`, entityType: "contact", delivered: false, opened: false, clicked: false, bounced: false }),
        );
      } else if (audience.target === "customers") {
        for (const c of state.customers) {
          if (!matchesList(c.status, audience.statuses)) continue;
          if (!matchesList(c.segment, audience.segments as string[] | undefined)) continue;
          if (!matchesList(c.territory, audience.territories)) continue;
          if (!matchesList(c.country, audience.countries)) continue;
          if (audience.tags?.length && !audience.tags.some((t) => c.tags.includes(t))) continue;
          if (audience.kycApprovedOnly && c.kycStatus !== "approved") continue;
          if (!recentEnough(c.lastOrderAt)) continue;
          push({
            id: `rc_${c.id}`,
            name: c.name,
            email: c.email ?? "",
            entityId: c.id,
            entityType: "customer",
            delivered: false,
            opened: false,
            clicked: false,
            bounced: false,
          });
        }
      } else if (audience.target === "suppliers") {
        for (const sp of state.suppliers) {
          if (!matchesList(sp.status, audience.statuses)) continue;
          if (!matchesList(sp.country, audience.countries)) continue;
          if (audience.tags?.length && !audience.tags.some((t) => sp.tags.includes(t))) continue;
          push({
            id: `rc_${sp.id}`,
            name: sp.name,
            email: sp.email ?? "",
            entityId: sp.id,
            entityType: "supplier",
            delivered: false,
            opened: false,
            clicked: false,
            bounced: false,
          });
        }
      } else {
        for (const ct of state.contacts) {
          const parent =
            state.customers.find((c) => c.id === ct.customerId) ??
            state.suppliers.find((sp) => sp.id === ct.supplierId);
          if (audience.statuses?.length && !matchesList(parent?.status, audience.statuses)) continue;
          if (audience.countries?.length && !matchesList(parent?.country, audience.countries)) continue;
          push({
            id: `rc_${ct.id}`,
            name: `${ct.firstName} ${ct.lastName}`.trim(),
            email: ct.email ?? "",
            entityId: ct.id,
            entityType: "contact",
            delivered: false,
            opened: false,
            clicked: false,
            bounced: false,
          });
        }
      }
      return out;
    },
    [state.customers, state.suppliers, state.contacts],
  );

  const addCampaign = useCallback((input: Partial<Campaign>) => {
    const id = `cp_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => {
      const campaign: Campaign = {
        id,
        name: input.name || "Untitled campaign",
        status: input.status ?? "draft",
        subject: input.subject ?? "",
        preheader: input.preheader,
        templateBody: input.templateBody ?? "",
        audience: input.audience ?? { target: "customers" },
        recipients: input.recipients ?? [],
        recipientCount: input.recipientCount ?? 0,
        sentCount: 0,
        openCount: 0,
        clickCount: 0,
        bounceCount: 0,
        attachPortfolio: input.attachPortfolio,
        scheduledAt: input.scheduledAt,
        createdBy: s.user?.id,
        createdAt: now,
        updatedAt: now,
      };
      return { ...s, campaigns: [campaign, ...s.campaigns] };
    });
    return id;
  }, []);

  const updateCampaign = useCallback((id: string, patch: Partial<Campaign>) => {
    setState((s) => ({
      ...s,
      campaigns: s.campaigns.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
      ),
    }));
  }, []);

  const removeCampaign = useCallback((id: string) => {
    setState((s) => ({ ...s, campaigns: s.campaigns.filter((c) => c.id !== id) }));
  }, []);

  const sendCampaign = useCallback((id: string) => {
    let sent = 0;
    let message = "Campaign not found.";
    setState((s) => {
      const campaign = s.campaigns.find((c) => c.id === id);
      if (!campaign) return s;
      if (campaign.status === "sent") {
        message = "This campaign has already been sent.";
        return s;
      }

      // Resolve against live data at send time, not whatever was counted when
      // the draft was written — accounts change between drafting and sending.
      const audience = campaign.audience;
      const recipients: CampaignRecipient[] = [];
      const pool =
        audience.target === "customers"
          ? s.customers.map((c) => ({ id: c.id, name: c.name, email: c.email, type: "customer" as const }))
          : audience.target === "suppliers"
            ? s.suppliers.map((sp) => ({ id: sp.id, name: sp.name, email: sp.email, type: "supplier" as const }))
            : s.contacts.map((ct) => ({
                id: ct.id,
                name: `${ct.firstName} ${ct.lastName}`.trim(),
                email: ct.email,
                type: "contact" as const,
              }));

      const chosen = new Set(campaign.recipients.map((r) => r.entityId));
      for (const p of pool) {
        if (chosen.size && !chosen.has(p.id)) continue;
        if (!p.email) continue;
        recipients.push({
          id: `rc_${p.id}`,
          name: p.name,
          email: p.email,
          entityId: p.id,
          entityType: p.type,
          delivered: true,
          opened: false,
          clicked: false,
          bounced: false,
        });
      }

      // v26: suppression list (unsubscribed / bounced) is honoured at send time,
      // and a bulk send needs the dedicated sending service to be set up.
      const { suppression, sending } = readCompliance();
      const { allowed, held } = applySuppression(recipients, suppression);
      const gate = sendGate(allowed.length, sending);
      if (allowed.length > 0 && !gate.ok) {
        message = gate.message;
        return s;
      }
      recipients.length = 0;
      recipients.push(...allowed);

      const now = new Date().toISOString();
      const org = s.organisation;

      // Every send lands in the recipient's own timeline, so the account page
      // and the mailbox show the same history rather than diverging.
      const messages: Communication[] = recipients.map((r, i) => ({
        id: `cm_cp_${Date.now()}_${i}`,
        channel: "email",
        direction: "outbound",
        folder: "sent",
        subject: campaign.subject,
        body: withUnsubscribe(
          renderTemplate(campaign.templateBody, r.name, s.user?.name ?? org.legalName),
          buildUnsubscribeUrl(sending.unsubscribeBaseUrl, r.email, campaign.id),
          sending.postalAddress,
        ),
        from: gate.viaService ? fromAddress(sending) : org.email || "marketing@thefilmlocation.com",
        fromName: s.user?.name,
        to: r.email,
        customerId: r.entityType === "customer" ? r.entityId : undefined,
        supplierId: r.entityType === "supplier" ? r.entityId : undefined,
        contactId: r.entityType === "contact" ? r.entityId : undefined,
        relatedEntityType: "campaign",
        relatedEntityId: campaign.id,
        isReceived: false,
        isRead: true,
        occurredAt: now,
        createdAt: now,
      }));

      sent = recipients.length;
      message =
        sent === 0
          ? "No recipients matched this audience — nothing was sent."
          : `Sent to ${sent} recipient${sent === 1 ? "" : "s"}${held.length ? ` (${held.length} held back: unsubscribed or bounced)` : ""}. Each message carries an unsubscribe link and is filed in Sent and on the account timeline.`;

      return {
        ...s,
        communications: [...messages, ...s.communications],
        campaigns: s.campaigns.map((c) =>
          c.id === id
            ? {
                ...c,
                status: "sent" as const,
                recipients,
                recipientCount: recipients.length,
                sentCount: recipients.length,
                openCount: 0,
                clickCount: 0,
                bounceCount: 0,
                sentAt: now,
                updatedAt: now,
              }
            : c,
        ),
      };
    });
    return { sent, message };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Mailbox                                                                 */
  /* ---------------------------------------------------------------------- */

  const patchCommunication = useCallback(
    (id: string, patch: Partial<Communication>) => {
      setState((s) => ({
        ...s,
        communications: s.communications.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      }));
    },
    [],
  );

  const markCommunicationRead = useCallback(
    (id: string, isRead = true) => patchCommunication(id, { isRead }),
    [patchCommunication],
  );

  const toggleCommunicationStar = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      communications: s.communications.map((c) =>
        c.id === id ? { ...c, isStarred: !c.isStarred } : c,
      ),
    }));
  }, []);

  const toggleCommunicationFlag = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      communications: s.communications.map((c) =>
        c.id === id ? { ...c, isFlagged: !c.isFlagged } : c,
      ),
    }));
  }, []);

  const moveCommunication = useCallback(
    (id: string, folder: MailFolder) => patchCommunication(id, { folder }),
    [patchCommunication],
  );

  const sendCommunication = useCallback((input: ComposeInput) => {
    const id = `cm_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => {
      const message: Communication = {
        id,
        threadId: input.threadId,
        channel: input.channel ?? "email",
        direction: "outbound",
        folder: input.asDraft ? "drafts" : "sent",
        subject: input.subject,
        body: input.body,
        // WhatsApp is addressed by number, not mailbox. Stamping an email
        // address on a chat message makes the conversation look like it came
        // from a different party than every other message in the thread.
        from:
          input.channel === "whatsapp"
            ? s.organisation.phone || "+44 7700 900418"
            : input.from || s.organisation.email || "trading@thefilmlocation.com",
        mailbox: input.channel === "whatsapp" ? undefined : input.from,
        fromName: s.user?.name,
        to: input.to,
        cc: input.cc,
        customerId: input.customerId,
        supplierId: input.supplierId,
        contactId: input.contactId,
        quotationId: input.quotationId,
        orderId: input.orderId,
        invoiceId: input.invoiceId,
        // Outbound mail is never a candidate for extraction — we already hold
        // the commercial terms we sent.
        isReceived: false,
        isRead: true,
        occurredAt: now,
        createdAt: now,
        attachments: (input.attachments || []).map((a, i) => ({
          id: `att_${Date.now()}_${i}`,
          name: a.name,
          size: a.size,
          mimeType: a.mimeType,
        })),
      };
      return { ...s, communications: [message, ...s.communications] };
    });
    return id;
  }, []);

  const fileAttachment = useCallback((communicationId: string, attachmentId: string) => {
    const docId = `doc_${Date.now()}`;
    let filed = false;
    setState((s) => {
      const message = s.communications.find((c) => c.id === communicationId);
      const attachment = message?.attachments?.find((a) => a.id === attachmentId);
      // Already filed, or nothing to file — leave state untouched so the caller
      // doesn't get a duplicate document for a second click.
      if (!message || !attachment || attachment.documentId) return s;
      filed = true;
      const doc: Document = {
        id: docId,
        name: attachment.name,
        // v23: filed by a name rule, then waits in "AI filed, please confirm".
        ...fileIntake(attachment.name),
        type: fileIntake(attachment.name).docTag === "other" ? inferDocumentType(attachment.name) : fileIntake(attachment.name).type!,
        mimeType: attachment.mimeType,
        size: attachment.size,
        customerId: message.customerId,
        supplierId: message.supplierId,
        source: "email",
        uploadedBy: s.user?.id,
        createdAt: new Date().toISOString(),
      };
      return {
        ...s,
        documents: [doc, ...s.documents],
        communications: s.communications.map((c) =>
          c.id === communicationId
            ? {
                ...c,
                attachments: c.attachments?.map((a) =>
                  a.id === attachmentId ? { ...a, documentId: docId } : a,
                ),
              }
            : c,
        ),
      };
    });
    return filed ? docId : null;
  }, []);

  /* --- Intelligence layer settings -------------------------------------- */

  const updateFxRates = useCallback((rates: FxRate[]) => {
    setState((s) => ({ ...s, fx: { ...s.fx, rates } }));
  }, []);

  const setReportingCurrency = useCallback((currency: string) => {
    setState((s) => {
      // Re-basing the table means re-expressing every rate against the new
      // base, not just relabelling it. Doing the arithmetic here keeps every
      // consumer of `fx` ignorant of which currency happens to be the base.
      if (currency === s.fx.base) return s;
      const pivot = s.fx.rates.find((r) => r.currency === currency);
      if (!pivot || pivot.perBase <= 0) return s;
      const rebased: FxRate[] = [
        { currency: s.fx.base, perBase: 1 / pivot.perBase, asOf: pivot.asOf },
        ...s.fx.rates
          .filter((r) => r.currency !== currency)
          .map((r) => ({ ...r, perBase: r.perBase / pivot.perBase })),
      ];
      return { ...s, fx: { base: currency, rates: rebased } };
    });
  }, []);

  const updateTradeSettings = useCallback((patch: Partial<TradeSettings>) => {
    setState((s) => ({ ...s, tradeSettings: { ...s.tradeSettings, ...patch } }));
  }, []);

  const dismissSignal = useCallback((id: string) => {
    setState((s) =>
      s.dismissedSignals.includes(id)
        ? s
        : { ...s, dismissedSignals: [...s.dismissedSignals, id] },
    );
  }, []);

  const snoozeSignal = useCallback((id: string, days: number) => {
    setState((s) => ({
      ...s,
      snoozedSignals: {
        ...s.snoozedSignals,
        [id]: new Date(Date.now() + days * 86400000).toISOString(),
      },
    }));
  }, []);

  const addDeal = useCallback((deal: Omit<Deal, "id" | "createdAt" | "updatedAt">) => {
    const id = `d_${Date.now()}`;
    const now = new Date().toISOString();
    setState((s) => ({ ...s, deals: [{ ...deal, id, createdAt: now, updatedAt: now }, ...s.deals] }));
    return id;
  }, []);

  const updateDeal = useCallback((id: string, patch: Partial<Deal>) => {
    setState((s) => {
      const now = new Date().toISOString();
      const before = s.deals.find((d) => d.id === id);
      const after = before ? { ...before, ...patch, updatedAt: now } : undefined;
      let ownStock = s.ownStock;
      if (before && after?.stockLotId) {
        // Sold through a deal -> deduct once; a cancelled deal puts the goods back.
        ownStock = ownStock.map((l) => {
          if (l.id !== after.stockLotId) return l;
          if (after.stage === "cancelled") return restoreToLot(l, id, now);
          if (isSaleReal(after)) return deductFromLot(l, id, after.quantity, now).lot;
          return l;
        });
      }
      return { ...s, ownStock, deals: s.deals.map((d) => (d.id === id ? (after as Deal) : d)) };
    });
  }, []);

  const addStockLot = useCallback((lot: Omit<StockLot, "id" | "createdAt" | "updatedAt" | "reservedQty" | "soldTo">) => {
    const now = new Date().toISOString();
    setState((s) => ({ ...s, ownStock: [{ ...lot, id: `lot_${Date.now()}`, reservedQty: 0, soldTo: [], createdAt: now, updatedAt: now }, ...s.ownStock] }));
  }, []);
  const updateStockLot = useCallback((id: string, patch: Partial<StockLot>) => {
    setState((s) => ({ ...s, ownStock: s.ownStock.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l)) }));
  }, []);
  const removeStockLot = useCallback((id: string) => {
    setState((s) => ({ ...s, ownStock: s.ownStock.filter((l) => l.id !== id) }));
  }, []);

  const reserveStock = useCallback((lotId: string, dealId: string, qty: number) => {
    setState((s) => {
      const lot = s.ownStock.find((l) => l.id === lotId);
      if (!lot) return s;
      const r = reserveLot(lot, dealId, qty, new Date().toISOString());
      return r.ok ? { ...s, ownStock: s.ownStock.map((l) => (l.id === lotId ? r.lot : l)) } : s;
    });
  }, []);
  const releaseStock = useCallback((lotId: string) => {
    setState((s) => ({ ...s, ownStock: s.ownStock.map((l) => (l.id === lotId ? releaseReservation(l, new Date().toISOString()) : l)) }));
  }, []);

  const removeDeal = useCallback((id: string) => {
    setState((s) => ({ ...s, deals: s.deals.filter((d) => d.id !== id) }));
  }, []);

  const restoreSignals = useCallback(() => {
    setState((s) => (s.dismissedSignals.length ? { ...s, dismissedSignals: [] } : s));
  }, []);

  const extractFromCommunication = useCallback((id: string) => {
    const recordId = `pr_${Date.now()}`;
    let created = false;
    setState((s) => {
      const message = s.communications.find((c) => c.id === id);
      // Only received messages are ever extracted, and never twice.
      if (!message || !message.isReceived || message.extracted) return s;
      const parsed = parseCommercialTerms(message.body);
      if (parsed.unitPrice == null) return s;
      created = true;
      const supplier = s.suppliers.find((sp) => sp.id === message.supplierId);
      const product = s.products.find((p) => p.id === message.productId);
      const now = new Date().toISOString();
      const record: PricingRecord = {
        id: recordId,
        productId: message.productId,
        productName: product?.name || parsed.productName || message.subject || "Unidentified product",
        supplierId: message.supplierId,
        supplierName: supplier?.name || message.fromName || message.from || "Unknown supplier",
        quantity: parsed.quantity,
        unitPrice: parsed.unitPrice,
        currency: parsed.currency || supplier?.currency || "USD",
        deliveryInfo: parsed.deliveryInfo,
        commercialTerms: parsed.commercialTerms,
        source: message.channel === "whatsapp" ? "whatsapp" : "email",
        sourceRef: message.subject || message.id,
        // Extraction never auto-approves. A human signs off in the review queue.
        status: "pending_review",
        extractedAt: now,
        originalText: message.body,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...s,
        pricingRecords: [record, ...s.pricingRecords],
        communications: s.communications.map((c) =>
          c.id === id ? { ...c, extracted: true } : c,
        ),
      };
    });
    return created ? recordId : null;
  }, []);


  /* ------------------------------------------------------------------ */
  /* v18: unified directory                                              */
  /* ------------------------------------------------------------------ */

  const CUSTOMER_ROLES: ContactRole[] = ["buyer", "trader"];
  const SUPPLIER_ROLES: ContactRole[] = ["supplier", "trader", "warehouse", "broker", "service"];

  const addParty = useCallback((input: NewPartyInput): string => {
    const stamp = Date.now();
    const partyId = `pty_${stamp}`;
    const now = new Date().toISOString();
    const roles: ContactRole[] = input.roles.length ? input.roles : ["buyer"];
    const wantsCustomer = roles.some((r) => CUSTOMER_ROLES.includes(r));
    const wantsSupplier = roles.some((r) => SUPPLIER_ROLES.includes(r));
    const common = {
      name: input.name.trim() || "New company",
      country: input.country ?? "",
      city: input.city,
      email: input.email,
      phone: input.phone,
      tags: [] as string[],
      currency: input.tradeTerms?.currency ?? "EUR",
      partyId,
      roles,
      profile: { ...(input.profile ?? {}), soleTrader: input.soleTrader ?? input.profile?.soleTrader },
      tradeTerms: input.tradeTerms,
      createdAt: now,
      updatedAt: now,
    };
    const personRecord: Contact | null = input.person
      ? {
          id: `ct_${stamp}`, firstName: input.person.firstName, lastName: input.person.lastName,
          email: input.person.email, phone: input.person.phone, isPrimary: true,
          ...(wantsCustomer || !wantsSupplier ? { customerId: `c_${stamp}` } : { supplierId: `s_${stamp}` }),
          createdAt: now, updatedAt: now,
        }
      : null;
    setState((s) => ({
      ...s,
      contacts: personRecord ? [personRecord, ...s.contacts] : s.contacts,
      customers:
        wantsCustomer || !wantsSupplier
          ? [{ id: `c_${stamp}`, status: "lead", segment: "wholesale", kycStatus: "none", ...common } as Customer, ...s.customers]
          : s.customers,
      suppliers: wantsSupplier
        ? [{ id: `s_${stamp}`, status: "active", ...common } as Supplier, ...s.suppliers]
        : s.suppliers,
      // A warehouse also needs a stock site so it can hold TFL's own stock.
      warehouses:
        roles.includes("warehouse") && !s.warehouses.some((w) => w.id === `s_${stamp}`)
          ? [
              {
                id: `s_${stamp}`, name: common.name, code: common.name.slice(0, 3).toUpperCase(), type: "bonded",
                isBonded: true, country: common.country, city: common.city, isActive: true, createdAt: now, updatedAt: now,
              } as Warehouse,
              ...s.warehouses,
            ]
          : s.warehouses,
    }));
    return partyId;
  }, []);

  const setPartyRoles = useCallback(
    (anchor: { kind: "customer" | "supplier"; id: string }, roles: ContactRole[]) => {
      setState((s) => {
        const a = anchor.kind === "customer" ? s.customers.find((x) => x.id === anchor.id) : s.suppliers.find((x) => x.id === anchor.id);
        if (!a) return s;
        const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
        const partyId = a.partyId ?? `pty_${a.id}`;
        const sameParty = (x: { name: string; partyId?: string }) => x.partyId === partyId || norm(x.name) === norm(a.name);
        let customers = s.customers.map((x) => (sameParty(x) ? { ...x, partyId, roles } : x));
        let suppliers = s.suppliers.map((x) => (sameParty(x) ? { ...x, partyId, roles } : x));
        const now = new Date().toISOString();
        const wantsCustomer = roles.some((r) => CUSTOMER_ROLES.includes(r));
        const wantsSupplier = roles.some((r) => SUPPLIER_ROLES.includes(r));
        const stamp = Date.now();
        if (wantsCustomer && !customers.some(sameParty)) {
          const src = a as Supplier;
          customers = [
            {
              id: `c_${stamp}`, name: src.name, tradingName: src.tradingName, status: "lead", segment: "wholesale",
              email: src.email, phone: src.phone, website: src.website, city: src.city, country: src.country,
              currency: src.currency, tags: [...(src.tags ?? [])], kycStatus: "none", partyId, roles,
              profile: src.profile, tradeTerms: src.tradeTerms, myRating: src.myRating, createdAt: now, updatedAt: now,
            } as Customer,
            ...customers,
          ];
        }
        if (wantsSupplier && !suppliers.some(sameParty)) {
          const src = a as Customer;
          suppliers = [
            {
              id: `s_${stamp}`, name: src.name, tradingName: src.tradingName, status: "active",
              email: src.email, phone: src.phone, website: src.website, city: src.city, country: src.country,
              currency: src.currency, tags: [...(src.tags ?? [])], partyId, roles,
              profile: src.profile, tradeTerms: src.tradeTerms, myRating: src.myRating, createdAt: now, updatedAt: now,
            } as Supplier,
            ...suppliers,
          ];
        }
        // Warehouses need a stock site record.
        let warehouses = s.warehouses;
        if (roles.includes("warehouse")) {
          const sup = suppliers.find(sameParty);
          if (sup && !warehouses.some((w) => w.id === sup.id)) {
            warehouses = [
              { id: sup.id, name: sup.name, code: sup.name.slice(0, 3).toUpperCase(), type: "bonded", isBonded: true, country: sup.country, city: sup.city, isActive: true, createdAt: now, updatedAt: now } as Warehouse,
              ...warehouses,
            ];
          }
        }
        return { ...s, customers, suppliers, warehouses };
      });
    },
    [],
  );

  const updatePartyProfile = useCallback((recordIds: string[], patch: Partial<PartyProfile>) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (recordIds.includes(c.id) ? { ...c, profile: { ...(c.profile ?? {}), ...patch }, updatedAt: now } : c)),
      suppliers: s.suppliers.map((c) => (recordIds.includes(c.id) ? { ...c, profile: { ...(c.profile ?? {}), ...patch }, updatedAt: now } : c)),
    }));
  }, []);

  const updatePartyTerms = useCallback((recordIds: string[], patch: Partial<TradeTerms>) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (recordIds.includes(c.id) ? { ...c, tradeTerms: { ...(c.tradeTerms ?? {}), ...patch }, updatedAt: now } : c)),
      suppliers: s.suppliers.map((c) => (recordIds.includes(c.id) ? { ...c, tradeTerms: { ...(c.tradeTerms ?? {}), ...patch }, updatedAt: now } : c)),
    }));
  }, []);

  /* ------------------------------------------------------------------ */
  /* v18: reading price lists and request lists                          */
  /* ------------------------------------------------------------------ */

  const addPricingBatch = useCallback((drafts: OfferDraft[]) => {
    if (!drafts.length) return 0;
    const now = new Date().toISOString();
    const stamp = Date.now();
    setState((s) => {
      const records: PricingRecord[] = drafts.map((d, i) => {
        const { duplicateOf: _dup, matchedProductName: _mp, ...rest } = d;
        void _dup; void _mp;
        // Match the supplier record by name when the importer didn't pick one.
        const sup = rest.supplierId ? undefined : s.suppliers.find((x) => x.name.toLowerCase() === rest.supplierName.toLowerCase());
        return { ...rest, supplierId: rest.supplierId ?? sup?.id, id: `pr_${stamp}_${i}`, createdAt: now, updatedAt: now } as PricingRecord;
      });
      return { ...s, pricingRecords: [...records, ...s.pricingRecords] };
    });
    return drafts.length;
  }, []);

  const addCommunicationsBatch = useCallback((items: Communication[]) => {
    if (!items.length) return 0;
    setState((s) => {
      const key = (c: Communication) => `${c.channel}|${c.occurredAt.slice(0, 16)}|${(c.from ?? "").toLowerCase()}|${c.body.trim().slice(0, 80)}`;
      const have = new Set(s.communications.map(key));
      const fresh = items.filter((c) => !have.has(key(c)));
      return fresh.length ? { ...s, communications: [...fresh, ...s.communications] } : s;
    });
    return items.length;
  }, []);

  const addRequestsBatch = useCallback((items: Partial<CustomerRequirement>[]) => {
    if (!items.length) return 0;
    const now = new Date().toISOString();
    const stamp = Date.now();
    setState((s) => {
      const made: CustomerRequirement[] = items.map((r, i) => ({
        id: `req_${stamp}_${i}`,
        customerId: r.customerId || "",
        productName: (r.productName || "").trim() || "Request",
        productId: r.productId,
        quantity: r.quantity,
        specification: r.specification,
        destination: r.destination,
        timing: r.timing,
        status: "new",
        ownerId: s.user?.id,
        matchedSupplierIds: [],
        notes: r.notes,
        source: r.source ?? "manual",
        sourceRef: r.sourceRef,
        targetPrice: r.targetPrice,
        currency: r.currency,
        importBatchId: r.importBatchId,
        createdAt: now,
        updatedAt: now,
      }));
      // Run the matcher straight away so each request lands as New or Matched.
      const matched = made.map((r) => {
        const m = matchRequest(r, { products: s.products, pricingRecords: s.pricingRecords, inventoryItems: s.inventoryItems });
        return m.total > 0
          ? { ...r, status: "matched" as const, matchedSupplierIds: [...new Set(m.live.map((x) => x.offer.supplierId).filter(Boolean) as string[])] }
          : r;
      });
      return { ...s, requirements: [...matched, ...s.requirements] };
    });
    return items.length;
  }, []);

  const startDealFromQuotation = useCallback((quotationId: string): string | null => {
    let created: string | null = null;
    setState((s) => {
      const q = s.quotations.find((x) => x.id === quotationId);
      if (!q || q.dealId) return s;
      const req = s.requirements.find((r) => r.id === q.requirementId);
      const line = q.lines[0];
      const qty = q.lines.reduce((n, l) => n + l.quantity, 0);
      const best = req
        ? matchRequest(req, { products: s.products, pricingRecords: s.pricingRecords, inventoryItems: s.inventoryItems }).best?.offer
        : undefined;
      const supplierId = best?.supplierId ?? s.suppliers[0]?.id ?? "";
      const purchasePrice = best ? best.unitPrice * qty : 0;
      const id = `d_${Date.now()}`;
      const now = new Date().toISOString();
      const deal: Deal = {
        ...blankDeal(nextDealRef(s.deals), {
          clientId: q.customerId,
          supplierId,
          requirementId: q.requirementId,
          quotationId: q.id,
          offerId: best?.id,
          productId: line?.productId ?? req?.productId,
          productDescription: line?.description ?? req?.productName ?? "",
          quantity: qty,
          currency: q.currency,
          salePrice: q.total,
          purchasePrice,
          dutyStatus: best?.dutyStatus ?? "T2",
          incoterm: best?.incoterm,
          incotermPlace: best?.incotermPlace,
          goodsLocation: best?.goodsLocation ?? "",
          destination: req?.destination ?? "",
        }),
        id,
        createdAt: now,
        updatedAt: now,
      };
      created = id;
      return {
        ...s,
        deals: [deal, ...s.deals],
        quotations: s.quotations.map((x) => (x.id === q.id ? { ...x, dealId: id, status: "converted" as const, updatedAt: now } : x)),
        requirements: s.requirements.map((r) => (r.id === q.requirementId ? { ...r, status: "won" as const, dealId: id, updatedAt: now } : r)),
      };
    });
    return created;
  }, []);

  const clearDemoData = useCallback(() => {
    setState((s) => ({
      ...s,
      customers: [], contacts: [], suppliers: [], products: [], pricingRecords: [], quotations: [], orders: [],
      invoices: [], requirements: [], opportunities: [], communications: [], documents: [],
      kycRecords: [], extractionJobs: [], campaigns: [], expenses: [], payments: [], deliveries: [],
      warehouses: [], inventoryItems: [], stockMovements: [], shipments: [],
      brands: [], markets: [], deals: [], ownStock: [], dismissedSignals: [], snoozedSignals: {},
    }));
  }, []);

  const resetDemoData = useCallback(() => {
    setState((s) => ({ ...s, ...seedData }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      signIn,
      signOut,
      adoptServerSession,
      hydrateFromServer,
      approvePricing,
      rejectPricing,
      updatePricing,
      addCustomer,
      updateCustomer,
      removeCustomer,
      addSupplier,
      updateSupplier,
      removeSupplier,
      addContact,
      updateContact,
      addProduct,
      updateProduct,
      removeProduct,
      addDocument,
      updateDocument,
      removeDocument,
      updateKycStatus,
      sendKycRequest,
      submitKycForm,
      convertQuotationToOrder,
      convertOrderToInvoice,
      updateKycNotes,
      addRequirement,
      updateRequirement,
      removeRequirement,
      matchRequirement,
      setModuleEnabled,
      addDelivery,
      markDeliveryArrived,
      removeDelivery,
      addWarehouse,
      updateWarehouse,
      removeWarehouse,
      receiveStock,
      adjustInventory,
      addShipment,
      updateShipment,
      updateShipmentStatus,
      removeShipment,
      recordProofOfDelivery,
      reportDeliveryException,
      resolveDeliveryException,
      addBrand,
      updateBrand,
      removeBrand,
      addMarket,
      updateMarket,
      removeMarket,
      addQuotation,
      updateQuotation,
      updateQuotationStatus,
      addOrder,
      updateOrder,
      updateOrderStatus,
      addOpportunity,
      updateOpportunity,
      removeOpportunity,
      updateOpportunityStage,
      markInvoicePaid,
      runHistoricalEmailScan,
      addExpense,
      updateExpense,
      removeExpense,
      recordReceipt,
      recordSupplierPayment,
      resolveAudience,
      addCampaign,
      updateCampaign,
      removeCampaign,
      sendCampaign,
      markCommunicationRead,
      toggleCommunicationStar,
      toggleCommunicationFlag,
      moveCommunication,
      sendCommunication,
      fileAttachment,
      extractFromCommunication,
      updateOrganisation,
      addUser,
      updateUser,
      removeUser,
      updateCrmSettings,
      updateSalesSettings,
      updateProductSettings,
      updateFxRates,
      setReportingCurrency,
      updateTradeSettings,
      dismissSignal,
      snoozeSignal,
      addDeal,
      addParty,
      setInvoiceCompany,
      addStockLot,
      updateStockLot,
      removeStockLot,
      reserveStock,
      releaseStock,
      setPartyRoles,
      updatePartyProfile,
      updatePartyTerms,
      addPricingBatch,
      addRequestsBatch,
      addCommunicationsBatch,
      startDealFromQuotation,
      clearDemoData,
      resetDemoData,
      updateDeal,
      removeDeal,
      restoreSignals,
    }),
    [state, signIn, signOut, adoptServerSession, hydrateFromServer, approvePricing, rejectPricing, updatePricing, addCustomer, updateCustomer, removeCustomer, addSupplier, updateSupplier, removeSupplier, addContact, updateContact, addProduct, updateProduct, removeProduct, addDocument, updateDocument, removeDocument, updateKycStatus, sendKycRequest, submitKycForm, convertQuotationToOrder, convertOrderToInvoice, addQuotation, updateQuotation, updateQuotationStatus, addOrder, updateOrder, updateOrderStatus, updateKycNotes, addRequirement, updateRequirement, removeRequirement, matchRequirement, setModuleEnabled, addDelivery, markDeliveryArrived, removeDelivery, addWarehouse, updateWarehouse, removeWarehouse, receiveStock, adjustInventory, addShipment, updateShipment, updateShipmentStatus, removeShipment, recordProofOfDelivery, reportDeliveryException, resolveDeliveryException, addBrand, updateBrand, removeBrand, addMarket, updateMarket, removeMarket, addOpportunity, updateOpportunity, removeOpportunity, updateOpportunityStage, markInvoicePaid, setInvoiceCompany, addStockLot, updateStockLot, removeStockLot, reserveStock, releaseStock, runHistoricalEmailScan, addExpense, updateExpense, removeExpense, recordReceipt, recordSupplierPayment, resolveAudience, addCampaign, updateCampaign, removeCampaign, sendCampaign, markCommunicationRead, toggleCommunicationStar, toggleCommunicationFlag, moveCommunication, sendCommunication, fileAttachment, extractFromCommunication, updateOrganisation, addUser, updateUser, removeUser, updateCrmSettings, updateSalesSettings, updateProductSettings, updateFxRates, setReportingCurrency, updateTradeSettings, dismissSignal, snoozeSignal, addDeal, updateDeal, removeDeal, restoreSignals, addParty, setPartyRoles, updatePartyProfile, updatePartyTerms, addPricingBatch, addRequestsBatch, addCommunicationsBatch, startDealFromQuotation, clearDemoData, resetDemoData],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
