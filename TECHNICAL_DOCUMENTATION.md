# Operation Ward Zero --- Technical Documentation

**Project:** Nursio SmartCare AI\
**Prototype version:** 3.0.0\
**Repository:** https://github.com/bgj2812/operation-ward-zero\
**Runtime:** Node.js 20 or later\
**Purpose:** Hackathon demonstration of a software-simulated home-care
monitoring workflow.

## 1. Project overview

Operation Ward Zero demonstrates a home-care monitoring workflow using
synthetic patient readings. It follows the sequence:

**Sense → Understand → Alert → Respond**

The prototype simulates heart rate, oxygen saturation (SpO₂),
temperature and systolic blood pressure. A browser dashboard sends
readings to a Node.js HTTP server. The server evaluates configured
demonstration rules, stores records in a local JSON file and exposes
caregiver workflows for notes, attendance and alert
acknowledgment/resolution.

No physical sensor, real patient, clinical device, external AI model,
SMS gateway or emergency dispatch service is connected.

## 2. Technology stack

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  User interface          HTML, CSS and browser   Dashboard, controls,
                          JavaScript              chart, notes and alerts

  Application server      Node.js built-in `http` HTTP routes and request
                          module                  handling

  Persistence             JSON file (`data.json`) Stores readings, notes,
                                                  alerts, events and
                                                  caregiver state

  Offline browser support Browser local storage   Queues selected failed
                          and service worker      reading submissions and
                          registration            supports a cached page
                                                  shell, subject to
                                                  service-worker
                                                  implementation and
                                                  testing

  Runtime configuration   `PORT` environment      Selects server port;
                          variable                defaults to 3000
  -----------------------------------------------------------------------

The package is an ES module (`"type": "module"`). The start script is
`node server.js`. No third-party npm dependencies are declared.

## 3. Architecture and data flow

``` text
Browser dashboard
  ├─ Synthetic scenario generator
  │    └─ Creates normal, gradual-deterioration or critical readings
  │
  ├─ HTTP POST /api/readings
  │    └─ Node.js server validates numeric fields
  │         ├─ Rule-based risk assessment
  │         ├─ Reading history update
  │         ├─ Alert creation or escalation
  │         ├─ Event log update
  │         └─ Save data.json
  │
  ├─ HTTP GET /api/state
  │    └─ Returns current application state for dashboard rendering
  │
  ├─ Caregiver actions
  │    ├─ POST /api/notes
  │    ├─ POST /api/caregiver
  │    └─ POST /api/alerts/action
  │
  └─ Browser presentation
       ├─ Vital trend chart
       ├─ Risk reasons
       ├─ Caregiver notes and attendance
       └─ Alert status and event history
```

## 4. Synthetic sensor simulation

The dashboard provides three software-generated scenarios:

-   **Stable patient (`normal`):** generates readings around a stable
    demonstration profile.
-   **Gradual deterioration (`warning`):** progressively changes
    selected values over successive three-second ticks.
-   **Critical readings (`critical`):** generates intentionally abnormal
    demonstration values.

The dashboard sends the first reading when a scenario starts, then sends
another reading every three seconds until the stream is stopped or
another scenario is selected.

The readings are generated in browser JavaScript. They are not measured
from a person or physical device.

## 5. Risk assessment rules

The server's `assess()` function uses a transparent additive score. It
evaluates four fields:

  Signal        Condition                            Score contribution
  ------------- ---------------------------------- --------------------
  SpO₂          Below 90%                                            +3
  SpO₂          90% to below 94%                                     +2
  Heart rate    At least 125 bpm or below 45 bpm                     +3
  Heart rate    At least 105 bpm or below 55 bpm                     +1
  Temperature   At least 39°C                                        +2
  Temperature   At least 38°C                                        +1
  Systolic BP   Below 95 mmHg                                        +2
  Systolic BP   95 to below 100 mmHg                                 +1

The final demonstration category is:

-   **LOW:** score is 0
-   **MEDIUM:** score is 1 or 2
-   **HIGH:** score is 3 or more

The reasons attached to each assessment are displayed in the dashboard
and stored with the reading. These thresholds and categories are
prototype rules only. They are not clinical thresholds, medical advice
or a validated risk score.

## 6. Alert lifecycle and escalation

When a reading is assessed:

1.  The server checks for an existing alert whose status is not
    `Resolved`.
2.  If an active alert exists and the new risk category is higher, the
    server updates that alert in place, records its escalation time and
    reading ID, and adds an escalation event.
3.  If there is no active alert, a non-LOW risk can create a new alert
    when the 30-second alert cooldown has elapsed.
4.  An alert can move from `Open` to `Acknowledged`, then from
    `Acknowledged` to `Resolved`.
5.  Invalid alert transitions return an HTTP 409 response.

The alert cooldown reduces repeated alert creation. A higher-risk
assessment can escalate an active alert without waiting for a new alert
to be created.

