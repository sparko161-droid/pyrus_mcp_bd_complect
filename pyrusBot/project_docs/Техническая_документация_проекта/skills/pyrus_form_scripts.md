---
title: "Навык: pyrus-form-scripts"
audience: "internal"
pyrus_id: "GXJnSzNKPPn"
synced_at: "2026-08-10T13:46:25.000Z"
synced_hash: "sha256:f049d43c08ba24cd4dd418e7484bd6b3"
---

This skill provides step-by-step guidance, code structures, API reference, safety constraints, and checklists for building interactive Client Form Scripts in Pyrus.

## When to Use This Skill
Use this skill whenever you need to:
1. Write or edit JavaScript/TypeScript scripts executed in Pyrus form UI (in browser or mobile app).
2. Automate form field calculations (`setValue`, `setValues`).
3. Add real-time field validation (`validate`, `validateAsync`).
4. Implement dynamic catalog filtering (`setFilter`, `setFilterAsync`).
5. Control field visibility (`setVisibility`) or assignees (`setAssignee`).
6. Calculate working days (`getDaysCount`) or aggregate table columns (`cost.sum`).

---

## 1. Key Rules for Client Form Scripts

- **Prerequisite Gate**: NEVER start writing scripts until ТЗ, Catalogs, JSON Form Upload, and Form Verification via `pyrus:dump` are 100% completed.
- **Execution Context**: Runs in the user's browser/mobile app when filling out a form in real-time.
- **Top-level Chains**: Subscriptions `form.onChange(...)` MUST be declared at the top level of the script.
- **Field Codes**: Field codes must be unique in the form and match standardized codes across forms (`client_name`, `inn`, `order_date`, etc.).
- **No Direct HTTP**: `fetch()`, `XMLHttpRequest`, and external network calls are **FORBIDDEN**. Use `form.getCatalog()`, `form.fetchRoles()`, `form.fetchRegister()`.
- **5-Second Timeout**: Operations must finish within 5 seconds.
- **Always set `executeOnLoad = true`**: Pass `true` as 2nd parameter to `form.onChange(fields, true)` so calculations run when opening existing tasks.
- **Code Articles in KB**: Always run `npm run mirror:scripts` after writing/updating script code to generate `.ts.md` articles for Pyrus KB sync.

---

## 2. API Quick Reference

### Methods on `form.onChange(fields, executeOnLoad)`:
- `.setValue('TargetCode', state => newValue)`
- `.setValues(['Code1', 'Code2'], state => [val1, val2])`
- `.setValueAsync('TargetCode', async state => await newValue)`
- `.setAssignee(state => personId)`
- `.validate('FieldCode', state => ({ errorMessage: "Error", canSave: false }))`
- `.setFilter('CatalogField', state => ({ values: [1, 2, 3] }))`
- `.setVisibility(['FieldCode'], state => boolean)`

### Helper Methods on `form`:
- `form.getCatalog(nameOrId)` -> Promise<CatalogItem[]>
- `form.fetchRoles(personId?)` -> Promise<RoleItem[]>
- `form.fetchRegister(formId, filter)` -> Promise<RegisterResult>
- `form.getDaysCount(startDate, endDate, options)` -> number
- `form.getDateWithTimezoneOffset(dateStr)` -> Date

---

## 3. Pre-Launch Checklist for Form Scripts

1. [ ] Form Upload & Verification (`npm run pyrus:dump`) completed before writing script.
2. [ ] Subscriptions declared at top level via `form.onChange(...)`.
3. [ ] `executeOnLoad` set to `true` for initial state calculation.
4. [ ] No direct HTTP `fetch`/`XHR` calls present.
5. [ ] `setValue` target fields acknowledged to become read-only for manual user input.
6. [ ] Catalog Promises cached outside `onChange` loops to avoid redundant network queries.
7. [ ] Table column aggregation uses `.sum` property.
8. [ ] No circular dependencies between fields.
9. [ ] Run targeted TypeScript type check: `npx tsc --noEmit --skipLibCheck <filename.ts>`.
10. [ ] Run local script mirror: `npm run mirror:scripts`.
11. [ ] Test form logic simulation locally via `MockFormContext` in `src/lib/testing/pyrus_simulator.ts` (`npm run test`) before UI deployment.
