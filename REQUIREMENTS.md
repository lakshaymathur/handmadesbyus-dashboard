# HandMadesByUs Dashboard — Requirements

> Status: Draft v3 (open questions resolved, see §6) · Last updated: 2026-11-13
> Legend: **[MVP]** = first release · **[P2]** = phase 2 / nice to have · ✨ = new vs. original notes

---

## 1. Overview

A web app for HandMadesByUs, a small handmade-products business that sells mainly through Instagram, to manage:

- **Customers**: who ordered and where to ship
- **Products**: the catalogue of items made
- **Orders**: what was ordered, customisations, production progress, payments
- **Shipping**: courier, AWB, tracking, delivery
- **Financials** ✨: revenue, costs, profit, outstanding payments, expenses

### 1.1 Assumptions
- One business with a few internal users (owner plus staff), all with full access. No customer-facing portal.
- Currency is INR (₹), timezone is IST, addresses are Indian (6-digit PIN code).
- The business is **not GST-registered**, so no tax fields are needed.
- Everything is made to order. Inventory is not tracked in the MVP.
- Existing customers and orders are kept in a spreadsheet and will be imported.
- Mostly used on a phone, so the UI must be mobile-first and also work on desktop.

---

## 2. Core Data Model

```
Customer 1 ──── * Order 1 ──── * OrderItem * ──── 1 Product
                    │
                    ├──── * Payment      ✨
                    ├──── * Shipment
                    └──── * StatusHistory ✨
Expense ✨ (standalone)
User
```

### 2.1 Customer **[MVP]**

| Field | Type | Rules |
|---|---|---|
| Customer ID | Auto | Readable format, e.g. `C-0001` |
| First name | Text | Required |
| Last name | Text | Optional (Instagram buyers often give only one name) ✨ |
| Mobile | Phone | Required, 10 digits, **unique**. Used for duplicate detection and search ✨ |
| Alternate mobile ✨ | Phone | Optional |
| Email ✨ | Email | Optional |
| Instagram handle | Text | Optional, stored without `@`, unique if present |
| Address(es) | See below | One or more; one marked as default ✨ |
| Source ✨ | Enum | Instagram / WhatsApp / Referral / Exhibition / Website / Other |
| Notes ✨ | Long text | e.g. "prefers pastel colours", "repeat buyer" |
| Created / Updated at ✨ | Auto | |

**Address**: House/flat no., Street/Area, Landmark ✨, City, State (dropdown), PIN code (6 digits, validated), Country (defaults to India) ✨.

**Derived (shown on the customer page)** ✨: total orders, lifetime spend, last order date, outstanding balance.

### 2.2 Product (Catalogue) **[MVP]**

The original notes defined only "Box". To support future product lines without a redesign ✨, a product has a **Category** (Box today; e.g. pouch or hamper later) plus common fields.

| Field | Type | Rules |
|---|---|---|
| Product ID / SKU | Text (user-defined) | Required, unique, e.g. `BOX-SQ-RED-01` |
| Product name | Text | Required |
| Category ✨ | Managed list | e.g. Box. **Each category defines its own production stages** (see 2.6) |
| Type | Managed list | e.g. Square, Rectangle, Hexagon, Trunk |
| Colour | Managed list | |
| Design | Managed list / text | |
| Length × Width × Height | Number | Unit: **cm** (stated explicitly) ✨ |
| Weight ✨ | Number (g) | Used to estimate courier charges |
| Selling price | ₹ | Base price before customisation |
| Cost to make | ₹ | Materials + labour estimate |
| Margin ✨ | Derived | `price − cost`, and % |
| Available customisations ✨ | Multi-select | Which add-ons this product supports (see 2.3) |
| Photos ✨ | Images | 1–5 images; first one is the thumbnail on order cards |
| Status ✨ | Active / Archived | **Archive instead of delete** when the product has been used in an order |

> **Managed lists** ✨: Type, Colour, Design and Delivery Partner should be editable dropdowns (Settings page) rather than free text. This keeps filtering and reporting clean, so you never end up with both "Red" and "red ".

### 2.3 Customisation Options ✨ **[MVP]**

In the original notes, customisation was a product field. It belongs to the order item instead, because the same product can be customised differently for each customer. The catalogue only defines *which* options exist and what they cost.

Customisation options are a **fully managed list in Settings**. Latkan and Sticker are not the only ones, and every option carries an extra charge. Each option defines:

