# Threat Model & Security Architecture Review (STRIDE)
**Project**: Project 3 - Smart Asset Inventory & Predictive Maintenance (AST)  
**Document Version**: 1.0.0 (Day 3 Review Deliverable)  
**Author**: Squad 3 - Platform Pod (Cybersecurity & Backend Leads)  

---

## 1. System Scope & Assets Under Protection
1. **Asset Registry & Financial References**: Physical university hardware, serial numbers, procurement costs, and warranty agreements.
2. **Private Document Vault**: Procurement invoices, contracts, receipts, disposal authorization evidence.
3. **Custody & Maintenance Event Trail**: Append-only event history preventing repudiation of equipment theft or unauthorized transfers.
4. **Identity & RBAC Tokens**: JWT credentials, password hashes, and organizational scope boundaries.

---

## 2. Threat Analysis (STRIDE Matrix)

| Threat Category | Potential Attack Vector | Applied Mitigation / Architectural Control |
|---|---|---|
| **Spoofing (Identity)** | Attacker attempts to forge user identity or session tokens. | • JWT with short-lived access tokens (15m) signed by HMAC-SHA256 secret.<br>• Passwords hashed with bcrypt (cost 12) / Argon2id; database rejects plain-text values.<br>• User status verified upon every authenticated request. |
| **Tampering (Data)** | Attacker modifies custody transfer records or erases past maintenance work order history. | • Database-level append-only design for `asset_events` and `audit_log`.<br>• Asset status history cannot be rewritten; every mutation generates an immutable event with actor ID, from/to states, and timestamp.<br>• Document files validated with SHA-256 checksums on upload. |
| **Repudiation** | User denies moving an expensive GPU server or approving asset retirement. | • Centralized `audit_log` records user ID, IP address, user agent, action, and sanitized metadata.<br>• Retirement requires formal approval notes and linked evidence document before sealing record. |
| **Information Disclosure** | Unauthorized college manager browses assets of another college, or non-procurement user downloads sensitive vendor invoices. | • **Organizational Scope RBAC**: College managers scoped to `org_unit_id` and descendants only; cross-college queries return empty/forbidden.<br>• **Private Object Storage**: Invoices and warranties stored in private vault (no public URLs). Downloads require time-bound cryptographic tokens (valid 300s) granted only to authorized roles (`super_admin`, `procurement_finance`, `auditor`). |
| **Denial of Service (DoS)** | Attacker floods API endpoints or submits massive CSV import files. | • Rate limiting (500 requests / 15 minutes per IP).<br>• Request body size capped at 15MB.<br>• Batch import enforces schema validation, unique in-memory sets, and pagination limits. |
| **Elevation of Privilege** | Normal technician attempts to retire assets or change user roles. | • Strict RBAC middleware on every protected route.<br>• Backend authorization is mandatory: UI button concealment is not an access control boundary. |

---

## 3. AI Safety & Fallback Controls
- **Advisory Output Only**: Risk predictions never automatically generate work orders, dispose assets, or alter custody.
- **Deterministic Baseline**: If the AI model or network is offline, the system seamlessly falls back to the deterministic rules engine without service interruption.
- **Zero Protected Attributes**: No personal or protected demographic attributes are used in prediction features.
