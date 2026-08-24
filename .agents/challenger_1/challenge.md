# Adversarial Challenge Report: Consumer Features (Analytics & Request Logs)

## Challenge Summary
**Overall Risk Assessment**: MEDIUM  
**Verdict**: REQUEST_CHANGES

The Consumer Features implementation (Analytics.jsx, Logs.jsx, backend/app.py, useApi.jsx) demonstrates strong architecture, high aesthetic quality, and solid fallback design. However, empirical testing identified **1 failing unit test in Logs.test.jsx** and **1 latent runtime crash risk in search filtering**.

---

## Identified Challenges & Vulnerabilities

### [High] Challenge 1: Logs.test.jsx Test 2 Failure (Modal Exit Animation in JSDOM)
- **Assumption challenged**: RequestDetailModal unmounts from the DOM immediately upon pressing Escape or clicking close.
- **Attack scenario / Failure mode**: In Logs.jsx, RequestDetailModal is wrapped inside <AnimatePresence>:
`jsx
<AnimatePresence>
  {selectedRequest && (
    <RequestDetailModal
      request={selectedRequest}
      onClose={() => setSelectedRequest(null)}
    />
  )}
</AnimatePresence>
`
RequestDetailModal returns a plain <div> rather than a <motion.div key=request-detail-modal ...>. In JSDOM / Vitest, AnimatePresence does not complete the exit transition on the plain child wrapper, retaining the dialog in the DOM (style=opacity: 0; transform: translateY(...)). Consequently, Logs.test.jsx line 142 (expect(screen.queryByRole('dialog', ...)).not.toBeInTheDocument()) fails and 
pm test exits with code 1.
- **Blast radius**: Breaks test suite in CI/CD pipeline (1 test failed out of 200).
- **Recommended Mitigation**:
  1. Add a key to the modal container or make the top-level element in RequestDetailModal a <motion.div key=request-detail-modal ...> that coordinates with AnimatePresence.
  2. Alternatively, structure AnimatePresence with mode=wait or test with waitForElementToBeRemoved.

---

### [Medium] Challenge 2: Potential Runtime TypeError in Search Filtering on Non-String Row Fields
- **Assumption challenged**: .id, .model, .upstream_label, and .status in awRows are always strings.
- **Attack scenario / Failure mode**: In Logs.jsx lines 411-417:
`javascript
const q = searchQuery.trim().toLowerCase();
return rawRows.filter((r) => {
  return (
    (r.id && r.id.toLowerCase().includes(q)) ||
    (r.model && r.model.toLowerCase().includes(q)) ||
    (r.upstream_label && r.upstream_label.toLowerCase().includes(q)) ||
    (r.status && r.status.toLowerCase().includes(q))
  );
});
`
If upstream returns a numeric status code (e.g. status: 200 or status: 429 instead of string 'ok') or a numeric ID (id: 1049281), .status is truthy, but (200).toLowerCase is undefined. Calling .toLowerCase() throws TypeError: r.status.toLowerCase is not a function, crashing the entire React render tree with a white screen when the user searches.
- **Blast radius**: React crash / unhandled error for any user searching logs containing numeric fields.
- **Recommended Mitigation**:
Cast all candidate fields to strings before calling .toLowerCase():
`javascript
return rawRows.filter((r) => {
  return (
    String(r.id || '').toLowerCase().includes(q) ||
    String(r.model || '').toLowerCase().includes(q) ||
    String(r.upstream_label || r.upstream || '').toLowerCase().includes(q) ||
    String(r.status || r.http_status || '').toLowerCase().includes(q)
  );
});
`

---

## Stress Test Results Matrix

| Component / Route | Scenario Tested | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| Analytics.jsx | 0 total tokens & 0 cached tokens | Displays 0.0% hit rate, no NaN | Rendered 0.0%, no NaN | **PASS** |
| Analytics.jsx | 25 Billion tokens throughput | Formatted as 25.00 B | Formatted 25.00 B | **PASS** |
| Analytics.jsx | Micro-cent costs (.000014) | Formatted as .000014 | Formatted .000014 | **PASS** |
| Analytics.jsx | Null/empty totals & rows | Structured fallbacks, no crash | Rendered empty state without crash | **PASS** |
| Analytics.jsx | API Error state handling | Displays error banner + retry button | Error banner rendered, retry worked | **PASS** |
| Logs.jsx | Empty request rows (rows: []) | No requests found banner | Correctly displayed | **PASS** |
| Logs.jsx | Pagination bounds (page 1 of 3) | Prev button disabled, Next enabled | Correctly toggled | **PASS** |
| Logs.jsx | Adversarial search strings (regex, XSS, SQL) | Encoded safely, no injection/crash | Safe query param forwarding | **PASS** |
| Logs.jsx | Null TTFT / Duration / Upstream | Fallback to — and direct | Correctly rendered | **PASS** |
| Logs.jsx | Search with numeric status / ID | No crash during local filter | TypeError crash (.toLowerCase is not a function) | **FAIL** |
| Logs.jsx | Modal escape close in test | Dialog removed from DOM | Dialog stays in DOM due to AnimatePresence | **FAIL** |
| ackend/app.py | /api/usage/cache-stats upstream offline | Returns 200 with structured zero totals | HTTP 200 returned with fallback | **PASS** |
| ackend/app.py | /api/usage/logs invalid page/pageSize params | Returns 200 with sanitized page numbers | HTTP 200 returned with page: 1, pageSize: 25 | **PASS** |
| ackend/app.py | /api/usage/breakdown upstream offline | Returns 200 with empty arrays | HTTP 200 returned with byModel: [], byProvider: [] | **PASS** |
| ackend/app.py | /api/usage/logs-models upstream offline | Returns 200 with empty array [] | HTTP 200 returned with [] | **PASS** |
| useApi.jsx | /api/usage/* in isApiEnabled | Returns true for all /api/usage routes | Returns true | **PASS** |
| Frontend Build | 
pm run build | Exits with code 0 | Exits with code 0 (built in 3.82s) | **PASS** |

---

## Unchallenged Areas
- Live WebSocket push updates (system uses polling model via background thread cache).
- Live InferHub cloud upstream token authentication (mocked locally with structured fallbacks).
