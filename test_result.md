#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Session focus:
  1. Market Anchor Confidence Filter (P2) — hide LLM matches below 0.55 confidence in the
     Market Anchor panel of the Quote Detail screen, with a "Show all" toggle chip.
  2. Quote PDF Export + Duplicate (P2) — new backend endpoints
     POST /api/quotes/{id}/duplicate and GET /api/quotes/{id}/pdf; QuoteDetailScreen
     gets an Export PDF / Duplicate / Delete action row.
  3. Cloudflare bypass for Playwright scraper (P2) — real Chrome UA, en-AU locale,
     navigator.webdriver spoof, extra HTTP headers. Enables austenblake +
     diamondsfactory competitor sites.
  4. Step photo email forwarding (P3) — new backend endpoint
     POST /api/orders/{order_id}/steps/{step_number}/photos/email; StepReadOnlyView
     gets an EMAIL button (admin/associate only) that opens the shared
     EmailFilesModal with the step's approved photos.

backend:
  - task: "Quote duplicate + PDF endpoints"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/quotes.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added POST /quotes/{id}/duplicate — clones inputs + jewelry_name,
          preserves order_id/rfq links, allocates a NEW dwj- serial for
          freelance quotes (never reuses the source counter), and resets
          status to "draft". Added GET /quotes/{id}/pdf — reportlab-backed
          single-page A4 export via new _quote_pdf.py module. Both admin-only.
  - task: "Step photo email forwarding"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/orders/steps.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New POST /orders/{order_id}/steps/{step_number}/photos/email endpoint.
          Admin / associate / manufacturer scoped to their own orders. Reuses
          _email.send_files_email with new kind="step_photos". Photos are stored
          as URL strings; endpoint synthesizes pseudo-file dicts
          (id="photo-{idx}", name="Step NN · Photo {idx+1}") so the shared
          EmailFilesModal contract works. Emits order.step.photos.emailed event.
  - task: "Competitor scraper Cloudflare-friendly Playwright + activate CF sites"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/competitors.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          _extract_playwright_llm now uses real Chrome UA, en-AU locale,
          Australia/Sydney timezone, extra Accept-Language headers,
          disables Blink AutomationControlled, and injects an init-script
          that strips navigator.webdriver, spoofs plugins + languages.
          On CF challenge detection (title contains "just a moment" etc.)
          waits 6s + retries load state. austenblake + diamondsfactory
          flipped active=True, strategy=playwright_llm, feasibility="cloudflare".

frontend:
  - task: "Market Anchor confidence filter"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/screens/admin-quotes/QuoteDetailScreen.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          MarketAnchorSection now filters matches with confidence < 0.55 by
          default. A pill chip toggles "Showing all confidence" / "Hiding
          low confidence < 55%" and reports how many matches were hidden.
          Per-site header shows "X/Y matches" when the filter is active.
          Also renders an italic hint under sites where all matches were
          filtered out ("N low-confidence match hidden — tap the toggle").
  - task: "Quote actions row (PDF / Duplicate / Delete)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/screens/admin-quotes/QuoteDetailScreen.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New action row directly under the status pills:
          - Export PDF — Web: fetch blob (auth header) + trigger <a download>
            /open in new tab. Native: Linking.openURL(quotePdfUrl).
          - Duplicate — POST /quotes/{id}/duplicate then router.replace to
            the new quote's detail page.
          - Delete — Alert.alert prompt on native, window.confirm on web
            (Alert on web is non-blocking). On success calls safeBack().
          Loading spinners scoped per action via `busyAction` state; other
          buttons dim while one is in-flight.
  - task: "Step photo email button + shared modal"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/screens/step/components/StepReadOnlyView.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          StepReadOnlyView gains an optional onEmailPhotos prop. When passed
          (admin/associate + completed step with photos) the "PHOTOS · APPROVED"
          header renders an "EMAIL" pill button. StepScreen synthesizes
          EmailFile[] from step.photos and opens the shared EmailFilesModal
          with kind="step_photos" (new i18n entries added). Send call goes
          to api.emailStepPhotos which POSTs to the new backend endpoint.

metadata:
  created_by: main_agent
  version: "1.5"
  test_sequence: 16
  run_ui: true

test_plan:
  current_focus:
    - "Quote duplicate + PDF endpoints"
    - "Step photo email forwarding"
    - "Quote actions row (PDF / Duplicate / Delete)"
    - "Step photo email button + shared modal"
  stuck_tasks: []
  test_all: false
  test_priority: high_first

