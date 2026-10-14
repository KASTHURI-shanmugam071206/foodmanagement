# FoodBridge – Surplus Food Donation & Distribution System

FoodBridge is a full-stack real-time platform connecting food donors (restaurants, caterers, canteens), recipient organizations (NGOs, community centers, shelters, individuals in need), volunteers, and administrators to reduce food waste and rapidly distribute meals.

---

## Architecture Overview

- **Backend**: Node.js (ESM), Express.js, Socket.IO real-time engine, MySQL (`mysql2/promise`), Zod schema validation, JWT authentication, bcryptjs, Helmet, rate-limiting, and Winston structured request logging.
- **Frontend**: React 18, Vite, Tailwind CSS, React Router v7, React Hook Form, Leaflet & React-Leaflet, Recharts, Lucide Icons, `qrcode.react`.
- **Database**: Relational MySQL 8.0 schema with transactional concurrency protection (`FOR UPDATE` row locks), foreign key constraints, indexes, and immutable status audit trails.

---

## 7 Innovative Features Implemented

### 1. Real-Time Food Rescue Tracker
- **10-Stage Delivery Lifecycle**:
  1. `donation_created`: Surplus food posted by donor.
  2. `accepted`: Matched with NGO/recipient requirement.
  3. `volunteer_assigned`: Candidate volunteer allocated.
  4. `volunteer_accepted`: Volunteer accepts dispatch run.
  5. `arrived_pickup`: Volunteer arrives at restaurant/donor pickup location.
  6. `food_collected`: Food securely verified and picked up.
  7. `in_transit`: En route to recipient dropoff location.
  8. `arrived_destination`: Volunteer arrives at destination.
  9. `delivered`: Delivered and confirmed with recipient.
  10. `failed`: Cancelled/failed run with documented reason and rollback.
- **Real-Time Dashboards**: Socket.IO events (`delivery:update`, `delivery:location`, `delivery:status`) push live changes instantly to donor, recipient, volunteer, and admin dashboards without page reload.
- **Immutable Status Audit Trail**: Persisted in `delivery_status_history` recording status, timestamp, geocoordinates, user ID, and transition notes.

### 2. Smart Volunteer Assignment
- **Multi-Factor Scoring Engine**:
  - Distance between volunteer location and pickup site (Haversine formula).
  - Volunteer availability and active workload (penalizes volunteers with concurrent deliveries).
  - Urgency of safe-use deadline and meal quantity.
- **Transparent Score Breakdown**: Administrators see candidate rankings, pickup distances, current active loads, and explanation strings (`"Nearest available volunteer with zero active delivery load"`).
- **Manual Assignment & Reassignment**: Admin override modal with one-click dispatch and race-condition prevention.
- **Volunteer Response Workflow**: Volunteers can accept or reject assignments; rejection immediately releases the delivery for re-dispatch.

### 3. Live Location, Route and ETA Tracking
- **Interactive OpenStreetMap & Leaflet**: Visualizes pickup marker, recipient dropoff marker, and live volunteer GPS location.
- **Volunteer Location Broadcast**: Active volunteers share live location with explicit browser permission (`navigator.geolocation`); tracking stops automatically once delivery is delivered or cancelled.
- **Stale Location Warning**: Gracefully alerts when location updates are older than 3 minutes or GPS is denied.
- **Authorized Room Isolation**: Socket.IO rooms (`delivery:${id}`) ensure precise coordinates are shared only with participants of that delivery.

### 4. Food Safety and Expiry Alerts
- **Safety Field Tracking**:
  - Category and quantity with units.
  - Storage requirements (`ambient`, `refrigerated`, `frozen`, `hot_holding`) and storage temperature (°C).
  - Allergen warnings (`allergens`) and food condition (`fresh_hot`, `fresh_chilled`, `packaged_ambient`, `sealed`).
  - Strict safe-use expiry deadlines (`safe_use_deadline`).
- **Urgent Expiry Pill**:
  - `> 4h remaining`: Safe until [time] (Emerald).
  - `1 - 4h remaining`: Expires soon (Amber).
  - `< 1h remaining`: Critical expiry alert (Rose).
  - Past deadline: `EXPIRED` (Rose).
- **Automated Safety Protection**: Expired or flagged food is strictly blocked from new allocations.
- **Food Safety Incident Reporting**: Users can report spoiled, damaged, or temperature-abused food (`/api/donations/:id/report-safety`), which marks the item, cancels unfulfilled allocations, and notifies stakeholders.

### 5. Fair and Explainable Food Allocation
- **Automated Matching Engine**:
  - Matches based on category compatibility, distance proximity, quantity fit, and deadline urgency.
  - Transparent match scoring displayed to users.
- **ACID Transaction Protection**:
  - Concurrency protected via `SELECT ... FOR UPDATE` row-level locks.
  - Eliminates over-allocation and duplicate allocation race conditions.
  - Automatically updates remaining quantity on donation and requirement records.

### 6. Real-Time Impact Dashboard & Environmental Analytics
- **Dynamic Metrics**:
  - Total Meals Rescued.
  - Food Weight Avoided from Landfill (kg).
  - CO2e Greenhouse Gas Emissions Avoided (kg CO2e).
  - Embedded Water Footprint Conserved (Liters).
  - In-transit meals and active community partners.
