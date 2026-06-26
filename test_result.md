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
  Convert the Customs and Airway Bill fields on an order from single base64
  image inputs to multi-file uploads (any file type, direct-to-Cloudinary as
  raw assets). Only admin and manufacturer can upload; manufacturer is now
  also allowed to view the customs screen for their own orders. Airway bill
  also supports a free-text field for tracking number / carrier notes.
  Admin retains exclusive ownership of the INTERNAL NOTES field.

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