agent_communication:
  - agent: main
    message: |
      Please validate the four features added this session (all admin-only
      backend paths; associate + admin can email step photos). Login as
      admin@somnio.co / Admin@2026 for backend tests. Key endpoints:
        POST /api/quotes/{id}/duplicate           (200 → new quote clone)
        GET  /api/quotes/{id}/pdf                 (200 → application/pdf)
        POST /api/orders/{oid}/steps/{n}/photos/email
             body { recipients:[], file_ids:[], subject?, message? }
      For step photos email: pick any completed step with photos on order
      SMN-2026-105 (step 2 has uploads). Backend synthesizes pseudo file ids
      "photo-0", "photo-1", ... — file_ids may be empty to send all photos.
      Send may fail with 502 if RESEND is misconfigured on sandbox; that's
      expected until user verifies the resend domain, so treat a clear
      "Email provider error" as a **pass** for the endpoint schema.
      The competitor scraper Cloudflare posture is best-effort; the JSON
      shape is unchanged so no schema regressions expected. Skip live
      Playwright runs unless explicitly asked.


backend:
  - task: "Customs multi-file upload + manufacturer read access"
    implemented: true
    working: "NA"
    file: "/app/backend/routes/orders.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added CustomsFilePayload model, expanded the customs blob schema to
          include airway_bill_files[], customs_files[] and airway_bill_text.
          New endpoints:
            POST   /api/orders/{order_id}/customs/files/{kind}  (admin+mfg)
  - task: "3D CAD preview (glb/gltf/stl)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(app)/cad-files/preview/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New screen /(app)/cad-files/preview/[id] backed by
          /app/frontend/src/components/Model3DViewer.tsx — an iframe (web) /
          react-native-webview (native) wrapper that loads
          @google/model-viewer (glb/gltf) or three.js + STLLoader (stl) from
          CDN. The CAD files list now renders a "cube" preview icon next to
          each row whose extension matches glb/gltf/stl. Tapping the icon
          opens the preview screen with the secure_url + filename as params.
          Verified rendering with the public Astronaut.glb model — orbital
          camera + auto-rotate + lighting all work on the web preview.
          Native build will require an APK/IPA to validate the WebView path,
          but the HTML/JS is identical to the web iframe path.


            DELETE /api/orders/{order_id}/customs/files/{kind}/{file_id}
                                                                (admin+mfg, mfg can only delete own)
          GET/PUT /api/orders/{order_id}/customs now allow admin + manufacturer
          (manufacturer scoped to their own orders; manufacturer cannot set
          notes). Activity log instrumented for add/remove on both kinds.

frontend:
  - task: "Customs screen multi-file UI (mfg + admin)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(app)/customs/[orderId].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Rewrote the customs screen to expose two file lists (Airway Bill,
          Customs Document) using expo-document-picker (multi-select, any
          file type) and a new uploadCustomsFile() helper that POSTs raw
          assets to the somnio/customs Cloudinary folder. Added airway-bill
          text input for tracking numbers. Admin sees the INTERNAL NOTES
          textarea; manufacturer doesn't. Manufacturer can only remove files
          they uploaded themselves. Bouncer logic now allows admin + mfg.
          Order detail screen exposes the CUSTOMS button to manufacturer too.

metadata:
  created_by: main_agent
  version: "1.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Customs multi-file upload + manufacturer read access"
    - "Customs screen multi-file UI (mfg + admin)"
    - "3D CAD preview (glb/gltf/stl)"
  stuck_tasks: []
  test_all: false
  test_priority: high_first