- **Time Filters**: Filter metrics by `All Time`, `Past 30 Days`, `Past 7 Days`, and `Today`.
- **Transparent Methodology & Assumptions**:
  - 1 serving/meal ≈ 0.42 kg (global food loss estimate).
  - 2.5 kg CO2e prevented per 1 kg food rescued (FAO/EPA Food Loss and Waste methodology).
  - 1,000 L embedded water conserved per kg food saved.
  - Figures are calculated directly from verified database records.
- **CSV Data Exports**: Admin export for donations, requirements, deliveries, users, and impact logs.

### 7. QR-Based Pickup and Delivery Verification
- **Dual Verification Workflow**:
  - **Pickup**: Donor generates single-use pickup QR code + 6-digit PIN; assigned volunteer inputs/scans code to confirm pickup.
  - **Delivery**: Recipient generates single-use delivery QR code + 6-digit PIN; assigned volunteer inputs/scans code to confirm dropoff.
- **Security & Integrity**:
  - Single-use cryptographically hashed tokens (`sha256`) with automatic 30-minute expiry.
  - Backend verifies assigned volunteer authorization and delivery state before updating status.
  - Prevents replay attacks and duplicate submissions.
  - 6-digit PIN manual fallback for devices without camera access.

---

## 4-Digit Numeric Password PIN Rule & Security

As required, authentication across the platform strictly implements a **4-digit numeric PIN password**:

- **Format**: Exactly four digits from `0` to `9` (e.g. `1234`).
- **Validation**: Enforced on both frontend (`/^\d{4}$/`) and backend (Zod regex) with consistent error message: `"Password must contain exactly 4 numeric digits (0-9)"`.
- **Letters, spaces, symbols**: Automatically rejected.
- **Show / Hide Password**: Interactive eye toggle available on all password input fields.
- **Bcrypt Hashing**: Passwords are never stored in plain text and are hashed using bcrypt with salt rounds.
- **Brute-Force Protection & Account Lockout**:
  - Endpoint-level rate limiting on `/api/auth/login`.
  - Account lockout after **5 consecutive failed attempts** for **15 minutes**.
  - Attempt counters reset automatically on successful authentication.

---

## Demo Accounts (PIN: `1234`)

All seed accounts are pre-configured with the 4-digit PIN **`1234`**:

| Role | Email | Password PIN | Role Features |
|---|---|---|---|
| **Admin** | `admin@foodbridge.demo` | `1234` | System dashboard, smart volunteer assignment, impact analytics, CSV reports |
| **Donor 1** | `donor1@foodbridge.demo` | `1234` | Post donations with safety details, live tracking, pickup QR codes |
| **Donor 2** | `donor2@foodbridge.demo` | `1234` | Restaurant profile with surplus menu postings |
| **Recipient 1 (NGO)** | `recipient1@foodbridge.demo` | `1234` | Hope Shelter NGO; post requirements, claim food, delivery QR codes |
| **Recipient 2 (NGO)** | `recipient2@foodbridge.demo` | `1234` | Community Care Centre; urgent food requirements |
| **Volunteer 1** | `volunteer1@foodbridge.demo` | `1234` | Arun Volunteer; 10-stage delivery actions, QR validation, live GPS sharing |
| **Volunteer 2** | `volunteer2@foodbridge.demo` | `1234` | Meena Volunteer; active delivery dispatch runs |

*Quick-login buttons for all demo roles are built into the login screen for one-click testing.*

---

## Database Configuration

The project runs on MySQL 8.0.

### Standalone Local Database (Pre-configured)
The folder `mysql-foodbridge-data` in the project root contains pre-configured tables:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" --datadir="c:\Users\Kasthuri S\Downloads\foodbridge_stage1\mysql-foodbridge-data" --port=3307 --mysqlx=0 --console
```

### Database Migration
Run the automated migration script:
```powershell
npm --prefix server run migrate
```

---

## Installation & Running

### 1. Install Dependencies
```powershell
npm install
npm --prefix server install
npm --prefix client install
```

### 2. Run Automated Test Suite
Execute the full test suite (28 automated tests covering authentication, 4-digit PINs, role access, end-to-end workflows, and the 7 innovative features):

```powershell
npm --prefix server test
```

### 3. Start Backend Server
```powershell
npm --prefix server run dev
```
Backend API & Socket.IO server: `http://localhost:5000`

### 4. Start Frontend Client
```powershell
npm --prefix client run dev
```
Client application: `http://localhost:5173`

---

## Test Results & Verification Summary

| Test Suite | Tests Passed | Status | Coverage |
|---|---|---|---|
| `auth.test.js` | 7 / 7 | PASS | 4-digit PIN validation, bcrypt hashing, brute-force rate limiting, lockout |
| `app.test.js` | 3 / 3 | PASS | Health check, API routing, 404 handler |
| `innovative_features.test.js` | 11 / 11 | PASS | 10-stage delivery lifecycle, smart volunteer assignment scoring, QR code generation and single-use verification, food safety alerts, real-time impact calculations, CSV report export |
| `workflows.test.js` | 7 / 7 | PASS | End-to-end role workflows: Admin, Donor creation, Recipient requirement, Matching recommendation, Transactional allocation, Volunteer status update, Admin statistics |
| **Client Vite Build** | Built in 11.3s | PASS | Clean production bundle compilation with Leaflet maps, QR SVG generator, Recharts, and Tailwind CSS |
