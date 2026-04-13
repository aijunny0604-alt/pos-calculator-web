# Code Analysis Results

## Analysis Target
- Path: `C:\Users\ROSSA\pos-calculator-web\src\`
- File count: 29 source files (JSX/JS)
- Analysis date: 2026-03-28
- Analyzer: bkit-code-analyzer

## Quality Score: 38/100

### Score Breakdown
| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Security | 15/100 | 30% | 4.5 |
| Code Quality | 40/100 | 25% | 10.0 |
| Performance | 55/100 | 20% | 11.0 |
| Architecture | 35/100 | 15% | 5.25 |
| Maintainability | 30/100 | 10% | 3.0 |
| **Total** | | | **33.75 -> 38** |

---

## Issues Found

### CRITICAL -- Immediate Fix Required

| # | File | Line | Issue | Category | Recommended Action |
|---|------|------|-------|----------|-------------------|
| C1 | `TextAnalyze.jsx` | 44-46 | **Gemini API key exposed via Base64 obfuscation** (`atob('QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj')`). This is trivially reversible and the key is shipped to every client in the JS bundle. Anyone can extract it. | Security | 1. Immediately **revoke** the API key in Google Cloud Console. 2. Move the key to a server-side proxy (Supabase Edge Function or Vercel serverless). 3. Never embed API keys in client code, even encoded. |
| C2 | `AdminPage.jsx` | 1878-1880 | **Same Gemini API key duplicated** in AIStockTab with identical `atob()` pattern. | Security | Same as C1. Remove after proxy is set up. |
| C3 | `supabase.js` | 1-4, App.jsx 188-189 | **Supabase credentials hardcoded without RLS enforcement verified**. The anon key + URL are in client code (acceptable for Supabase anon key IF Row-Level Security is properly configured). CLAUDE.md mentions "RLS 미확인" as a critical issue. Without RLS, anyone with the anon key has full CRUD access to all tables. | Security | Verify that all 5 tables (`orders`, `products`, `customers`, `customer_returns`, `saved_carts`) have proper RLS policies. If not, any user can read/modify/delete all business data. |
| C4 | `AdminPage.jsx` | 18 | **Admin password hardcoded as plain text** (`const ADMIN_PASSWORD = '4321'`). This is visible to anyone inspecting the JS bundle. The admin panel provides full CRUD over products, customers, and stock. | Security | Implement server-side authentication. At minimum, use Supabase Auth with admin role-based access. Client-side password comparison provides zero security. |
| C5 | `supabase.js` | 206 | **Unused admin password exported** (`export const ADMIN_PASSWORD = '1234'`). Confusing dead code with a different password than what AdminPage uses (4321 vs 1234), and exposes a credential in the module system. | Security | Delete this line entirely. It is unused and misleading. |
| C6 | **No authentication system** | Entire app | There is **no user authentication**. The Supabase anon key is used for all operations. Any visitor to the GitHub Pages URL can access and modify all business data (orders, customers, pricing) if RLS is not configured. The "admin password" check at `AdminPage.jsx:130` is purely cosmetic client-side gating. | Security | Implement Supabase Auth. Create an authentication flow. Protect all API calls with authenticated user tokens. Apply RLS policies that reference `auth.uid()`. |

### HIGH -- Fix Before Next Deployment

| # | File | Line | Issue | Category | Recommended Action |
|---|------|------|-------|----------|-------------------|
| H1 | `OrderDetail.jsx` | 369-425 | **`document.write()` with template literals** for print functionality. While `escapeHtml()` is used for customer name, phone, and memo fields, the pattern itself is dangerous. If any new field is added without escaping, it becomes an XSS vector. The `order.orderNumber` on line 374 is **not escaped**. | Security | Replace `document.write()` with a React-based print approach (render to iframe with React DOM, or use `window.print()` with CSS `@media print`). |
| H2 | `ShippingLabel.jsx` | 480-581 | **Same `document.write()` pattern** for shipping label printing. While `escapeHtml()` is applied to most fields, the HTML template construction itself is fragile. The `sender` variable on line 520 (`보내는곳 : ${sender}`) is **not escaped**. | Security | Same as H1. Refactor to a React-based printing solution. |
| H3 | `OrderPage.jsx` | 244-280 | **Legacy `document.write()` in unused file**. This file is documented as unused but still present in the codebase. It contains the same `document.write()` pattern with `${orderNumber}` unescaped on line 249. | Security + Maintenance | Delete `OrderPage.jsx` entirely. It is confirmed unused legacy code (~1000 lines of dead code). |
| H4 | `TextAnalyze.jsx` | 468 | **Gemini API key passed in URL query string**. The key appears in `?key=${geminiApiKey}` which means it will be logged in server access logs, browser history, and potentially network monitoring tools. | Security | Use a server-side proxy to make Gemini API calls. Pass the key in a server-side environment variable, never in a URL. |
| H5 | `AdminPage.jsx` | 1989-1990 | **Same API key in URL pattern** for AI stock management Gemini calls. | Security | Same as H4. |
| H6 | `App.jsx` | 188-193 | **Supabase key duplicated in WebSocket URL construction**. The key is declared separately from `supabase.js`, creating a maintenance risk if keys are rotated. | Maintenance | Import the key from `supabase.js` instead of hardcoding it again. Currently two different variables hold the same key in two files. |
| H7 | `OrderDetail.jsx` | 354 | **Bank account number hardcoded** (`신한은행 010-5858-6046 무브모터스`). This sensitive financial information is embedded in the client bundle and also appears in the print template. | Security | Move to a configuration/environment variable or Supabase config table. |

### MEDIUM -- Improvement Recommended

| # | File | Line | Issue | Category | Recommended Action |
|---|------|------|-------|----------|-------------------|
| M1 | `AdminPage.jsx` | all | **File is 2563 lines long**. This is 8.5x the recommended 300-line limit. Contains 7 separate components (`AdminLogin`, `SectionCard`, `InputField`, `ActionBtn`, `Modal`, `ProductsTab`, `CustomersTab`, `CategoriesTab`, `BurnwayTab`, `AIStockTab`, `DiscountTiersTab`, `AdminPage`). | Code Quality | Split into separate files: `components/admin/ProductsTab.jsx`, `components/admin/CustomersTab.jsx`, `components/admin/AIStockTab.jsx`, etc. |
| M2 | `OrderDetail.jsx` | all | **File is ~1420 lines**. Contains rendering, editing, return processing, printing, and clipboard logic all in one component. | Code Quality | Extract print logic, edit mode, and return processing into separate hooks or components. |
| M3 | `SavedCarts.jsx` | all | **File is ~1314 lines**. | Code Quality | Extract detail modal, edit mode, and filtering logic into separate components. |
| M4 | `ShippingLabel.jsx` | all | **File is ~1238 lines**. | Code Quality | Extract print template builder, form modal, and settings management into separate modules. |
| M5 | `TextAnalyze.jsx` | all | **File is ~1216 lines**. Contains AI prompt engineering, synonym mapping, scoring algorithms, and UI all in one file. | Code Quality | Extract AI logic (`analyzeWithGemini`, `calculateMatchScore`, `synonyms`) into `lib/aiAnalyzer.js`. |
| M6 | `CustomerList.jsx` | all | **File is ~1100 lines**. | Code Quality | Extract customer detail modal and return processing into separate components. |
| M7 | `MainPOS.jsx` | all | **File is ~1074 lines**. | Code Quality | Extract product grid, cart panel, and order confirm modal into separate components. |
| M8 | `App.jsx` | all | **File is ~1162 lines** acting as both router and state manager. Contains all Supabase subscriptions, all CRUD operations, cart management, undo system, and the complete page routing switch. | Architecture | Extract state management into a context provider (`OrderContext`, `ProductContext`). Extract the WebSocket subscription into a custom hook. Extract the routing switch into a router component. |
| M9 | `MainPOS.jsx` | 12-30 | **Hardcoded `priceData` array (17 products)** duplicated from `lib/priceData.js` (478 products). The arrays are different sizes, creating confusion about which fallback is authoritative. | Code Quality (DRY) | Remove the local `priceData` in `MainPOS.jsx`. Import from `@/lib/priceData` if a fallback is needed, or rely on the existing fallback in `App.jsx`. |
| M10 | `TextAnalyze.jsx` 72-89 + `AdminPage.jsx` 1883-1890 | synonyms | **Synonym maps duplicated** across TextAnalyze and AdminPage's AIStockTab. They have slightly different entries, causing inconsistent matching behavior between AI order recognition and AI stock management. | Code Quality (DRY) | Extract to a shared `lib/synonyms.js` module. |
| M11 | `TextAnalyze.jsx` 137-195 + `AdminPage.jsx` 1898-1916 | calculateMatchScore | **`calculateMatchScore` function duplicated**. TextAnalyze version is more complete (includes Levenshtein distance and chosung matching). AdminPage has a stripped-down copy. | Code Quality (DRY) | Extract the full version to `lib/productMatcher.js` and import in both places. |
| M12 | `TextAnalyze.jsx` ~467-489 + `AdminPage.jsx` ~1988-2000 | Gemini API call | **Gemini API call logic duplicated**. Both make fetch calls to the same endpoint, parse JSON from code blocks the same way, and process results similarly. | Code Quality (DRY) | Extract to `lib/geminiClient.js` with a `callGemini(prompt, apiKey, options)` function. |
| M13 | `App.jsx` | 304-320 | **`todayOrderCount` and `shippingCount` are identical computations**. Both filter orders where `toDateKST(o.createdAt) === today` and return `.length`. | Code Quality (DRY) | Remove `shippingCount` and reuse `todayOrderCount`, or clarify the business intent if they should differ. |
| M14 | 7 pages | various | **Mobile header pattern duplicated** across 7 fullscreen pages. Each has the same hamburger menu button with `window.dispatchEvent(new CustomEvent('toggle-sidebar'))`. | Code Quality (DRY) | Extract a `MobilePageHeader` component that encapsulates the menu button, back button, and title pattern. |
| M15 | `App.jsx` | 276-279 | **Polling backup fetches only orders and savedCarts** (every 5 minutes), but the visibility handler fetches all 4 tables. Inconsistent polling strategy. | Performance | Either poll all tables consistently or document why only orders/savedCarts need periodic refreshing. |
| M16 | `supabase.js` | 39-45, 154-162 | **Double-request fallback pattern** in `saveOrder` and `addSavedCart`. On first failure, they retry without certain fields, which masks schema mismatch errors. | Code Quality | Fix the schema to include all expected columns instead of building retry logic around missing columns. |

### LOW -- Consider Fixing

| # | File | Line | Issue | Category | Recommended Action |
|---|------|------|-------|----------|-------------------|
| L1 | `supabase.js` | 180-186 | **`console.log` left in production code** (`deleteSavedCart` has debug logging). | Code Quality | Remove debug console.log statements or use a logging library with log levels. |
| L2 | `supabase.js` | all | **37 `console.error`/`console.warn` calls** across the codebase with no structured error reporting. Errors are silently swallowed (caught and logged, but the UI often just shows a generic toast). | Observability | Implement a centralized error handler. Consider an error boundary for React components and a structured logger for API errors. |
| L3 | Various pages | various | **8 uses of `window.alert()` and `window.confirm()`**. These are blocking calls that freeze the UI thread and cannot be styled. | UX / Code Quality | Replace with the existing `ConfirmDialog` component (already available in `components/ui/ConfirmDialog.jsx`) and toast notifications. |
| L4 | `App.jsx` | 86-97 | **`localStorage` access without error handling in initial state**. While the `notificationSettings` initializer has try/catch, other pages (e.g., `ShippingLabel.jsx:32`) have incomplete error handling. | Robustness | Create a `safeLocalStorage` utility with consistent get/set/parse error handling. |
| L5 | `App.jsx` | 452 | **Order ID generation using `Math.random()`**. The format `ORD-YYYYMMDD-XXXX` with `Math.random()*10000` has a collision risk (~0.01% per pair on the same day). | Reliability | Use `crypto.randomUUID()` or a timestamp-based approach for guaranteed uniqueness. |
| L6 | `OrderDetail.jsx` | 82-98 | **Body scroll lock via inline style manipulation**. Setting `document.body.style.position = 'fixed'` is a known fragile approach that can cause layout shifts. | UX | Use `overflow: hidden` on body or a CSS class toggle. Consider the `useScrollLock` pattern. |
| L7 | `App.jsx` | 747-1001 | **`renderPage()` function with 12-case switch statement**. Each case renders a component with 5-15 props. This is the entire routing system in one function. | Architecture | Replace with a route configuration object: `{ id: 'pos', component: MainPOS, props: {...} }` and map over it. |
| L8 | `TextAnalyze.jsx` | 22, 31 | **AI order text and backups stored in localStorage**. This data could contain customer names and order details, persisting sensitive business data on any device that accesses the app. | Security | Consider clearing sensitive localStorage on session end, or provide a clear data button. |
| L9 | Multiple files | all | **No TypeScript**. All files are plain JSX/JS. With 29 files and complex prop chains (App -> MainPOS -> OrderPage has 15+ props), type errors are only caught at runtime. | Code Quality | Consider migrating to TypeScript, starting with shared types for `Order`, `Product`, `Customer`, and `CartItem`. |
| L10 | `App.jsx` | 345-365 | **`deductStock` reads `products` from closure**. Since `products` is in the dependency array of `useCallback`, the function is recreated on every product change. But more critically, concurrent stock deductions could race. | Performance / Correctness | Use a functional update pattern or optimistic locking on the server side. |
| L11 | `supabase.js` | 19-23 | **No request timeout**. `fetchJSON` uses raw `fetch()` without `AbortController` or timeout. A slow/hung Supabase response will leave the UI waiting indefinitely. | Performance | Add a timeout (e.g., 10 seconds) using `AbortController`. |
| L12 | `App.jsx` | 196-256 | **WebSocket reconnection not handled**. If the WebSocket disconnects (network change, server restart), there is no automatic reconnection logic. The `ws.onerror` only logs a warning. | Reliability | Implement exponential backoff reconnection. Consider using the Supabase JS client's built-in realtime subscription instead of raw WebSocket. |
| L13 | `ShippingLabel.jsx` | 63-65 | **`refreshCustomers` called on every mount** unconditionally. This triggers a full customer table fetch each time the shipping page is navigated to. | Performance | Rely on the WebSocket subscription to keep customers in sync, or add a staleness check. |

### INFO -- Reference

| # | Observation |
|---|-------------|
| I1 | **Good: `escapeHtml` utility exists and is used** in print templates. This mitigates some XSS risk in `document.write()` usage, though the pattern itself remains fragile. |
| I2 | **Good: API call throttling implemented** in `App.jsx` (30s visibility throttle, 5-min polling). This was a direct response to the March 2026 egress quota incident. |
| I3 | **Good: Parallel API calls** using `Promise.all()` for initial data load and stock deduction, reducing perceived latency. |
| I4 | **Good: WebSocket event-driven updates** instead of full table re-fetches. INSERT/UPDATE/DELETE events are handled individually per table. |
| I5 | **Good: Undo system** with global Ctrl+Z support and per-operation snapshots. Well-designed with a 20-entry ring buffer. |
| I6 | **Good: KST timezone handling** was addressed with dedicated `getTodayKST()` and `toDateKST()` utilities after a real bug. |
| I7 | **No test files exist**. Test coverage is 0%. The only test infrastructure is Playwright (devDependency) but no test files were found in the project. |
| I8 | **No `.env` file usage**. All configuration (Supabase URL/key, Gemini key, admin password, bank account) is hardcoded in source files. Vite's `import.meta.env` is never used. |
| I9 | **`OrderPage.jsx` is confirmed dead code** (~1000 lines). It is imported by `MainPOS.jsx` but CLAUDE.md marks it as unused legacy. Verify if `MainPOS.jsx` line 7 `import OrderPage from './OrderPage'` is actually used before deletion. |
| I10 | **No React Router**. Navigation is state-based (`currentPage` string in `App.jsx`). This means no URL-based navigation, no browser back button support, no deep linking, and no code splitting. |
| I11 | **Total file lines across pages: ~13,000+**. Most of this is in 8 files that each exceed 1000 lines. The average page file is 4.3x over the 300-line recommendation. |

---

## Duplicate Code Analysis

### Exact/Near Duplicates Found

| Type | Location 1 | Location 2 | Similarity | Recommended Action |
|------|------------|------------|------------|-------------------|
| Near-exact | `TextAnalyze.jsx:72-89` (synonyms map) | `AdminPage.jsx:1883-1890` (synonyms map) | ~85% | Extract to `lib/synonyms.js` |
| Near-exact | `TextAnalyze.jsx:137-195` (calculateMatchScore) | `AdminPage.jsx:1898-1916` (calculateMatchScore) | ~70% | Extract to `lib/productMatcher.js` |
| Near-exact | `TextAnalyze.jsx:44-46` (getDefaultApiKey) | `AdminPage.jsx:1877-1880` (getGeminiKey) | ~90% | Extract to `lib/geminiClient.js` |
| Near-exact | `TextAnalyze.jsx:467-489` (Gemini fetch+parse) | `AdminPage.jsx:1988-2000` (Gemini fetch+parse) | ~80% | Extract to `lib/geminiClient.js` |
| Structural | `TextAnalyze.jsx:122-128` (applySynonyms) | `AdminPage.jsx:1892-1896` (applySynonyms) | ~95% | Extract with synonyms |
| Exact | `App.jsx:304-310` (todayOrderCount) | `App.jsx:314-320` (shippingCount) | 100% | Remove duplicate |
| Structural | 7 pages (toggle-sidebar dispatch) | same pattern 7 times | 100% | Extract `MobilePageHeader` component |
| Structural | `MainPOS.jsx:12-30` (priceData) | `lib/priceData.js` (priceData) | Subset | Remove local copy in MainPOS |
| Structural | `OrderDetail.jsx:369-425` (print template) | `OrderPage.jsx:244-280` (print template) | ~60% | Extract shared print utility |

### Reuse Opportunities

| Function/Pattern | Current Location | Suggestion | Reason |
|-----------------|-----------------|------------|--------|
| Gemini API call | TextAnalyze, AdminPage | `lib/geminiClient.js` | Used in 2 places, will grow |
| Product matching (synonyms + scoring) | TextAnalyze, AdminPage | `lib/productMatcher.js` | Core business logic duplicated |
| Print via `document.write()` | OrderDetail, ShippingLabel, OrderPage | `lib/printHelper.js` or React print component | 3 implementations of same pattern |
| Mobile page header | 7 fullscreen pages | `components/layout/MobilePageHeader.jsx` | Identical pattern in 7 places |
| localStorage safe access | 6+ files | `lib/storage.js` | Inconsistent error handling |

---

## Architecture Issues

### Dependency Direction Violations

```
Current:
  App.jsx (1162 lines) ---- owns ALL state, ALL handlers, ALL routing
    |
    +-- 12 page components (receive 5-15 props each)
    +-- Raw WebSocket management
    +-- Raw Supabase API calls
    +-- Cart/Undo/Toast state

