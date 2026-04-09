# POS Calculator Web - Security Audit Report v3

> Audit Date: 2026-03-31
> Auditor: Security Architect Agent
> Project: pos-calculator-web (C:\Users\MOVEAM_PC\pos-calculator-web)
> Deployed: https://aijunny0604-alt.github.io/pos-calculator-web/
> Previous Audits: v1 (2026-03-19), v2 (2026-03-23)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Issues | 19 |
| Critical | 4 |
| High | 5 |
| Medium | 4 |
| Low | 3 |
| Info | 3 |
| Security Score | 22 / 100 |
| Previous Score (v2) | 22 / 100 |
| Status | **All Critical/High issues from v1/v2 remain UNRESOLVED** |

The application is a production POS system handling real customer PII (117+ customers), financial transactions, and bank account information. It is deployed on a public URL with zero authentication -- any visitor has full CRUD access to all business data.

---

## OWASP Top 10 Coverage

| OWASP ID | Category | Status | Findings |
|----------|----------|--------|----------|
| A01 | Broken Access Control | **FAIL** | No authentication, no authorization, public CRUD |
| A02 | Cryptographic Failures | **FAIL** | API key Base64 "encryption", hardcoded passwords |
| A03 | Injection | PARTIAL | escapeHtml applied but document.write still risky; PostgREST filter injection |
| A04 | Insecure Design | **FAIL** | No security architecture, client-side only |
| A05 | Security Misconfiguration | **FAIL** | No CSP, no security headers, RLS unverified |
| A06 | Vulnerable Components | PASS | Dependencies reasonably current |
| A07 | Auth Failures | **FAIL** | No auth system at all |
| A08 | Software/Data Integrity | WARN | No SRI on CDN resources, no input validation |
| A09 | Logging/Monitoring | PARTIAL | Sentry for errors, but no audit trail for data ops |
| A10 | SSRF | PASS | No server-side requests from user input |

---

## Critical Issues (Immediate Action Required)

### SEC-01: No Authentication System [CRITICAL] [UNRESOLVED since v1]

- **OWASP**: A01, A07
- **Location**: Entire application
- **Description**: The application has zero authentication. Any person who visits the public GitHub Pages URL has full access to all business data including customer PII, order history, financial records, and admin functions.
- **Impact**: Complete data breach risk. Competitors, malicious actors, or automated bots can read/modify/delete all business data.
- **Evidence**: No login page, no session management, no JWT/token verification. The admin page at `AdminPage.jsx:18` has a client-side password check (`'4321'`) that provides zero security since all Supabase API calls bypass it.
- **Remediation**: Implement Supabase Auth with email/password or magic link. Enforce authentication on all API calls. Add RLS policies tied to authenticated users.

### SEC-02: Hardcoded Admin Password in Client Code [CRITICAL] [UNRESOLVED since v1]

- **OWASP**: A02, A07
- **Files**:
  - `src/pages/AdminPage.jsx:18` -- `const ADMIN_PASSWORD = '4321';`
  - `src/lib/supabase.js:206` -- `export const ADMIN_PASSWORD = '1234';` (unused but exposed)
- **Description**: Admin password is hardcoded in plain text in the JavaScript bundle. Anyone can view it via browser DevTools (Sources tab) or the public GitHub repository.
- **Impact**: The admin "gate" is purely cosmetic. Even without reading the code, the 4-digit password is trivially brute-forceable (10,000 combinations, no rate limiting).
- **Remediation**:
  1. **Immediate**: Remove `ADMIN_PASSWORD` from `supabase.js:206` (unused).
  2. **Short-term**: Replace client-side password check with Supabase Auth role-based access.

### SEC-03: Gemini API Key Exposed via Base64 Obfuscation [CRITICAL] [UNRESOLVED since v1]

- **OWASP**: A02
- **Files**:
  - `src/pages/TextAnalyze.jsx:44-46` -- `atob('QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj')`
  - `src/pages/AdminPage.jsx:1880` -- identical `atob(...)` call
- **Decoded Value**: `AIzaSyBFmp8Yc0xT0dC0784M6w6sMIBoZIYH8Pc`
- **Description**: A Google Gemini API key is embedded in the source code with only Base64 encoding (not encryption). This key is exposed in the public GitHub repository and in every built JS bundle.
- **Impact**: Anyone can extract and abuse this API key, incurring charges on the owner's Google Cloud account. Attackers could use it for prompt injection attacks or exhaust quota.
- **Remediation**:
  1. **Immediate**: Revoke the current API key in Google Cloud Console.
  2. **Short-term**: Create a new key with API restrictions (IP/referrer). Implement a backend proxy (Supabase Edge Function) that holds the key server-side and forwards requests.
  3. Store in environment variable, never in client code.