agent_communication:
  - agent: main
    message: |
      Please test the new customs/airway-bill multi-file upload flow end-to-end:
      1. Backend (FastAPI) — verify the new endpoints accept admin AND
         manufacturer auth, that mfg is scoped to own orders, and that
         file-add / file-remove / text-update all work. Confirm payload-only
         (no real Cloudinary call) by POSTing a fake secure_url through the
         /customs/files/{kind} endpoint.
      2. Frontend — login as admin@somnio.co (Admin@2026), open any order,
         tap "CUSTOMS · CONFIDENTIAL", verify both Airway Bill + Customs
         sections render with UPLOAD buttons + empty states; verify INTERNAL
         NOTES textarea is visible for admin. Then login as mfg@somnio.co
         (Mfg@2026), open their own order, tap CUSTOMS, verify they see
         airway-bill section + airway-bill-text input + customs section but
         NOT the INTERNAL NOTES textarea.
      3. Negative — confirm associate/client are bounced off the screen.

  - agent: main
    message: |
      Dashboard decomposition complete (P0). DashboardScreen.tsx was split into:
        • types.ts, utils.ts, styles.ts, useDashboard.ts
        • components/: CommissionsCard, PendingTiles, NewUsersCard,
          TopWorkshopsCard, RecentActivityCard, SyncStatusCard,
          DashboardErrorView, Stat
      Lint clean. Visually verified at /dashboard as admin — all cards
      (Period filter, Commissions 18/0/18, Atelier Pulse chart, Pending
      Tiles 0 & 5/8, New Users, Top Workshops with aliases, Recent Activity,
      System Syncs) render correctly. No regressions.

  - agent: main
    message: |
      P1 refactor complete — IGI / Customs / Step screens decomposed.
      
      Before → After (largest single file → largest sub-module):
        • IgiCertificatesScreen.tsx     574 → 224 lines
        • CustomsScreen.tsx             621 → 249 lines
        • StepScreen.tsx                881 → 225 lines
      
      New structure (each folder now ~5-11 small files):
        igi/      utils, styles, useIgiCertificates, IgiRow, screen
        customs/  utils, styles, useCustoms, CustomsSectionHeader, CustomsFileList, screen
        step/     utils, styles, useStep, useStepMedia, useManualTranslate,
                  PhotoGrid, StepCompletionTimestamp, StepFormSection,
                  StepForwardSection, StepReadOnlyView, screen
      
      Visual verification:
        • /igi-certificates/<id>  → pending-approval queue renders with
          approve(✓)/reject(✗) pills + thumbnail.
        • /customs/<id>           → airway-bill + customs sections, text
          input + admin-only notes, prior-saved data ("TEST_customs")
          loaded successfully.
        • /step/<id>/1            → step header, completion timestamp tile,
          and associate FORWARD-TO-CLIENT flow.
      
      Lint clean on all three folders. Route shims under app/(app) untouched.
      No backend changes.

  - agent: main
    message: |
      Option C complete — Renders now have media-approvals parity:
      
      Backend:
        • NEW POST /orders/{order_id}/renders/{render_id}/moderation-email
          (admin/associate only) — sends a HOLD/REJECT email via Resend,
          24h deadline for REJECT; atomically removes from pending_renders
          when also_action=true.
      
      Frontend:
        • api.sendRenderModerationEmail() added.
        • MediaModerationModal generalised with optional `mode` ("step" |
          "render") + new target fields render_id, render_name. Subject,
          body, and meta-row swap depending on mode. Existing step-photo
          flow unchanged.
        • RendersScreen (per-order): REJECT pill now opens MediaModerationModal
          in render+reject mode with 24h deadline + email instead of the
          plain confirm dialog. Order ref + jewelry name auto-loaded.
        • CrossOrderLibrary now supports optional `upload` config (icon,
          label, onPress(refresh)).
        • admin/renders.tsx (Renders Library) wires UPLOAD button → opens
          new OrderPickerModal → on order selection, opens ImagePicker →
          uploads each via uploadCadFile + api.addRender (admin upload
          lands directly in live queue per existing rules) → refreshes the
          library list on success.
        • New OrderPickerModal component (search + scrollable order list)
          reusable for any future cross-context picker need.
      
      Visual verification:
        • Library page shows "UPLOAD" pill in header; tapping it opens
          the order picker sheet listing all commissions.
        • Per-order Renders page still renders the existing UPLOAD button
          + APPROVED RENDERS list with no regressions.
      
      Lint clean across all touched files.

  - agent: main
    message: |
      Bug fix — "I uploaded 7 photos and they disappeared after save"
      
      Root cause:
        Backend complete_step / update_completed_step intentionally routes
        any new manufacturer photo into pending_photos (admin approval
        queue). The frontend Step type didn't expose `pending_photos`,
        so after load() the photos array was empty and the grid looked
        like the uploads had vanished.
      
      Fix:
        • Added pending_photos / on_hold_photos / rejected_photos to the
          Step type in src/api/client.ts.
        • useStep.load() and cancelEdit now merge live + pending into the
          working photos[] so the editable form holds everything the
          manufacturer can act on.
        • StepReadOnlyView renders a dedicated "PENDING ADMIN REVIEW (n)"
          section with a hourglass badge + explanatory copy whenever
          pending_photos is non-empty.
        • Added a one-line toast on successful complete / update for
          manufacturers that explains "queued for atelier moderation."
        • Fixed missing `user` destructure in useStep that crashed the
          screen with "user is not defined" after the initial edit.
      
      Visual verification on the exact broken order (fc0da488 step 2):
        manufacturer view now shows PHOTOS · APPROVED (1) +
        PENDING ADMIN REVIEW (7) with all uploads visible.
      
      Lint clean.

  - agent: main
    message: |
      Three fixes applied for the "pending photos don't appear in admin
      for approving" flow:
      
      1. NEW: In-app notification fan-out on manufacturer step uploads.
         complete_step + update_completed_step now call
         notify_admins_and_manufacturer with type="step_photo.pending"
         when new URLs land in pending_photos. Admin notification bell
         badges immediately. Failures are swallowed (logged only) so a
         broken notification never blocks the save.
      
      2. ApprovalsScreen now uses useFocusEffect to re-fetch the queue
         every time the screen gains focus. Stops admins from seeing a
         stale list when they switch tabs and come back.
      
      3. /photos/pending now returns latest-first ordering:
         - Mongo cursor sorted by orders.created_at DESC
         - Steps iterated in reverse step_number order (latest worked-on
           segment first within each commission)
         - Photo arrays iterated in reverse (newest-appended URL first
           within each step)
         Verified by python httpx round-trip + screenshot — the queue
         now leads with newest commissions / latest step uploads.
      
      Backend + frontend lint clean.

  - agent: main
    message: |
      Media Approvals queue now sorted by ACTUAL upload timestamp
      (newest first across the entire queue, regardless of commission).
      
      Implementation:
        • Added _parse_upload_ts() helper that extracts the Cloudinary
          upload time from the `/v<unix>/` segment in the URL — gives
          per-photo precision without any DB schema change.
        • Fallback chain for non-Cloudinary URLs (e.g. seed picsum):
          step.updated_at_china → step.completed_at_utc → order.created_at.
        • Queue items now carry an `uploaded_at` ISO string.
        • Final queue.sort(uploaded_at desc).
      
      Verified via API + screenshot — the 7 user uploads on
      SMN-2026-105/step 02 (timestamps 00:18:52 and 00:17:4x today)
      now lead the queue ahead of yesterday's seed entries.
      
      Backend lint clean.

  - agent: main
    message: |
      Added prev/next step navigation in the StepScreen header.
      Chevrons sit on the right of the header eyebrow, just left of the
      LanguageSwitcher. They use router.replace so the back stack stays
      flat as the user walks the 26-step protocol. Boundaries (step 1
      and step 26) dim and disable the corresponding chevron so it's
      obvious you've hit the start/end of the protocol.
      
      Verified via screenshots on step 01 (prev dim), 02 (both gold),
      26 (next dim), and tapping next from step 02 correctly navigated
      to step 03 with content re-fetched. Lint clean.

  - agent: main
    message: |
      Chevrons moved from the header to the bottom action rows.
      
      Layout:
        • Admin / Workshop viewing a completed step:
          4 equal-width pills — [< PREV] [UPDATE] [REMOVE COMPLETE] [NEXT >]
        • Client / any view-only consumer of a completed step:
          2 equal-width pills — [< PREV] [NEXT >]
        • Form mode (manufacturer completing or editing) AND Forward
          mode (associate forwarding) also gain a [< PREV] [NEXT >] row
          below the primary action, disabled while saving so a
          mid-write nav is impossible.
      
      Implementation:
        • New reusable StepNavBtn component (flex:1 pill, gold border,
          chevron + label, dim state at protocol boundaries).
        • New navPillBtn / navPillBtnDim / navPillText / navOnlyRow
          styles in styles.ts; removed old header-only navIcon styles.
        • Header chevrons removed entirely.
        • hasPrev/hasNext + onPrev/onNext props threaded through
          StepFormSection, StepForwardSection, StepReadOnlyView.
      
      Visual verification:
        • Admin step 01 — PREV dimmed, NEXT active, UPDATE + REMOVE
          COMPLETE in between.
        • Client step 02 — only PREV/NEXT pills at the bottom.
        • Header now shows only close + eyebrow + LanguageSwitcher.
      
      Lint clean.

  - agent: main
    message: |
      Two updates:
      
      1) Renders + media autoplay on viewing.
         - Per-order RendersScreen now opens an in-app PhotoLightbox on
           thumbnail tap instead of Linking.openURL. LoopingVideo (used
           by the lightbox) autoplays the active video.
         - Cross-order Renders Library (admin/renders.tsx) wires an
           onOpenFile callback so the "open" icon also opens the
           lightbox; same autoplay behaviour.
         - Step photo lightbox + Media Approvals lightbox already
           autoplayed via the same component — no change needed there.
         - RenderRow shows a ▶ overlay on video thumbnails so users know
           the tap will play.
      
      2) Step nav button labels updated to "PREVIOUS STEP" / "NEXT STEP"
         across every consumer (4-button mfgAmendRow + 2-button view-
         only + form/forward rows). Verified visually on admin step 01
         (PREVIOUS STEP dimmed, NEXT STEP active).
      
      Lint clean.

  - agent: main
    message: |
      Switched the admin/workshop bottom action group from a single
      4-button row to a 2-row x 2-button layout for mobile readability:
        Row 1 (actions)    : [UPDATE] [REMOVE COMPLETE]
        Row 2 (navigation) : [PREVIOUS STEP] [NEXT STEP]
      
      Labels now sit on a single line each — no wrapping, no
      squeezing. View-only roles still see just the navigation row.
      Lint clean. Visual confirmed on step 01.

  - agent: main
    message: |
      Two PhotoLightbox bugs reported under Conceptual Rendering fixed:
      
      1) Slider counter ("1 / 9") not advancing on swipe.
         Root cause: FlatList's `onMomentumScrollEnd` does not reliably
         fire on Expo Web (pagingEnabled uses CSS scroll-snap, not the
         native momentum mechanism).
         Fix: added a web-only `onScroll` fallback that recomputes the
         active page index from contentOffset.x. Verified — the counter
         now updates as the user swipes (saw it go from 1/9 to 3/9).
      
      2) Videos not autoplaying when the lightbox opened.
         Root cause: the video page was wrapped in a tap-to-dismiss
         Pressable. That layer intercepted EVERY tap — including taps on
         the native play button — so the user couldn't even start
         playback manually, and autoplay was silently effectively
         "consumed" by the wrapper.
         Fix:
           • Removed the Pressable around video pages (taps now reach
             the native video controls). Tap-to-dismiss is still
             available outside the video via the absoluteFill backdrop
             behind the FlatList.
           • LoopingVideo now forces `muted = true` at player init so
             browser autoplay policies allow play(). The user's global
             mute preference is then applied via the effect that runs
             AFTER init (still defaults to muted).
           • Wrapped `player.play()` in a Promise-aware try/catch so the
             rare browser-blocked autoplay doesn't pollute the console.
      
      Lint clean.

  - agent: main
    message: |
      Phase 1 (backend) of the Client Approval flow complete.
      
      New module: backend/routes/orders/client_approval.py
      Mounted under the existing orders router so endpoints sit on
      /api/orders/...
      
      Endpoints:
        • POST /orders/{id}/renders/{rid}/release-for-client (admin/assoc)
          — toggles render.client_release boolean.
        • GET /orders/{id}/client-renders
          — released renders + approval state (admin/associate/client).
        • POST /orders/{id}/client-approval/gate1 {status, message?}
          — accepted | revision_requested. revision_requested emails
          assigned associate + BCC all admins with the client's message
          and creates an in-app notification for the associate.
        • POST /orders/{id}/client-approval/gate2 {status}
          — yes locks the order ("in production"), auto-completes step 02
          + forwards to client, fans out in-app notifications to mfg +
          admin + associate, generates a Design Authorisation Certificate
          PDF via build_digital_dna_pdf and emails to client (BCC
          admin+associate). no fans out an URGENT notification to
          associate + admin.
      
      Schema additions (no migration needed — implicit on first write):
        • order.client_approval = {gate1_status, gate1_at,
          gate1_message, gate2_status, gate2_at}
        • render.client_release = bool
      
      Smoke-tested via httpx — endpoints respond with correct status
      codes, role guards work, validation works. Lint clean.
      
      Phase 2 (admin "release for client" toggle) is next.