Problems:
  1. App.jsx is a God Component - single point of failure
  2. No separation between UI, business logic, and data access
  3. Pages directly call supabase in some cases (ShippingLabel, AdminPage)
     while other pages receive handlers from App.jsx - inconsistent pattern
  4. No service layer between components and Supabase REST API
  5. No shared type definitions for data entities
```

### Recommended Architecture

```
src/
  contexts/
    AppProvider.jsx       (combines providers below)
    OrderContext.jsx      (orders state + CRUD)
    ProductContext.jsx    (products state + CRUD)
    CustomerContext.jsx   (customers state + CRUD)
    CartContext.jsx       (cart + undo)
    AuthContext.jsx       (Supabase Auth)
  hooks/
    useRealtimeSync.js    (WebSocket subscription)
    useGeminiAI.js        (AI analysis)
  lib/
    supabase.js           (API client - keep)
    productMatcher.js     (matching + scoring)
    geminiClient.js       (Gemini API wrapper)
    synonyms.js           (shared synonym maps)
    printHelper.js        (print template generation)
    storage.js            (localStorage wrapper)
  components/
    layout/
      MobilePageHeader.jsx
    admin/
      ProductsTab.jsx
      CustomersTab.jsx
      AIStockTab.jsx
      ...
```

---

## Security Summary

| Vulnerability | OWASP Category | Severity | Status |
|--------------|----------------|----------|--------|
| Gemini API key in client bundle | A02: Cryptographic Failures | Critical | Unmitigated |
| No authentication | A07: Identification Failures | Critical | Unmitigated |
| RLS not verified on Supabase | A01: Broken Access Control | Critical | Unknown |
| Hardcoded admin password | A07: Identification Failures | Critical | Unmitigated |
| `document.write()` XSS surface | A03: Injection | High | Partially mitigated (escapeHtml used for most fields) |
| Sensitive data in localStorage | A04: Insecure Design | Low | Unmitigated |
| No CSRF protection | A05: Security Misconfiguration | Low | N/A (no server-side state changes via forms) |
| No rate limiting on API calls | A04: Insecure Design | Medium | Partially mitigated (client-side throttling) |
| Bank account in source code | A02: Cryptographic Failures | Medium | Unmitigated |

---

## Performance Summary

| Issue | Impact | Files | Status |
|-------|--------|-------|--------|
| Initial load fetches ALL data from 4 tables | Slow first paint on mobile | App.jsx | Partially optimized (parallel fetch) |
| No code splitting (all pages bundled) | Large initial JS bundle | App.jsx routing | Unaddressed |
| `products.find()` in hot paths | O(n) per cart item, per render | MainPOS, OrderDetail | Use Map for lookups |
| No React.memo on expensive lists | Unnecessary re-renders | All page components | Apply memo/useMemo strategically |
| WebSocket has no reconnection | Stale data after disconnect | App.jsx | Unaddressed |
| `deductStock` closure over `products` | Race condition possibility | App.jsx:345 | Use functional updates |
| No request timeouts | Potential UI freeze | supabase.js | Unaddressed |

---

## Improvement Recommendations (Priority Order)

### Immediate (This Week)
1. **Revoke and rotate the Gemini API key**. Set up a Supabase Edge Function or Vercel serverless function to proxy Gemini API calls.
2. **Verify Supabase RLS policies** on all 5 tables. If not configured, this is a data breach risk.
3. **Delete `OrderPage.jsx`** (1000 lines of dead code).
4. **Delete `ADMIN_PASSWORD` export** from `supabase.js:206`.

### Short-term (This Month)
5. **Implement Supabase Auth** with at least one admin role. Replace the client-side password check.
6. **Extract duplicated AI logic** (synonyms, matchScore, Gemini client) into shared modules in `lib/`.
7. **Split `AdminPage.jsx`** (2563 lines) into separate tab components.
8. **Replace `document.write()`** in print functions with a React-based approach.
9. **Move all hardcoded configuration** (Supabase keys, bank account) to environment variables using Vite's `import.meta.env`.

### Medium-term (This Quarter)
10. **Introduce React Context** for state management to reduce App.jsx from 1162 lines.
11. **Add TypeScript** starting with shared type definitions.
12. **Implement code splitting** with `React.lazy()` and `Suspense` for page components.
13. **Add WebSocket reconnection** logic or switch to Supabase JS client's built-in realtime.
14. **Add basic test coverage** for business-critical paths (order saving, stock deduction, product matching).
15. **Extract `MobilePageHeader`** component to eliminate the 7-way duplication.

---

## Post-Analysis Verdict

```
CRITICAL issues found: 6
HIGH issues found: 7
MEDIUM issues found: 16
LOW issues found: 13

--> DEPLOYMENT SHOULD BE BLOCKED until Critical issues C1-C6 are resolved.
    The Gemini API key exposure is an active vulnerability.
    The lack of authentication means any visitor can modify business data.
```
