# Warehouse UX Guidelines

The design system is Industrial SaaS: dense, table-oriented, keyboard accessible and tablet usable. Shared tokens control spacing, radii, surfaces, text hierarchy, borders, status colors and focus rings.

## Operational priority

Dashboard answers “what must the warehouse do now?” Queue cards cover allocation, preparation, pickup, faulty returns, repair, transfers and exceptions. Secondary metrics remain subordinate to tasks and the attention queue.

## Statuses

One `StatusBadge` maps stable codes to neutral, blue, amber, green, red, grey or Scrap presentation. Color is paired with text and never carries meaning alone.

## Scanner-first interaction

Scanner inputs autofocus where appropriate, submit on Enter, reject rapid duplicate input, clear successful scans, preserve rejected input and restore focus. Specific backend error codes map to short operator messages while technical details remain available for diagnosis.

## Risk and feedback

Outbound, Adjustment Out, repair completion and transfer dispatch confirmations show business context and inventory effect. Routine success uses toast or inline feedback. Loading disables duplicate actions, empty states explain the next useful step, and data tables use compact rows, numeric alignment, monospace identifiers and sticky headers.