## 7. HTTP API

All API routes are served by the same Node.js process.

  -----------------------------------------------------------------------
  Method                  Route                   Purpose
  ----------------------- ----------------------- -----------------------
  GET                     `/api/health`           Returns health, storage
                                                  mode and prototype
                                                  version

  GET                     `/api/state`            Returns the current
                                                  stored application
                                                  state

  POST                    `/api/readings`         Validates and stores a
                                                  synthetic reading;
                                                  assesses risk and
                                                  manages alerts

  POST                    `/api/notes`            Stores a caregiver
                                                  note, language tag and
                                                  optional manually
                                                  entered English summary

  POST                    `/api/alerts/action`    Acknowledges or
                                                  resolves an alert

  POST                    `/api/caregiver`        Checks a caregiver in
                                                  or out

  POST                    `/api/reset`            Resets demo state to
                                                  initial values
  -----------------------------------------------------------------------

### Reading payload

`POST /api/readings` expects numeric, finite values for `hr`, `spo2`,
`temp` and `bp`.

### Caregiver note payload

`POST /api/notes` accepts: - `text`: note text, limited to 1,000
characters - `language`: `English`, `Tamil` or `Hindi`; other values
default to English - `englishSummary`: optional manually entered English
summary, limited to 1,000 characters

The application does not automatically translate notes or use them in
the risk calculation.

### Alert action payload

`POST /api/alerts/action` accepts an alert `id` and an `action` of
`acknowledge` or `resolve`, subject to the alert's current status.

### Caregiver payload

`POST /api/caregiver` accepts `action` (`checkin` or `checkout`) and an
optional caregiver `name`.

## 8. Data persistence

The server stores state in `data.json` in the project directory. If the
file cannot be read during startup, the server initializes an empty
state and writes the file.

The state contains: - Recent readings (up to 500 records) - Caregiver
notes - Alerts and their status/history fields - Event log (up to 100
events) - Current caregiver name and check-in status - Alert cooldown
timestamp and next alert ID

The dashboard retrieves state through `GET /api/state`. The browser
refreshes state periodically and after actions.

**Privacy note:** Use synthetic demonstration data only. Do not store
real patient-identifiable or health information in this prototype. Keep
`data.json` out of the public repository.

## 9. Offline behavior and limitations

The browser code stores a pending-action queue in local storage and
listens for the browser's `online` event to retry queued items. The
reading-submission path queues failed synthetic readings locally. When
connectivity returns, queued items are posted in order and the dashboard
refreshes after the queue is cleared.

This is a limited browser-side demonstration, not a durable
offline-first architecture. It does not guarantee delivery after browser
storage is cleared, device failure or power loss. Caregiver note,
caregiver attendance and alert-action requests are not all consistently
queued by the current interface. The service worker is registered by the
page; offline caching behavior should be verified separately against the
actual `sw.js` implementation and browser cache state.

## 10. Run locally on Windows

1.  Install Node.js 20 or later.
2.  Extract the project to a folder such as `ward-zero-v3`.
3.  Open PowerShell in that folder.
4.  Run:

``` powershell
npm.cmd start
```

5.  Open `http://localhost:3000` in a browser.
6.  Keep the PowerShell window open while testing. Press `Ctrl+C` to
    stop the server.

If port 3000 is already in use, stop the other local server or set a
different `PORT` value before starting this server.

## 11. Suggested verification checklist

-   [ ] `GET /api/health` reports version `3.0.0`.
-   [ ] Stable scenario sends readings at approximately three-second
    intervals.
-   [ ] Gradual-deterioration scenario changes readings over time.
-   [ ] Critical scenario produces a HIGH demonstration assessment.
-   [ ] Risk reasons match the configured rules.
-   [ ] A caregiver note can be saved with English, Tamil or Hindi
    language tag.
-   [ ] Optional English summary is stored and displayed as entered.
-   [ ] An active alert escalates when a higher risk category is
    received.
-   [ ] An alert can be acknowledged and then resolved.
-   [ ] Caregiver check-in and check-out update the state.
-   [ ] Readings, notes and alerts remain after browser refresh while
    `data.json` remains available.
-   [ ] Offline queue behavior is tested with browser network
    disconnection and reconnection.

## 12. Safety, scope and future work

This is an educational hackathon prototype. It is not a medical device
and is not suitable for diagnosis, treatment, clinical monitoring or
emergency response. The risk engine is rule-based and has not been
clinically validated. It does not predict deterioration 24--48 hours in
advance. The caregiver note's English summary is entered by a human;
automatic translation and AI-based clinical interpretation are not
implemented.

Potential future work, requiring separate design and validation,
includes authenticated caregiver accounts, encrypted storage, access
control, audit logging, a database designed for concurrent users, robust
offline synchronization, real sensor integration, tested notification
channels and clinically governed model evaluation.