| Setting | Notes |
|---|---|
| Name | e.g. Latkan, Sticker, Name embroidery, Lining colour |
| Input type | None / Text (with max length) / Choice from a list (e.g. colours) |
| Extra price | ₹ added to the item price. Can be overridden on an individual order |
| Extra cost | ₹ added to the item's cost to make |
| Applies to | Which product categories can use it |
| Active | Retired options stay on old orders but can't be picked for new ones |

Starting options: **Latkan** (choice: colour/style) and **Sticker** (text).

### 2.4 Order **[MVP]**

| Field | Type | Rules |
|---|---|---|
| Order ID | Auto | Readable, e.g. `HMU-2611-0042` (year-month-sequence) ✨ |
| Customer | Link | Required, exactly one |
| Order date ✨ | Date | Defaults to today |
| Items | 1..n OrderItems | See 2.5 |
| Delivery address ✨ | Snapshot | Copied from the customer's address at order time, editable per order. Later changes to the customer's address don't alter past orders. |
| Promised delivery date | Date | Required. Drives the "overdue" and "due soon" flags |
| Priority ✨ | Normal / Urgent | e.g. gifting deadline |
| Discount | Flat ₹ **or** % ✨ | Applied at order level |
| Shipping charged to customer ✨ | ₹ | Can be 0 (free shipping) |
| Order total | Derived | `Σ item totals − discount + shipping charged` |
| Payment status ✨ | Derived | Unpaid / Partially paid / Paid / Refunded (from Payments) |
| Status | Enum | See 2.6 |
| Channel ✨ | Enum | Instagram DM / WhatsApp / etc. |
| Notes ✨ | Long text | Internal notes |
| Reference images ✨ | Images | Screenshots of the customer's request or design references **[P2]** |

### 2.5 Order Item ✨ **[MVP]**

One row per product in an order.

| Field | Notes |
|---|---|
| Product | Link to catalogue |
| Quantity ✨ | Default 1 |
| Unit price | **Snapshot** of product price at order time; editable (custom pricing) |
| Unit cost | **Snapshot** of cost to make. Keeps profit reports accurate if prices change later |
| Customisations | Selected options plus their inputs (latkan colour, sticker text) and their prices |
| Item notes | e.g. "lining in gold" |
| Production stage ✨ | Current stage from the product category's stage list (see 2.6) |
| Line total | Derived: `(unit price + customisation prices) × qty` |

### 2.6 Order Lifecycle

The lifecycle has two parts. **Production stages differ by product category**, while **fulfilment stages are the same for every order**.

```
Production (per category, editable in Settings)
  e.g. Box: Not Started → Outer Fabric Done → Handles & Lace Done → Finishing Done

Fulfilment (fixed)
  Ready for Pickup → Docket Raised → In Transit → Delivered

Side states ✨:  On Hold · Cancelled · Returned (RTO)
```

How production is tracked:
- Every order item has its own production stage, taken from its category's stage list.
- If all items in an order share a category (the usual case), the order card shows a single stage, and advancing it moves every item together.
- If an order mixes categories, the order shows **"In Production (x of y items finished)"**, and each item is advanced on the Order Detail page.
- The order moves to **Ready for Pickup** once every item has reached its category's last production stage. This can happen automatically or with one tap.
- A category's stages can be renamed, added or reordered in Settings. A stage that orders still use can't be deleted.

Rules:
- Every status change is recorded in **Status History** ✨ (from → to, timestamp, user). This lets you see how long each stage takes and when an order was delivered.
- Status can move backwards (corrections), but each change still goes into the history.
- **Docket Raised** requires a Shipment with a delivery partner. **In Transit** requires an AWB number ✨.
- **Cancelled** asks for a reason and whether a refund is owed ✨.
- An order is **Overdue** if today > promised date and status is before *Delivered*. It is **Due soon** if the promised date is ≤ 3 days away (threshold configurable) ✨.

### 2.7 Shipment **[MVP]**

| Field | Notes |
|---|---|
| Shipment ID | Auto |
| Order | Link, required. The **customer comes from the order**, so it isn't stored twice (prevents mismatches) ✨ |
| Booked via ✨ | Direct with courier / Aggregator (e.g. Shiprocket). Both are used today |
| Aggregator | Managed list, shown only when booked via an aggregator |
| Delivery partner | Managed list (Delhivery, DTDC, India Post, Blue Dart, etc.). The courier that actually carries the parcel, even when booked through an aggregator |
| AWB number | Unique per partner |
| Tracking URL ✨ | Auto-built from the partner's URL template + AWB |
| Shipping cost (paid to courier) ✨ | ₹. Needed for profit calculation |
| Package weight / dimensions ✨ | Optional |
| Pickup / dispatch date ✨ | |
| Delivered date ✨ | Filled automatically when order status becomes Delivered |
| Shipment status ✨ | Kept in sync with the order's shipping-stage statuses |

