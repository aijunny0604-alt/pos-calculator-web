# Security Audit Report - POS Calculator Web

| Field | Value |
|-------|-------|
| **Project** | pos-calculator-web (MOVE MOTORS POS System) |
| **Audit Date** | 2026-03-28 |
| **Auditor** | Security Architect Agent |
| **Tech Stack** | React 18 + Vite 6 + Tailwind CSS 3 + Supabase |
| **Deployment** | GitHub Pages (static SPA) |
| **URL** | https://aijunny0604-alt.github.io/pos-calculator-web/ |

---

## Executive Summary

This audit identified **5 Critical**, **4 High**, **6 Medium**, and **5 Low** severity issues across the POS Calculator Web application. The most urgent findings involve exposed API keys (Gemini and Supabase), the complete absence of an authentication system, hardcoded admin passwords in client-side code, and XSS vectors via `document.write()`. Because this is a client-only SPA deployed on GitHub Pages with no server-side middleware, the attack surface is fundamentally different from a traditional server-rendered application -- all secrets in source code are fully exposed to any browser user.

### Risk Score: 28/100 (Critical Risk)

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 5 | Requires immediate remediation |
| High | 4 | Fix before next release |
| Medium | 6 | Fix within next sprint |
| Low | 5 | Track in backlog |

---

## Table of Contents

