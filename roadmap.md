# Roadmap

## In progress
- [ ] Audit only: document current Admin/Super Admin, database, products, suppliers, bookings and API architecture; identify completed Universal Sync Center work, gaps, risks and next steps without further implementation.
- [ ] TTC catalogue import: finish all 856 verified tours (background resumable importer running; brands remaining: Contiki, AAT Kings, Brendan; Costsaver discovery returns 0 URLs).
- [ ] Validate TTC pages, catalogue data, API fail-closed behaviour, tests, typecheck, build; report final per-brand counts.

## Done
- [x] Imported the WorldwayLuxe "All Journeys" catalogue (263 journeys, 38 destinations) into /all-journeys with listing + detail pages and JOURNEYS → ALL JOURNEYS nav entry.

## Queued
- [ ] (superseded) Import the WorldwayLuxe "All Journeys" catalogue (https://worldwayluxe.com/all-journeys) into a new JOURNEYS → ALL JOURNEYS tab: full journey records (images, descriptions, destinations, regions, styles, interests, duration, group size, pricing, status, day-by-day itineraries, inclusions/exclusions, tags, source IDs, metadata), premium listing + detail pages with search/filter/sort, responsive and SEO-ready. Verify source vs destination counts afterwards.

## TripJack
- [x] Read-only audit of Cabs + TripSafe integration vs uploaded docs (no code changes)