> **Change from original notes** ✨: Order → Shipment is **one-to-many**, to handle split shipments and re-shipping after an RTO. The UI still shows a single shipment for the common case.

### 2.8 Payment ✨ **[MVP]**

Handmade orders are often taken with an advance payment, so payments are tracked per order.

| Field | Notes |
|---|---|
| Order | Link |
| Amount | ₹ (negative = refund) |
| Date | |
| Mode | UPI / Cash / Bank transfer / Card / Other |
| Reference | UPI transaction ID, etc. |
| Type | Advance / Balance / Refund |

### 2.9 Expense ✨ **[MVP]**

Business costs not tied to a single order.

| Field | Notes |
|---|---|
| Date, Amount, Description | |
| Category | Raw materials / Packaging / Courier (bulk) / Marketing & ads / Tools / Other |
| Paid via | Same as payment mode |
| Receipt image | Optional **[P2]** |

---

## 3. Screens & Features

### 3.1 Order Dashboard (home) **[MVP]**

- **Card view** of orders. Each card shows:
  - Order ID, customer name, Instagram handle, tap-to-call mobile
  - Product thumbnails and item count with a short summary ("2× Square Box – Red")
  - Status badge (colour-coded) and **Overdue / Due soon / Urgent** flags ✨
  - Promised delivery date (with "in 3 days" / "2 days late")
  - Order total and payment status (e.g. "₹1,200 · ₹500 due") ✨
  - AWB and partner, once shipped
- **Default filter**: hides Delivered and Cancelled orders (toggle to show) ✨. Default sort: promised date, soonest first ✨.
- **Filter** by any attribute: status, customer, product, category, colour, date ranges (order or promised), payment status, delivery partner, overdue.
- **Group by**: status, promised date (Today / This week / Later), customer, product, payment status, delivery partner.
- **Search** ✨: one box that matches order ID, customer name, mobile, Instagram handle, or AWB.
- **Kanban view** ✨: one column per status. Drag a card to the next column to advance it.
- **Quick actions on card** ✨: "Advance to next status" button and "Record payment", without opening the order.
- **Saved views** ✨ **[P2]**: e.g. "To ship today", "Unpaid".
- Clicking a card opens the **Order Detail** page.

### 3.2 Order Detail / Create Order **[MVP]**
- Edit any field. Add, remove or edit items and their customisations.
- **Customer picker** with search by mobile or Instagram handle. Lets you create a new customer inline without leaving the order form ✨.
- Live price breakdown: items, customisations, discount, shipping, total, paid, **balance due** ✨.
- Panels for Shipment, Payments and Status History (timeline) ✨.
- **Duplicate order** ✨ for repeat customers.
- **[P2]** Generate invoice / packing slip PDF, and copy a pre-filled WhatsApp/Instagram message ("Your order HMU-… has shipped! Track: …").

### 3.3 Customers **[MVP]** ✨
- List with search; customer detail page with addresses, order history, lifetime spend, balance due.
- Warn about duplicates when the mobile number or handle already exists.

### 3.4 Products **[MVP]**
- Grid with photos; filter by category, type, colour, active/archived.
- Add, edit, archive. **Delete only if never used in an order** ✨.
- Duplicate product (fast way to create colour variants) ✨.

### 3.5 Shipping **[MVP]**
- List of all shipments; filter by partner, status, date.
- "Ready for Pickup" queue: orders waiting for a docket ✨.
- Edit any shipping detail. Click the AWB to open the tracking link.
- All AWB numbers are entered by hand in the MVP.
- **[P2]** Shiprocket API integration for aggregator shipments: create the shipment, fetch the AWB and update In Transit / Delivered automatically. Direct bookings stay manual.