### SEC-04: Supabase RLS Policies Unverified [CRITICAL] [UNRESOLVED since v1]

- **OWASP**: A01, A05
- **Location**: Supabase project `jubzppndcclhnvgbvrxr`
- **Description**: The Supabase anon key is necessarily exposed in the client (this is expected for Supabase). However, without Row Level Security (RLS) policies, the anon key grants unrestricted access to all tables. The CLAUDE.md mentions "RLS 정책 완료" but the actual policy rules have never been verified or documented.
- **Impact**: If RLS is disabled or misconfigured, any person can directly call the Supabase REST API to read/write/delete all data -- even without using this application.
- **Evidence**: `supabase.js` uses `Bearer ${SUPABASE_ANON_KEY}` for all operations without any user-specific token.
- **Remediation**: Log into Supabase Dashboard and verify that:
  1. RLS is **enabled** on all 5 tables.
  2. Policies are restrictive (not `true` for all operations).
  3. Document the exact policy rules.
  4. Long-term: migrate to authenticated user tokens.

---

## High Issues (Fix Before Next Release)

### SEC-05: document.write() XSS Vector [HIGH] [PARTIALLY MITIGATED since v1]

- **OWASP**: A03
- **Files**:
  - `src/pages/OrderDetail.jsx:371` -- `printWindow.document.write(...)`
  - `src/pages/ShippingLabel.jsx:580` -- `printWindow.document.write(html)`
  - `src/pages/OrderPage.jsx:246` -- `printWindow.document.write(...)` (legacy, unused)
- **Description**: `document.write()` is used to inject HTML into print windows. While `escapeHtml()` is properly applied to user-controlled fields (customer names, addresses, memos, product names), `document.write()` itself is a dangerous pattern that:
  - Bypasses React's built-in XSS protections
  - Creates a direct DOM manipulation surface
  - Can be exploited if any new field is added without escapeHtml
- **Current Mitigation**: `escapeHtml()` in `utils.js:2-4` properly escapes `& < > " '` and is applied to all user-controlled interpolations (17+ points verified).
- **Residual Risk**: Medium -- any future modification that adds an unescaped field creates an XSS hole.
- **Remediation**: Replace `document.write()` with `@media print` CSS approach or use a print-specific React component rendered via `ReactDOM.createPortal`.

### SEC-06: PostgREST Filter Parameter Injection [HIGH] [UNRESOLVED since v2]

- **OWASP**: A03
- **Location**: `src/lib/supabase.js` -- 11 locations using `?id=eq.${id}` and `&customer_id=eq.${customerId}`
- **Description**: URL query parameters are constructed via string interpolation without validation. If an attacker or a bug passes a crafted `id` value (e.g., `1&select=*`), it could modify the PostgREST query behavior.
- **Impact**: Potential data exfiltration or unintended query modification. Severity depends on RLS configuration.
- **Remediation**: Validate that `id` parameters are integers (or UUIDs for customers) before interpolation. Use `encodeURIComponent()` at minimum.

### SEC-07: No Brute-Force Protection on Admin Login [HIGH] [UNRESOLVED since v1]

- **OWASP**: A07
- **Location**: `src/pages/AdminPage.jsx:128-138`
- **Description**: The admin login has no lockout, no delay, and no rate limiting. The `attempts` state is tracked but never used for lockout. A 4-digit numeric password can be brute-forced in seconds with a simple script.
- **Remediation**: Replace with Supabase Auth. If client-side gate must remain temporarily, add exponential backoff and a lockout after 5 attempts.

### SEC-08: No Audit Logging for Data Operations [HIGH] [UNRESOLVED since v1]

- **OWASP**: A09
- **Description**: No audit trail for any data-modifying operations (order creation/deletion, stock changes, customer data changes, admin actions). Sentry captures errors but not business operations.
- **Impact**: Cannot detect unauthorized data modification. Cannot investigate incidents or disputes.
- **Remediation**: Implement audit logging via Supabase triggers or Edge Functions. Log: who, what, when, before/after values.

### SEC-09: No Content Security Policy (CSP) [HIGH] [NEW]

- **OWASP**: A05
- **Location**: `index.html` -- no CSP meta tag or header
- **Description**: The application has no Content Security Policy. This means:
  - No restriction on script sources (inline scripts execute freely)
  - No restriction on API endpoints the app can connect to
  - No protection against injected third-party scripts