1. [Critical Findings](#1-critical-findings)
2. [High Findings](#2-high-findings)
3. [Medium Findings](#3-medium-findings)
4. [Low Findings](#4-low-findings)
5. [OWASP Top 10 Compliance Matrix](#5-owasp-top-10-compliance-matrix)
6. [Remediation Roadmap](#6-remediation-roadmap)
7. [Architecture Recommendations](#7-architecture-recommendations)

---

## 1. Critical Findings

### CRIT-01: Gemini API Key Exposed in Source Code (Base64 Obfuscated)

| Field | Detail |
|-------|--------|
| **OWASP** | A02 Cryptographic Failures |
| **File** | `src/pages/TextAnalyze.jsx:44-46` |
| **Also in** | `src/pages/AdminPage.jsx:1880` |
| **Impact** | Full access to Google Gemini API under the project owner's account; financial abuse, quota exhaustion, data exfiltration |

**Evidence:**
```javascript
// TextAnalyze.jsx:44-46
const getDefaultApiKey = () => {
  const encoded = 'QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj';
  try { return atob(encoded); } catch { return ''; }
};
```

The Base64 string decodes to a Google API key beginning with `AIzaSy...`. This key is:
- Committed to the Git repository (full history).
- Included in the production build (`dist/assets/index-D6Svickq.js`).
- Trivially decodable (Base64 is encoding, not encryption).
- Used in direct client-side `fetch()` calls to `generativelanguage.googleapis.com`, meaning anyone can extract it from browser DevTools.

**Remediation:**
1. **Immediate:** Revoke the current API key in Google Cloud Console.
2. Generate a new API key with HTTP referrer restrictions (restrict to your domain).
3. Move the Gemini API call to a backend proxy (Supabase Edge Function or similar) so the key never reaches the client.
4. Remove the Base64-encoded key from all source files and Git history (use `git filter-repo` or BFG Repo Cleaner).

---

### CRIT-02: No Authentication System

| Field | Detail |
|-------|--------|
| **OWASP** | A07 Identification and Authentication Failures |
| **Scope** | Entire application |
| **Impact** | Any person with the URL can access all POS data, create/modify/delete orders, products, customers, and manage stock |

The application has zero authentication. There is no login page, no session management, no JWT tokens, and no Supabase Auth integration. The Supabase anon key grants full read/write access to all tables via the REST API.

**Current state:**
- `AdminPage.jsx` has a client-side password gate (`4321`), but this is trivially bypassable (inspect source, or call Supabase REST API directly).
- All Supabase CRUD operations use the same anon key with no user identity.

**Remediation:**
1. Implement Supabase Auth (email/password or magic link).
2. Enforce authenticated sessions before any data access.
3. Replace the client-side admin password with role-based access control (RBAC) via Supabase Auth roles.
4. See [Architecture Recommendations](#7-architecture-recommendations) for a phased plan.

---

### CRIT-03: Supabase Anon Key with Unrestricted Database Access

| Field | Detail |
|-------|--------|
| **OWASP** | A01 Broken Access Control |
| **File** | `src/lib/supabase.js:3-4`, `src/App.jsx:188-189` |
| **Impact** | Anyone can read, create, update, and delete all records in all 5 tables |

**Evidence:**
```javascript
// supabase.js:3-4
const SUPABASE_URL = 'https://jubzppndcclhnvgbvrxr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU';
```

The Supabase anon key is hardcoded and published. While Supabase anon keys are designed to be public, their safety depends entirely on properly configured Row Level Security (RLS) policies. Based on this audit:

- There is no evidence of RLS policies enforcing per-user access control in the codebase.
- The `deleteAllSavedCarts()` function uses `?id=gt.0` which deletes ALL records -- this would only be possible if RLS allows unrestricted DELETE for the anon role.
- The CLAUDE.md mentions "RLS + Realtime subscription setup complete" but without authentication, RLS policies cannot meaningfully restrict access (there is no `auth.uid()` to check against).

**Remediation:**
1. **Verify current RLS policies** in the Supabase dashboard for all 5 tables (orders, products, customers, customer_returns, saved_carts).
2. Implement Supabase Auth first, then create RLS policies that use `auth.uid()` to restrict access.
3. At minimum, restrict DELETE and UPDATE operations to authenticated admin users.
4. Audit the `deleteAllSavedCarts()` bulk delete endpoint -- this is extremely dangerous without RLS.

---

### CRIT-04: Hardcoded Admin Password in Client-Side Code

| Field | Detail |
|-------|--------|
| **OWASP** | A07 Identification and Authentication Failures |
| **File** | `src/pages/AdminPage.jsx:18` |
| **Also in** | `src/lib/supabase.js:206` (unused legacy) |
| **Impact** | Admin access bypass; false sense of security |

**Evidence:**
```javascript
// AdminPage.jsx:18
const ADMIN_PASSWORD = '4321';

// supabase.js:206 (exported but unused)
export const ADMIN_PASSWORD = '1234';
```

**Issues:**
- The password `4321` is visible in the source code to any user (View Source, DevTools, or the Git repo).
- The password check is purely client-side (`pw === ADMIN_PASSWORD`) with no server-side enforcement.
- Even if the password check were hidden, bypassing it only requires calling the Supabase REST API directly -- there is no server-side authorization for admin operations.
- The old password `1234` is still exported from `supabase.js`, creating confusion and a potential secondary attack vector.
- No brute-force protection (the `attempts` counter is local state only; refreshing resets it).

**Remediation:**
1. Remove both hardcoded passwords entirely.
2. Implement server-side authentication with Supabase Auth.
3. Create an `admin` role in Supabase and use RLS policies to restrict admin operations.
4. Add proper rate limiting and account lockout for failed login attempts.

---

### CRIT-05: Supabase Credentials Duplicated in App.jsx (WebSocket)

| Field | Detail |
|-------|--------|
| **OWASP** | A02 Cryptographic Failures |
| **File** | `src/App.jsx:188-189` |
| **Impact** | Secret sprawl; credentials in multiple locations increase risk of inconsistent rotation |

**Evidence:**
```javascript
// App.jsx:188-189
const supabaseUrl = 'https://jubzppndcclhnvgbvrxr.supabase.co';
const supabaseKey = 'sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU';
```

The same Supabase credentials appear in both `supabase.js` and `App.jsx`. This creates a maintenance hazard where one might be rotated while the other is missed.

**Remediation:**
1. Centralize all Supabase credentials in a single module (`supabase.js`).
2. Import from that single source in `App.jsx` instead of re-declaring.
3. Move credentials to environment variables (`import.meta.env.VITE_SUPABASE_URL`).

---

## 2. High Findings

### HIGH-01: XSS via document.write() in Print Functions

| Field | Detail |
|-------|--------|
| **OWASP** | A03 Injection |
| **Files** | `src/pages/OrderDetail.jsx:371`, `src/pages/ShippingLabel.jsx:580`, `src/pages/OrderPage.jsx:246` |
| **Impact** | If database records contain malicious HTML/JS, printing will execute it in a new window context |

**Evidence:**
```javascript
// OrderDetail.jsx:371
const printWindow = window.open('', '_blank');
printWindow.document.write(`<html>...${order.orderNumber}...`);
```

**Mitigating factors:**
- The code does use `escapeHtml()` for user-generated content (customer names, product names, memos, addresses).
- The `escapeHtml()` function in `utils.js` properly escapes `&`, `<`, `>`, `"`, `'`.

**Remaining risk:**
- `order.orderNumber` at `OrderDetail.jsx:374` and `OrderPage.jsx:249` are interpolated WITHOUT `escapeHtml()`.
- `order.priceType` at `OrderDetail.jsx:399` is interpolated without escaping (uses ternary to select string, which is safe only if priceType is always `'wholesale'` or `'retail'`).
- The `<script>window.onload = function() { window.print(); }</script>` in ShippingLabel.jsx is static and safe.
- `document.write()` itself is a deprecated API with security implications; modern alternatives exist.

**Remediation:**
1. Apply `escapeHtml()` to ALL interpolated values, even those expected to be safe (defense in depth).
2. Replace `document.write()` with a safer approach:
   - Use an iframe with `srcdoc` attribute.
   - Or use `DOMParser` to construct the document safely.
   - Or use CSS `@media print` with a dedicated print-friendly component.
3. Add Content Security Policy headers to prevent inline script execution.

---

### HIGH-02: No Input Validation on Supabase REST API URL Parameters

| Field | Detail |
|-------|--------|
| **OWASP** | A03 Injection |
| **File** | `src/lib/supabase.js` (11 occurrences) |
| **Impact** | PostgREST filter injection; unauthorized data access or modification |

**Evidence:**
```javascript
// supabase.js:50
const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, ...);
// supabase.js:125
if (customerId) url += `&customer_id=eq.${customerId}`;
```

The `id` and `customerId` parameters are interpolated directly into PostgREST query strings without any validation or encoding. A crafted `id` value like `1&select=*` could potentially manipulate the query.

**Remediation:**
1. Validate that `id` parameters match expected formats (integer or UUID) before interpolation.
2. Use `encodeURIComponent()` on all user-supplied values in URL construction.
3. Better yet, use the Supabase JS client (`supabaseClient.from('table').select()...`) which handles parameterization safely, instead of raw `fetch()` calls.

---

### HIGH-03: Gemini API Key Persisted in localStorage

| Field | Detail |
|-------|--------|
| **OWASP** | A02 Cryptographic Failures |
| **File** | `src/pages/TextAnalyze.jsx:50`, `src/pages/AdminPage.jsx:1878` |
| **Impact** | API key accessible via XSS or physical access to browser; persists across sessions |

**Evidence:**
```javascript
// TextAnalyze.jsx:50
const [geminiApiKey, setGeminiApiKey] = useState(
  () => localStorage.getItem('geminiApiKey') || getDefaultApiKey()
);
```

The Gemini API key (either the hardcoded default or a user-provided key) is stored in `localStorage`, which:
- Is accessible to any JavaScript running on the same origin (XSS risk).
- Persists indefinitely unless explicitly cleared.
- Is not encrypted.

**Remediation:**
1. Never store API keys in client-side storage.
2. Proxy all Gemini API calls through a backend service.
3. If client-side storage is unavoidable, use session-scoped state only (no localStorage).

---

### HIGH-04: No Rate Limiting or Abuse Protection

| Field | Detail |
|-------|--------|
| **OWASP** | A04 Insecure Design |
| **Scope** | All Supabase API calls, Gemini API calls |
| **Impact** | Denial of service, API cost exhaustion, data manipulation at scale |

There is no rate limiting at any level:
- The Supabase REST API is called directly from the client with no throttling on write operations.
- The Gemini API is called directly from the client with the user's key.
- The admin password login has no lockout (client-side attempt counter resets on page refresh).
- The `deleteAllSavedCarts()` function can wipe all saved carts with a single call.

**Remediation:**
1. Implement rate limiting via Supabase Edge Functions or a middleware layer.
2. Add API key usage quotas in Google Cloud Console.
3. Implement server-side brute-force protection for admin access.
4. Add confirmation dialogs with secondary verification for destructive bulk operations.

---

## 3. Medium Findings

### MED-01: No Content Security Policy (CSP) Headers

| Field | Detail |
|-------|--------|
| **OWASP** | A05 Security Misconfiguration |
| **File** | `index.html`, deployment configuration |
| **Impact** | No defense against XSS, clickjacking, or resource injection attacks |

The application has no security headers configured:
- No `Content-Security-Policy` header.
- No `X-Frame-Options` header (vulnerable to clickjacking).
- No `X-Content-Type-Options` header.
- No `Strict-Transport-Security` header.
- No `Referrer-Policy` header.

GitHub Pages does set some default headers, but they do not include CSP.

**Remediation:**
1. Add a CSP meta tag to `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self' https://jubzppndcclhnvgbvrxr.supabase.co https://generativelanguage.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
```
2. For full header control, consider deploying behind Cloudflare, Netlify, or Vercel which allow custom header configuration.
3. Add `X-Frame-Options: DENY` meta tag or use CSP `frame-ancestors 'none'`.

---

### MED-02: Sensitive Data in console.log Statements

| Field | Detail |
|-------|--------|
| **OWASP** | A09 Security Logging and Monitoring Failures |
| **Scope** | 37 occurrences across 7 files |
| **Impact** | Information leakage via browser DevTools; debug logs in production |

**Evidence:**
```javascript
// supabase.js:182
console.log('[supabase.deleteSavedCart] id:', id, 'type:', typeof id);
console.log('[supabase.deleteSavedCart] status:', r.status, 'ok:', r.ok);
```

Production builds include 37 `console.log/error/warn` statements that expose:
- API call details (IDs, status codes)
- Error messages with potential internal structure details
- Debug information about data types and operations

**Remediation:**
1. Add a Vite plugin to strip `console.*` calls in production builds (e.g., `vite-plugin-remove-console` or `terser` options).
2. Replace `console.error` with a structured logging service for production monitoring.
3. Remove debug-specific `console.log` statements (lines 182-184 in supabase.js).

---

### MED-03: No HTTPS Enforcement

| Field | Detail |
|-------|--------|
| **OWASP** | A02 Cryptographic Failures |
| **Scope** | Deployment configuration |
| **Impact** | Man-in-the-middle attacks if accessed via HTTP |

While GitHub Pages enforces HTTPS, the application does not:
- Include HSTS headers.
- Have a redirect from HTTP to HTTPS in its own configuration.
- Include `Strict-Transport-Security` headers.

**Note:** GitHub Pages handles HTTPS enforcement at the infrastructure level, so this is lower risk. However, if the application is ever moved to a different host, this could become a critical issue.

**Remediation:**
1. Add HSTS meta tag for defense in depth:
```html
<meta http-equiv="Strict-Transport-Security" content="max-age=63072000; includeSubDomains">
```
2. Ensure all hardcoded URLs use `https://` (currently they do).

---

### MED-04: localStorage Used for Security-Sensitive Settings Without Integrity Checks

| Field | Detail |
|-------|--------|
| **OWASP** | A08 Software and Data Integrity Failures |
| **Files** | Multiple (TextAnalyze.jsx, AdminPage.jsx, ShippingLabel.jsx, App.jsx) |
| **Impact** | Tampering with localStorage could modify application behavior |

The application stores various settings in localStorage:
- `geminiApiKey` - API credentials
- `aiOrderBackups` - Backup data
- `useGeminiAI` - Feature toggle
- `shippingCustomerSettings` - Shipping configuration
- `notificationSettings` - Notification preferences
- `burnway-car-models` - Product configuration

None of these values are validated for integrity when read back. A malicious script or browser extension could modify these values to:
- Redirect API calls to a malicious endpoint.
- Inject malicious data into backup restoration flows.
- Alter shipping information.

**Remediation:**
1. Validate all localStorage values against expected schemas when reading them.
2. For critical settings, add HMAC integrity checks.
3. Avoid storing sensitive credentials in localStorage entirely.

---

### MED-05: Unvalidated JSON Parsing of AI Responses

| Field | Detail |
|-------|--------|
| **OWASP** | A08 Software and Data Integrity Failures |
| **Files** | `src/pages/TextAnalyze.jsx:491-495`, `src/pages/AdminPage.jsx:2000` |
| **Impact** | Malformed or malicious AI responses could cause unexpected behavior |

**Evidence:**
```javascript
// TextAnalyze.jsx:491-494
jsonStr = jsonStr.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}')
  .replace(/[\x00-\x1F]/g, ' ').trim();
try { return JSON.parse(jsonStr); } catch {
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
```

The AI response parsing has multiple fallback strategies to extract JSON, including regex extraction. While `JSON.parse` itself is safe, the parsed data is used to:
- Look up products by name (could match unintended products).
- Set stock quantities (could set stock to arbitrary values in AI Stock mode).

**Remediation:**
1. Validate the parsed JSON against a strict schema (e.g., using Zod or manual validation).
2. Verify that `quantity`, `action`, and `matchedProduct` values fall within expected ranges.
3. Add bounds checking for stock modification values.

---

### MED-06: Missing Error Boundary for API Failures

| Field | Detail |
|-------|--------|
| **OWASP** | A09 Security Logging and Monitoring Failures |
| **File** | `src/lib/supabase.js` |
| **Impact** | Silent failures could lead to data loss or inconsistent state |

**Evidence:**
```javascript
// supabase.js:31
} catch (e) { console.error('getOrders:', e); return null; }
```

All Supabase API functions catch errors and return `null` or `false`. This means:
- API failures are silently swallowed.
- The application may display stale or empty data without user awareness.
- Error details (including potentially sensitive information) are logged to the console.
- No monitoring or alerting system captures these failures.

**Remediation:**
1. Implement a consistent error handling pattern that surfaces errors to the user.
2. Add error state management in the React components.
3. Consider implementing a retry mechanism for transient failures.
4. Set up client-side error reporting (e.g., Sentry) for production monitoring.

---

## 4. Low Findings

### LOW-01: Legacy Unused Password Export

| Field | Detail |
|-------|--------|
| **File** | `src/lib/supabase.js:206` |
| **Impact** | Code confusion; exported constant suggests authentication that does not exist |

```javascript
export const ADMIN_PASSWORD = '1234';
```

This is exported but never imported anywhere. It is a remnant from an earlier design and should be removed.

**Remediation:** Delete line 206 from `supabase.js`.

---

### LOW-02: External Links Without Full rel Attribute

| Field | Detail |
|-------|--------|
| **OWASP** | A05 Security Misconfiguration |
| **File** | `src/pages/Dashboard.jsx:197-208` |
| **Impact** | Minor; `rel="noopener noreferrer"` is correctly used on Google Docs links |

The external links to Google Docs in the Dashboard do correctly use `target="_blank" rel="noopener noreferrer"`, which is the recommended pattern. No issue here -- this is a confirmation of correct practice.

---

### LOW-03: user-scalable=no in Viewport Meta

| Field | Detail |
|-------|--------|
| **File** | `index.html:5` |
| **Impact** | Accessibility concern; prevents users with visual impairments from zooming |

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

While this is common in POS applications for preventing accidental zoom, it reduces accessibility.

**Remediation:** Consider removing `maximum-scale=1.0, user-scalable=no` or making it configurable.

---

### LOW-04: No Subresource Integrity (SRI) for External Resources

| Field | Detail |
|-------|--------|
| **OWASP** | A08 Software and Data Integrity Failures |
| **Scope** | Build configuration |
| **Impact** | If a CDN were compromised, injected scripts could execute |

The application currently loads all resources from its own origin (GitHub Pages), so this is low risk. However, if external CDN resources are added in the future, SRI hashes should be included.

**Remediation:** Monitor for any future addition of external script/style tags and add `integrity` attributes.

---

### LOW-05: Debug Information in Production Build

| Field | Detail |
|-------|--------|
| **File** | `dist/assets/index-D6Svickq.js` |
| **Impact** | Source code is readable; all secrets, logic, and API endpoints are extractable |

The production build contains:
- The Base64-encoded Gemini API key.
- Supabase URL and anon key.
- Admin password.
- Complete business logic.

While Vite does minify the production bundle, it does not obfuscate secrets.

**Remediation:**
1. Move all secrets to server-side services.
2. Enable source map generation only for development builds (currently source maps appear to be off in production, which is correct).

---

## 5. OWASP Top 10 Compliance Matrix

| # | Category | Status | Findings |
|---|----------|--------|----------|
| A01 | Broken Access Control | **FAIL** | CRIT-03: No access control on Supabase data; any user can read/write/delete all records |
| A02 | Cryptographic Failures | **FAIL** | CRIT-01, CRIT-05, HIGH-03: API keys exposed in source code and localStorage |
| A03 | Injection | **PARTIAL** | HIGH-01: XSS mitigated with escapeHtml but document.write still risky; HIGH-02: PostgREST filter injection possible |
| A04 | Insecure Design | **FAIL** | HIGH-04: No rate limiting; no authentication architecture; client-side-only security model |
| A05 | Security Misconfiguration | **FAIL** | MED-01: No CSP, no security headers |
| A06 | Vulnerable Components | **PASS** | Dependencies appear current; no known CVEs in direct dependencies |
| A07 | Auth Failures | **FAIL** | CRIT-02, CRIT-04: No authentication; hardcoded passwords |
| A08 | Integrity Failures | **PARTIAL** | MED-04, MED-05: No validation on localStorage or AI responses |
| A09 | Logging Failures | **FAIL** | MED-02, MED-06: No security logging; debug logs in production; silent error handling |
| A10 | SSRF | **PASS** | No server-side components; Gemini API calls use hardcoded URLs only |

**Overall OWASP Compliance: 2/10 categories pass**

---

## 6. Remediation Roadmap

### Phase 1: Emergency (Do This Week)

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | **Revoke the Gemini API key** in Google Cloud Console and generate a new one with referrer restrictions | 15 min |
| 2 | **Remove** `ADMIN_PASSWORD = '1234'` from `supabase.js:206` | 5 min |
| 3 | **Verify Supabase RLS policies** are enabled on all 5 tables in the Supabase dashboard | 30 min |
| 4 | **Remove** Base64 Gemini key from source code (`TextAnalyze.jsx:45`, `AdminPage.jsx:1880`) | 15 min |
| 5 | **Centralize** Supabase credentials (remove duplication in `App.jsx:188-189`) | 15 min |

### Phase 2: Short-Term (Next 2 Weeks)

| Priority | Action | Effort |
|----------|--------|--------|
| 6 | **Move credentials to environment variables** (use `import.meta.env.VITE_SUPABASE_URL` etc.) | 1 hour |
| 7 | **Add CSP meta tag** to `index.html` | 30 min |
| 8 | **Add `escapeHtml()`** to all `document.write()` interpolations (orderNumber, etc.) | 1 hour |
| 9 | **Add input validation** to Supabase URL parameters (validate IDs as integers/UUIDs) | 2 hours |
| 10 | **Strip console.log** in production builds via Vite configuration | 30 min |

### Phase 3: Medium-Term (Next Month)

| Priority | Action | Effort |
|----------|--------|--------|
| 11 | **Implement Supabase Auth** (email/password login) | 1-2 days |
| 12 | **Create RLS policies** that use `auth.uid()` for all tables | 4 hours |
| 13 | **Replace hardcoded admin password** with Supabase Auth roles | 4 hours |
| 14 | **Create a Supabase Edge Function** to proxy Gemini API calls | 4 hours |
| 15 | **Replace `document.write()`** with CSS print media or iframe srcdoc | 4 hours |

### Phase 4: Long-Term (Next Quarter)

| Priority | Action | Effort |
|----------|--------|--------|
| 16 | **Add rate limiting** via Edge Functions or middleware | 2 days |
| 17 | **Implement security monitoring** (client-side error reporting) | 1 day |
| 18 | **Add automated security scanning** to CI/CD pipeline | 4 hours |
| 19 | **Implement audit logging** for data modifications | 1 day |
| 20 | **Conduct penetration test** after remediation | 1-2 days |

---

## 7. Architecture Recommendations

### Current Architecture (Insecure)

```
Browser (all users, no auth)
    |
    +-- Direct fetch() --> Supabase REST API (anon key, full access)
    |
    +-- Direct fetch() --> Google Gemini API (key in client code)
```

### Recommended Architecture

```
Browser
    |
    +-- Supabase Auth (login/session)
    |
    +-- Supabase REST API (with RLS, authenticated)
    |       |
    |       +-- RLS policies enforce per-user access
    |       +-- Admin role for destructive operations
    |
    +-- Supabase Edge Function (proxy)
            |
            +-- Gemini API (key stored in server-side secrets)
            +-- Rate limiting
            +-- Input validation
```

### Key Design Principles

1. **Zero Trust Client**: Never trust the browser. All security enforcement must be server-side.
2. **Principle of Least Privilege**: The anon key should only allow read access to non-sensitive data. All writes should require authentication.
3. **Defense in Depth**: Even with RLS, validate inputs; even with authentication, check authorization; even with escapeHtml, use CSP.
4. **Secrets Never in Client Code**: Use environment variables for build-time configuration and Edge Functions for runtime secrets.

### Environment Variable Migration

Create a `.env` file (already in `.gitignore`):

```bash
VITE_SUPABASE_URL=https://jubzppndcclhnvgbvrxr.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU
```

Update `supabase.js`:
```javascript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

**Note:** For Supabase anon keys, environment variables improve maintainability but do not add security since the key is still embedded in the built JavaScript. The real security comes from RLS policies.

---

## Appendix A: Files Audited

| File | Lines | Security-Relevant Findings |
|------|-------|---------------------------|
| `src/lib/supabase.js` | 207 | Hardcoded credentials, unused password export, no input validation |
| `src/pages/TextAnalyze.jsx` | ~1216 | Base64 API key, localStorage key storage, unvalidated AI response |
| `src/pages/AdminPage.jsx` | ~2203 | Hardcoded password, Base64 API key, client-side auth gate |
| `src/pages/OrderDetail.jsx` | ~1420 | document.write() XSS, partial escapeHtml usage |
| `src/pages/ShippingLabel.jsx` | ~1238 | document.write() XSS, escapeHtml used consistently |
| `src/pages/OrderPage.jsx` | ~1000 | document.write() XSS (legacy, unused page) |
| `src/App.jsx` | ~1045 | Duplicated Supabase credentials, localStorage usage |
| `src/lib/utils.js` | 118 | escapeHtml implementation (correctly implemented) |
| `index.html` | 17 | No CSP, no security headers, user-scalable=no |
| `vite.config.js` | 10 | No security-related plugins or configurations |
| `.gitignore` | 20 | Correctly excludes .env files |

## Appendix B: Tools and Methods

- Manual source code review
- Pattern-based secret detection (regex scanning for API keys, passwords, tokens)
- OWASP Top 10 (2021) checklist evaluation
- Dependency version audit (`package.json`)
- Build artifact inspection (`dist/` directory)
- Data flow analysis for XSS vectors

---

*This report was generated as part of Phase 7 (SEO/Security) of the PDCA development lifecycle. The findings should be reviewed by the development team and prioritized according to the remediation roadmap above.*