### 3.6 Financials ✨ **[MVP — basic]**
For a selected period (this month, last month, custom):
- **Revenue is recognised on delivery.** An order counts in the period of its **delivered date**, at its order total.
- **Cost of goods**, **courier cost** and **discounts** for those same delivered orders, so revenue and its costs always match up
- **Shipping**: amount charged to customers vs. paid to couriers
- **Pipeline** (shown separately, not counted as revenue): value of orders that are open but not yet delivered
- **Returned (RTO)** orders are excluded from revenue, but their courier cost still counts as an expense
- **Other expenses** by category
- **Net profit** = Revenue − COGS − Courier cost − Expenses
- **Cash received** (from payments) vs. **Outstanding receivables** (list of orders with a balance due)
- Charts: monthly revenue and profit trend; top products by quantity and by profit
- **[P2]** Export to CSV/Excel for accounting.

### 3.7 Settings ✨ **[MVP]**
- Managed lists: product categories, product types, colours, designs, customisation options (see 2.3), aggregators, delivery partners (with tracking URL template).
- **Production stages per category** (add, rename, reorder).
- Thresholds: "due soon" days.
- User management: add or deactivate users, reset passwords.
- Business details (name, logo, contact), used on invoices **[P2]**.

### 3.8 Data Import ✨ **[MVP]**
Bring existing spreadsheet data into the app as a one-time migration that can be repeated if needed.
- Upload a CSV/Excel file for **Customers**, **Products** and **Orders**. Orders are imported last, linked to customers by mobile number and to products by Product ID.
- Map spreadsheet columns to app fields, and preview the result before importing.
- Validation report: rows with errors (bad mobile or PIN, unknown product, duplicates) are listed and skipped, not silently dropped.
- Imported historical orders can be marked Delivered with their real dates, so past revenue shows up in Financials.
- Provide downloadable template files for each sheet.

---

## 4. Users & Access

**[MVP]**
- Log in with username and password. Passwords are stored hashed. Session expires after inactivity. Includes a "Change password" option.
- **Multiple user accounts** (owner and staff), each with their own login. **Everyone has full access**, including costs, profit and Financials. No roles are needed.
- All logged-in users can create, modify and delete products, orders, customers, shipping, payments and expenses.
- **Deletes are soft**: orders become *Cancelled* and products become *Archived*. Hard delete requires a confirmation dialog ✨.
- **Audit trail** ✨: every record keeps created-by, updated-by and timestamps. With several people editing, this shows who changed what.

**[P2]**
- Password reset via email.
- Roles, only if access ever needs to be restricted.

---

## 5. Non-Functional Requirements ✨

| Area | Requirement |
|---|---|
| Devices | Mobile-first responsive UI; usable one-handed on a phone |
| Performance | Dashboard loads in < 2 s with ~5,000 orders |
| Data safety | Automated daily backups; ability to export all data (CSV/JSON) |
| Security | HTTPS only, hashed passwords, login rate limiting |
| Locale | ₹ formatting (₹1,23,456), DD/MM/YYYY dates, IST |
| Validation | Mobile (10 digits), PIN (6 digits), required fields, no negative prices |
| Hosting | Low/no cost (single small server or managed free tier) |

---

## 6. Decisions (resolved 2026-11-13)

| # | Question | Decision | Where it applies |
|---|---|---|---|
| 1 | When does revenue count? | **On delivery** | §3.6 |
| 2 | Same production stages for every category? | **No, they differ by category.** Each item is tracked against its own category's stages | §2.2, §2.5, §2.6, §3.7 |
| 3 | Other users? | **Yes, staff, with full access** to everything including finances | §4 |
| 4 | Inventory? | **Not now.** Possibly phase 2 | §7 |
| 5 | How are couriers booked? | **Both direct and through an aggregator.** Manual AWB entry in the MVP, Shiprocket API in phase 2 | §2.7, §3.5 |
| 6 | GST-registered? | **No.** No tax fields | §1.1 |
| 7 | Customisation options? | **More than Latkan and Sticker, all with an extra charge.** Fully configurable | §2.3 |
| 8 | Existing data? | **Yes, in a spreadsheet.** Import is part of the MVP | §3.8 |

---

## 7. Suggested Release Plan

| Phase | Scope |
|---|---|
| **MVP** | Multi-user auth, Customers, Products (with photos), Orders with items, configurable customisations, per-category production stages and status history, Shipments, Payments, Expenses, Order Dashboard (cards, filters, group, search, Kanban), Financials (revenue on delivery), Settings, spreadsheet import |
| **P2** | Invoices/packing slips (non-GST), message templates, CSV export, saved views, Shiprocket API integration, inventory (raw materials and/or finished stock), email password reset |