- **Note**: As a GitHub Pages static site, HTTP headers cannot be configured. A `<meta>` tag CSP can be added to `index.html`.
- **Remediation**: Add to `index.html`:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src https://jubzppndcclhnvgbvrxr.supabase.co https://generativelanguage.googleapis.com https://*.sentry.io; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
  ```

---

## Medium Issues (Fix in Next Sprint)

### SEC-10: Gemini API Key Stored in localStorage [MEDIUM]

- **OWASP**: A02
- **Files**: `src/pages/TextAnalyze.jsx:50`, `src/pages/AdminPage.jsx:1878`
- **Description**: The Gemini API key is stored in `localStorage` under `'geminiApiKey'`. Any XSS vulnerability or browser extension can read it.
- **Remediation**: Move API key to server-side proxy. If localStorage must be used temporarily, at minimum encrypt it.

### SEC-11: Bank Account Information Hardcoded in Source [MEDIUM]

- **OWASP**: A02
- **Files**: `src/pages/OrderDetail.jsx:354,418`
- **Content**: `신한은행 010-5858-6046 무브모터스`
- **Description**: Real bank account details are hardcoded in the source code and exposed in the public GitHub repository.
- **Impact**: Phishing/social engineering risk. Attackers could use this information in targeted scams.
- **Remediation**: Move to a configuration file or database setting that is not committed to the repository.

### SEC-12: No Input Validation on Data Write Operations [MEDIUM]

- **OWASP**: A03, A04
- **Location**: All `supabase.save*`, `supabase.add*`, `supabase.update*` functions
- **Description**: No client-side or server-side input validation. Any data shape can be sent to Supabase via the REST API. Missing checks include:
  - Field type validation
  - Field length limits
  - Required field enforcement
  - Numeric range validation (prices, quantities)
- **Remediation**: Add Zod or similar validation before API calls. Configure Supabase column constraints.

### SEC-13: Excessive console.log in Production [MEDIUM]

- **OWASP**: A09
- **Location**: 37 occurrences across 7 files
- **Files**: `supabase.js` (22), `App.jsx` (5), `AdminPage.jsx` (1), `SavedCarts.jsx` (4), others
- **Description**: Debug logging statements remain in production code. Some log API responses and data structures that could assist attackers in understanding the system.
- **Evidence**: `supabase.js:182-184` logs cart IDs and deletion results.
- **Remediation**: Remove debug console.log statements. Use Sentry for production logging. Configure Vite to strip console.* in production builds.

---

## Low Issues (Track in Backlog)

### SEC-14: Missing Security Headers [LOW]

- **OWASP**: A05
- **Description**: As a GitHub Pages site, the following security headers cannot be set:
  - `Strict-Transport-Security` (GitHub Pages provides HTTPS but no HSTS preload control)
  - `X-Frame-Options` / `frame-ancestors`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
- **Note**: This is a platform limitation of GitHub Pages. Migration to Vercel/Netlify would allow custom headers.
- **Remediation**: If migrating to Vercel/Netlify, add all standard security headers. For now, add CSP via meta tag (see SEC-09).

### SEC-15: Sensitive Data in localStorage Without Encryption [LOW]

- **OWASP**: A02
- **Location**: Multiple localStorage usage across the app
- **Description**: The app stores various data in localStorage including:
  - `geminiApiKey` -- API key (SEC-10)
  - `aiOrderInputText` -- order text content
  - `aiOrderBackups` -- order backup data
  - `shippingCustomerSettings` -- customer shipping settings
  - `shippingCustomEntries` -- custom shipping entries
  - `notificationSettings` -- notification preferences
  - `burnway-car-models` -- car model data
- **Impact**: All data is readable by any JavaScript running on the same origin, including browser extensions.
- **Remediation**: Evaluate which data truly needs client-side persistence. Move sensitive data to authenticated Supabase queries.

### SEC-16: window.open() Without noopener/noreferrer [LOW]

- **OWASP**: A05
- **Files**: `OrderDetail.jsx:370`, `OrderPage.jsx:245`, `ShippingLabel.jsx:579`
- **Description**: `window.open('', '_blank')` is used without `rel="noopener noreferrer"`. Modern browsers mitigate the worst risks, but the opened window retains a reference to the opener.
- **Remediation**: Use `window.open('', '_blank', 'noopener,noreferrer')` or set `printWindow.opener = null`.

---

## Informational

### INFO-01: Supabase Anon Key Exposure (Expected)

- **Location**: `src/lib/supabase.js:4`, `src/App.jsx:189`
- **Description**: The Supabase `anon` key is exposed in client code. This is **expected and by design** for Supabase -- the key is a publishable key meant for client use. Security relies entirely on RLS policies (see SEC-04).

### INFO-02: Sentry DSN in Source (Expected)

- **Location**: `src/main.jsx:8`
- **Description**: The Sentry DSN is in the source code. This is expected -- Sentry DSNs are designed to be public. Rate limiting and allowed domains are configured in the Sentry project settings.

### INFO-03: Legacy Unused File (OrderPage.jsx)

- **Location**: `src/pages/OrderPage.jsx` (~1000 lines)
- **Description**: This file is marked as unused legacy code. It contains the same patterns (document.write, escapeHtml) as active files. It should be removed to reduce the attack surface and maintenance burden.

---

## Positive Findings

1. **escapeHtml() properly implemented**: The `escapeHtml()` function in `utils.js:2-4` correctly escapes all 5 HTML-dangerous characters and is consistently applied at all 17+ user-data interpolation points in `document.write()` calls.
2. **No dangerouslySetInnerHTML usage**: Zero instances found in the entire codebase.
3. **No eval() or Function() usage**: No dynamic code execution found.
4. **No innerHTML direct assignment**: Zero instances found.
5. **Sentry error monitoring**: Production error tracking is properly configured with appropriate sampling rates.
6. **HTTPS enforced**: GitHub Pages serves over HTTPS by default.
7. **Dependencies current**: `package.json` shows reasonably current versions with no known critical CVEs at time of audit.
8. **.gitignore properly configured**: Excludes `.env`, `node_modules`, test artifacts.

---

## Remediation Roadmap

### Phase 1: Immediate (This Week)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | Revoke Gemini API key, create new restricted key | 15 min | Eliminates SEC-03 abuse risk |
| 2 | Remove `ADMIN_PASSWORD = '1234'` from supabase.js:206 | 1 min | Eliminates dead code exposure |
| 3 | Verify Supabase RLS in dashboard | 30 min | Confirms/denies SEC-04 |
| 4 | Add CSP meta tag to index.html | 15 min | Addresses SEC-09 |
| 5 | Remove OrderPage.jsx (unused) | 5 min | Reduces attack surface |

### Phase 2: Short-term (1-2 Weeks)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 6 | Implement Supabase Edge Function as Gemini API proxy | 2-4 hrs | Eliminates client-side API key entirely |
| 7 | Add input validation (Zod) for all write operations | 4-6 hrs | Addresses SEC-12 |
| 8 | Strip console.log in production build (Vite config) | 15 min | Addresses SEC-13 |
| 9 | Sanitize PostgREST query parameters | 1-2 hrs | Addresses SEC-06 |
| 10 | Move bank account info to DB/config | 30 min | Addresses SEC-11 |

### Phase 3: Medium-term (1 Month)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 11 | Implement Supabase Auth (email/password) | 1-2 days | Eliminates SEC-01, SEC-02, SEC-07 |
| 12 | Replace document.write with print CSS | 4-6 hrs | Eliminates SEC-05 |
| 13 | Implement audit logging | 4-8 hrs | Addresses SEC-08 |
| 14 | Migrate to Vercel/Netlify for security headers | 2-4 hrs | Addresses SEC-14 |

---

## Comparison with Previous Audits

| Issue | v1 (03-19) | v2 (03-23) | v3 (03-31) | Status |
|-------|-----------|-----------|-----------|--------|
| SEC-01: No Auth | Critical | Critical | Critical | Unresolved |
| SEC-02: Hardcoded Passwords | Critical | Critical | Critical | Unresolved |
| SEC-03: Gemini API Key | Critical | Critical | Critical | Unresolved |
| SEC-04: RLS Unverified | Critical | Critical | Critical | Unresolved |
| SEC-05: document.write XSS | High | High (mitigated) | High (mitigated) | Partially mitigated |
| SEC-06: PostgREST Injection | -- | High | High | Unresolved |
| SEC-09: No CSP | -- | -- | High | New |
| Sentry monitoring | -- | -- | Positive | New (good) |

**Net assessment**: No security improvements have been made since the v1 audit on 2026-03-19. The security posture remains at 22/100. The addition of Sentry (v3 positive finding) addresses error monitoring but not security monitoring.

---

*End of Security Audit Report v3*
