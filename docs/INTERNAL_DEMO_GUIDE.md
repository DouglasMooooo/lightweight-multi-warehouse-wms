# Internal WMS Preview Demo Guide

Target duration: approximately 5–10 minutes.

Recommended positioning:

> This is a working WMS prototype based on observed warehouse workflows. The focus is process analysis, requirements, inventory and SN business rules, ERP/WMS boundaries, exception handling and target-state system design.

Do not position it as a complete replacement production WMS.

## Before the Demo

- Confirm the banner says `INTERNAL PREVIEW · NON-PRODUCTION`.
- Select `SYD · Sydney Service Warehouse`.
- Confirm ERP Admin/Import identifies `MockERPAdapter` or `ERP integration not configured`.
- Use read-only navigation and representative existing records. Do not dispatch, transfer, reset or seed valuable Preview data for demonstration.

## 1. Dashboard

**Click:** Dashboard.

**Show:** To Prepare, Awaiting Pickup, Repair Queue, In Transit, exceptions, current product availability and recent audit activity.

**Business problem:** Warehouse priorities are otherwise scattered across ERP documents and spreadsheets.

**Design decision:** The dashboard prioritises operational queues rather than generic management charts.

## 2. ERP Import

**Click:** Dashboard → ERP Order Import, or Outbound → ERP Order Import.

**Show:** Adapter identity, Fetch, Preview, validation issues and Confirm Import boundary.

**Business problem:** ERP demand must be checked before it becomes warehouse work.

**Design decision:** ERP import is preview-before-mutation, and ERP warehouse classification remains separate from physical location.

## 3. Outbound Review

**Click:** Outbound → open a To Prepare order → review SN workbench.

**Show:** scanner input, paste, CSV/XLSX upload, invalid rows, remove/replace/retry and revalidation.

**Business problem:** Batch SN work is error-prone when an upload is treated as confirmation.

**Design decision:** Scan, paste and upload create one temporary review batch; inventory changes only at final confirmation.

## 4. Product Inventory Report

**Click:** Product Inventory Report.

**Show:** Physical, Available, Frozen/Awaiting Pickup, In Transit, New, Repair Good and Repair; apply a warehouse or condition filter and open location detail.

**Business problem:** Management needs a defensible answer to “How much inventory do we currently have?”

**Design decision:** `InventoryBalance` is quantity authority; SN coverage is traceability information.

## 5. Warehouse Map

**Click:** Warehouse Map.

**Show:** R1, R2, FLEX, REPAIR, RETURN and DISPATCH; search by location/SKU/SN; open R1 rack elevation and a location drawer.

**Business problem:** Physical warehouse knowledge should not live only in operator memory.

**Design decision:** Search highlights the space within an SVG floor/rack model instead of replacing the warehouse with result cards.

## 6. Faulty / Repair or Transfer

### Faulty / Repair

**Click:** Repair.

**Show:** faulty SN lookup, default `REPAIR-01`, condition/status Repair and the Repair Job lifecycle.

**Business problem:** A returned machine must remain traceable even when ERP evidence is incomplete.

**Design decision:** The workflow defines Repair condition automatically and separates Manual Review from guessed data.

### Transfer alternative

**Click:** Transfers.

**Show:** multi-SN Transfer Out review, Product + Condition grouping, In Transit state and destination receipt.

**Business problem:** Cross-warehouse movement must not be disguised as a normal location Move.

**Design decision:** Transfer is a distinct lifecycle and preserves condition, including `Repair_Good`.

## Optional Closing Points

- Switch to Simplified Chinese to demonstrate presentation-only localisation.
- Open ERP Mapping/Admin to show explicit adapter and warehouse mapping boundaries.
- Explain that label preview is read-only and one Pickup Code produces one A4 batch label.
- Close with known limitations: prototype data, Mock/unverified Kingdee integration, prototype auth and future UAT/security/backup work.
